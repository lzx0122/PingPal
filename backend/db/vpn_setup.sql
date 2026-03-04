-- Multi-Server VPN Architecture
-- This schema allows devices to connect to any VPS server

-- 1. VPN Profiles Table (Device Registration)
-- Stores device information without server binding
DROP TABLE IF EXISTS public.vpn_profiles CASCADE;
CREATE TABLE public.vpn_profiles (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
    device_name TEXT NOT NULL,
    public_key TEXT NOT NULL UNIQUE,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. VPN Server Allocations Table
-- Tracks IP allocations per device per server
DROP TABLE IF EXISTS public.vpn_server_allocations CASCADE;
CREATE TABLE public.vpn_server_allocations (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    profile_id UUID REFERENCES public.vpn_profiles(id) ON DELETE CASCADE NOT NULL,
    server_ip TEXT NOT NULL,
    assigned_ip INET NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    last_connected_at TIMESTAMP WITH TIME ZONE,
    UNIQUE(profile_id, server_ip),
    UNIQUE(server_ip, assigned_ip)
);

-- 3. Create Indexes
CREATE INDEX IF NOT EXISTS idx_vpn_profiles_user_id ON public.vpn_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_vpn_profiles_public_key ON public.vpn_profiles(public_key);
CREATE INDEX IF NOT EXISTS idx_vpn_allocations_profile_id ON public.vpn_server_allocations(profile_id);
CREATE INDEX IF NOT EXISTS idx_vpn_allocations_server_ip ON public.vpn_server_allocations(server_ip);

-- 4. Enable Realtime for VPS Agent
ALTER PUBLICATION supabase_realtime ADD TABLE vpn_profiles;
ALTER PUBLICATION supabase_realtime ADD TABLE vpn_server_allocations;

-- 5. Enable RLS (Disabled for now since backend handles auth)
-- 6. RLS Policies for vpn_profiles (Disabled - backend handles auth with JWT)
-- 7. RLS Policies for vpn_server_allocations (Disabled - backend handles auth)

-- 8. RPC Function: Register Device (without server)
CREATE OR REPLACE FUNCTION register_vpn_device(
    p_user_id UUID,
    p_device_name TEXT,
    p_public_key TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    new_profile_id UUID;
BEGIN
    -- Check if public key already exists
    IF EXISTS (SELECT 1 FROM vpn_profiles WHERE public_key = p_public_key) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Public key already registered');
    END IF;

    -- Insert new profile
    INSERT INTO vpn_profiles (user_id, device_name, public_key)
    VALUES (p_user_id, p_device_name, p_public_key)
    RETURNING id INTO new_profile_id;

    -- Return success
    RETURN jsonb_build_object(
        'success', true,
        'profile_id', new_profile_id,
        'device_name', p_device_name
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- 9. RPC Function: Allocate IP for Server Connection
CREATE OR REPLACE FUNCTION allocate_server_ip(
    p_profile_id UUID,
    p_server_ip TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    new_ip INET;
    octet INT;
    existing_octets INT[];
    v_user_id UUID;
BEGIN
    -- Verify profile belongs to calling user
    SELECT user_id INTO v_user_id
    FROM vpn_profiles
    WHERE id = p_profile_id AND is_active = true;

    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Profile not found or inactive');
    END IF;

    IF v_user_id != auth.uid() THEN
        RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
    END IF;

    -- Check if allocation already exists for this profile + server
    SELECT assigned_ip INTO new_ip
    FROM vpn_server_allocations
    WHERE profile_id = p_profile_id AND server_ip = p_server_ip;

    IF new_ip IS NOT NULL THEN
        -- Update last_connected_at
        UPDATE vpn_server_allocations
        SET last_connected_at = NOW()
        WHERE profile_id = p_profile_id AND server_ip = p_server_ip;

        RETURN jsonb_build_object(
            'success', true,
            'assigned_ip', host(new_ip) || '/32',
            'server_endpoint', p_server_ip || ':51820',
            'server_public_key', 'SERVER_PUB_KEY_PLACEHOLDER',
            'allowed_ips', '0.0.0.0/0'
        );
    END IF;

    -- Allocate new IP for this server
    -- Get all used last octets for the 10.0.0.x range on this server
    SELECT ARRAY_AGG((host(assigned_ip)::inet - '10.0.0.0'::inet))
    INTO existing_octets
    FROM vpn_server_allocations
    WHERE server_ip = p_server_ip
      AND family(assigned_ip) = 4
      AND assigned_ip << '10.0.0.0/24';

    -- Find first available octet (2-254, 1 is gateway)
    SELECT num INTO octet
    FROM generate_series(2, 254) AS num
    WHERE NOT (num = ANY(COALESCE(existing_octets, ARRAY[]::INT[])))
    ORDER BY num ASC
    LIMIT 1;

    IF octet IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'No IP addresses available on this server');
    END IF;

    new_ip := ('10.0.0.' || octet)::inet;

    -- Insert allocation
    INSERT INTO vpn_server_allocations (profile_id, server_ip, assigned_ip, last_connected_at)
    VALUES (p_profile_id, p_server_ip, new_ip, NOW());

    -- Return config
    RETURN jsonb_build_object(
        'success', true,
        'assigned_ip', host(new_ip) || '/32',
        'server_endpoint', p_server_ip || ':51820',
        'server_public_key', 'SERVER_PUB_KEY_PLACEHOLDER',
        'allowed_ips', '0.0.0.0/0'
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

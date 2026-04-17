-- Add optional learner ownership to game_ip_ranges.
-- Safe to run multiple times.

ALTER TABLE public.game_ip_ranges
ADD COLUMN IF NOT EXISTS user_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'game_ip_ranges_user_id_fkey'
  ) THEN
    ALTER TABLE public.game_ip_ranges
    ADD CONSTRAINT game_ip_ranges_user_id_fkey
    FOREIGN KEY (user_id)
    REFERENCES public.users(id)
    ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_game_ip_ranges_user_id
ON public.game_ip_ranges(user_id);

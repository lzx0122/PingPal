# WireGuard 設備註冊檢查指南

## 問題描述
如果設備**沒有在 VPS 上的 WireGuard 配置中進行註冊**，就無法連接到 VPN，導致無法訪問遊戲伺服器檢測和其他 VPN 功能。

## 工作流程圖
```
應用端 (Tauri)
  ↓
生成 WireGuard 公鑰 (X25519)
  ↓
POST /api/vpn/register
  ↓
後端 (Node.js)
  ↓
調用 RPC: register_vpn_device()
  ↓
Supabase (vpn_profiles 表)
  ├─ user_id: 您的用戶ID
  ├─ device_name: 您的設備名稱
  ├─ public_key: WireGuard 公鑰
  ├─ is_active: true/false ← 關鍵！
  └─ server_ip: null（初始化時）

VPS Agent (Docker)
  ↓
每 2 秒查詢: SELECT * FROM vpn_profiles 
            WHERE server_ip = '本VPS的IP' 
            AND is_active = true
  ↓
如果找到記錄 → 更新 WireGuard 配置 (wg0.conf)
如果沒有記錄 → 不添加任何設備！ ❌
```

## 檢查清單

### ✅ Step 1: 確認應用已登錄
- [ ] 打開應用
- [ ] 檢查是否已登錄（應該看到用戶名或用戶界面）
- [ ] 如果未登錄，先執行登錄

### ✅ Step 2: 檢查是否有已註冊的設備
在應用中：
1. 導航到 **Settings** 或 **Device Management** 選項卡
2. 查看 **"{{ profiles.length }}/5 DEVICES"** 計數器
   - 如果顯示 **0/5** → 沒有任何設備註冊 ❌
   - 如果顯示 **1/5** 或更多 → 設備已註冊 ✅

### ✅ Step 3: 註冊設備（如果還沒有）
如果沒有設備：
1. 找到 **"Device Registration"** 或 **"VPN Registration"** 組件
2. 輸入設備名稱（例如 "My Gaming PC"）
3. 點擊 **"Register Device"** 按鈕
4. 等待成功消息

**成功後您應該看到**：
```
✓ Registration success
Device Name: My Gaming PC
``` 

### ✅ Step 4: 驗證數據庫中的設備記錄

#### 方式A：通過 Supabase 儀表板（如果有訪問權限）
1. 打開 Supabase 項目
2. 進入 **SQL Editor** 或 **Table Editor**
3. 查看 `vpn_profiles` 表
4. 搜尋您的用戶 ID，應該看到：
   ```
   id              | user_id        | device_name      | public_key                | is_active | server_ip | created_at
   ─────────────── | ────────────── | ──────────────── | ───────────────────────── | ───────── | ───────── | ──────────
   abc123def       | your_user_id   | My Gaming PC     | [WireGuard公鑰]          | true      | NULL      | 2026-03-15
   ```

**關鍵欄位檢查**：
- ✅ `public_key` 不為空 → WireGuard 公鑰已保存
- ✅ `is_active = true` → 設備已啟用
- ⚠️ `server_ip = NULL` → 尚未連接到任何伺服器（正常！）

#### 方式B：通過直接查詢（SQL）
```sql
-- 查詢所有已註冊的設備
SELECT 
  id, 
  user_id, 
  device_name, 
  public_key, 
  is_active, 
  server_ip, 
  created_at 
FROM vpn_profiles 
WHERE user_id = '[YOUR_USER_ID]'
ORDER BY created_at DESC;
```

### ✅ Step 5: 驗證 VPS Agent 可以看到設備
在 VPS container 日誌中，您應該看到類似：
```
Found 1 active peers.
```

檢查日誌：
```bash
docker logs <nigping-agent-container-name>
```

期望看到：
```
✓ Selected PID 12345 with 1 connections
🔌 Sniffer starting on interface: 192.168.1.x
Subscribing to Realtime changes...
Realtime connected!
Found 1 active peers.  ← 這表示您的設備被識別了！
```

### ✅ Step 6: 連接到 VPS 伺服器

一旦設備已註冊，需要**分配一個 WireGuard IP 地址**：

1. 打開應用中的伺服器列表
2. 選擇一個 VPS 伺服器（例如 "13.124.0.0/16" 或區域標籤）
3. 點擊 **"Connect"** 按鈕
4. 應用會調用 `/api/vpn/connect` 端點

這會：
- 在 `vpn_server_allocations` 表中分配一個 IP（例如 10.0.0.2）
- VPS Agent 會將設備添加到 WireGuard 配置
- WireGuard 會自動配置 "Peer"

### ✅ Step 7: 驗證 WireGuard 配置更新

在 VPS 上檢查 WireGuard 配置：
```bash
# 在 VPS 容器內
cat /etc/wireguard/wg0.conf
```

您應該看到 Peer 部分：
```ini
[Interface]
PrivateKey = <VPS私鑰>
ListenPort = 51820
Address = 10.0.0.1/24
PostUp = iptables -A FORWARD -i wg0 -j ACCEPT; ...

[Peer]
  // User: your_user_id - Device: My Gaming PC
PublicKey = <您的公鑰>
AllowedIPs = 10.0.0.2/32
```

## 常見問題排除

### ❌ 問題 1: "Registration failed" 錯誤

**可能原因**：
- JWT 令牌已過期
- 網絡連接問題
- 後端伺服器沒有運行

**解決方案**：
1. 重新登錄
2. 檢查後端是否運行：`pnpm run dev:all`
3. 檢查網絡連接
4. 查看瀏覽器控制台的具體錯誤消息

### ❌ 問題 2: "Public key already registered"

**原因**：該公鑰已經在系統中註冊過

**解決方案**：
1. 刪除現有設備並重新註冊，或
2. 使用其他設備，或
3. 聯繫管理員清除重複的公鑰

### ❌ 問題 3: 設備已註冊但 PUBG 伺服器數量仍為 0

**檢查清單**：
1. 設備已連接到 VPS？
2. VPS Agent 正在運行？
   ```bash
   docker ps | grep nigping-agent
   ```
3. WireGuard 接口已啟動？
   ```bash
   docker exec <container> wg show
   ```
4. VPN 連接有效？
   ```bash
   docker exec <container> ping -c 1 8.8.8.8
   ```
5. PUBG IP 範圍已在 Supabase 中設置？

### ❌ 問題 4: VPS Agent 看不到設備記錄

**原因**：
- Supabase Realtime 連接失敗
- `server_ip` 不匹配（Agent 查詢 `server_ip = 'VPS的IP'`）

**解決方案**：
1. 確保 Supabase Realtime 已啟用
2. 檢查 Agent 日誌中的錯誤
3. 驗證環境變量正確（SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY）

## 調試命令

### 查看 VPS Agent 日誌
```bash
docker logs -f nigping-agent
```

### 查看 WireGuard 對等設備
```bash
docker exec nigping-agent wg show
```

### 檢查 Supabase 連接
```bash
# 在後端容器中測試
curl -s https://[YOUR_SUPABASE_URL]/rest/v1/vpn_profiles \
  -H "Authorization: Bearer [SERVICE_ROLE_KEY]" \
  -H "Content-Type: application/json" | jq .
```

## 完整流程檢查表

| 步驟 | 檢查項 | 狀態 |
|------|--------|------|
| 1 | 應用已登錄 | ☐ |
| 2 | VPNRegistration 組件可見 | ☐ |
| 3 | 輸入設備名稱並點擊註冊 | ☐ |
| 4 | 註冊成功（無錯誤） | ☐ |
| 5 | Device Management 顯示 1/5+ 設備 | ☐ |
| 6 | Supabase `vpn_profiles` 有一條記錄 | ☐ |
| 7 | `is_active = true` | ☐ |
| 8 | 選擇伺服器並點擊連接 | ☐ |
| 9 | VPS Agent 日誌顯示 "Found N active peers" | ☐ |
| 10 | WireGuard 配置包含 Peer 部分 | ☐ |
| 11 | PUBG 伺服器檢測現在顯示結果 | ☐ |

## 下一步

✅ **如果所有檢查都通過**：
- 您的設備已正確註冊到 WireGuard
- 應該可以訪問遊戲伺服器檢測功能

🔄 **如果還有問題**：
- 檢查應用是否實際連接到 VPN（查看 IP 地址變化）
- 檢查防火牆規則是否允許 UDP 51820 端口
- 查看詳細的應用日誌和 VPS Agent 日誌

## 相關文件
- VPN 註冊端點：`backend/src/api/vpn.ts`
- RPC 函數定義：`backend/db/vpn_setup.sql`
- VPS Agent：`vps-agent/src/index.ts`
- Tauri 前端：`Tauri/src/components/VPNRegistration.vue`

# PUBG Server Detection Issue - Diagnostic Guide

## 問題描述
PUBG伺服器檢測返回0個伺服器。

## 工作原理
系統通過以下步驟檢測PUBG伺服器：
1. 找到PUBG進程 (`TslGame.exe`)
2. 使用Windows API獲取該進程的本地UDP端口
3. 使用Raw Socket Sniffer監聽所有UDP流量
4. 過濾來自遊戲進程端口的出站UDP流量，識別遠端伺服器IP和端口

## 可能原因和解決方案

### ❌ **原因1: PUBG進程沒有運行**
**症狀**: 沒有TslGame.exe進程

**解決方案**:
- [ ] 確認PUBG: BATTLEGROUNDS已安裝並運行
- [ ] 檢查任務管理器中是否有 `TslGame.exe` 進程
- [ ] 嘗試在遊戲大廳或主菜單中停留至少10秒

### ❌ **原因2: 進程沒有綁定UDP端口**
**症狀**: 伺服器檢測未能找到任何本地UDP綁定

**解決方案**:
- [ ] 確保您已進入遊戲並選擇了伺服器區域
- [ ] 等待遊戲完全加載並連接到遊戲伺服器（至少30秒）
- [ ] 檢查網絡連接是否正常

### ❌ **原因3: Raw Socket Sniffer權限不足**
**最可能的原因** - Raw Socket需要管理員權限

**症狀**: 初始化Winsock失敗，或無法在Raw Socket上啟用RCVALL

**解決方案**:
1. [ ] **以管理員身份運行應用**
   - 右鍵點擊應用
   - 選擇 "以管理員身份運行"
   
2. [ ] **檢查Windows防火牆設置**
   - 打開 Windows Defender 防火牆進階安全
   - 確保Raw Socket不被阻止

3. [ ] **檢查系統日誌**
   - 打開事件檢視器
   - 檢查應用有關Raw Socket初始化的錯誤

### ❌ **原因4: 無流量檢測**
**症狀**: 進程和UDP端口已找到，但未檢測到流量

**解決方案**:
- [ ] 確認遊戲正在發送數據（觀察遊戲中的網絡活動）
- [ ] 檢查是否有VPN或代理干擾UDP流量
- [ ] 嘗試重新啟動遊戲和應用
- [ ] 檢查Windows防火牆是否阻止了應用訪問Raw Socket

### ❌ **原因5: 應用初始化失敗**
**症狀**: "Starting..." 消息卡住，然後顯示錯誤

**解決方案**:
- [ ] 檢查應用日誌（查看終端輸出）
- [ ] 查看控制台中的具體錯誤信息
- [ ] 嘗試重新啟動應用

## 調試步驟

### Step 1: 檢查進程是否運行
```powershell
Get-Process | Where-Object {$_.ProcessName -like "*Tsl*"} | Select-Object ProcessName, Id
```

### Step 2: 檢查UDP連接
```powershell
Get-NetUDPEndpoint | Where-Object {$_.OwningProcess -eq <PID>}
```

### Step 3: 檢查Raw Socket權限
- 確保在管理員提示符中運行應用
- 檢查Windows防火牆日誌：`netsh advfirewall monitor show currentprofile`

### Step 4: 檢查應用輸出
在啟動應用時查看終端輸出：
- 尋找 "✓ Selected PID" 確認進程被找到
- 尋找 "🔌 Sniffer active" 確認Raw Socket初始化成功
- 尋找 "→ UDP: " 確認流量被檢測

## 預期行為

### 成功情況下的日誌：
```
✓ Selected PID 12345 with 1 connections
🔌 Sniffer starting on interface: 192.168.1.x
🔌 Sniffer active and listening...
   → UDP: 13.124.10.50:9000 (↑1024/↓2048 B/s)
```

### 常見錯誤消息：

| 錯誤 | 原因 | 解決方案 |
|------|------|--------|
| "Failed to create raw socket" | 權限不足 | 以管理員運行 |
| "Failed to init Winsock" | Winsock初始化失敗 | 重啟應用或系統 |
| "Failed to bind raw socket" | 無法綁定到本地IP | 檢查網絡配置 |
| "No processes found" | 未找到遊戲進程 | 啟動PUBG |

## 進階診斷

### 啟用詳細日誌
應用每2秒檢測一次伺服器。您應該看到：
1. 首先列出所有檢測到的UDP端口
2. 然後顯示來自這些端口的遠端伺服器

### 測試Raw Socket
在PowerShell（管理員模式）中運行：
```powershell
# 確認WinPcap或Npcap已安裝（可選，但有助於Raw Socket操作）
Get-Command wincap.exe -ErrorAction SilentlyContinue
```

## 其他可能性

- **VPN/代理干擾**: 關閉VPN測試
- **防火牆規則**: 檢查是否有規則阻止Raw Socket
- **舊版驅動**: 確保網絡驅動程序是最新的
- **多個進程實例**: 確保只有一個TslGame.exe實例運行

## 聯繫支持
如果問題仍未解決，請提供：
1. 應用啟動時的完整終端輸出
2. 您的操作系統版本和網絡配置
3. 遊戲是否在運行、處於何種狀態

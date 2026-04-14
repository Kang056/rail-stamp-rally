測試執行說明

本目錄包含 Playwright E2E 與簡單的 API 層級測試範例，用以驗證「打卡（Check-in）」與後端 RPC 行為。這些是測試骨架（skeleton），會在缺少必要環境變數或尚未實作相應 RPC / UI 時跳過或給出說明。

先決條件
- Node.js 20+（請參照 package.json 的 engines / 專案需求）
- 已安裝相依套件：在專案根目錄執行 `npm ci`

Playwright E2E 測試（前端行為驗證）

1) 在一個終端機啟動開發伺服器（測試假設伺服器在 http://localhost:3000）

   npm run dev

2) 設定環境變數（可放入 .env.local）

   NEXT_PUBLIC_SUPABASE_URL        # Supabase 專案 URL
   NEXT_PUBLIC_SUPABASE_ANON_KEY   # Supabase anon/public key
   TEST_USER_LAT (optional)        # 測試用座標緯度 (預設台北車站 25.0478)
   TEST_USER_LON (optional)        # 測試用座標經度 (預設台北車站 121.5170)

3) 執行 Playwright 測試：

   npx playwright test tests/checkin.spec.ts

注意：測試會在缺少 NEXT_PUBLIC_SUPABASE_URL 或 NEXT_PUBLIC_SUPABASE_ANON_KEY 時自動跳過，並輸出跳過理由。

API 層級測試（直接呼叫 Supabase RPC）

1) 建立或設定 .env.local，至少包含下列變數：

   SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL)
   SUPABASE_SERVICE_ROLE_KEY   # 需要 service-role key 以繞過 RLS 並驗證 DB side-effects
   TEST_USER_ID                # 測試使用者的 UUID（必須存在於 Supabase Auth）
   CHECKIN_RPC_NAME (optional) # 預設為 "check_in"，視資料庫實作而定

2) 執行 API 測試腳本：

   node tests/api/checkin.test.js

該腳本會：
- 以 TEST_USER_LAT / TEST_USER_LON（預設為台北車站）呼叫 RPC（CHECKIN_RPC_NAME）
- 印出 RPC 回應
- 如果提供了 service-role key，會查詢 user_collected_badges 以確認紀錄是否寫入
- 再次呼叫 RPC 檢查是否回傳 already_unlocked 類型的回應

安全性與注意事項
- 請勿將實際的 service-role key 或任何敏感憑證推送至版本控制。請使用 CI / GitHub Secrets 或本地 .env.local 並將其加入 .gitignore。
- 測試為示範/骨架：若你的 database RPC 名稱或參數不同（例如使用 user_lon/user_lat 或 lon/lat），請在執行前調整 CHECKIN_RPC_NAME 與傳入的參數名稱。

如：如果你的 RPC 參數名稱為 (user_lon, user_lat)，請在執行時設定相對應的 CHECKIN_RPC_NAME 與環境變數，或直接修改 tests/api/checkin.test.js 中的參數鍵。

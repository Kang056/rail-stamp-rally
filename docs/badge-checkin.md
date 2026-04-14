Badge Check-in (打卡) — 使用與測試說明

啟用環境變數
- 複製 `.env.local.example` 為 `.env.local`，填入：
  - NEXT_PUBLIC_SUPABASE_URL
  - NEXT_PUBLIC_SUPABASE_ANON_KEY

行為說明
- 當上方兩個環境變數存在時，首頁會呼叫 Supabase RPC `get_all_railway_geojson` 並在地圖上顯示實際資料（取代 MOCK）。
- 點擊右上角「打卡 / 到訪」會要求瀏覽器定位、取得目前使用者（需先登入），再呼叫 `checkin` RPC（參數：user_lon, user_lat, user_id）。成功後會顯示小提示與徽章縮圖，並觸發地圖資料重新載入。

簡短手動測試步驟
1. 在 `.env.local` 設定 NEXT_PUBLIC_SUPABASE_URL 與 NEXT_PUBLIC_SUPABASE_ANON_KEY。
2. npm run dev，開啟瀏覽器到 http://localhost:3000。
3. 使用瀏覽器 DevTools 模擬地理位置（Chrome: DevTools → Sensors → Geolocation）。
4. 先登入（Supabase auth），再按「打卡 / 到訪」。
5. 期望結果：顯示「打卡成功！」提示、若有回傳 badge_image_url 則顯示縮圖、地圖資料重新整理並反映已解鎖狀態。

Playwright 測試提示
- 可在 Playwright 建立 context 時傳入 geolocation 和 permissions：
  context = await browser.newContext({ geolocation: { longitude: 121.0, latitude: 25.0 }, permissions: ['geolocation'] });
- 使用測試帳號登入後，導航到頁面並點擊打卡按鈕，檢查回應與界面更新。

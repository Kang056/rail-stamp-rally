# [cite_start]系統設計與開發規格書 (System Design Document) [cite: 1]

[cite_start]**專案名稱：鐵道集旅 (Rail Stamp Rally)** [cite: 2]

[cite_start]本文件旨在為 RD 開發團隊提供「鐵道集旅」專案的技術實作藍圖，涵蓋前端地圖渲染效能優化、後端資料庫設計、圖資的獲取與供應規格，以及遊戲化（Gamification）的車站打卡集章系統。[cite: 3] [cite_start]本架構特別針對「零成本（Zero-Cost）」營運進行最佳化，全面採用強大的免費級別（Free Tier）開源或雲端服務。[cite: 3]

---

## [cite_start]1. 系統架構總覽 (System Architecture) [cite: 4]

[cite_start]本專案全面導入 Next.js 作為核心全端框架，並以 Supabase 作為後端即服務（BaaS）資料庫，打造高效能且免付費的 WebGIS 應用程式。[cite: 5] [cite_start]為了確保地圖能完整呈現全臺龐大的鐵路與車站路網，且不受外部 API 流量限制，系統採取**「資料庫自有化」**策略。[cite: 5]

* [cite_start]**全端核心框架與託管 (Core Framework & Hosting)：** Next.js (採用 App Router 架構)。[cite: 6] [cite_start]專案將部署於 Vercel 的 Hobby 免費方案。[cite: 6]
* [cite_start]**後端與空間資料庫 (Backend as a Service)：** 採用 Supabase。[cite: 7] [cite_start]Supabase 提供 500 MB 的 PostgreSQL 資料庫空間與無限制的 API 請求次數。[cite: 7] [cite_start]全臺鐵道路網與車站的空間資料將一次性存入此資料庫中，由專案內部 API 供應，完全與外部 API 脫鉤。[cite: 7]
* [cite_start]**前端地圖引擎與免費圖資 (Map Engine & Tiles)：** [cite: 8]
    * [cite_start]底圖選用 OpenStreetMap (OSM) 搭配 Leaflet.js。[cite: 9]
    * [cite_start]在 Next.js 中實作 Leaflet 時，必須使用 `next/dynamic` 將地圖元件以動態載入 (Dynamic Import) 的方式引入，並強制設定 `ssr: false`。[cite: 10]
    * [cite_start]為優化海量軌道節點與路線的渲染，導入 `geojson-vt` 進行客戶端向量圖磚即時切割。[cite: 11]
* [cite_start]**核心互動機制 (Core Interaction)：** 導入「數位車站集章」模式，讓使用者在抵達實體車站時，透過行動裝置的 GPS 進行打卡，解鎖極具地方特色的數位徽章，強化使用者與鐵道基礎建設之間的情感連結。[cite: 12]

---

## [cite_start]2. 資料庫設計 (Database Schema & ER Model) [cite: 13]

* [cite_start]所有空間資料 (Geometry) 皆須採用 EPSG:4326 (WGS 84) 座標系統儲存。[cite: 14]
* [cite_start]**開發前置作業：** RD 團隊需進入 Supabase 控制台的「Extensions」頁面，手動啟用 `postgis` 擴充模組。[cite: 15]

### [cite_start]2.1 Table: railway_stations (車站節點表) [cite: 16]
[cite_start]負責儲存全臺軌道車站的地理與歷史資訊，並確保地圖上能完整呈現每一個站點。[cite: 17]
* [cite_start]`id` (UUID, Primary Key) [cite: 18]
* [cite_start]`station_id` (String, Indexed): 車站代碼。[cite: 19]
* [cite_start]`station_name` (String): 車站名稱 (例如: 台北車站)。[cite: 20]
* [cite_start]`system_type` (Enum): 系統別 (TRA 台鐵, HSR 高鐵, TRTC 北捷, TYMC 桃捷, KRTC 高捷, TMRT 中捷, NTMC 新北捷運, KLRT 高雄輕軌)。[cite: 21]
* [cite_start]`line_id` (String): 所屬路線代碼。[cite: 22]
* [cite_start]`geom` (Geometry, Point, 4326): 車站精確經緯度，需建立 GiST 空間索引。[cite: 23]
* [cite_start]`established_year` (Integer): 啟用年份。[cite: 24]
* [cite_start]`history_desc` (Text): 歷史沿革描述。[cite: 25]
* [cite_start]`history_image_url` (String): 歷史老照片網址。[cite: 26]
* [cite_start]`badge_image_url` (String): 該車站專屬特色徽章之圖片網址。[cite: 27]

### [cite_start]2.2 Table: railway_lines (軌道路線表) [cite: 28]
[cite_start]負責儲存全臺軌道實體線型，確保地圖上能完整畫出所有運輸路網。[cite: 29]
* [cite_start]`id` (UUID, Primary Key) [cite: 30]
* [cite_start]`line_id` (String, Indexed): 路線代碼。[cite: 31]
* [cite_start]`line_name` (String): 路線名稱 (例如: 淡水信義線)。[cite: 32]
* [cite_start]`system_type` (Enum): 系統別。[cite: 33]
* [cite_start]`color_hex` (String): 路線專屬識別色碼。[cite: 34]
* [cite_start]`geom` (Geometry, LineString/MultiLineString, 4326): 軌道幾何線型，需建立 GiST 空間索引。[cite: 35]
* [cite_start]`history_desc` (Text): 路線建設歷史與經典列車介紹。[cite: 36]

### [cite_start]2.3 Table: user_collected_badges (使用者集章紀錄表) [cite: 37]
[cite_start]負責記錄每位使用者成功打卡並解鎖的車站徽章。[cite: 38]
* [cite_start]`id` (UUID, Primary Key) [cite: 39]
* [cite_start]`user_id` (UUID, Foreign Key): 關聯至 Supabase Auth 的使用者 ID。[cite: 40]
* [cite_start]`station_id` (String, Foreign Key): 關聯至 `railway_stations` 的車站代碼。[cite: 41]
* [cite_start]`unlocked_at` (Timestamp): 成功打卡解鎖的時間戳記。[cite: 42]
* [cite_start]**Index：** 建立 `(user_id, station_id)` 的 Unique 複合索引，避免重複派發。[cite: 43]

---

## [cite_start]3. 圖資獲取與儲存策略 (Data Acquisition & Storage Strategy) [cite: 44]

[cite_start]考量到「交通部 TDX 運輸資料流通服務平臺」的 API 服務設有每日呼叫次數限制，為了確保專案上線後，使用者在瀏覽全臺車站與龐大路網時能維持極佳的效能，本專案採取**「一次性開發端拉取 (One-Time Ingestion)」**策略，將資料完整轉移至自建的 Supabase 資料庫。[cite: 45]

### [cite_start]3.1 認證機制與 Access Token 獲取 [cite: 46]
[cite_start]執行資料拉取腳本前，必須向 TDX 驗證伺服器獲取 Token：[cite: 47]
* [cite_start]**端點：** `POST https://tdx.transportdata.tw/auth/realms/TDXConnect/protocol/openid-connect/token` [cite: 48]
* [cite_start]**參數：** 帶入 `grant_type=client_credentials`、開發者申請之 `client_id` 與 `client_secret`。[cite: 49]
* [cite_start]將取得的 Access Token 附加於後續請求的 `Header Authorization: Bearer {token}`。[cite: 50]

### [cite_start]3.2 TDX Rail V3 API 呼叫清單與 GeoJSON 參數設定 [cite: 51]
[cite_start]為取得可直接寫入 PostGIS 或供地圖套件使用的幾何資料，**所有 API 請求網址後方均須強制附加 `?$format=GEOJSON` 參數**。[cite: 52] [cite_start]這能讓 API 回傳標準 GeoJSON 格式，而非預設帶有 WKT 字串的 JSON。[cite: 52]

[cite_start]RD 團隊需開發腳本（如 Node.js 或 Python），依序請求以下端點：[cite: 53]

* [cite_start]**臺灣鐵路 (TRA)** [cite: 54]
    * [cite_start]車站點位：`GET https://tdx.transportdata.tw/api/basic/v3/Rail/TRA/Station?$format=GEOJSON` [cite: 55]
    * [cite_start]軌道線型：`GET https://tdx.transportdata.tw/api/basic/v3/Rail/TRA/Network?$format=GEOJSON` [cite: 56]
* [cite_start]**台灣高鐵 (THSR)** [cite: 57]
    * [cite_start]車站點位：`GET https://tdx.transportdata.tw/api/basic/v3/Rail/THSR/Station?$format=GEOJSON` [cite: 58]
    * [cite_start]軌道線型：`GET https://tdx.transportdata.tw/api/basic/v3/Rail/THSR/Network?$format=GEOJSON` [cite: 59]
* [cite_start]**捷運與輕軌系統 (Metro / LRT)** 需透過 `{RailSystem}` 變數輪詢各營運機構代碼：[cite: 60]
    * [cite_start]代碼清單：TRTC (北捷)、KRTC (高捷)、TYMC (桃捷)、TMRT (中捷)、NTMC (新北捷運，含淡海/安坑輕軌)、KLRT (高雄輕軌)。[cite: 61]
    * [cite_start]車站點位：`GET https://tdx.transportdata.tw/api/basic/v3/Rail/Metro/Station/{RailSystem}?$format=GEOJSON` [cite: 62]
    * [cite_start]軌道線型：`GET https://tdx.transportdata.tw/api/basic/v3/Rail/Metro/Network/{RailSystem}?$format=GEOJSON` [cite: 63]

### [cite_start]3.3 匯入自建資料庫 (Database Population) [cite: 64]
[cite_start]拉取到上述所有 GeoJSON 檔案後，開發腳本需進行資料清洗（Data Cleaning），並透過 PostGIS 函數（如 `ST_GeomFromGeoJSON`），全數匯入至專案自有的 Supabase 資料庫中的 `railway_stations` 與 `railway_lines` 資料表。[cite: 65] [cite_start]自此之後，專案**不再依賴**即時呼叫 TDX API。[cite: 65]

---

## [cite_start]4. 前端地圖渲染與視覺實作規格 (Frontend Map Implementation) [cite: 66]

### [cite_start]4.1 地圖初始化與效能優化 [cite: 67]
[cite_start]面對全臺完整的軌道路網與所有車站，嚴禁使用預設的 SVG 渲染，以避免 DOM 節點過載卡頓。[cite: 68]
* [cite_start]**強制 Canvas 渲染：** `const map = L.map('map', { renderer: L.canvas() });` [cite: 69]
* [cite_start]**導入 `geojson-vt`：** 將專案資料庫傳來的全臺 GeoJSON 在前端即時切割。[cite: 70]
* [cite_start]**渲染圖磚：** 使用 `Leaflet.VectorGrid` 擴充套件讀取切割後的 tileIndex 並繪製到 Canvas 圖層上。[cite: 71]

### [cite_start]4.2 路線色彩與膠捲樣式 (Layer Styling) [cite: 72]
[cite_start]前端渲染時需根據資料庫的 `system_type` 與 `line_name` 套用指定樣式。[cite: 73]

* [cite_start]**捷運與輕軌系統色碼 (Hex Codes)：** [cite: 74]
    * [cite_start]**北捷：** 文湖線 `#C48C31`、淡水信義線 `#E3002C`、松山新店線 `#008659`、中和新蘆線 `#F8B61C`、板南線 `#0070BD`、環狀線 `#FCDA01`。[cite: 75]
    * [cite_start]**淡海/安坑輕軌：** 整合為北捷路網，淡海標朱紅色，安坑標卡其色/光耀金。[cite: 76]
    * [cite_start]**貓空纜車：** `#00AFE2`。[cite: 77]
    * [cite_start]**桃捷：** 機場線 `#8246AF`。[cite: 78]
    * [cite_start]**高捷：** 紅線 `#e20b65`、橘線 `#faa73f`、環狀輕軌 `#7cbd52`。[cite: 79]
* [cite_start]**城際鐵路膠捲線型實作 (雙層疊加法)：** [cite: 80]
    [cite_start]前端需針對同一條路線繪製兩個重疊的 `L.polyline`：[cite: 81]
    * [cite_start]**台灣高鐵 (橘白膠捲)：** [cite: 82]
        * [cite_start]底層線條 (白色): `{ color: '#FFFFFF', weight: 6 }` [cite: 83]
        * [cite_start]上層線條 (橘色虛線): `{ color: '#db691d', weight: 4, dashArray: '10, 10' }` [cite: 84]
    * [cite_start]**臺灣鐵路 (黑白膠捲)：** [cite: 85]
        * [cite_start]底層線條 (白色): `{ color: '#FFFFFF', weight: 6 }` [cite: 86]
        * [cite_start]上層線條 (黑色虛線): `{ color: '#000000', weight: 4, dashArray: '10, 10' }` [cite: 87]

### [cite_start]4.3 響應式介面實作 (Mobile-First UI) [cite: 88]
* [cite_start]**Mobile：** 導入 `react-spring-bottom-sheet` 等套件。[cite: 89] [cite_start]點擊地圖特徵時，從底部滑出彈性面板 (Bottom Sheet) 顯示歷史資訊。[cite: 89]
* [cite_start]**Desktop：** 利用 CSS `@media (min-width: 768px)`，改由左側 Absolute 定位的 `<aside>` 側邊欄滑入顯示。[cite: 90]

### [cite_start]4.4 徽章收集頁面與 GPS 打卡機制 (Badge Collection & Check-in) [cite: 91]
[cite_start]此頁面專注於引導使用者進行實體探索與集章，視覺與互動邏輯定義如下：[cite: 92]
* [cite_start]**初始地圖狀態：** 切換至此頁面時，全臺鐵道路網正常顯示，但**所有車站節點預設套用 CSS 灰階濾鏡**（Disabled / Grayscale 狀態），呈現尚未收集的樣貌。[cite: 93]
* [cite_start]**主動打卡觸發 (Active Check-in)：** 頁面下方常駐一個顯眼的「打卡 / 到訪」按鈕。[cite: 94] [cite_start]當使用者點擊該按鈕時，前端程式將呼叫瀏覽器原生的 HTML5 Geolocation API `navigator.geolocation.getCurrentPosition()`，要求授權並獲取裝置當下最精確的經緯度座標。[cite: 94]
* [cite_start]**UI 解鎖動畫回饋：** 前端收到後端判定成功的 `station_id` 與 `badge_image_url` 後，透過 React State 更新地圖。[cite: 95] [cite_start]對應的車站節點將移除灰階濾鏡，並以帶有特效的動畫將專屬徽章圖示 Render 於地圖座標點上。[cite: 95]

---

## [cite_start]5. 專案內部資料存取規格 (Internal API / Supabase Client) [cite: 96]

[cite_start]專案上線後，所有的地圖渲染、資訊查詢與打卡驗證，皆透過前端 Next.js 呼叫自建的 Supabase 資料庫。[cite: 97]

### [cite_start]5.1 取得全臺路網 GeoJSON 圖資 (用於渲染) [cite: 98]
[cite_start]前端初始化時，直接向 Supabase 請求已經存放好的完整路網與車站空間資料：[cite: 99]

```javascript
[cite_start]// 透過 Supabase RPC 將 geom 轉換為 GeoJSON 回傳給前端 geojson-vt 處理 [cite: 101]
[cite_start]const { data, error } = await supabase.rpc('get_all_railway_geojson'); [cite: 101]
```

### [cite_start]5.2 點擊車站/路線取得詳細資訊 (Click-to-Query) [cite: 102]
[cite_start]當前端點擊特定地圖特徵時，利用 ID 查詢資料庫：[cite: 103]

```javascript
[cite_start]// 查詢車站歷史與營運資訊 [cite: 105]
const { data: station } = await supabase
  .from('railway_stations')
  .select('station_id, station_name, established_year, history_desc, history_image_url')
  .eq('station_id', clickedStationId)
  [cite_start].single(); [cite: 105]
```

### [cite_start]5.3 實體座標打卡與徽章解鎖判定 (Location-Based Unlock Logic) [cite: 106]
[cite_start]當前端傳送 GPS 座標至後端時，嚴禁使用 `ST_Buffer` 畫圓再求交集（效能極差）。[cite: 107] [cite_start]**資料庫端必須實作使用 `ST_DWithin` 的 RPC 函數**，以利用 GiST 空間索引進行超高速的比對。[cite: 107]

[cite_start]**判定邏輯 (Supabase RPC - SQL)：** [cite: 108]
[cite_start]尋找與使用者座標直線距離誤差在 **100 公尺以內**的車站，若吻合則將紀錄寫入 `user_collected_badges` 並回傳徽章資訊。[cite: 109]

```sql
[cite_start]-- 傳入參數：使用者經度 (user_lon), 使用者緯度 (user_lat) [cite: 111]
SELECT station_id, station_name, badge_image_url 
FROM railway_stations 
[cite_start]-- 將點位轉換為 geography 型別，確保距離計算單位為真實的公尺 [cite: 111]
WHERE ST_DWithin(
  geom::geography,
  ST_SetSRID(ST_MakePoint(user_lon, user_lat), 4326)::geography, 
  [cite_start]100 -- 判定誤差範圍：方圓 100 公尺內 [cite: 111]
) 
[cite_start]LIMIT 1; [cite: 111]
```
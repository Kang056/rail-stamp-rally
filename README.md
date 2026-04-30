# 🚂 Rail Stamp Rally — 鐵道集旅

A zero-cost **WebGIS** application that renders Taiwan's entire railway network
(TRA, HSR, and all Metro systems) on an interactive Leaflet map, with rich
station/line historical information backed by **Supabase + PostGIS**.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | [Next.js 15](https://nextjs.org) (App Router) |
| Database | [Supabase](https://supabase.com) (PostgreSQL + PostGIS) |
| Map Engine | [Leaflet.js](https://leafletjs.com), [geojson-vt](https://github.com/mapbox/geojson-vt), [Leaflet.VectorGrid](https://github.com/Leaflet/Leaflet.VectorGrid) |
| Mobile UI | [vaul](https://github.com/emilkowalski/vaul) (bottom sheet drawer) |
| Deployment | [GitHub Pages](https://pages.github.com) (static export via `output: 'export'`) |

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

```bash
cp .env.local.example .env.local
# Fill in NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, and TDX credentials
```

### 3. Set up the database

Run `supabase/schema.sql` in the **Supabase SQL Editor** to create the
`railway_stations` and `railway_lines` tables with PostGIS spatial indexes,
the `get_all_railway_geojson` RPC function, and Row Level Security policies.

### 4. Ingest data

```bash
node scripts/ingest-tdx-data.js
```

This fetches GeoJSON from the [TDX API](https://tdx.transportdata.tw/) and
parses it for insertion into Supabase.

### 5. Start the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Project Structure

```
.
├── app/
│   ├── layout.tsx              # Root layout (metadata, global styles)
│   ├── page.tsx                # Main page (map + sidebar/bottom-sheet, state owner)
│   ├── page.module.css         # Responsive layout styles
│   └── globals.css             # Global CSS reset
├── components/
│   ├── Map.tsx                 # Leaflet map (dynamically imported, ssr:false)
│   ├── FeatureDetails.tsx      # Station / line detail panel
│   ├── AuthButton.tsx          # Google OAuth sign-in/out + account drawer
│   ├── BadgeCheckin.tsx        # GPS check-in button
│   ├── CheckinRecordsPanel.tsx # Check-in history panel (time + station, newest first)
│   ├── AccountSettings.tsx     # Map display & theme settings
│   └── TrainScheduleDialog.tsx # TRA / HSR / Metro schedule query
├── lib/
│   ├── supabaseClient.ts       # Supabase client + typed helper functions
│   ├── levelSystem.ts          # XP / level calculation
│   ├── railwayConstants.ts     # System type labels & colours
│   └── i18n/                  # Traditional Chinese translation strings
├── scripts/
│   └── ingest-tdx-data.js     # One-time TDX data ingestion script
├── supabase/
│   ├── schema.sql              # PostGIS database schema + RPCs
│   └── *.sql                   # Incremental migration files (date-prefixed)
└── public/
    └── leaflet/                # Leaflet default marker icons
```

## Responsive Layout

| Viewport | Layout |
|----------|--------|
| **Mobile** (`< 768 px`) | Full-screen map + drag-up bottom sheet for details |
| **Desktop** (`≥ 768 px`) | Fixed 320 px left sidebar + map filling remaining space |

## Map Rendering — Filmstrip (膠捲) Style

Intercity railways (TRA / HSR) use a double-layer polyline technique:

1. **Thick white base** — simulates the film strip border
2. **Thin dashed coloured top** — shows the actual route colour

Metro lines use a single solid coloured polyline.

For very large datasets, the code includes a commented-out scaffold for
switching to **geojson-vt + Leaflet.VectorGrid** tiled rendering.

## Check-in Records (打卡紀錄)

After signing in, users can view their complete check-in history via the
**「打卡紀錄」** panel (accessible from the account menu on both mobile and desktop).

The panel shows:
- **Total check-in count** — summary card at the top
- **Individual records** — sorted newest to oldest, each entry displaying the
  **check-in time** and **station name**

Data is fetched from the `checkin_logs` table via the `get_user_checkin_logs`
Postgres RPC (one entry per station per day, per the daily check-in constraint).
New entries are prepended in real time after a successful GPS check-in without
requiring a page reload.

## Troubleshooting — RPC & RLS (常見問題與排錯)

如果網頁載入時看到 PostgREST 錯誤，例如：

```
{
    "code": "PGRST202",
    "details": "Searched for the function public.get_all_railway_geojson without parameters ...",
    "message": "Could not find the function public.get_all_railway_geojson without parameters in the schema cache"
}
```

原因與處理步驟：

- **可能原因 A — Function 未套用到資料庫**  
    1. 在 Supabase 專案的 **SQL Editor** 執行下列查詢，確認函式是否存在：  
         ```
         SELECT n.nspname AS schema, p.proname AS name, pg_get_functiondef(p.oid) AS definition
         FROM pg_proc p
         JOIN pg_namespace n ON p.pronamespace = n.oid
         WHERE p.proname = 'get_all_railway_geojson';
         ```
    2. 若查無結果，請在 SQL Editor 中執行 `supabase/schema.sql` 檔案內的 `CREATE OR REPLACE FUNCTION get_all_railway_geojson()` 區塊，然後再次執行上面的查詢。
    3. 確認授權：  
         ```
         GRANT EXECUTE ON FUNCTION public.get_all_railway_geojson() TO anon, authenticated;
         ```

- **可能原因 B — PostgREST schema cache 未更新**  
    - 若函式存在但仍顯示 PGRST202，請在 Supabase Dashboard 重載或重新啟動 API/服務（managed Supabase：Settings -> Database -> Restart / Rebuild schema；local: 停掉並重啟 `supabase` 服務），讓 PostgREST 重新載入 schema。

關於啟用 Row Level Security (RLS) 時出現：

```
Failed to toggle RLS: Failed to run sql query: ERROR: 42501: must be owner of table spatial_ref_sys
```

原因與解法：

- Supabase Dashboard 在某些 UI 操作（例如「Grant on all tables」或自動建立 policy）可能會對整個 `public` schema 下的所有 table 執行 GRANT/ALTER，這會包含 PostGIS 的系統表 `spatial_ref_sys`。該系統表由擁有者（通常為資料庫初始化者）管理，非擁有者的角色無法修改它，導致錯誤。

- 安全做法（避免修改系統表）：  
    - 不要執行 `GRANT ... ON ALL TABLES IN SCHEMA public ...`（會包含 `spatial_ref_sys`）。  
    - 改以針對單一應用表明確執行下列語句（在 Supabase SQL Editor 執行）：  
        ```
        ALTER TABLE public.railway_stations ENABLE ROW LEVEL SECURITY;
        CREATE POLICY "Public read stations"
            ON public.railway_stations FOR SELECT USING (true);
        GRANT SELECT ON public.railway_stations TO anon, authenticated;

        ALTER TABLE public.railway_lines ENABLE ROW LEVEL SECURITY;
        CREATE POLICY "Public read lines"
            ON public.railway_lines FOR SELECT USING (true);
        GRANT SELECT ON public.railway_lines TO anon, authenticated;
        ```
    - 這些語句只會影響你的應用表，不會觸碰 `spatial_ref_sys`，因此不會觸發「must be owner」權限錯誤。

如果要我代為：我可以（選一項）
- 幫你在 repo 加入更完整的排錯文件與可執行 SQL（已新增此段說明，可繼續建立獨立文件）
- 或逐項檢查你 Supabase 專案（需要你提供權限或告訴我你已執行的 SQL 結果）

請告訴我你要我接下來做哪一項。
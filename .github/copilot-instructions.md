# Copilot Instructions — Rail Stamp Rally (鐵道集旅)

## Commands

```bash
npm run dev        # Start Next.js dev server (http://localhost:3000)
npm run build      # Production build
npm run lint       # ESLint (next/core-web-vitals config)
node scripts/ingest-tdx-data.js  # One-time TDX data ingestion into Supabase
```

No test suite is configured. There is no `npm test` target.

## Architecture

**Next.js 15 (App Router) + Supabase (PostgreSQL/PostGIS) + Leaflet WebGIS.**

```
app/page.tsx          ← Root page: state owner, layout switcher
components/Map.tsx    ← Leaflet map (dynamic import, ssr:false)
components/FeatureDetails.tsx  ← Station/line detail panel
lib/supabaseClient.ts ← Singleton Supabase client + typed DB helpers
supabase/schema.sql   ← PostGIS schema + RPC function
scripts/ingest-tdx-data.js  ← Fetches TDX API → inserts into Supabase
```

Data flow: `supabase.rpc('get_all_railway_geojson')` → `FeatureCollection<RailwayFeatureProperties>` → `Map.tsx` renders features → user click → `onFeatureClick(props)` → `page.tsx` state → `FeatureDetails.tsx`.

Responsive layout controlled entirely by CSS:
- **Mobile < 768 px**: full-screen map + `react-spring-bottom-sheet`
- **Desktop ≥ 768 px**: fixed 320 px left `<aside>` sidebar + map filling remaining space

## Key Conventions

### Leaflet is browser-only — always use dynamic import
`Map.tsx` and `react-spring-bottom-sheet` must be loaded via `next/dynamic` with `ssr: false`. Never import them at the module level in a server or shared file. `next.config.js` also marks `leaflet` and `leaflet.vectorgrid` as server externals to suppress SSR warnings.

### Discriminated union for feature properties
All DB features use `RailwayFeatureProperties` (from `lib/supabaseClient.ts`), a union of `StationProperties | LineProperties` discriminated by `feature_type: 'station' | 'line'`. Always narrow with `feature.feature_type === 'station'` before accessing station-only fields.

### Filmstrip rendering for intercity railways
TRA and HSR lines use a two-layer polyline: thick white base + thin dashed coloured top (the "膠捲" filmstrip style). MRT/metro lines use a single solid polyline. This distinction is based on `system_type === 'TRA' || system_type === 'HSR'`.

### Stations use CircleMarker + Canvas renderer
Stations are rendered as `L.circleMarker` (not markers) with the Canvas renderer (`L.canvas()`) for performance when displaying thousands of points. Avoid switching to SVG renderer.

### Supabase RLS — anon key is read-only
The `NEXT_PUBLIC_SUPABASE_ANON_KEY` allows `SELECT` only (public RLS policies). Data ingestion (`scripts/ingest-tdx-data.js`) requires the **service-role** key which bypasses RLS. Never expose the service-role key to the browser.

### Path alias
`@/` resolves to the project root (`tsconfig.json` paths). Use `@/lib/supabaseClient`, `@/components/...`, etc.

### CSS Modules
All component styles use CSS Modules (`*.module.css`). No CSS-in-JS or global utility framework.

### VectorGrid scaffold (commented out)
`Map.tsx` contains a commented-out `geojson-vt` + `Leaflet.VectorGrid` implementation for tiled rendering at scale (10 000+ features). Uncomment and adapt it if performance becomes an issue.

## Environment Variables

```
NEXT_PUBLIC_SUPABASE_URL        # Supabase project URL
NEXT_PUBLIC_SUPABASE_ANON_KEY   # Supabase anon (public) key
# TDX API credentials (used only by ingest script)
TDX_CLIENT_ID
TDX_CLIENT_SECRET
```

Copy `.env.local.example` → `.env.local`.

## Database

Schema is in `supabase/schema.sql`. Run it once in the Supabase SQL Editor. Key objects:
- `railway_stations` — Point geometries (EPSG:4326), `railway_system_type` enum
- `railway_lines` — MultiLineString geometries, `color_hex` field drives map colour
- `get_all_railway_geojson()` — Postgres RPC returning a single GeoJSON FeatureCollection (stations + lines merged)
- Triggers auto-update `updated_at` on both tables

`RailwaySystemType` values: `TRA | HSR | TRTC | TYMC | KRTC | TMRT | NTMC | KLRT`

# Copilot Instructions — Rail Stamp Rally (鐵道集旅)

## Commands

```bash
npm run dev          # Start Next.js dev server (http://localhost:3000)
npm run build        # Static export production build (output → out/)
npm run lint         # ESLint (next/core-web-vitals)
npm run typecheck    # TypeScript type-check (tsc --noEmit)
npm run precheck     # typecheck + lint + build (run before PR)

# Tests — Playwright E2E (auto-starts dev server if not running)
npm test                                       # Run all Playwright tests
npx playwright test tests/home.spec.js         # Run a single test file
npx playwright test tests/checkin.spec.ts -g "Badge check-in"  # Run by test name

# Data ingestion (one-time, requires TDX credentials)
node scripts/ingest-tdx-data.js
```

## Architecture

**Next.js 15 (App Router, static export) + Supabase (PostgreSQL/PostGIS) + Leaflet WebGIS.**
Deployed to GitHub Pages via `output: 'export'` with `basePath: '/rail-stamp-rally'` in production.

### Core data flow

```
supabase.rpc('get_all_railway_geojson')
  → FeatureCollection<RailwayFeatureProperties>
  → Map.tsx renders stations + lines
  → user click → onFeatureClick(props) → page.tsx state → FeatureDetails.tsx
```

### Authentication & badge check-in flow

```
AuthButton (Google OAuth via Supabase Auth)
  → user logs in → page.tsx stores User
  → upsertProfile() writes to profiles table
  → getUserCollectedBadges() fetches existing badges via get_user_badges RPC
BadgeCheckin
  → navigator.geolocation → supabase.rpc('checkin', { user_lon, user_lat, p_user_id })
  → RPC finds station within 100 m (ST_DWithin) → inserts into user_collected_badges
  → returns { ok, station_id, station_name, badge_image_url, already_unlocked, unlocked_at }
```

### Responsive layout

CSS-only, no JS media queries:
- **Mobile < 768 px**: full-screen map + `vaul` Drawer (bottom sheet) for details and progress
- **Desktop ≥ 768 px**: fixed 320 px left `<aside>` sidebar + map filling remaining space

### Key components

| File | Role |
|------|------|
| `app/page.tsx` | Root page: state owner for selected feature, auth, collected badges, visible system filters |
| `components/Map.tsx` | Leaflet map (dynamic import, ssr:false). Canvas renderer, CircleMarker for stations |
| `components/FeatureDetails.tsx` | Station/line detail panel + badge progress bars per system |
| `components/AuthButton.tsx` | Google OAuth sign-in/out + account drawer |
| `components/BadgeCheckin.tsx` | GPS check-in button, calls `checkin` RPC |
| `lib/supabaseClient.ts` | Singleton Supabase client + all typed DB helper functions + type definitions |

## Key Conventions

### Leaflet is browser-only — always use dynamic import
`Map.tsx` must be loaded via `next/dynamic` with `ssr: false`. Never import Leaflet at the module level in a server or shared file. `next.config.js` marks `leaflet` and `leaflet.vectorgrid` as server externals to suppress SSR warnings.

### Discriminated union for feature properties
`RailwayFeatureProperties` (in `lib/supabaseClient.ts`) is `StationProperties | LineProperties`, discriminated by `feature_type: 'station' | 'line'`. Always narrow with `feature.feature_type === 'station'` before accessing station-only fields like `station_id` or `badge_image_url`.

### Filmstrip rendering for intercity railways
TRA and HSR lines use a two-layer polyline: thick white base + thin dashed coloured top (the "膠捲" filmstrip style). MRT/metro lines use a single solid polyline. Branch on `system_type === 'TRA' || system_type === 'HSR'`.

### Stations use CircleMarker + Canvas renderer
Stations are rendered as `L.circleMarker` with `L.canvas()` for performance with thousands of points. Do not switch to SVG renderer or `L.marker`.

### Mobile drawers use vaul
Mobile bottom sheets use the `vaul` library (`Drawer.Root` / `Drawer.Content`), not `react-spring-bottom-sheet`. Always set `modal={false}` when the drawer should not block map interaction.

### Supabase RLS model
- **Anon key** (`NEXT_PUBLIC_SUPABASE_ANON_KEY`): `SELECT` on `railway_stations`, `railway_lines`, and execute on `get_all_railway_geojson()`
- **Authenticated role**: additionally can INSERT/SELECT own rows in `user_collected_badges` and `profiles`, and execute `checkin()` and `get_user_badges()`
- **Service-role key**: used only by `scripts/ingest-tdx-data.js` for data ingestion. Never expose to the browser.

### Supabase RPC parameter naming
RPC functions use `p_` prefix for parameters that would collide with column names (e.g., `p_user_id` in `checkin()` and `get_user_badges()`). Match this convention when adding new RPCs.

### Database migrations
`supabase/schema.sql` is the base schema. Incremental changes are in date-prefixed migration files: `supabase/YYYY-MM-DD-<description>.sql`. For a fresh setup, use `supabase/init-full-schema.sql` which consolidates everything.

### Path alias
`@/` resolves to the project root (`tsconfig.json` paths). Use `@/lib/supabaseClient`, `@/components/...`, etc.

### CSS Modules
All component styles use CSS Modules (`*.module.css`). No CSS-in-JS or global utility framework.

### Static export with mock fallback
When Supabase env vars are missing (e.g., CI build), the Supabase client initialises with placeholder values. At runtime, if the RPC call fails, `page.tsx` falls back to `lib/mockGeoJSON.ts` so the build never breaks.

## Environment Variables

```
NEXT_PUBLIC_SUPABASE_URL        # Supabase project URL
NEXT_PUBLIC_SUPABASE_ANON_KEY   # Supabase anon (public) key
TDX_CLIENT_ID                   # TDX API (ingest script only)
TDX_CLIENT_SECRET               # TDX API (ingest script only)
```

Copy `.env.local.example` → `.env.local`.

## Database

Schema: `supabase/schema.sql` (base) + migration files in `supabase/`.

| Table | Purpose |
|-------|---------|
| `railway_stations` | Point geometries (EPSG:4326), `badge_image_url` for stamp images |
| `railway_lines` | MultiLineString geometries, `color_hex` drives map colour |
| `user_collected_badges` | Per-user badge records, unique on `(user_id, station_id)` |
| `profiles` | User profile info (synced from Supabase Auth on login) |

Key RPCs:
- `get_all_railway_geojson()` — returns merged GeoJSON FeatureCollection (stations + lines)
- `checkin(user_lon, user_lat, p_user_id)` — GPS check-in, returns JSON with `ok`, `station_id`, `badge_image_url`, `already_unlocked`
- `get_user_badges(p_user_id)` — returns all collected badges for a user
- `insert_stations_bulk(rows)` / `insert_lines_bulk(rows)` — idempotent upserts used by ingestion script

`RailwaySystemType` enum values: `TRA | HSR | TRTC | TYMC | KRTC | TMRT | NTMC | KLRT`

## CI/CD

GitHub Actions pipeline (`.github/workflows/`):
1. **Playwright tests** → 2. **CI - Tests** (typecheck + lint + build + E2E + API tests) → 3. **Deploy** to GitHub Pages (static export)

## MCP Servers

### Playwright

Use the Playwright MCP server to interact with the browser when debugging E2E tests or inspecting runtime behaviour.

```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["@playwright/mcp@latest", "--browser", "chromium"]
    }
  }
}
```

Add this to your VS Code `settings.json` under `mcp.servers`, or to `.vscode/mcp.json` for the workspace.

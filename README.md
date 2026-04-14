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
| Mobile UI | [react-spring-bottom-sheet](https://github.com/stipsan/react-spring-bottom-sheet) |
| Deployment | [Vercel](https://vercel.com) (Hobby tier) |

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
│   ├── layout.tsx          # Root layout (metadata, global styles)
│   ├── page.tsx            # Main page (map + sidebar/bottom-sheet)
│   ├── page.module.css     # Responsive layout styles
│   └── globals.css         # Global CSS reset
├── components/
│   ├── Map.tsx             # Leaflet map (dynamically imported, ssr:false)
│   ├── FeatureDetails.tsx  # Station / line detail panel
│   └── FeatureDetails.module.css
├── lib/
│   └── supabaseClient.ts   # Supabase client + typed helper functions
├── scripts/
│   └── ingest-tdx-data.js  # One-time TDX data ingestion script
├── supabase/
│   └── schema.sql          # PostGIS database schema + RPC
└── public/
    └── leaflet/            # Leaflet default marker icons
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
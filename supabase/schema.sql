-- Rail Stamp Rally (鐵道集旅) - Supabase/PostGIS Database Schema
-- Run this SQL in the Supabase SQL Editor to set up the database.

-- ─────────────────────────────────────────────
-- Enable the PostGIS extension (spatial data)
-- ─────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS postgis;
-- Needed for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ─────────────────────────────────────────────
-- Shared enum for railway system types
-- ─────────────────────────────────────────────
CREATE TYPE railway_system_type AS ENUM (
  'TRA',   -- Taiwan Railways Administration (台灣鐵路)
  'HSR',   -- High Speed Rail (高速鐵路)
  'TRTC',  -- Taipei Rapid Transit Corporation (台北捷運)
  'TYMC',  -- Taoyuan Mass Rapid Transit (桃園捷運)
  'KRTC',  -- Kaohsiung Rapid Transit Corporation (高雄捷運)
  'TMRT',  -- Taichung MRT (台中捷運)
  'NTMC',  -- New Taipei Metro (新北捷運)
  'KLRT'   -- Keelung Light Rail (高雄輕軌)
);

-- ─────────────────────────────────────────────
-- railway_stations table
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS railway_stations (
  id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  station_id        TEXT          NOT NULL,
  station_name      TEXT          NOT NULL,
  system_type       railway_system_type NOT NULL,
  line_id           TEXT          NOT NULL,
  geom              GEOMETRY(Point, 4326) NOT NULL,
  established_year  INTEGER,
  history_desc      TEXT,
  history_image_url TEXT,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Index on station_id for fast lookup by station code
CREATE INDEX IF NOT EXISTS idx_railway_stations_station_id
  ON railway_stations (station_id);

-- GiST spatial index for geography queries (e.g. bbox intersection)
CREATE INDEX IF NOT EXISTS idx_railway_stations_geom
  ON railway_stations USING GIST (geom);

-- ─────────────────────────────────────────────
-- railway_lines table
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS railway_lines (
  id           UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  line_id      TEXT          NOT NULL,
  line_name    TEXT          NOT NULL,
  system_type  railway_system_type NOT NULL,
  color_hex    TEXT          NOT NULL DEFAULT '#888888',
  -- Supports both simple LineString and multi-segment MultiLineString geometries
  geom         GEOMETRY(MultiLineString, 4326) NOT NULL,
  history_desc TEXT,
  created_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Index on line_id for fast lookup by line code
CREATE INDEX IF NOT EXISTS idx_railway_lines_line_id
  ON railway_lines (line_id);

-- Ensure unique constraints for idempotent upserts by station/line code
CREATE UNIQUE INDEX IF NOT EXISTS uq_railway_stations_station_system ON railway_stations (station_id, system_type);
CREATE UNIQUE INDEX IF NOT EXISTS uq_railway_lines_line_system ON railway_lines (line_id, system_type);

-- GiST spatial index for geography queries
CREATE INDEX IF NOT EXISTS idx_railway_lines_geom
  ON railway_lines USING GIST (geom);

-- ─────────────────────────────────────────────
-- auto-update updated_at trigger
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_stations_updated_at
  BEFORE UPDATE ON railway_stations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_lines_updated_at
  BEFORE UPDATE ON railway_lines
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─────────────────────────────────────────────
-- RPC: get_all_railway_geojson
-- Returns a single GeoJSON FeatureCollection containing all stations and
-- lines. Called from the frontend via supabase.rpc('get_all_railway_geojson').
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_all_railway_geojson()
RETURNS JSON
LANGUAGE sql
STABLE
AS $$
  SELECT json_build_object(
    'type', 'FeatureCollection',
    'features', json_agg(feature)
  )
  FROM (
    -- Station features
    SELECT json_build_object(
      'type',       'Feature',
      'geometry',   ST_AsGeoJSON(geom)::json,
      'properties', json_build_object(
        'feature_type',       'station',
        'id',                 id,
        'station_id',         station_id,
        'station_name',       station_name,
        'system_type',        system_type,
        'line_id',            line_id,
        'established_year',   established_year,
        'history_desc',       history_desc,
        'history_image_url',  history_image_url
      )
    ) AS feature
    FROM railway_stations

    UNION ALL

    -- Line features
    SELECT json_build_object(
      'type',       'Feature',
      'geometry',   ST_AsGeoJSON(geom)::json,
      'properties', json_build_object(
        'feature_type', 'line',
        'id',           id,
        'line_id',      line_id,
        'line_name',    line_name,
        'system_type',  system_type,
        'color_hex',    color_hex,
        'history_desc', history_desc
      )
    ) AS feature
    FROM railway_lines
  ) features;
$$;

-- ─────────────────────────────────────────────
-- Row Level Security (RLS)
-- Public read access; writes require service-role key (used by ingest script)
-- ─────────────────────────────────────────────
ALTER TABLE railway_stations ENABLE ROW LEVEL SECURITY;
ALTER TABLE railway_lines    ENABLE ROW LEVEL SECURITY;

-- Allow anyone to SELECT (anon key is sufficient for map rendering)
CREATE POLICY "Public read stations"
  ON railway_stations FOR SELECT
  USING (true);

CREATE POLICY "Public read lines"
  ON railway_lines FOR SELECT
  USING (true);

-- Service role (used by the ingest script) bypasses RLS automatically,
-- so no extra INSERT/UPDATE policy is needed for it.

-- ─────────────────────────────────────────────
-- Bulk insert RPCs used by the ingestion script
-- Accepts a JSON array of objects and performs idempotent upserts
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION insert_stations_bulk(rows json)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO railway_stations (
    station_id, station_name, system_type, line_id, geom,
    established_year, history_desc, history_image_url
  )
  SELECT
    elem->>'station_id',
    COALESCE(elem->>'station_name',''),
    (elem->>'system_type')::railway_system_type,
    elem->>'line_id',
    ST_SetSRID(ST_GeomFromGeoJSON((elem->'geom')::text), 4326),
    NULLIF(elem->>'established_year','')::int,
    elem->>'history_desc',
    elem->>'history_image_url'
  FROM json_array_elements(rows) AS arr(elem)
  ON CONFLICT (station_id, system_type) DO UPDATE
  SET
    station_name = EXCLUDED.station_name,
    line_id = EXCLUDED.line_id,
    geom = EXCLUDED.geom,
    established_year = EXCLUDED.established_year,
    history_desc = EXCLUDED.history_desc,
    history_image_url = EXCLUDED.history_image_url,
    updated_at = NOW();
END;
$$;

CREATE OR REPLACE FUNCTION insert_lines_bulk(rows json)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO railway_lines (
    line_id, line_name, system_type, color_hex, geom, history_desc
  )
  SELECT
    elem->>'line_id',
    COALESCE(elem->>'line_name',''),
    (elem->>'system_type')::railway_system_type,
    COALESCE(elem->>'color_hex','#888888'),
    ST_SetSRID(ST_GeomFromGeoJSON((elem->'geom')::text), 4326),
    elem->>'history_desc'
  FROM json_array_elements(rows) AS arr(elem)
  ON CONFLICT (line_id, system_type) DO UPDATE
  SET
    line_name = EXCLUDED.line_name,
    color_hex = EXCLUDED.color_hex,
    geom = EXCLUDED.geom,
    history_desc = EXCLUDED.history_desc,
    updated_at = NOW();
END;
$$;
-- Grants
-- Allow the anon and authenticated roles (used by the Supabase JS client with
-- the public anon key) to SELECT from both tables and to call the RPC function.
-- RLS policies above act as a row-level filter on top of these grants.
-- Without these grants the browser client receives "permission denied" even
-- though the RLS policies permit the rows.
-- ─────────────────────────────────────────────
GRANT SELECT ON railway_stations TO anon, authenticated;
GRANT SELECT ON railway_lines    TO anon, authenticated;

GRANT EXECUTE ON FUNCTION get_all_railway_geojson() TO anon, authenticated;

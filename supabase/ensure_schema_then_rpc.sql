-- ensure_schema_then_rpc.sql
-- Idempotent script: create extensions, type, tables, triggers, RPCs, and grants
-- Run this in the Supabase SQL Editor as a project owner

BEGIN;

-- Extensions
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Enum type: create if not exists
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'railway_system_type') THEN
    CREATE TYPE railway_system_type AS ENUM (
      'TRA', 'HSR', 'TRTC', 'TYMC', 'KRTC', 'TMRT', 'NTMC', 'KLRT'
    );
  END IF;
END$$;

-- Tables
CREATE TABLE IF NOT EXISTS public.railway_stations (
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

CREATE TABLE IF NOT EXISTS public.railway_lines (
  id           UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  line_id      TEXT          NOT NULL,
  line_name    TEXT          NOT NULL,
  system_type  railway_system_type NOT NULL,
  color_hex    TEXT          NOT NULL DEFAULT '#888888',
  geom         GEOMETRY(MultiLineString, 4326) NOT NULL,
  history_desc TEXT,
  created_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_railway_stations_station_id
  ON public.railway_stations (station_id);

CREATE INDEX IF NOT EXISTS idx_railway_stations_geom
  ON public.railway_stations USING GIST (geom);

CREATE INDEX IF NOT EXISTS idx_railway_lines_line_id
  ON public.railway_lines (line_id);
-- Create unique indexes (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE c.relname = 'uq_railway_stations_station_system') THEN
    EXECUTE 'CREATE UNIQUE INDEX uq_railway_stations_station_system ON public.railway_stations (station_id, system_type)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE c.relname = 'uq_railway_lines_line_system') THEN
    EXECUTE 'CREATE UNIQUE INDEX uq_railway_lines_line_system ON public.railway_lines (line_id, system_type)';
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_railway_lines_geom
  ON public.railway_lines USING GIST (geom);

-- update_updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers (drop-if-exists then create to ensure idempotency)
DROP TRIGGER IF EXISTS trg_stations_updated_at ON public.railway_stations;
CREATE TRIGGER trg_stations_updated_at
  BEFORE UPDATE ON public.railway_stations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_lines_updated_at ON public.railway_lines;
CREATE TRIGGER trg_lines_updated_at
  BEFORE UPDATE ON public.railway_lines
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RPC: get_all_railway_geojson
CREATE OR REPLACE FUNCTION public.get_all_railway_geojson()
RETURNS JSON
LANGUAGE sql
STABLE
AS $$
  SELECT json_build_object(
    'type', 'FeatureCollection',
    'features', json_agg(feature)
  )
  FROM (
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
    FROM public.railway_stations

    UNION ALL

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
    FROM public.railway_lines
  ) features;
$$;

-- Bulk insert RPCs
CREATE OR REPLACE FUNCTION public.insert_stations_bulk(rows json)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.railway_stations (
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

CREATE OR REPLACE FUNCTION public.insert_lines_bulk(rows json)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.railway_lines (
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
GRANT SELECT ON public.railway_stations TO anon, authenticated;
GRANT SELECT ON public.railway_lines    TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_all_railway_geojson() TO anon, authenticated;

COMMIT;

-- Quick checks (optional):
-- SELECT table_schema, table_name FROM information_schema.tables WHERE table_name IN ('railway_stations','railway_lines');

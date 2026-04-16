-- fix_get_all_railway_geojson.sql
-- Run this in the Supabase SQL Editor to (re)create the RPC and grant execute

BEGIN;

-- Ensure PostGIS & pgcrypto exist
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Create or replace the RPC in the public schema explicitly
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
        'history_image_url',  history_image_url,
        'badge_image_url',    badge_image_url
      )
    ) AS feature
    FROM public.railway_stations

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
    FROM public.railway_lines
  ) features;
$$;

-- Grant execute to anon & authenticated (browser client)
GRANT EXECUTE ON FUNCTION public.get_all_railway_geojson() TO anon, authenticated;

-- Quick existence check (returns row if function exists)
SELECT n.nspname AS schema, p.proname AS name
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE p.proname = 'get_all_railway_geojson';

COMMIT;

-- USAGE: After running this, if PostgREST still reports PGRST202, restart/rebuild the API/schema cache
-- via the Supabase Dashboard (Database -> Restart) or the API settings so PostgREST reloads the function list.

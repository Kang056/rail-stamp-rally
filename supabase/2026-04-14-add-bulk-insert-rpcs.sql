-- Migration: Add bulk insert RPCs for stations and lines
-- Date: 2026-04-14

-- insert_stations_bulk(rows jsonb)
-- Expects an array of JSON objects with at least: station_id, station_name, system_type, line_id, geom (GeoJSON object)
-- Optional fields: established_year, history_desc, history_image_url
CREATE OR REPLACE FUNCTION insert_stations_bulk(rows jsonb)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  r jsonb;
BEGIN
  IF rows IS NULL THEN
    RETURN;
  END IF;

  FOR r IN SELECT * FROM jsonb_array_elements(rows)
  LOOP
    INSERT INTO railway_stations (
      station_id,
      station_name,
      system_type,
      line_id,
      geom,
      established_year,
      history_desc,
      history_image_url
    )
    SELECT
      COALESCE(r->>'station_id','')::text,
      COALESCE(r->>'station_name','')::text,
      (r->>'system_type')::railway_system_type,
      COALESCE(r->>'line_id','')::text,
      ST_GeomFromGeoJSON(r->>'geom'),
      NULLIF(r->>'established_year','')::int,
      r->>'history_desc',
      r->>'history_image_url'
    WHERE NOT EXISTS (
      SELECT 1 FROM railway_stations WHERE station_id = r->>'station_id'
    );
  END LOOP;
END;
$$;

-- insert_lines_bulk(rows jsonb)
-- Expects an array of JSON objects with at least: line_id, line_name, system_type, color_hex, geom (GeoJSON MultiLineString or LineString)
-- Optional fields: history_desc
CREATE OR REPLACE FUNCTION insert_lines_bulk(rows jsonb)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  r jsonb;
BEGIN
  IF rows IS NULL THEN
    RETURN;
  END IF;

  FOR r IN SELECT * FROM jsonb_array_elements(rows)
  LOOP
    INSERT INTO railway_lines (
      line_id,
      line_name,
      system_type,
      color_hex,
      geom,
      history_desc
    )
    SELECT
      COALESCE(r->>'line_id','')::text,
      COALESCE(r->>'line_name','')::text,
      (r->>'system_type')::railway_system_type,
      COALESCE(r->>'color_hex','#888888')::text,
      ST_GeomFromGeoJSON(r->>'geom'),
      r->>'history_desc'
    WHERE NOT EXISTS (
      SELECT 1 FROM railway_lines WHERE line_id = r->>'line_id'
    );
  END LOOP;
END;
$$;

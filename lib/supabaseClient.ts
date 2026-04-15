import { createClient } from '@supabase/supabase-js';
import type { FeatureCollection, Geometry } from 'geojson';

// ─────────────────────────────────────────────────────────────────────────────
// Environment variables
// Copy .env.local.example → .env.local and fill in your project values.
// ─────────────────────────────────────────────────────────────────────────────
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

// ─────────────────────────────────────────────────────────────────────────────
// Singleton Supabase client (safe for both browser and server components)
// When env vars are missing (e.g. CI build), create a dummy client that will
// fail at request time rather than at module-load time, so static generation
// can still succeed.
// ─────────────────────────────────────────────────────────────────────────────
export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-key',
);

// ─────────────────────────────────────────────────────────────────────────────
// Type definitions for station / line properties returned from the DB
// ─────────────────────────────────────────────────────────────────────────────
export type RailwaySystemType =
  | 'TRA'
  | 'HSR'
  | 'TRTC'
  | 'TYMC'
  | 'KRTC'
  | 'TMRT'
  | 'NTMC'
  | 'KLRT';

export interface StationProperties {
  feature_type: 'station';
  id: string;
  station_id: string;
  station_name: string;
  system_type: RailwaySystemType;
  line_id: string;
  established_year: number | null;
  history_desc: string | null;
  history_image_url: string | null;
  badge_image_url: string | null;
}

export interface LineProperties {
  feature_type: 'line';
  id: string;
  line_id: string;
  line_name: string;
  system_type: RailwaySystemType;
  color_hex: string;
  history_desc: string | null;
}

export type RailwayFeatureProperties = StationProperties | LineProperties;

// ─────────────────────────────────────────────────────────────────────────────
// getAllRailwayGeoJSON
// Calls the `get_all_railway_geojson` Postgres RPC defined in schema.sql.
// Returns a GeoJSON FeatureCollection containing every station and line.
// ─────────────────────────────────────────────────────────────────────────────
export async function getAllRailwayGeoJSON(): Promise<
  FeatureCollection<Geometry, RailwayFeatureProperties>
> {
  const { data, error } = await supabase.rpc('get_all_railway_geojson');

  if (error) {
    throw new Error(`Failed to fetch railway GeoJSON: ${error.message}`);
  }

  return data as FeatureCollection<Geometry, RailwayFeatureProperties>;
}

// ─────────────────────────────────────────────────────────────────────────────
// getStationById
// Fetches a single station's full details by its UUID primary key.
// ─────────────────────────────────────────────────────────────────────────────
export async function getStationById(id: string) {
  const { data, error } = await supabase
    .from('railway_stations')
    .select(
      'id, station_id, station_name, system_type, line_id, established_year, history_desc, history_image_url',
    )
    .eq('id', id)
    .single();

  if (error) {
    throw new Error(`Failed to fetch station ${id}: ${error.message}`);
  }

  return data;
}

// ─────────────────────────────────────────────────────────────────────────────
// getLineById
// Fetches a single railway line's details by its UUID primary key.
// ─────────────────────────────────────────────────────────────────────────────
export async function getLineById(id: string) {
  const { data, error } = await supabase
    .from('railway_lines')
    .select('id, line_id, line_name, system_type, color_hex, history_desc')
    .eq('id', id)
    .single();

  if (error) {
    throw new Error(`Failed to fetch line ${id}: ${error.message}`);
  }

  return data;
}

// ─────────────────────────────────────────────────────────────────────────────
// searchStationsByName
// Full-text partial-match search on station_name. Useful for a search bar.
// ─────────────────────────────────────────────────────────────────────────────
export async function searchStationsByName(query: string) {
  const { data, error } = await supabase
    .from('railway_stations')
    .select('id, station_id, station_name, system_type, line_id')
    .ilike('station_name', `%${query}%`)
    .limit(20);

  if (error) {
    throw new Error(`Station search failed: ${error.message}`);
  }

  return data ?? [];
}

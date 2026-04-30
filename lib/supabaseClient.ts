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

// ─────────────────────────────────────────────────────────────────────────────
// CollectedBadge type — shape returned by get_user_badges RPC
// ─────────────────────────────────────────────────────────────────────────────
export interface CollectedBadge {
  station_id: string;
  unlocked_at: string;
  station_name: string;
  badge_image_url: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// getUserCollectedBadges
// Calls the `get_user_badges` Postgres RPC to fetch all badges for a user.
// ─────────────────────────────────────────────────────────────────────────────
export async function getUserCollectedBadges(userId: string): Promise<CollectedBadge[]> {
  const { data, error } = await supabase.rpc('get_user_badges', {
    p_user_id: userId,
  });

  if (error) {
    throw new Error(`Failed to fetch user badges: ${error.message}`);
  }

  return (data as CollectedBadge[]) ?? [];
}

// ─────────────────────────────────────────────────────────────────────────────
// upsertProfile
// Upserts user profile info to the profiles table after login.
// ─────────────────────────────────────────────────────────────────────────────
export async function upsertProfile(user: {
  id: string;
  email?: string;
  user_metadata?: { full_name?: string; avatar_url?: string };
}) {
  const { error } = await supabase
    .from('profiles')
    .upsert(
      {
        id: user.id,
        email: user.email ?? null,
        display_name: user.user_metadata?.full_name ?? null,
        avatar_url: user.user_metadata?.avatar_url ?? null,
      },
      { onConflict: 'id' },
    );

  if (error) {
    console.error('Failed to upsert profile:', error.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// getUserCheckinCount
// Returns the total number of successful check-ins for a user (across all days).
// ─────────────────────────────────────────────────────────────────────────────
export async function getUserCheckinCount(userId: string): Promise<number> {
  const { data, error } = await supabase.rpc('get_user_checkin_count', {
    p_user_id: userId,
  });

  if (error) {
    console.error('Failed to fetch checkin count:', error.message);
    return 0;
  }

  return (data as number) ?? 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// CheckinLogRecord — shape returned by get_user_checkin_logs RPC
// ─────────────────────────────────────────────────────────────────────────────
export interface CheckinLogRecord {
  created_at: string;
  station_name: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// getUserCheckinLogs
// Calls the `get_user_checkin_logs` Postgres RPC to fetch all check-in records
// for a user, sorted newest to oldest, with station name included.
// ─────────────────────────────────────────────────────────────────────────────
export async function getUserCheckinLogs(userId: string): Promise<CheckinLogRecord[]> {
  const { data, error } = await supabase.rpc('get_user_checkin_logs', {
    p_user_id: userId,
  });

  if (error) {
    console.error('Failed to fetch checkin logs:', error.message);
    return [];
  }

  return (data as CheckinLogRecord[]) ?? [];
}

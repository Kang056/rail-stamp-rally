checkin RPC

Signature:
  checkin(user_lon double precision, user_lat double precision, user_id uuid) RETURNS json

Usage (Supabase JS):

  // Example
  const { data, error } = await supabase.rpc('checkin', {
    user_lon: 121.540, // longitude
    user_lat: 25.033,  // latitude
    user_id: '00000000-0000-0000-0000-000000000000' // UUID of the user
  });

Return value (json):
  {
    ok: true|false,
    reason: 'not_nearby' // when ok is false
    already_unlocked: boolean,
    station_id: text,
    station_name: text,
    badge_image_url: text
  }

Notes:
- The RPC finds a nearby station using PostGIS ST_DWithin with a 100m radius.
- If a station is found the function attempts to insert into user_collected_badges (user_id, station_id) with ON CONFLICT DO NOTHING.
- The badge_image_url is taken from railway_stations.history_image_url (if present).
- Call via supabase.rpc('checkin', { user_lon, user_lat, user_id }).

// Supabase project: hifdh-tracker (eu-west-2)
// The publishable key is safe to ship in client code; row-level security
// restricts every table to the authenticated user's own rows.
export const SUPABASE_URL = 'https://kddjvlcfmrpuqhvjthks.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_8s-xx_Buv8lcMgotlsRtaA_wD2JsnW9';

// VAPID public key. Public by design: it identifies this server to the push
// service. The matching private key lives only in the database, readable by
// the service role alone.
export const VAPID_PUBLIC_KEY =
  'BCfluPkQ6Q5iLLAfv-zevQcFkKO8OpGU9kOxUjjCvAmCIDfwEvJQCHY7fDXq0GQrFX3Jf3Y5t9Sxf674Pga9dWA';

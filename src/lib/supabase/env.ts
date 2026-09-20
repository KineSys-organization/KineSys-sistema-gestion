export function supabaseUrl() {
  return process.env.NEXT_PUBLIC_SUPABASE_URL!;
}

// En KineSys la clave publicable vive con este nombre (en el ERP era ANON_KEY).
export function supabaseKey() {
  return process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
}

// Supabase verifies the token; decoding a caller-supplied JWT is not authentication.
export async function verifiedUser(req: Request, supabase: any) {
  const match = req.headers.get("authorization")?.match(/^Bearer\s+(\S+)$/i);
  if (!match) return null;
  const { data, error } = await supabase.auth.getUser(match[1]);
  return error ? null : data?.user || null;
}

export async function verifiedAdmin(req: Request, supabase: any) {
  const user = await verifiedUser(req, supabase);
  // app_metadata is controlled by the server. Never use user_metadata here.
  return user?.app_metadata?.role === "admin" ? user : null;
}

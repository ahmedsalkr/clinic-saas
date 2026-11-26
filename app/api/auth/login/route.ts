import { createClient } from "@supabase/supabase-js";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "بيانات الدخول غير صالحة." }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return Response.json({ error: "بيانات الدخول غير صالحة." }, { status: 400 });
  }
  const { clinicCode, username, password } = body as Record<string, unknown>;
  if (
    typeof clinicCode !== "string" ||
    typeof username !== "string" ||
    typeof password !== "string" ||
    !/^[a-z0-9-]{4,24}$/i.test(clinicCode.trim()) ||
    !/^[a-z0-9._-]{3,30}$/i.test(username.trim())
  ) {
    return Response.json({ error: "أدخل رمز المركز واسم المستخدم وكلمة المرور." }, { status: 400 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return Response.json({ error: "إعدادات Supabase غير مكتملة." }, { status: 503 });
  }

  let admin;
  try {
    admin = getSupabaseAdminClient();
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "إعدادات Supabase غير مكتملة.",
      },
      { status: 503 },
    );
  }
  const { data: clinic, error: clinicError } = await admin
    .from("clinics")
    .select("id")
    .eq("code", clinicCode.trim().toUpperCase())
    .maybeSingle();
  if (clinicError) {
    return Response.json({ error: clinicError.message }, { status: 500 });
  }
  if (!clinic) {
    return Response.json({ error: "رمز المركز أو بيانات الدخول غير صحيحة." }, { status: 401 });
  }

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("email, is_active")
    .eq("clinic_id", clinic.id)
    .eq("username", username.trim().toLowerCase())
    .maybeSingle();
  if (profileError) {
    return Response.json({ error: profileError.message }, { status: 500 });
  }
  if (!profile?.is_active) {
    return Response.json({ error: "رمز المركز أو بيانات الدخول غير صحيحة." }, { status: 401 });
  }

  const authClient = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await authClient.auth.signInWithPassword({
    email: profile.email,
    password,
  });
  if (error || !data.session) {
    return Response.json({ error: "رمز المركز أو بيانات الدخول غير صحيحة." }, { status: 401 });
  }

  return Response.json(
    {
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

import { createClient } from "@supabase/supabase-js";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

const invalidCredentials = "رمز المركز أو بيانات الدخول غير صحيحة.";

function jsonResponse(body: object, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export async function POST(request: Request) {
  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return jsonResponse({ error: "بيانات الدخول غير صالحة." }, 400);
  }
  if (rawBody.length > 8 * 1024) {
    return jsonResponse({ error: "بيانات الدخول كبيرة جداً." }, 413);
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return jsonResponse({ error: "بيانات الدخول غير صالحة." }, 400);
  }
  if (!isRecord(body)) {
    return jsonResponse({ error: "بيانات الدخول غير صالحة." }, 400);
  }

  const clinicCode = body.clinicCode;
  const identity = body.identity ?? body.username;
  const password = body.password;
  if (
    typeof clinicCode !== "string" ||
    typeof identity !== "string" ||
    typeof password !== "string" ||
    password.length === 0 ||
    password.length > 72 ||
    !/^[a-z0-9-]{4,24}$/i.test(clinicCode.trim())
  ) {
    return jsonResponse({ error: "أدخل رمز المركز وبيانات الدخول." }, 400);
  }

  const normalizedIdentity = identity.trim().toLowerCase();
  const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedIdentity);
  const isUsername = /^[a-z0-9._-]{3,30}$/i.test(normalizedIdentity);
  if (
    normalizedIdentity.length > 254 ||
    (!isEmail && !isUsername)
  ) {
    return jsonResponse({ error: "أدخل بريداً إلكترونياً أو اسم مستخدم صالحاً." }, 400);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return jsonResponse({ error: "إعدادات Supabase غير مكتملة." }, 503);
  }

  let admin;
  try {
    admin = getSupabaseAdminClient();
  } catch (error) {
    return jsonResponse(
      {
        error:
          error instanceof Error
            ? error.message
            : "إعدادات Supabase غير مكتملة.",
      },
      503,
    );
  }

  const { data: clinic, error: clinicError } = await admin
    .from("clinics")
    .select("id")
    .eq("code", clinicCode.trim().toUpperCase())
    .maybeSingle();
  if (clinicError) {
    console.error("Clinic lookup failed during login.", clinicError);
    return jsonResponse({ error: "تعذر التحقق من بيانات الدخول." }, 500);
  }
  if (!clinic) {
    return jsonResponse({ error: invalidCredentials }, 401);
  }

  const identityColumn = isEmail ? "email" : "username";
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("email, is_active")
    .eq("clinic_id", clinic.id)
    .eq(identityColumn, normalizedIdentity)
    .maybeSingle();
  if (profileError) {
    console.error("Profile lookup failed during login.", profileError);
    return jsonResponse({ error: "تعذر التحقق من بيانات الدخول." }, 500);
  }
  if (!profile?.is_active || !profile.email) {
    return jsonResponse({ error: invalidCredentials }, 401);
  }

  const authClient = createClient(url, anonKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
  const { data, error } = await authClient.auth.signInWithPassword({
    email: profile.email,
    password,
  });
  if (error || !data.session) {
    return jsonResponse({ error: invalidCredentials }, 401);
  }

  return jsonResponse({
    accessToken: data.session.access_token,
    refreshToken: data.session.refresh_token,
  });
}

import { sendClinicCodeEmail } from "@/lib/email";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

const genericResponse = {
  message: "إذا كان البريد مسجلاً، فقد تم إرسال رمز المركز إليه.",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export async function POST(request: Request) {
  try {
    const contentLength = Number(request.headers.get("content-length") || 0);
    if (contentLength > 2 * 1024) {
      return Response.json(genericResponse);
    }

    const body: unknown = await request.json();
    if (
      !isRecord(body) ||
      typeof body.email !== "string" ||
      body.email.trim().length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim())
    ) {
      return Response.json(genericResponse);
    }

    const email = body.email.trim().toLowerCase();
    const supabase = getSupabaseAdminClient();
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("clinic_id")
      .eq("email", email)
      .eq("is_active", true)
      .maybeSingle();

    if (profileError) {
      console.error("Clinic-code recovery profile lookup failed.", profileError);
      return Response.json(genericResponse);
    }
    if (!profile?.clinic_id) {
      return Response.json(genericResponse);
    }

    const { data: clinic, error: clinicError } = await supabase
      .from("clinics")
      .select("code, name")
      .eq("id", profile.clinic_id)
      .maybeSingle();

    if (clinicError) {
      console.error("Clinic-code recovery clinic lookup failed.", clinicError);
      return Response.json(genericResponse);
    }
    if (clinic) {
      await sendClinicCodeEmail(email, clinic.name, clinic.code);
    }
  } catch (error) {
    console.error("Clinic-code recovery request failed.", error);
  }

  return Response.json(genericResponse);
}

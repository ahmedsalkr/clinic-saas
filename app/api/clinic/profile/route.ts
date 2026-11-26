import { authorizeWorkspace, getSupabaseAdminClient } from "@/lib/supabase-admin";

interface ClinicUpdateBody {
  name?: unknown;
  phone?: unknown;
  address?: unknown;
  logo?: unknown;
}

export async function GET(request: Request) {
  const authorization = await authorizeWorkspace(request, { adminOnly: true });
  if ("response" in authorization) return authorization.response;

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("clinics")
    .select("id, code, name, phone, address, logo_url")
    .eq("id", authorization.workspace.clinicId)
    .single();
  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
  return Response.json({ clinic: data });
}

export async function PATCH(request: Request) {
  const authorization = await authorizeWorkspace(request, { adminOnly: true });
  if ("response" in authorization) return authorization.response;

  let body: ClinicUpdateBody;
  try {
    body = (await request.json()) as ClinicUpdateBody;
  } catch {
    return Response.json({ error: "بيانات المركز غير صالحة." }, { status: 400 });
  }
  if (
    typeof body.name !== "string" ||
    body.name.trim().length < 2 ||
    body.name.trim().length > 120 ||
    typeof body.phone !== "string" ||
    body.phone.trim().length < 5 ||
    body.phone.trim().length > 40 ||
    typeof body.address !== "string" ||
    body.address.trim().length > 240
  ) {
    return Response.json({ error: "تحقق من الاسم والهاتف والعنوان." }, { status: 400 });
  }

  const updates: Record<string, string | null> = {
    name: body.name.trim(),
    phone: body.phone.trim(),
    address: body.address.trim(),
  };

  if (body.logo !== undefined && body.logo !== null) {
    if (
      typeof body.logo !== "object" ||
      !("mimeType" in body.logo) ||
      !("base64" in body.logo) ||
      typeof body.logo.mimeType !== "string" ||
      typeof body.logo.base64 !== "string" ||
      !["image/png", "image/jpeg", "image/webp"].includes(body.logo.mimeType) ||
      body.logo.base64.length > 2_800_000
    ) {
      return Response.json({ error: "ملف الشعار غير صالح." }, { status: 400 });
    }

    const bytes = Buffer.from(body.logo.base64, "base64");
    if (!bytes.length || bytes.length > 2 * 1024 * 1024) {
      return Response.json({ error: "حجم الشعار يجب ألا يتجاوز 2 ميجابايت." }, { status: 400 });
    }
    const validImage =
      (body.logo.mimeType === "image/png" &&
        bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) ||
      (body.logo.mimeType === "image/jpeg" &&
        bytes[0] === 0xff &&
        bytes[1] === 0xd8 &&
        bytes[2] === 0xff) ||
      (body.logo.mimeType === "image/webp" &&
        bytes.toString("ascii", 0, 4) === "RIFF" &&
        bytes.toString("ascii", 8, 12) === "WEBP");
    if (!validImage) {
      return Response.json({ error: "صيغة ملف الشعار لا تطابق محتواه." }, { status: 400 });
    }
    const extension =
      body.logo.mimeType === "image/jpeg"
        ? "jpg"
        : body.logo.mimeType === "image/webp"
          ? "webp"
          : "png";
    const logoPath = `${authorization.workspace.clinicId}/logo.${extension}`;
    const supabase = getSupabaseAdminClient();
    const { error: uploadError } = await supabase.storage
      .from("clinic-logos")
      .upload(logoPath, bytes, {
        contentType: body.logo.mimeType,
        upsert: true,
      });
    if (uploadError) {
      return Response.json({ error: uploadError.message }, { status: 500 });
    }
    const { data: publicUrl } = supabase.storage
      .from("clinic-logos")
      .getPublicUrl(logoPath);
    updates.logo_url = publicUrl.publicUrl;
  }

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("clinics")
    .update(updates)
    .eq("id", authorization.workspace.clinicId)
    .select("id, code, name, phone, address, logo_url")
    .single();
  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
  return Response.json({ clinic: data });
}

import { createHmac, randomBytes } from "node:crypto";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

interface EmployeeInput {
  username: string;
  fullName: string;
  password: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function validUsername(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[a-z0-9._-]{3,30}$/i.test(value.trim())
  );
}

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 4 * 1024 * 1024) {
    return Response.json({ error: "حجم طلب التسجيل كبير جدًا." }, { status: 413 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "بيانات التسجيل غير صالحة." }, { status: 400 });
  }
  if (!isRecord(body)) {
    return Response.json({ error: "بيانات التسجيل غير صالحة." }, { status: 400 });
  }

  const {
    clinicName,
    phone,
    address,
    ownerName,
    ownerEmail,
    ownerUsername,
    ownerPassword,
    employees,
    logo,
  } = body;

  if (
    typeof clinicName !== "string" ||
    clinicName.trim().length < 2 ||
    clinicName.trim().length > 120 ||
    typeof phone !== "string" ||
    phone.trim().length < 5 ||
    phone.trim().length > 40 ||
    typeof address !== "string" ||
    address.trim().length > 240 ||
    typeof ownerName !== "string" ||
    ownerName.trim().length < 2 ||
    ownerName.trim().length > 120 ||
    typeof ownerEmail !== "string" ||
    ownerEmail.trim().length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail.trim()) ||
    !validUsername(ownerUsername) ||
    typeof ownerPassword !== "string" ||
    ownerPassword.length < 10 ||
    ownerPassword.length > 72 ||
    !Array.isArray(employees) ||
    employees.length > 100
  ) {
    return Response.json(
      { error: "تحقق من بيانات المركز والمالك والموظفين." },
      { status: 400 },
    );
  }

  const employeeList = employees as EmployeeInput[];
  const usernames = [ownerUsername.trim().toLowerCase()];
  for (const employee of employeeList) {
    if (
      !isRecord(employee) ||
      !validUsername(employee.username) ||
      typeof employee.fullName !== "string" ||
      employee.fullName.trim().length < 2 ||
      employee.fullName.trim().length > 120 ||
      typeof employee.password !== "string" ||
      employee.password.length < 10 ||
      employee.password.length > 72
    ) {
      return Response.json(
        { error: "لكل موظف أدخل اسمًا وكلمة مرور لا تقل عن 10 أحرف." },
        { status: 400 },
      );
    }
    usernames.push(employee.username.trim().toLowerCase());
  }
  if (new Set(usernames).size !== usernames.length) {
    return Response.json(
      { error: "أسماء المستخدمين يجب أن تكون مختلفة داخل المركز." },
      { status: 400 },
    );
  }

  let logoBytes: Buffer | null = null;
  let logoMimeType: string | null = null;
  if (logo !== undefined && logo !== null) {
    if (
      !isRecord(logo) ||
      typeof logo.mimeType !== "string" ||
      !["image/png", "image/jpeg", "image/webp"].includes(String(logo.mimeType)) ||
      typeof logo.base64 !== "string" ||
      logo.base64.length > 2_800_000
    ) {
      return Response.json({ error: "الشعار غير صالح أو أكبر من 2 ميجابايت." }, { status: 400 });
    }
    logoMimeType = logo.mimeType;
    logoBytes = Buffer.from(logo.base64, "base64");
    if (logoBytes.length === 0 || logoBytes.length > 2 * 1024 * 1024) {
      return Response.json({ error: "حجم الشعار يجب ألا يتجاوز 2 ميجابايت." }, { status: 400 });
    }
    const validImage =
      (logoMimeType === "image/png" &&
        logoBytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) ||
      (logoMimeType === "image/jpeg" &&
        logoBytes[0] === 0xff &&
        logoBytes[1] === 0xd8 &&
        logoBytes[2] === 0xff) ||
      (logoMimeType === "image/webp" &&
        logoBytes.toString("ascii", 0, 4) === "RIFF" &&
        logoBytes.toString("ascii", 8, 12) === "WEBP");
    if (!validImage) {
      return Response.json({ error: "صيغة ملف الشعار لا تطابق محتواه." }, { status: 400 });
    }
  }

  let supabase;
  try {
    supabase = getSupabaseAdminClient();
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "إعدادات Supabase غير مكتملة.",
      },
      { status: 503 },
    );
  }

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    return Response.json(
      { error: "إعدادات Supabase غير مكتملة." },
      { status: 503 },
    );
  }
  const forwardedIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ipHash = createHmac("sha256", serviceRoleKey)
    .update(forwardedIp || "unknown-client")
    .digest("hex");
  const { data: registrationAllowed, error: rateLimitError } =
    await supabase.rpc("claim_registration_slot", { p_ip_hash: ipHash });
  if (rateLimitError) {
    console.error("Registration rate-limit RPC failed.", {
      code: rateLimitError.code,
      message: rateLimitError.message,
      details: rateLimitError.details,
      hint: rateLimitError.hint,
    });
    return Response.json(
      { error: "تعذر التحقق من طلب التسجيل. حاول لاحقًا." },
      { status: 503 },
    );
  }
  if (!registrationAllowed) {
    return Response.json(
      { error: "تم تجاوز عدد محاولات التسجيل المسموح. حاول بعد ساعة." },
      { status: 429 },
    );
  }

  const { data: ownerResult, error: ownerError } =
    await supabase.auth.admin.createUser({
      email: ownerEmail.trim().toLowerCase(),
      password: ownerPassword,
      email_confirm: true,
      user_metadata: {
        full_name: ownerName.trim(),
        username: ownerUsername.trim().toLowerCase(),
      },
    });
  if (ownerError || !ownerResult.user) {
    return Response.json(
      { error: ownerError?.message ?? "تعذر إنشاء حساب المالك." },
      { status: 400 },
    );
  }

  const createdUserIds = [ownerResult.user.id];
  let clinicId: string | null = null;
  try {
    const clinicCode = randomBytes(4).toString("hex").toUpperCase();
    const { data, error } = await supabase.rpc("create_clinic_workspace", {
      p_owner_id: ownerResult.user.id,
      p_code: clinicCode,
      p_name: clinicName.trim(),
      p_phone: phone.trim(),
      p_address: address.trim(),
      p_username: ownerUsername.trim().toLowerCase(),
    });
    if (error || typeof data !== "string") {
      throw new Error(error?.message ?? "تعذر إنشاء مساحة المركز.");
    }
    clinicId = data;

    if (logoBytes && logoMimeType) {
      const extension =
        logoMimeType === "image/jpeg"
          ? "jpg"
          : logoMimeType === "image/webp"
            ? "webp"
            : "png";
      const logoPath = `${clinicId}/logo.${extension}`;
      const { error: uploadError } = await supabase.storage
        .from("clinic-logos")
        .upload(logoPath, logoBytes, {
          contentType: logoMimeType,
          upsert: true,
        });
      if (uploadError) throw new Error(`تعذر رفع الشعار: ${uploadError.message}`);

      const { data: publicUrl } = supabase.storage
        .from("clinic-logos")
        .getPublicUrl(logoPath);
      const { error: logoError } = await supabase
        .from("clinics")
        .update({ logo_url: publicUrl.publicUrl })
        .eq("id", clinicId);
      if (logoError) throw new Error(`تعذر حفظ الشعار: ${logoError.message}`);
    }

    for (const employee of employeeList) {
      const username = employee.username.trim().toLowerCase();
      const internalEmail = `${username}@${clinicId}.staff.clinicapp.invalid`;
      const { data: employeeResult, error: employeeError } =
        await supabase.auth.admin.createUser({
          email: internalEmail,
          password: employee.password,
          email_confirm: true,
          user_metadata: { full_name: employee.fullName.trim(), username },
        });
      if (employeeError || !employeeResult.user) {
        throw new Error(
          `تعذر إنشاء حساب الموظف ${username}: ${employeeError?.message ?? "خطأ غير معروف."}`,
        );
      }

      createdUserIds.push(employeeResult.user.id);
      const { error: profileError } = await supabase
        .from("profiles")
        .update({
          clinic_id: clinicId,
          username,
          full_name: employee.fullName.trim(),
          role: "employee",
          is_active: true,
        })
        .eq("id", employeeResult.user.id);
      if (profileError) throw new Error(`تعذر تفعيل حساب الموظف: ${profileError.message}`);
    }

    return Response.json(
      {
        ok: true,
        clinicCode,
        ownerUsername: ownerUsername.trim().toLowerCase(),
        employeeCount: employeeList.length,
      },
      { status: 201 },
    );
  } catch (error) {
    await Promise.all(
      createdUserIds.map((userId) => supabase.auth.admin.deleteUser(userId)),
    );
    if (clinicId) {
      await supabase.from("clinics").delete().eq("id", clinicId);
    }
    return Response.json(
      {
        error: error instanceof Error ? error.message : "تعذر إكمال التسجيل.",
      },
      { status: 500 },
    );
  }
}

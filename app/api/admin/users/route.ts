import {
  authorizeWorkspace,
  getSupabaseAdminClient,
} from "@/lib/supabase-admin";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export async function GET(request: Request) {
  const authorization = await authorizeWorkspace(request, {
    adminOnly: true,
    subscriptionRequired: true,
  });
  if ("response" in authorization) return authorization.response;

  const supabase = getSupabaseAdminClient();
  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("id, username, full_name, role, is_active")
    .eq("clinic_id", authorization.workspace.clinicId)
    .order("created_at");
  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({
    users: (profiles ?? []).map((profile) => ({
      id: profile.id,
      username: profile.username,
      fullName: profile.full_name,
      role: profile.role,
      active: profile.is_active,
    })),
  });
}

export async function POST(request: Request) {
  const authorization = await authorizeWorkspace(request, {
    adminOnly: true,
    subscriptionRequired: true,
  });
  if ("response" in authorization) return authorization.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "بيانات الموظف غير صالحة." }, { status: 400 });
  }
  if (!isRecord(body)) {
    return Response.json({ error: "بيانات الموظف غير صالحة." }, { status: 400 });
  }
  const { username, fullName, password } = body;
  if (
    typeof username !== "string" ||
    !/^[a-z0-9._-]{3,30}$/i.test(username.trim()) ||
    typeof fullName !== "string" ||
    fullName.trim().length < 2 ||
    fullName.trim().length > 120 ||
    typeof password !== "string" ||
    password.length < 10
  ) {
    return Response.json(
      { error: "أدخل اسمًا واسم مستخدم صالحًا وكلمة مرور من 10 أحرف على الأقل." },
      { status: 400 },
    );
  }

  const normalizedUsername = username.trim().toLowerCase();
  const supabase = getSupabaseAdminClient();
  const [{ data: subscription, error: subscriptionError }, { count, error: countError }] =
    await Promise.all([
      supabase
        .from("subscriptions")
        .select("seat_count")
        .eq("clinic_id", authorization.workspace.clinicId)
        .maybeSingle(),
      supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("clinic_id", authorization.workspace.clinicId),
    ]);
  if (subscriptionError || countError) {
    return Response.json(
      { error: subscriptionError?.message ?? countError?.message },
      { status: 500 },
    );
  }
  if (!subscription || (count ?? 0) >= subscription.seat_count) {
    return Response.json(
      {
        error:
          "وصل المركز إلى عدد الحسابات المشمول في الاشتراك. زد عدد المقاعد من صفحة الاشتراك أولاً.",
      },
      { status: 409 },
    );
  }

  const email = `${normalizedUsername}@${authorization.workspace.clinicId}.staff.clinicapp.invalid`;
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: fullName.trim(),
      username: normalizedUsername,
    },
  });
  if (error || !data.user) {
    return Response.json(
      { error: error?.message ?? "تعذر إنشاء حساب الموظف." },
      { status: 400 },
    );
  }

  const { error: profileError } = await supabase
    .from("profiles")
    .update({
      clinic_id: authorization.workspace.clinicId,
      username: normalizedUsername,
      full_name: fullName.trim(),
      role: "employee",
      is_active: true,
    })
    .eq("id", data.user.id);
  if (profileError) {
    await supabase.auth.admin.deleteUser(data.user.id);
    return Response.json({ error: profileError.message }, { status: 500 });
  }

  return Response.json(
    {
      user: {
        id: data.user.id,
        username: normalizedUsername,
        fullName: fullName.trim(),
        role: "employee",
        active: true,
      },
    },
    { status: 201 },
  );
}

export async function DELETE(request: Request) {
  const authorization = await authorizeWorkspace(request, {
    adminOnly: true,
    subscriptionRequired: true,
  });
  if ("response" in authorization) return authorization.response;

  const userId = new URL(request.url).searchParams.get("id");
  if (!userId || userId === authorization.workspace.userId) {
    return Response.json(
      { error: "لا يمكن حذف الحساب الحالي." },
      { status: 400 },
    );
  }

  const supabase = getSupabaseAdminClient();
  const { data: target, error: targetError } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("id", userId)
    .eq("clinic_id", authorization.workspace.clinicId)
    .maybeSingle();
  if (targetError) {
    return Response.json({ error: targetError.message }, { status: 500 });
  }
  if (!target) {
    return Response.json({ error: "المستخدم غير موجود." }, { status: 404 });
  }
  if (target.role === "admin") {
    return Response.json(
      { error: "إزالة حساب مدير تتطلب دعم المنصة." },
      { status: 403 },
    );
  }

  const { error } = await supabase.auth.admin.deleteUser(userId);
  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
  return Response.json({ ok: true });
}

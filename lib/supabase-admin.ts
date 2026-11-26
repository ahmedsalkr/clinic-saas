import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let adminClient: SupabaseClient | null = null;

export function getSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error("Supabase server credentials are not configured.");
  }

  if (!adminClient) {
    adminClient = createClient(url, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return adminClient;
}

export interface AuthenticatedWorkspace {
  userId: string;
  clinicId: string;
  username: string;
  fullName: string;
  role: "admin" | "employee";
}

export type WorkspaceAuthorization =
  | { workspace: AuthenticatedWorkspace }
  | { response: Response };

export async function authorizeWorkspace(
  request: Request,
  options: { adminOnly?: boolean; subscriptionRequired?: boolean } = {},
): Promise<WorkspaceAuthorization> {
  const accessToken = request.headers
    .get("authorization")
    ?.match(/^Bearer (.+)$/i)?.[1];
  if (!accessToken) {
    return {
      response: Response.json({ error: "يلزم تسجيل الدخول." }, { status: 401 }),
    };
  }

  let supabase;
  try {
    supabase = getSupabaseAdminClient();
  } catch (error) {
    return {
      response: Response.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "إعدادات Supabase غير مكتملة.",
        },
        { status: 503 },
      ),
    };
  }

  const { data: authData, error: authError } =
    await supabase.auth.getUser(accessToken);
  if (authError || !authData.user) {
    return {
      response: Response.json({ error: "انتهت الجلسة. سجّل الدخول مجدداً." }, { status: 401 }),
    };
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("clinic_id, username, full_name, role, is_active")
    .eq("id", authData.user.id)
    .maybeSingle();
  if (profileError) {
    return {
      response: Response.json({ error: profileError.message }, { status: 500 }),
    };
  }
  if (
    !profile?.is_active ||
    !profile.clinic_id ||
    (profile.role !== "admin" && profile.role !== "employee")
  ) {
    return {
      response: Response.json({ error: "الحساب غير مفعل." }, { status: 403 }),
    };
  }
  if (options.adminOnly && profile.role !== "admin") {
    return {
      response: Response.json({ error: "هذه العملية للمدير فقط." }, { status: 403 }),
    };
  }

  if (options.subscriptionRequired) {
    const { data: subscription, error: subscriptionError } = await supabase
      .from("subscriptions")
      .select("status, current_period_end")
      .eq("clinic_id", profile.clinic_id)
      .maybeSingle();
    if (subscriptionError) {
      return {
        response: Response.json(
          { error: subscriptionError.message },
          { status: 500 },
        ),
      };
    }

    const isActive =
      (subscription?.status === "active" ||
        subscription?.status === "trialing") &&
      (!subscription.current_period_end ||
        new Date(subscription.current_period_end).getTime() > Date.now());
    if (!isActive) {
      return {
        response: Response.json(
          { error: "يلزم تفعيل الاشتراك أو تجديده للمتابعة." },
          { status: 402 },
        ),
      };
    }
  }

  return {
    workspace: {
      userId: authData.user.id,
      clinicId: profile.clinic_id,
      username: profile.username,
      fullName: profile.full_name,
      role: profile.role,
    },
  };
}

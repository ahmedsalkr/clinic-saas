import { authorizeWorkspace, getSupabaseAdminClient } from "@/lib/supabase-admin";
import {
  getPublicAppUrl,
  getStripePriceId,
  stripeRequest,
} from "@/lib/stripe";

interface StripeSession {
  url?: string | null;
}

export async function POST(request: Request) {
  const authorization = await authorizeWorkspace(request, { adminOnly: true });
  if ("response" in authorization) return authorization.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "بيانات الخطة غير صالحة." }, { status: 400 });
  }
  if (!body || typeof body !== "object") {
    return Response.json({ error: "بيانات الخطة غير صالحة." }, { status: 400 });
  }
  const { planType, seatCount } = body as Record<string, unknown>;
  if (
    (planType !== "monthly" && planType !== "yearly") ||
    !Number.isInteger(seatCount) ||
    Number(seatCount) < 1 ||
    Number(seatCount) > 101
  ) {
    return Response.json({ error: "اختر خطة وعدد مستخدمين صالحين." }, { status: 400 });
  }

  try {
    const supabase = getSupabaseAdminClient();
    const [{ data: subscription, error: subscriptionError }, { data: authUser }] =
      await Promise.all([
        supabase
          .from("subscriptions")
          .select("stripe_customer_id, status")
          .eq("clinic_id", authorization.workspace.clinicId)
          .maybeSingle(),
        supabase.auth.admin.getUserById(authorization.workspace.userId),
      ]);
    if (subscriptionError) throw subscriptionError;

    const origin = getPublicAppUrl();
    if (
      subscription?.stripe_customer_id &&
      (subscription.status === "active" || subscription.status === "trialing")
    ) {
      const portalParameters = new URLSearchParams({
        customer: subscription.stripe_customer_id,
        return_url: `${origin}/billing`,
      });
      const portal = await stripeRequest<StripeSession>(
        "/billing_portal/sessions",
        portalParameters,
      );
      if (!portal.url) throw new Error("تعذر فتح بوابة إدارة الاشتراك.");
      return Response.json({ url: portal.url });
    }

    const parameters = new URLSearchParams({
      mode: "subscription",
      "line_items[0][price]": getStripePriceId(planType),
      "line_items[0][quantity]": String(seatCount),
      success_url: `${origin}/billing?success=1`,
      cancel_url: `${origin}/billing?cancelled=1`,
      client_reference_id: authorization.workspace.clinicId,
      "metadata[clinic_id]": authorization.workspace.clinicId,
      "metadata[plan_type]": planType,
      "metadata[seat_count]": String(seatCount),
      "subscription_data[metadata][clinic_id]": authorization.workspace.clinicId,
      "subscription_data[metadata][plan_type]": planType,
      "subscription_data[metadata][seat_count]": String(seatCount),
    });
    if (authUser.user?.email) {
      parameters.set("customer_email", authUser.user.email);
    }
    const checkout = await stripeRequest<StripeSession>(
      "/checkout/sessions",
      parameters,
    );
    if (!checkout.url) throw new Error("تعذر إنشاء جلسة الدفع.");
    return Response.json({ url: checkout.url });
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "تعذر بدء الاشتراك.",
      },
      { status: 503 },
    );
  }
}

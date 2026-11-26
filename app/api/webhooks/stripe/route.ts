import { createHmac, timingSafeEqual } from "node:crypto";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

interface StripeSubscription {
  id: string;
  customer: string | { id: string };
  status: string;
  current_period_end?: number;
  metadata?: Record<string, string>;
  items?: {
    data?: Array<{
      quantity?: number;
      price?: { id?: string };
    }>;
  };
}

interface StripeEvent {
  type: string;
  data?: { object?: StripeSubscription };
}

function isValidSignature(payload: string, header: string, secret: string) {
  const parts = header.split(",").map((part) => part.split("=", 2));
  const timestamp = parts.find(([key]) => key === "t")?.[1];
  const signatures = parts
    .filter(([key]) => key === "v1")
    .map(([, value]) => value);
  if (
    !timestamp ||
    !/^\d+$/.test(timestamp) ||
    Math.abs(Date.now() / 1000 - Number(timestamp)) > 300 ||
    signatures.length === 0
  ) {
    return false;
  }

  const signedPayload = `${timestamp}.${payload}`;
  const expected = createHmac("sha256", secret)
    .update(signedPayload, "utf8")
    .digest();
  return signatures.some((signature) => {
    if (!/^[a-f0-9]{64}$/i.test(signature)) return false;
    const received = Buffer.from(signature, "hex");
    return received.length === expected.length && timingSafeEqual(received, expected);
  });
}

export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    return Response.json({ error: "Stripe webhook غير مهيأ." }, { status: 503 });
  }

  const payload = await request.text();
  const signature = request.headers.get("stripe-signature");
  if (!signature || !isValidSignature(payload, signature, secret)) {
    return Response.json({ error: "توقيع webhook غير صالح." }, { status: 400 });
  }

  let event: StripeEvent;
  try {
    event = JSON.parse(payload) as StripeEvent;
  } catch {
    return Response.json({ error: "حدث Stripe غير صالح." }, { status: 400 });
  }

  if (
    !event.type.startsWith("customer.subscription.") ||
    !event.data?.object?.id
  ) {
    return Response.json({ received: true });
  }

  const subscription = event.data.object;
  const clinicId = subscription.metadata?.clinic_id;
  if (!clinicId) {
    return Response.json(
      { error: "حدث الاشتراك لا يحتوي على معرف المركز." },
      { status: 400 },
    );
  }

  const monthlyPrice = process.env.STRIPE_MONTHLY_PRICE_ID;
  const yearlyPrice = process.env.STRIPE_YEARLY_PRICE_ID;
  const priceId = subscription.items?.data?.[0]?.price?.id;
  const planType = priceId
    ? priceId === monthlyPrice
      ? "monthly"
      : priceId === yearlyPrice
        ? "yearly"
        : null
    : subscription.metadata?.plan_type;
  if (planType !== "monthly" && planType !== "yearly") {
    return Response.json({ error: "نوع خطة Stripe غير معروف." }, { status: 400 });
  }

  const stripeCustomerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer.id;
  const status =
    event.type === "customer.subscription.deleted"
      ? "canceled"
      : subscription.status;
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase
    .from("subscriptions")
    .update({
      stripe_customer_id: stripeCustomerId,
      stripe_subscription_id: subscription.id,
      plan_type: planType,
      status,
      seat_count: Math.max(1, Math.min(101, subscription.items?.data?.[0]?.quantity ?? 1)),
      current_period_end: subscription.current_period_end
        ? new Date(subscription.current_period_end * 1000).toISOString()
        : null,
      updated_at: new Date().toISOString(),
    })
    .eq("clinic_id", clinicId);
  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ received: true });
}

const stripeApi = "https://api.stripe.com/v1";

export async function stripeRequest<T>(
  path: string,
  parameters: URLSearchParams,
  method: "POST" = "POST",
): Promise<T> {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error("إعدادات Stripe غير مكتملة على الخادم.");
  }

  const response = await fetch(`${stripeApi}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: parameters,
    cache: "no-store",
  });
  const payload: unknown = await response.json();
  if (!response.ok) {
    const message =
      payload &&
      typeof payload === "object" &&
      "error" in payload &&
      payload.error &&
      typeof payload.error === "object" &&
      "message" in payload.error &&
      typeof payload.error.message === "string"
        ? payload.error.message
        : "تعذر الاتصال بخدمة الدفع.";
    throw new Error(message);
  }
  return payload as T;
}

export function getStripePriceId(planType: "monthly" | "yearly") {
  const priceId =
    planType === "monthly"
      ? process.env.STRIPE_MONTHLY_PRICE_ID
      : process.env.STRIPE_YEARLY_PRICE_ID;
  if (!priceId) {
    throw new Error("لم يتم إعداد سعر الخطة في Stripe.");
  }
  return priceId;
}

export function getPublicAppUrl() {
  const value = process.env.NEXT_PUBLIC_SITE_URL;
  if (!value) {
    throw new Error("يجب إعداد NEXT_PUBLIC_SITE_URL قبل تفعيل الدفع.");
  }
  const url = new URL(value);
  if (url.protocol !== "https:" && url.hostname !== "localhost") {
    throw new Error("عنوان الموقع يجب أن يستخدم HTTPS.");
  }
  return url.origin;
}

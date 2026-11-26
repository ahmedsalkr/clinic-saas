"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { AppProfile } from "@/lib/auth";
import {
  cacheProfile,
  getCurrentProfile,
  isSubscriptionActive,
} from "@/lib/auth";
import { navigateTo } from "@/lib/navigation";
import { getSupabaseClient } from "@/lib/supabase";

interface BillingResponse {
  error?: string;
  url?: string;
}

export default function BillingPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<AppProfile | null>(null);
  const [returnStatus, setReturnStatus] = useState("");
  const [clinicCode, setClinicCode] = useState("");
  const [planType, setPlanType] = useState<"monthly" | "yearly">("monthly");
  const [seatCount, setSeatCount] = useState(1);
  const [errorMessage, setErrorMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isStartingCheckout, setIsStartingCheckout] = useState(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const status = new URLSearchParams(window.location.search);
        setReturnStatus(
          status.get("success") === "1"
            ? "success"
            : status.get("cancelled") === "1"
              ? "cancelled"
              : "",
        );
        const currentProfile = await getCurrentProfile();
        if (!active) return;
        if (!currentProfile) {
          navigateTo("/login", () => router.replace("/login"));
          return;
        }
        if (currentProfile.role !== "admin") {
          navigateTo("/", () => router.replace("/"));
          return;
        }

        cacheProfile(currentProfile);
        setProfile(currentProfile);
        const savedBillingMessage = sessionStorage.getItem(
          "clinic-billing-message",
        );
        if (savedBillingMessage) {
          setErrorMessage(savedBillingMessage);
          sessionStorage.removeItem("clinic-billing-message");
        }
        setClinicCode(
          sessionStorage.getItem("clinic-registration-code") ||
            currentProfile.clinicCode,
        );
        setPlanType(currentProfile.planType);
        setSeatCount(Math.max(1, currentProfile.seatCount));

        if (status.get("success") === "1") {
          for (let attempt = 0; attempt < 5; attempt += 1) {
            await new Promise((resolve) => window.setTimeout(resolve, 2000));
            const refreshed = await getCurrentProfile();
            if (!active || !refreshed) break;
            cacheProfile(refreshed);
            setProfile(refreshed);
            if (isSubscriptionActive(refreshed)) {
              break;
            }
          }
        }
      } catch (error) {
        if (active) {
          setErrorMessage(
            error instanceof Error ? error.message : "تعذر تحميل الاشتراك.",
          );
        }
      } finally {
        if (active) setIsLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [router]);

  const startCheckout = async () => {
    setErrorMessage("");
    setIsStartingCheckout(true);
    try {
      const { data, error } = await getSupabaseClient().auth.getSession();
      if (error) throw error;
      const token = data.session?.access_token;
      if (!token) throw new Error("انتهت الجلسة. سجّل الدخول مجدداً.");

      const response = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ planType, seatCount }),
      });
      const result = (await response.json()) as BillingResponse;
      if (!response.ok || !result.url) {
        throw new Error(result.error || "تعذر بدء الدفع.");
      }
      window.location.assign(result.url);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "تعذر بدء الدفع.",
      );
    } finally {
      setIsStartingCheckout(false);
    }
  };

  if (isLoading) {
    return <p dir="rtl" className="p-8">جارٍ تحميل الاشتراك...</p>;
  }

  const isActive = profile ? isSubscriptionActive(profile) : false;

  return (
    <main dir="rtl" className="min-h-screen bg-gray-100 p-4 sm:p-8">
      <div className="mx-auto max-w-2xl space-y-5">
        <header className="flex items-center justify-between rounded-xl bg-white p-5 shadow-sm">
          <div>
            <h1 className="text-xl font-bold">اشتراك {profile?.clinicName}</h1>
            <p className="text-sm text-gray-600">
              الحالة: {isActive ? "نشط" : "يحتاج إلى تفعيل أو تجديد"}
            </p>
          </div>
          {isActive && (
            <button
              onClick={() => router.push("/")}
              className="font-semibold text-blue-700 hover:underline"
            >
              العودة للنظام
            </button>
          )}
        </header>

        {returnStatus === "cancelled" && (
          <p className="rounded-lg bg-amber-100 p-3 text-amber-900">
            لم يكتمل الدفع. لم يتم تفعيل الاشتراك.
          </p>
        )}
        {returnStatus === "success" && !isActive && (
          <p role="status" className="rounded-lg bg-blue-100 p-3 text-blue-900">
            استلمنا العودة من الدفع وننتظر تأكيد Stripe. ستتحدث الحالة تلقائيًا.
          </p>
        )}
        {errorMessage && (
          <p role="alert" className="rounded-lg bg-red-100 p-3 text-red-700">
            {errorMessage}
          </p>
        )}

        <section className="space-y-4 rounded-xl bg-white p-6 shadow">
          <h2 className="text-lg font-bold">
            {isActive ? "إدارة التجديد والفوترة" : "اختر اشتراكًا للمتابعة"}
          </h2>
          {isActive ? (
            <p className="text-gray-700">
              اشتراك المركز {profile?.planType === "yearly" ? "سنوي" : "شهري"}،
              ويشمل {profile?.seatCount} حسابًا. يمكنك تغيير الخطة أو المقاعد من
              بوابة الفوترة الآمنة.
            </p>
          ) : (
            <>
              <label className="block">
                <span className="mb-1 block font-semibold">الخطة</span>
                <select
                  value={planType}
                  onChange={(event) =>
                    setPlanType(event.target.value as "monthly" | "yearly")
                  }
                  className="w-full rounded-lg border p-2"
                >
                  <option value="monthly">شهري</option>
                  <option value="yearly">سنوي</option>
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block font-semibold">
                  عدد الحسابات (المالك والموظفون)
                </span>
                <input
                  type="number"
                  min={1}
                  max={101}
                  value={seatCount}
                  onChange={(event) =>
                    setSeatCount(
                      Math.max(1, Math.min(101, Number(event.target.value))),
                    )
                  }
                  className="w-full rounded-lg border p-2"
                />
              </label>
            </>
          )}
          {clinicCode && (
            <p className="rounded-lg bg-blue-50 p-3 text-blue-900">
              رمز المركز لاستخدام الموظفين: <strong dir="ltr">{clinicCode}</strong>
            </p>
          )}
          <button
            onClick={() => void startCheckout()}
            disabled={isStartingCheckout}
            className="w-full rounded-lg bg-blue-700 py-3 font-bold text-white disabled:opacity-50"
          >
            {isStartingCheckout
              ? "جارٍ التحويل إلى الدفع..."
              : isActive
                ? "إدارة الاشتراك"
                : "المتابعة إلى الدفع الآمن"}
          </button>
        </section>
      </div>
    </main>
  );
}

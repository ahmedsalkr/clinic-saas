"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  cacheProfile,
  getCachedProfile,
  getCurrentProfile,
  type AppProfile,
} from "@/lib/auth";
import {
  getLegacyDataSummary,
  hasLegacyDataToMigrate,
  hasLegacyMigrationCompleted,
  isLegacyMigrationPending,
  queueLegacyDataMigration,
} from "@/lib/clinic-sync";
import { navigateTo } from "@/lib/navigation";
import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabase";

interface LoginResponse {
  error?: string;
  accessToken?: string;
  refreshToken?: string;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "حدث خطأ غير معروف.";
}

function requestLegacyDataMigration(role: AppProfile["role"]) {
  if (
    role !== "admin" ||
    hasLegacyMigrationCompleted() ||
    isLegacyMigrationPending()
  ) {
    return;
  }

  const summary = getLegacyDataSummary();
  const total = Object.values(summary).reduce((sum, count) => sum + count, 0);
  if (total === 0 && !hasLegacyDataToMigrate()) return;

  const confirmed = window.confirm(
    `سيتم ترحيل البيانات الموجودة على هذا الجهاز إلى مساحة المركز:\n` +
      `المرضى: ${summary.patients}\n` +
      `الأطباء: ${summary.doctors}\n` +
      `المصروفات: ${summary.expenses}\n\n` +
      "لن يتم ترحيل حسابات المستخدمين أو كلمات المرور. هل تريد المتابعة؟",
  );
  if (confirmed) queueLegacyDataMigration();
}

export default function LoginPage() {
  const [clinicCode, setClinicCode] = useState("");
  const [usernameOrEmail, setUsernameOrEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isForgotCodeOpen, setIsForgotCodeOpen] = useState(false);
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [isRecoveringCode, setIsRecoveringCode] = useState(false);
  const [recoveryError, setRecoveryError] = useState("");
  const router = useRouter();

  useEffect(() => {
    if (!isSupabaseConfigured()) return;

    let active = true;
    getCurrentProfile()
      .then((profile) => {
        if (active && profile) {
          navigateTo("/", () => router.replace("/"));
        }
      })
      .catch((profileError: unknown) => {
        if (active) setError(errorMessage(profileError));
      });

    return () => {
      active = false;
    };
  }, [router]);

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");

    if (!isSupabaseConfigured()) {
      setError("إعدادات الدخول غير مكتملة. يرجى المحاولة لاحقًا.");
      return;
    }
    if (!navigator.onLine) {
      setError("اتصل بالإنترنت لتسجيل الدخول، أو استخدم الدخول دون اتصال على هذا الجهاز.");
      return;
    }

    setIsSubmitting(true);
    try {
      const identity = usernameOrEmail.trim();
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clinicCode, identity, password }),
      });
      const result = (await response.json()) as LoginResponse;
      if (!response.ok || !result.accessToken || !result.refreshToken) {
        throw new Error(result.error || "رمز المركز أو بيانات الدخول غير صحيحة.");
      }
      const supabase = getSupabaseClient();
      const { error: sessionError } = await supabase.auth.setSession({
        access_token: result.accessToken,
        refresh_token: result.refreshToken,
      });
      if (sessionError) throw sessionError;

      const profile = await getCurrentProfile();
      if (!profile) {
        await supabase.auth.signOut({ scope: "local" });
        throw new Error("تعذر تحميل بيانات المركز. تحقق من إعداد قاعدة البيانات.");
      }

      cacheProfile(profile);
      localStorage.setItem("loginTime", new Date().toLocaleTimeString("ar-EG"));
      requestLegacyDataMigration(profile.role);
      navigateTo("/", () => router.replace("/"));
    } catch (loginError) {
      setError(errorMessage(loginError));
    } finally {
      setIsSubmitting(false);
    }
  };

  const continueOffline = () => {
    const profile = getCachedProfile();
    if (navigator.onLine) {
      setError("استخدم تسجيل الدخول المعتاد أثناء الاتصال بالإنترنت.");
      return;
    }
    if (!profile) {
      setError("سجّل الدخول عبر الإنترنت مرة واحدة على هذا الجهاز أولًا.");
      return;
    }
    navigateTo("/", () => router.push("/"));
  };

  const handleForgotCode = async (event: React.FormEvent) => {
    event.preventDefault();
    setRecoveryError("");
    setIsRecoveringCode(true);
    try {
      const response = await fetch("/api/auth/forgot-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: recoveryEmail }),
      });
      if (!response.ok) {
        throw new Error("تعذر إكمال الطلب. حاول مرة أخرى.");
      }

      setIsForgotCodeOpen(false);
      setRecoveryEmail("");
      window.alert("إذا كان البريد مسجلاً، فقد تم إرسال رمز المركز إليه.");
    } catch (recoveryRequestError) {
      setRecoveryError(errorMessage(recoveryRequestError));
    } finally {
      setIsRecoveringCode(false);
    }
  };

  return (
    <main
      dir="rtl"
      className="flex min-h-screen items-center justify-center bg-gray-100 p-4"
    >
      <div className="w-full max-w-sm rounded-xl bg-white p-8 shadow-xl">
        <h1 className="mb-2 text-center text-2xl font-bold text-blue-700">
          تسجيل الدخول
        </h1>
        <p className="mb-6 text-center text-sm text-gray-600">
          الموظف يدخل برمز المركز واسم المستخدم. يمكن للمالك استخدام بريده الإلكتروني.
        </p>
        <form onSubmit={handleLogin} className="space-y-4">
          <label className="block">
            <span className="mb-1 block font-semibold text-gray-700">رمز المركز</span>
            <input
              required
              value={clinicCode}
              onChange={(event) => setClinicCode(event.target.value.toUpperCase())}
              className="w-full rounded-lg border p-2"
              placeholder="يظهر للمالك بعد التسجيل"
              autoComplete="organization"
            />
          </label>
          <label className="block">
            <span className="mb-1 block font-semibold text-gray-700">
              اسم المستخدم أو البريد الإلكتروني
            </span>
            <input
              required
              value={usernameOrEmail}
              onChange={(event) => setUsernameOrEmail(event.target.value)}
              className="w-full rounded-lg border p-2"
              autoComplete="username"
            />
          </label>
          <label className="block">
            <span className="mb-1 block font-semibold text-gray-700">كلمة المرور</span>
            <input
              required
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-lg border p-2"
              autoComplete="current-password"
            />
          </label>
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-lg bg-blue-700 py-3 font-bold text-white disabled:opacity-50"
          >
            {isSubmitting ? "جارٍ التحقق..." : "دخول"}
          </button>
        </form>
        <button
          type="button"
          onClick={() => {
            setRecoveryError("");
            setIsForgotCodeOpen(true);
          }}
          className="mt-3 w-full text-center text-sm font-semibold text-blue-700 underline"
        >
          نسيت رمز المركز؟
        </button>
        <button
          type="button"
          onClick={continueOffline}
          className="mt-3 w-full rounded-lg border border-blue-700 py-2 font-bold text-blue-700"
        >
          متابعة دون اتصال على هذا الجهاز
        </button>
        {error && (
          <p role="alert" className="mt-4 text-sm text-red-700">
            {error}
          </p>
        )}
        <p className="mt-5 text-center text-sm text-gray-600">
          هل تريد إنشاء مساحة لمركزك؟{" "}
          <button
            type="button"
            onClick={() => router.push("/register")}
            className="font-semibold text-blue-700 underline"
          >
            تسجيل مركز جديد
          </button>
        </p>
      </div>
      {isForgotCodeOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          dir="rtl"
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="forgot-code-title"
            className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl"
          >
            <h2
              id="forgot-code-title"
              className="mb-2 text-xl font-bold text-gray-800"
            >
              استعادة رمز المركز
            </h2>
            <p className="mb-5 text-sm text-gray-600">
              أدخل البريد الإلكتروني المسجل لإرسال رمز المركز إليه.
            </p>
            <form onSubmit={handleForgotCode} className="space-y-4">
              <label className="block">
                <span className="mb-1 block font-semibold text-gray-700">
                  البريد الإلكتروني
                </span>
                <input
                  type="email"
                  required
                  maxLength={254}
                  autoComplete="email"
                  value={recoveryEmail}
                  onChange={(event) => setRecoveryEmail(event.target.value)}
                  className="w-full rounded-lg border p-2"
                />
              </label>
              {recoveryError && (
                <p role="alert" className="text-sm text-red-700">
                  {recoveryError}
                </p>
              )}
              <button
                type="submit"
                disabled={isRecoveringCode}
                className="w-full rounded-lg bg-blue-700 py-2 font-bold text-white disabled:opacity-50"
              >
                {isRecoveringCode ? "جارٍ إرسال الطلب..." : "إرسال رمز المركز"}
              </button>
              <button
                type="button"
                disabled={isRecoveringCode}
                onClick={() => setIsForgotCodeOpen(false)}
                className="w-full rounded-lg border py-2 font-semibold text-gray-700 disabled:opacity-50"
              >
                إلغاء
              </button>
            </form>
          </section>
        </div>
      )}
    </main>
  );
}

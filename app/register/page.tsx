"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseClient } from "@/lib/supabase";

interface EmployeeDraft {
  fullName: string;
  username: string;
  password: string;
}

interface ApiResult {
  error?: string;
  url?: string;
  clinicCode?: string;
}

async function fileToBase64(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export default function RegisterPage() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [newClinicCode, setNewClinicCode] = useState("");
  const [clinicName, setClinicName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [ownerName, setOwnerName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [ownerUsername, setOwnerUsername] = useState("");
  const [ownerPassword, setOwnerPassword] = useState("");
  const [planType, setPlanType] = useState<"monthly" | "yearly">("monthly");
  const [employees, setEmployees] = useState<EmployeeDraft[]>([]);

  const addEmployee = () => {
    if (employees.length >= 100) return;
    setEmployees((current) => [
      ...current,
      { fullName: "", username: "", password: "" },
    ]);
  };

  const updateEmployee = (
    index: number,
    field: keyof EmployeeDraft,
    value: string,
  ) => {
    setEmployees((current) =>
      current.map((employee, employeeIndex) =>
        employeeIndex === index
          ? { ...employee, [field]: value }
          : employee,
      ),
    );
  };

  const handleRegister = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSubmitting(true);
    setErrorMessage("");

    try {
      const logo = logoFile
        ? {
            mimeType: logoFile.type,
            base64: await fileToBase64(logoFile),
          }
        : undefined;
      const registrationResponse = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clinicName,
          phone,
          address,
          ownerName,
          ownerEmail,
          ownerUsername,
          ownerPassword,
          planType,
          employees,
          logo,
        }),
      });
      const registration = (await registrationResponse.json()) as ApiResult;
      if (!registrationResponse.ok || !registration.clinicCode) {
        throw new Error(registration.error || "تعذر إنشاء حساب المركز.");
      }
      sessionStorage.setItem(
        "clinic-registration-code",
        registration.clinicCode,
      );
      setNewClinicCode(registration.clinicCode);

      const loginResponse = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clinicCode: registration.clinicCode,
          username: ownerUsername,
          password: ownerPassword,
        }),
      });
      const login = (await loginResponse.json()) as ApiResult & {
        accessToken?: string;
        refreshToken?: string;
      };
      if (
        !loginResponse.ok ||
        !login.accessToken ||
        !login.refreshToken
      ) {
        throw new Error(login.error || "تم إنشاء المركز؛ تابع بتسجيل الدخول.");
      }

      const { error: sessionError } = await getSupabaseClient().auth.setSession({
        access_token: login.accessToken,
        refresh_token: login.refreshToken,
      });
      if (sessionError) throw sessionError;

      const checkoutResponse = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${login.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          planType,
          seatCount: employees.length + 1,
        }),
      });
      const checkout = (await checkoutResponse.json()) as ApiResult;
      if (!checkoutResponse.ok || !checkout.url) {
        sessionStorage.setItem(
          "clinic-billing-message",
          checkout.error || "تابع إلى صفحة الاشتراك لإكمال التفعيل.",
        );
        router.push("/billing");
        return;
      }

      window.location.assign(checkout.url);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "تعذر إكمال التسجيل.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main
      dir="rtl"
      className="min-h-screen bg-gray-100 px-4 py-8"
    >
      <div className="mx-auto max-w-3xl rounded-xl bg-white p-6 shadow-xl sm:p-8">
        <h1 className="mb-2 text-center text-2xl font-bold text-blue-700">
          ابدأ استخدام نظام إدارة المركز
        </h1>
        <p className="mb-6 text-center text-gray-600">
          أدخل بيانات منشأتك، ثم أنشئ حسابات المالك والموظفين.
        </p>

        {errorMessage && (
          <div role="alert" className="mb-5 rounded-lg bg-amber-100 p-3 text-amber-900">
            {errorMessage}
            {newClinicCode && (
              <p className="mt-2">
                رمز المركز: <strong dir="ltr">{newClinicCode}</strong>
              </p>
            )}
            <button
              type="button"
              onClick={() => router.push("/login")}
              className="mr-2 font-bold underline"
            >
              تسجيل الدخول
            </button>
          </div>
        )}

        <form onSubmit={handleRegister} className="space-y-7">
          <section className="space-y-4">
            <h2 className="border-b pb-2 text-lg font-bold">بيانات المركز</h2>
            <label className="block">
              <span className="mb-1 block font-semibold">اسم المركز أو المستشفى</span>
              <input
                required
                maxLength={120}
                value={clinicName}
                onChange={(event) => setClinicName(event.target.value)}
                className="w-full rounded-lg border p-2"
                placeholder="مركز الشفاء"
              />
            </label>
            <label className="block">
              <span className="mb-1 block font-semibold">هاتف المنشأة</span>
              <input
                required
                type="tel"
                maxLength={40}
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                className="w-full rounded-lg border p-2"
                autoComplete="tel"
              />
            </label>
            <label className="block">
              <span className="mb-1 block font-semibold">العنوان</span>
              <input
                maxLength={240}
                value={address}
                onChange={(event) => setAddress(event.target.value)}
                className="w-full rounded-lg border p-2"
                autoComplete="street-address"
              />
            </label>
            <label className="block">
              <span className="mb-1 block font-semibold">شعار المنشأة (حتى 2 ميجابايت)</span>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(event) => setLogoFile(event.target.files?.[0] ?? null)}
                className="w-full rounded-lg border p-2"
              />
            </label>
          </section>

          <section className="space-y-4">
            <h2 className="border-b pb-2 text-lg font-bold">حساب صاحب المركز</h2>
            <label className="block">
              <span className="mb-1 block font-semibold">الاسم الكامل</span>
              <input
                required
                maxLength={120}
                value={ownerName}
                onChange={(event) => setOwnerName(event.target.value)}
                className="w-full rounded-lg border p-2"
                autoComplete="name"
              />
            </label>
            <label className="block">
              <span className="mb-1 block font-semibold">البريد الإلكتروني</span>
              <input
                required
                type="email"
                value={ownerEmail}
                onChange={(event) => setOwnerEmail(event.target.value)}
                className="w-full rounded-lg border p-2"
                autoComplete="email"
              />
            </label>
            <label className="block">
              <span className="mb-1 block font-semibold">اسم المستخدم</span>
              <input
                required
                minLength={3}
                maxLength={30}
                pattern="[A-Za-z0-9._-]+"
                value={ownerUsername}
                onChange={(event) => setOwnerUsername(event.target.value)}
                className="w-full rounded-lg border p-2"
                autoComplete="username"
              />
            </label>
            <label className="block">
              <span className="mb-1 block font-semibold">كلمة المرور (10 أحرف على الأقل)</span>
              <input
                required
                type="password"
                minLength={10}
                value={ownerPassword}
                onChange={(event) => setOwnerPassword(event.target.value)}
                className="w-full rounded-lg border p-2"
                autoComplete="new-password"
              />
            </label>
          </section>

          <section className="space-y-4">
            <h2 className="border-b pb-2 text-lg font-bold">الاشتراك والموظفون</h2>
            <label className="block">
              <span className="mb-1 block font-semibold">نوع الاشتراك</span>
              <select
                value={planType}
                onChange={(event) =>
                  setPlanType(event.target.value as "monthly" | "yearly")
                }
                className="w-full rounded-lg border p-2"
              >
                <option value="monthly">اشتراك شهري</option>
                <option value="yearly">اشتراك سنوي</option>
              </select>
            </label>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold">حسابات الموظفين: {employees.length}</p>
                <p className="text-sm text-gray-600">
                  أضف حسابًا لكل موظف؛ يختار صاحب المركز اسم المستخدم وكلمة المرور.
                </p>
              </div>
              <button
                type="button"
                disabled={employees.length >= 100}
                onClick={addEmployee}
                className="rounded-lg border border-blue-600 px-4 py-2 font-semibold text-blue-700 disabled:opacity-50"
              >
                إضافة موظف
              </button>
            </div>
            {employees.map((employee, index) => (
              <fieldset
                key={index}
                className="grid gap-3 rounded-lg border p-4 sm:grid-cols-2"
              >
                <legend className="px-2 font-semibold">الموظف {index + 1}</legend>
                <label>
                  <span className="mb-1 block">الاسم</span>
                  <input
                    required
                    value={employee.fullName}
                    onChange={(event) =>
                      updateEmployee(index, "fullName", event.target.value)
                    }
                    className="w-full rounded-lg border p-2"
                    autoComplete="off"
                  />
                </label>
                <label>
                  <span className="mb-1 block">اسم المستخدم</span>
                  <input
                    required
                    minLength={3}
                    maxLength={30}
                    pattern="[A-Za-z0-9._-]+"
                    value={employee.username}
                    onChange={(event) =>
                      updateEmployee(index, "username", event.target.value)
                    }
                    className="w-full rounded-lg border p-2"
                    autoComplete="off"
                  />
                </label>
                <label>
                  <span className="mb-1 block">كلمة المرور (10 أحرف على الأقل)</span>
                  <input
                    required
                    type="password"
                    minLength={10}
                    value={employee.password}
                    onChange={(event) =>
                      updateEmployee(index, "password", event.target.value)
                    }
                    className="w-full rounded-lg border p-2"
                    autoComplete="new-password"
                  />
                </label>
                <button
                  type="button"
                  onClick={() =>
                    setEmployees((current) =>
                      current.filter((_, employeeIndex) => employeeIndex !== index),
                    )
                  }
                  className="self-end text-right text-red-600 hover:underline"
                >
                  إزالة الموظف
                </button>
              </fieldset>
            ))}
          </section>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-lg bg-blue-700 py-3 font-bold text-white disabled:opacity-50"
          >
            {isSubmitting ? "جارٍ إنشاء المركز والحسابات..." : "إنشاء المركز والمتابعة للدفع"}
          </button>
        </form>

        <p className="mt-5 text-center text-sm text-gray-600">
          لديك حساب؟{" "}
          <button
            type="button"
            onClick={() => router.push("/login")}
            className="font-semibold text-blue-700 underline"
          >
            تسجيل الدخول
          </button>
        </p>
      </div>
    </main>
  );
}

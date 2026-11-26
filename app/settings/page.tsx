"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  cacheProfile,
  getCachedProfile,
  getCurrentProfile,
} from "@/lib/auth";
import { navigateTo } from "@/lib/navigation";
import { getSupabaseClient } from "@/lib/supabase";

interface ClinicResponse {
  error?: string;
  clinic?: {
    code: string;
    name: string;
    phone: string;
    address: string;
    logo_url: string | null;
  };
}

async function fileToBase64(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export default function ClinicSettingsPage() {
  const router = useRouter();
  const [clinicCode, setClinicCode] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoUrl, setLogoUrl] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const profile = await getCurrentProfile();
        if (!active) return;
        if (!profile || profile.role !== "admin") {
          navigateTo("/", () => router.replace("/"));
          return;
        }
        cacheProfile(profile);
        const { data, error: sessionError } =
          await getSupabaseClient().auth.getSession();
        if (sessionError) throw sessionError;
        const token = data.session?.access_token;
        if (!token) throw new Error("انتهت الجلسة. سجّل الدخول مجدداً.");

        const response = await fetch("/api/clinic/profile", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const result = (await response.json()) as ClinicResponse;
        if (!response.ok || !result.clinic) {
          throw new Error(result.error || "تعذر تحميل بيانات المركز.");
        }
        setClinicCode(result.clinic.code);
        setName(result.clinic.name);
        setPhone(result.clinic.phone);
        setAddress(result.clinic.address);
        setLogoUrl(result.clinic.logo_url ?? "");
      } catch (error) {
        if (active) {
          setErrorMessage(
            error instanceof Error ? error.message : "تعذر تحميل بيانات المركز.",
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

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setErrorMessage("");
    setIsSaving(true);
    try {
      const { data, error: sessionError } =
        await getSupabaseClient().auth.getSession();
      if (sessionError) throw sessionError;
      const token = data.session?.access_token;
      if (!token) throw new Error("انتهت الجلسة. سجّل الدخول مجدداً.");

      const logo = logoFile
        ? { mimeType: logoFile.type, base64: await fileToBase64(logoFile) }
        : undefined;
      const response = await fetch("/api/clinic/profile", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name, phone, address, logo }),
      });
      const result = (await response.json()) as ClinicResponse;
      if (!response.ok || !result.clinic) {
        throw new Error(result.error || "تعذر حفظ بيانات المركز.");
      }
      setName(result.clinic.name);
      setPhone(result.clinic.phone);
      setAddress(result.clinic.address);
      setLogoUrl(result.clinic.logo_url ?? "");
      setLogoFile(null);
      const currentProfile = getCachedProfile();
      if (currentProfile) {
        cacheProfile({
          ...currentProfile,
          clinicName: result.clinic.name,
          clinicPhone: result.clinic.phone,
          clinicAddress: result.clinic.address,
          clinicLogoUrl: result.clinic.logo_url,
        });
      }
      alert("تم حفظ بيانات المركز.");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "تعذر حفظ بيانات المركز.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return <p dir="rtl" className="p-8">جارٍ تحميل الإعدادات...</p>;
  }

  return (
    <main dir="rtl" className="min-h-screen bg-gray-100 p-4 sm:p-8">
      <div className="mx-auto max-w-2xl space-y-5">
        <header className="flex items-center justify-between rounded-xl bg-white p-5 shadow-sm">
          <h1 className="text-xl font-bold">بيانات المركز</h1>
          <button
            onClick={() => router.push("/")}
            className="font-semibold text-blue-700 hover:underline"
          >
            الرئيسية
          </button>
        </header>
        {errorMessage && (
          <p role="alert" className="rounded-lg bg-red-100 p-3 text-red-700">
            {errorMessage}
          </p>
        )}
        <form onSubmit={save} className="space-y-4 rounded-xl bg-white p-6 shadow">
          <p className="rounded-lg bg-blue-50 p-3 text-sm text-blue-900">
            رمز المركز لتسجيل دخول الموظفين: <strong dir="ltr">{clinicCode}</strong>
          </p>
          {logoUrl && (
            <div
              role="img"
              aria-label="شعار المركز"
              className="h-24 w-24 rounded-lg border bg-contain bg-center bg-no-repeat"
              style={{ backgroundImage: `url("${logoUrl}")` }}
            />
          )}
          <label className="block">
            <span className="mb-1 block font-semibold">اسم المركز</span>
            <input
              required
              maxLength={120}
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="w-full rounded-lg border p-2"
            />
          </label>
          <label className="block">
            <span className="mb-1 block font-semibold">هاتف المركز</span>
            <input
              required
              type="tel"
              maxLength={40}
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              className="w-full rounded-lg border p-2"
            />
          </label>
          <label className="block">
            <span className="mb-1 block font-semibold">العنوان</span>
            <input
              maxLength={240}
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              className="w-full rounded-lg border p-2"
            />
          </label>
          <label className="block">
            <span className="mb-1 block font-semibold">تغيير الشعار</span>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(event) => setLogoFile(event.target.files?.[0] ?? null)}
              className="w-full rounded-lg border p-2"
            />
          </label>
          <button
            disabled={isSaving}
            className="w-full rounded-lg bg-blue-700 py-3 font-bold text-white disabled:opacity-50"
          >
            {isSaving ? "جارٍ الحفظ..." : "حفظ البيانات"}
          </button>
        </form>
      </div>
    </main>
  );
}

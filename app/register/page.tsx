"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface RegistrationResponse {
  error?: string;
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
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  // بيانات المركز
  const [clinicName, setClinicName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [logoFile, setLogoFile] = useState<File | null>(null);

  // بيانات المدير (صاحب المركز)
  const [adminName, setAdminName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage("");
    setLoading(true);

    try {
      const logo = logoFile
        ? {
            mimeType: logoFile.type,
            base64: await fileToBase64(logoFile),
          }
        : undefined;
      const response = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clinicName,
          phone,
          address,
          ownerName: adminName,
          ownerEmail: email,
          ownerUsername: username,
          ownerPassword: password,
          employees: [],
          logo,
        }),
      });
      const result = (await response.json()) as RegistrationResponse;
      if (!response.ok || !result.clinicCode) {
        throw new Error(result.error || "لم يتم إكمال تسجيل المركز.");
      }

      alert(`تم إنشاء المركز بنجاح. رمز المركز هو: ${result.clinicCode}`);
      router.push("/login");
    } catch (error: unknown) {
      setErrorMessage(
        error instanceof Error ? error.message : "حدث خطأ أثناء التسجيل.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div dir="rtl" className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="bg-white p-8 rounded-xl shadow-xl w-full max-w-lg">
        <h1 className="text-2xl font-bold text-center text-blue-600 mb-6">تسجيل مركز طبي جديد</h1>

        <form onSubmit={handleRegister} className="space-y-4">
          <h2 className="text-lg font-semibold text-gray-700 border-b pb-2">بيانات المركز</h2>
          <div>
            <label className="block text-gray-700 font-semibold mb-1">اسم المركز</label>
            <input type="text" required minLength={2} maxLength={120} value={clinicName} onChange={(e) => setClinicName(e.target.value)} className="w-full border rounded-lg p-2" placeholder="مثال: مركز الشفاء" />
          </div>
          <div>
            <label className="block text-gray-700 font-semibold mb-1">رقم الهاتف</label>
            <input type="tel" required minLength={5} maxLength={40} value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full border rounded-lg p-2" placeholder="01xxxxxxxxx" />
          </div>
          <div>
            <label className="block text-gray-700 font-semibold mb-1">العنوان</label>
            <input type="text" maxLength={240} value={address} onChange={(e) => setAddress(e.target.value)} className="w-full border rounded-lg p-2" placeholder="المدينة، الشارع" />
          </div>
          <div>
            <label className="block text-gray-700 font-semibold mb-1">شعار المركز</label>
            <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => setLogoFile(e.target.files?.[0] || null)} className="w-full border rounded-lg p-2" />
          </div>

          <h2 className="text-lg font-semibold text-gray-700 border-b pb-2 mt-6">بيانات المدير (صاحب المركز)</h2>
          <div>
            <label className="block text-gray-700 font-semibold mb-1">الاسم الكامل</label>
            <input type="text" required minLength={2} maxLength={120} value={adminName} onChange={(e) => setAdminName(e.target.value)} className="w-full border rounded-lg p-2" placeholder="د. أحمد محمد" />
          </div>
          <div>
            <label className="block text-gray-700 font-semibold mb-1">اسم المستخدم (للدخول)</label>
            <input
              type="text"
              required
              minLength={3}
              maxLength={30}
              value={username}
              onChange={(e) =>
                setUsername(
                  e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, ""),
                )
              }
              className="w-full border rounded-lg p-2"
              placeholder="مثال: ahmed"
              pattern="[A-Za-z0-9._-]{3,30}"
            />
          </div>
          <div>
            <label className="block text-gray-700 font-semibold mb-1">البريد الإلكتروني</label>
            <input type="email" required maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} className="w-full border rounded-lg p-2" placeholder="email@example.com" />
          </div>
          <div>
            <label className="block text-gray-700 font-semibold mb-1">كلمة المرور</label>
            <input type="password" required minLength={10} maxLength={72} value={password} onChange={(e) => setPassword(e.target.value)} className="w-full border rounded-lg p-2" placeholder="********" />
          </div>

          {errorMessage && (
            <p role="alert" className="text-sm text-red-700">{errorMessage}</p>
          )}
          <button type="submit" disabled={loading} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg mt-4 transition">
            {loading ? "جاري التسجيل..." : "تسجيل المركز"}
          </button>
        </form>
      </div>
    </div>
  );
}
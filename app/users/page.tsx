"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  cacheProfile,
  getCurrentProfile,
  isSubscriptionActive,
} from "@/lib/auth";
import { navigateTo } from "@/lib/navigation";
import { getSupabaseClient } from "@/lib/supabase";

interface User {
  id: string;
  username: string;
  fullName: string;
  role: "admin" | "employee";
  active: boolean;
}

interface UsersResponse {
  users?: User[];
  error?: string;
}

export default function UsersPage() {
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);
  const [username, setUsername] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [seatCount, setSeatCount] = useState(1);

  const loadUsers = async () => {
    const { data, error: sessionError } =
      await getSupabaseClient().auth.getSession();
    if (sessionError) throw sessionError;
    const accessToken = data.session?.access_token;
    if (!accessToken) throw new Error("انتهت الجلسة. سجّل الدخول مجدداً.");

    const response = await fetch("/api/admin/users", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const result = (await response.json()) as UsersResponse;
    if (!response.ok) {
      throw new Error(result.error || "تعذر تحميل المستخدمين.");
    }
    setUsers(result.users ?? []);
  };

  useEffect(() => {
    let active = true;
    getCurrentProfile()
      .then(async (profile) => {
        if (!active) return;
        if (!profile || profile.role !== "admin") {
          alert("ليس لديك صلاحية للوصول لهذه الصفحة");
          navigateTo("/", () => router.replace("/"));
          return;
        }
        if (!isSubscriptionActive(profile)) {
          navigateTo("/billing", () => router.replace("/billing"));
          return;
        }

        cacheProfile(profile);
        setSeatCount(profile.seatCount);
        try {
          await loadUsers();
        } catch (error) {
          if (active) {
            setErrorMessage(
              error instanceof Error ? error.message : "تعذر تحميل المستخدمين.",
            );
          }
        } finally {
          if (active) setIsLoading(false);
        }
      })
      .catch((error: unknown) => {
        console.error("Unable to load the signed-in user.", error);
        if (active) navigateTo("/login", () => router.replace("/login"));
      });

    return () => {
      active = false;
    };
  }, [router]);

  const handleAddUser = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!username.trim() || !fullName.trim() || password.length < 10) {
      setErrorMessage("أدخل الاسم واسم المستخدم وكلمة مرور من 10 أحرف على الأقل.");
      return;
    }

    setErrorMessage("");
    setIsSaving(true);
    try {
      const { data, error: sessionError } =
        await getSupabaseClient().auth.getSession();
      if (sessionError) throw sessionError;
      const accessToken = data.session?.access_token;
      if (!accessToken) throw new Error("انتهت الجلسة. سجّل الدخول مجدداً.");

      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username, fullName, password }),
      });
      const result = (await response.json()) as UsersResponse;
      if (!response.ok) {
        throw new Error(result.error || "تعذرت دعوة المستخدم.");
      }

      await loadUsers();
      setUsername("");
      setFullName("");
      setPassword("");
      alert("تم إنشاء حساب الموظف. سلّمه اسم المستخدم وكلمة المرور.");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "تعذرت دعوة المستخدم.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const deleteUser = async (user: User) => {
    if (!confirm(`هل تريد حذف حساب ${user.fullName || user.username}؟`)) return;

    setErrorMessage("");
    try {
      const { data, error: sessionError } =
        await getSupabaseClient().auth.getSession();
      if (sessionError) throw sessionError;
      const accessToken = data.session?.access_token;
      if (!accessToken) throw new Error("انتهت الجلسة. سجّل الدخول مجدداً.");

      const response = await fetch(
        `/api/admin/users?id=${encodeURIComponent(user.id)}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${accessToken}` },
        },
      );
      const result = (await response.json()) as UsersResponse;
      if (!response.ok) {
        throw new Error(result.error || "تعذر حذف المستخدم.");
      }
      setUsers((currentUsers) =>
        currentUsers.filter((currentUser) => currentUser.id !== user.id),
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "تعذر حذف المستخدم.",
      );
    }
  };

  return (
    <div dir="rtl" className="min-h-screen bg-gray-100 p-6">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex items-center justify-between rounded-xl bg-white p-4 shadow-sm">
          <h1 className="text-2xl font-bold text-gray-800">
            إدارة المستخدمين والصلاحيات
          </h1>
          <button
            onClick={() => navigateTo("/", () => router.push("/"))}
            className="font-semibold text-blue-600 hover:underline"
          >
            العودة للرئيسية
          </button>
        </div>

        {errorMessage && (
          <p role="alert" className="rounded-lg bg-red-100 p-3 text-red-700">
            {errorMessage}
          </p>
        )}

        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          <div className="h-fit rounded-xl bg-white p-6 shadow-md">
            <h2 className="mb-4 text-xl font-bold">إنشاء حساب موظف</h2>
            <form onSubmit={handleAddUser} className="space-y-4">
              <div>
                <label className="mb-1 block font-semibold text-gray-700">
                  الاسم الحقيقي
                </label>
                <input
                  type="text"
                  required
                  maxLength={120}
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  className="w-full rounded-lg border p-2"
                  autoComplete="name"
                />
              </div>
              <div>
                <label className="mb-1 block font-semibold text-gray-700">
                  اسم المستخدم
                </label>
                <input
                  required
                  minLength={3}
                  maxLength={30}
                  pattern="[A-Za-z0-9._\x2d]+"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  className="w-full rounded-lg border p-2"
                  autoComplete="off"
                />
              </div>
              <div>
                <label className="mb-1 block font-semibold text-gray-700">
                  كلمة المرور (10 أحرف على الأقل)
                </label>
                <input
                  type="password"
                  required
                  minLength={10}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="w-full rounded-lg border p-2"
                  autoComplete="new-password"
                />
              </div>
              <button
                type="submit"
                disabled={isSaving}
                className="w-full rounded-lg bg-blue-600 py-2 font-bold text-white disabled:opacity-50"
              >
                {isSaving ? "جارٍ إنشاء الحساب..." : "إنشاء حساب الموظف"}
              </button>
            </form>
          </div>

          <div className="rounded-xl bg-white p-6 shadow-md md:col-span-2">
            <h2 className="mb-1 text-xl font-bold">قائمة المستخدمين</h2>
            <p className="mb-4 text-sm text-gray-600">
              المقاعد المستخدمة: {users.length} من {seatCount} —{" "}
              <button
                type="button"
                onClick={() => router.push("/billing")}
                className="font-semibold text-blue-700 underline"
              >
                تعديل عدد المقاعد
              </button>
            </p>
            {isLoading ? (
              <p>جارٍ تحميل المستخدمين...</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-right">
                  <thead>
                    <tr className="bg-gray-100">
                      <th className="border-b p-3">الاسم</th>
                      <th className="border-b p-3">اسم المستخدم</th>
                      <th className="border-b p-3">الصلاحية</th>
                      <th className="border-b p-3">الحالة</th>
                      <th className="border-b p-3">إجراءات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((user) => (
                      <tr key={user.id} className="border-b hover:bg-gray-50">
                        <td className="p-3 font-semibold">{user.fullName}</td>
                        <td className="p-3 text-gray-600">{user.username}</td>
                        <td className="p-3">
                          {user.role === "admin" ? "مدير" : "موظف"}
                        </td>
                        <td className="p-3">
                          {user.active ? "نشط" : "غير نشط"}
                        </td>
                        <td className="p-3">
                          {user.role === "employee" && (
                            <button
                              onClick={() => void deleteUser(user)}
                              className="text-red-500 hover:underline"
                            >
                              حذف
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                    {users.length === 0 && (
                      <tr>
                        <td colSpan={5} className="p-6 text-center text-gray-500">
                          لا يوجد مستخدمون.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

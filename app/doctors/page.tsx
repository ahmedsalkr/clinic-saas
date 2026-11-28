"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  cacheProfile,
  getCurrentProfile,
} from "@/lib/auth";
import { readLocalRecords, saveLocalRecords } from "@/lib/clinic-sync";
import { navigateTo } from "@/lib/navigation";

interface Doctor {
  id: string;
  name: string;
  specialty: string;
  phone: string;
  price: number;
  room: string;
}

export default function DoctorsPage() {
  const router = useRouter();
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [room, setRoom] = useState("");

  // حالات الإدخال
  const [name, setName] = useState("");
  const [specialty, setSpecialty] = useState("بطن");
  const [phone, setPhone] = useState("");
  const [price, setPrice] = useState("");

  // تحميل قائمة الأطباء عند فتح الصفحة
  useEffect(() => {
    let active = true;
    const refreshDoctors = () => {
      setDoctors(readLocalRecords<Doctor>("doctors"));
    };

    window.addEventListener("clinic-data-updated", refreshDoctors);
    getCurrentProfile()
      .then((profile) => {
        if (!active) return;
        if (!profile) {
          navigateTo("/login", () => router.replace("/login"));
          return;
        }
        cacheProfile(profile);
        refreshDoctors();
      })
      .catch((error: unknown) => {
        console.error("Unable to load the signed-in user.", error);
        if (active) navigateTo("/login", () => router.replace("/login"));
      });

    return () => {
      active = false;
      window.removeEventListener("clinic-data-updated", refreshDoctors);
    };
  }, [router]);

  const handleAddDoctor = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !price) {
      alert("يرجى إدخال اسم الدكتور وسعر الكشف");
      return;
    }

    const newDoctor: Doctor = {
      id: crypto.randomUUID(),
      name,
      specialty,
      phone,
      price: Number(price),
      room,
    };

    const updated = [...doctors, newDoctor];
    setDoctors(updated);
    saveLocalRecords("doctors", updated);

    // تفريغ الحقول
    setName("");
    setPhone("");
    setPrice("");
    setRoom("");
  };

  const deleteDoctor = (id: string) => {
    if (confirm("هل أنت متأكد من حذف هذا الدكتور؟")) {
      const updated = doctors.filter((d) => d.id !== id);
      setDoctors(updated);
      saveLocalRecords("doctors", updated);
    }
  };

  return (
    <div dir="rtl" className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex justify-between items-center bg-white p-4 rounded-xl shadow-sm">
          <h1 className="text-2xl font-bold text-gray-800">إدارة الأطباء</h1>
          <button
            onClick={() => navigateTo("/", () => router.push("/"))}
            className="text-blue-600 hover:underline font-semibold"
          >
            العودة للرئيسية
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* نموذج الإضافة */}
          <div className="bg-white p-6 rounded-xl shadow-md h-fit">
            <h2 className="text-xl font-bold mb-4">إضافة دكتور جديد</h2>
            <form onSubmit={handleAddDoctor} className="space-y-4">
              <div>
                <label className="block text-gray-700 font-semibold mb-1">
                  اسم الدكتور
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full border rounded-lg p-2"
                  placeholder="د. أحمد..."
                />
              </div>
              <div>
                <label className="block text-gray-700 font-semibold mb-1">
                  التخصص
                </label>
                <select
                  value={specialty}
                  onChange={(e) => setSpecialty(e.target.value)}
                  className="w-full border rounded-lg p-2"
                >
                  <optgroup label="التخصصات الباطنية">
                    <option value="باطنة عامة">باطنة عامة</option>
                    <option value="قلب وأوعية دموية">قلب وأوعية دموية</option>
                    <option value="جهاز هضمي وكبد">جهاز هضمي وكبد</option>
                    <option value="صدر وحساسية">صدر وحساسية</option>
                    <option value="كلى">كلى</option>
                    <option value="غدد صماء وسكر">غدد صماء وسكر</option>
                    <option value="روماتيزم ومناعة">روماتيزم ومناعة</option>
                    <option value="أورام">أورام</option>
                    <option value="أمراض دم">أمراض دم</option>
                  </optgroup>
                  <optgroup label="التخصصات الجراحية">
                    <option value="جراحة عامة">جراحة عامة</option>
                    <option value="عظام">عظام</option>
                    <option value="جراحة مخ وأعصاب">جراحة مخ وأعصاب</option>
                    <option value="جراحة قلب وصدر">جراحة قلب وصدر</option>
                    <option value="جراحة أوعية دموية">جراحة أوعية دموية</option>
                    <option value="جراحة مسالك بولية">جراحة مسالك بولية</option>
                    <option value="جراحة تجميل">جراحة تجميل</option>
                  </optgroup>
                  <optgroup label="تخصصات أخرى">
                    <option value="أطفال">أطفال</option>
                    <option value="نساء وتوليد">نساء وتوليد</option>
                    <option value="عيون">عيون</option>
                    <option value="أنف وأذن وحنجرة">أنف وأذن وحنجرة</option>
                    <option value="جلدية وتناسلية">جلدية وتناسلية</option>
                    <option value="مسالك بولية">مسالك بولية</option>
                    <option value="أسنان">أسنان</option>
                    <option value="نفسية وعصبية">نفسية وعصبية</option>
                    <option value="تخاطب">تخاطب</option>
                    <option value="علاج طبيعي">علاج طبيعي</option>
                    <option value="تغذية علاجية">تغذية علاجية</option>
                  </optgroup>
                </select>
              </div>
              <div>
                <label className="block text-gray-700 font-semibold mb-1">
                  رقم التواصل
                </label>
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full border rounded-lg p-2"
                  placeholder="01xxxxxxxxx"
                />
              </div>
              <div>
                <label className="block text-gray-700 font-semibold mb-1">
                  سعر الكشف (ج.م)
                </label>
                <input
                  type="number"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  className="w-full border rounded-lg p-2"
                  placeholder="مثال: 150"
                />
              </div>
              <div>
                <label className="block text-gray-700 font-semibold mb-1">
                  رقم الغرفة
                </label>
                <input
                  type="text"
                  value={room}
                  onChange={(e) => setRoom(e.target.value)}
                  className="w-full border rounded-lg p-2"
                  placeholder="مثال: غرفة 1 أو A"
                />
              </div>
              <button
                type="submit"
                className="w-full bg-blue-600 text-white font-bold py-2 rounded-lg"
              >
                حفظ
              </button>
            </form>
          </div>

          {/* جدول عرض الأطباء */}
          <div className="md:col-span-2 bg-white p-6 rounded-xl shadow-md">
            <h2 className="text-xl font-bold mb-4">قائمة الأطباء</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-right">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="p-3 border-b">الاسم</th>
                    <th className="p-3 border-b">التخصص</th>
                    <th className="p-3 border-b">الغرفة</th>
                    <th className="p-3 border-b">السعر</th>
                    <th className="p-3 border-b">إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {doctors.map((doc) => (
                    <tr key={doc.id} className="hover:bg-gray-50 border-b">
                      <td className="p-3 font-semibold">{doc.name}</td>
                      <td className="p-3 text-gray-600">{doc.specialty}</td>
                      <td className="p-3 text-gray-600">{doc.room}</td>
                      <td className="p-3 font-bold text-green-600">
                        {doc.price} ج.م
                      </td>
                      <td className="p-3">
                        <button
                          onClick={() => deleteDoctor(doc.id)}
                          className="text-red-500 hover:underline"
                        >
                          حذف
                        </button>
                      </td>
                    </tr>
                  ))}
                  {doctors.length === 0 && (
                    <tr>
                      <td colSpan={4} className="text-center p-4 text-gray-500">
                        لا يوجد أطباء مسجلين بعد
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

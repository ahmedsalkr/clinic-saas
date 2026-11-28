"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  cacheProfile,
  clearCachedProfile,
  getCurrentProfile,
} from "@/lib/auth";
import {
  getStationId,
  readLocalRecords,
  saveLocalRecords,
} from "@/lib/clinic-sync";
import { navigateTo } from "@/lib/navigation";
import { getSupabaseClient } from "@/lib/supabase";

interface Patient {
  id: string;
  name: string;
  phone: string;
  age: string;
  service: string;
  price: string;
  queueNumber: number | string;
  date: string;
  time: string;
  doctorName?: string;
  room?: string;
  category?: string;
  addedBy?: string;
  paymentMethod?: string;
}
interface Doctor {
  id: string;
  name: string;
  specialty: string;
  phone: string;
  price: number;
  room: string;
}

export default function Home() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"register" | "list">("register");
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [selectedRoom, setSelectedRoom] = useState("");
  const [todayDate, setTodayDate] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [loginTime, setLoginTime] = useState("");
  const [clinicName, setClinicName] = useState("");
  const [clinicPhone, setClinicPhone] = useState("");
  const [clinicAddress, setClinicAddress] = useState("");
  const [clinicLogoUrl, setClinicLogoUrl] = useState<string | null>(null);
  // حالات إدخال المريض
  const [patientName, setPatientName] = useState("");
  const [patientPhone, setPatientPhone] = useState("");
  const [patientAge, setPatientAge] = useState("");
  const [serviceType, setServiceType] = useState("كشف بطن");
  const [servicePrice, setServicePrice] = useState("");
  const [selectedDoctorName, setSelectedDoctorName] = useState("");

  // حالات القوائم
  const [printData, setPrintData] = useState<Patient | null>(null);
  const [patientsList, setPatientsList] = useState<Patient[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [doctors, setDoctors] = useState<Doctor[]>([]);

  // حالة لإظهار الاقتراحات
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("كاش");

  useEffect(() => {
    let active = true;
    const refreshLocalData = () => {
      setPatientsList(readLocalRecords<Patient>("patients").reverse());
      setDoctors(readLocalRecords<Doctor>("doctors"));
    };

    window.addEventListener("clinic-data-updated", refreshLocalData);
    getCurrentProfile()
      .then((profile) => {
        if (!active) return;
        if (!profile) {
          navigateTo("/login", () => router.replace("/login"));
          return;
        }
        cacheProfile(profile);
        setDisplayName(profile.fullName);
        setClinicName(profile.clinicName);
        setClinicPhone(profile.clinicPhone);
        setClinicAddress(profile.clinicAddress);
        setClinicLogoUrl(profile.clinicLogoUrl);
        setLoginTime(localStorage.getItem("loginTime") || "");
        setTodayDate(new Date().toLocaleDateString("ar-EG"));
        refreshLocalData();
      })
      .catch((error: unknown) => {
        console.error("Unable to load the signed-in user.", error);
        if (active) navigateTo("/login", () => router.replace("/login"));
      });

    return () => {
      active = false;
      window.removeEventListener("clinic-data-updated", refreshLocalData);
    };
  }, [router]);

  const getQueueNumber = (category: string) => {
    const now = new Date();
    const hour = now.getHours();
    const today = now.toDateString();
    const shiftName = hour >= 6 && hour < 16 ? "morning" : "evening";

    // مفتاح فريد لكل قسم في كل شفت
    const currentShiftKey = `${today}-${shiftName}-${category}`;
    const stationId = getStationId();
    const counterKey = `currentQueue-${stationId}-${category}`;
    const shiftKey = `lastShiftKey-${stationId}-${category}`;

    const lastShiftKey = localStorage.getItem(shiftKey);
    let currentQueue = parseInt(
      localStorage.getItem(counterKey) || "0",
    );

    if (lastShiftKey !== currentShiftKey) {
      currentQueue = 0;
    }

    currentQueue += 1;

    localStorage.setItem(shiftKey, currentShiftKey);
    localStorage.setItem(counterKey, currentQueue.toString());
    return `${stationId}-${currentQueue.toString().padStart(3, "0")}`;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!patientName || !servicePrice) {
      alert("يرجى إدخال اسم المريض والسعر على الأقل");
      return;
    }

    const now = new Date();

    const queueNumber = getQueueNumber(serviceType);

    const newPatient: Patient = {
      id: crypto.randomUUID(),
      name: patientName,
      phone: patientPhone,
      age: patientAge,
      service: serviceType,
      price: servicePrice,
      queueNumber,
      date: now.toISOString().split("T")[0], // سيحفظ التاريخ بصيغة 2026-11-24
      time: now.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
      }),
      doctorName: selectedDoctorName,
      room: selectedRoom,
      category: serviceType,
      addedBy: localStorage.getItem("userName") || "مجهول",
      paymentMethod: paymentMethod,
    };

    const savedPatients = readLocalRecords("patients");
    saveLocalRecords("patients", [...savedPatients, newPatient]);

    setPatientsList([newPatient, ...patientsList]);
    setPrintData(newPatient);

    setTimeout(() => window.print(), 500);

    // تفريغ الحقول
    setPatientName("");
    setPatientPhone("");
    setPatientAge("");
    setServicePrice("");
    setSelectedDoctorName("");
    setSelectedRoom("");
    setPaymentMethod("كاش");
  };

  // دالة استرجاع المبلغ (إلغاء الكشف)
const handleRefund = (patientToRefund: Patient) => {
  if (confirm(`هل أنت متأكد من استرجاع مبلغ ${patientToRefund.price} ج.م للمريض ${patientToRefund.name}؟`)) {
    // تحديث حالة المريض إلى "مسترجع"
    const updatedPatients = patientsList.map((p) =>
      p.id === patientToRefund.id
        ? { ...p, service: "تم الاسترجاع", price: "0", addedBy: p.addedBy }
        : p
    );

    setPatientsList(updatedPatients);
    // إعادة حفظ القائمة في المتصفح
    saveLocalRecords("patients", [...updatedPatients].reverse());
    alert("تم استرجاع المبلغ وتحديث السجل بنجاح.");
  }
};

// دالة استبدال الكشف
const handleSwap = (patientToSwap: Patient) => {
  const newService = prompt("أدخل اسم الخدمة الجديدة (مثال: كشف عظام):", patientToSwap.service);
  if (newService && newService !== patientToSwap.service) {
    const newPrice = prompt("أدخل سعر الخدمة الجديدة:", "150");
    if (newPrice) {
      const updatedPatients = patientsList.map((p) =>
        p.id === patientToSwap.id
          ? { ...p, service: newService, price: newPrice, doctorName: "تم الاستبدال", room: "", addedBy: p.addedBy }
          : p
      );

      setPatientsList(updatedPatients);
      saveLocalRecords("patients", [...updatedPatients].reverse());
      alert("تم استبدال الكشف وتحديث السجل بنجاح.");
    }
  }
};

  // دالة اختيار مريض سابق
  const selectPreviousPatient = (p: Patient) => {
    setPatientName(p.name);
    setPatientPhone(p.phone);
    setPatientAge(p.age);
    setShowSuggestions(false); // إخفاء القائمة بعد الاختيار
  };

  // دالة البحث التلقائي (تبحث في الاسم أو الهاتف)
  const getSuggestions = () => {
    const searchStr = patientName || patientPhone; // يبحث في الاسم أو الهاتف
    if (searchStr.length < 2) return []; // لا يبحث إلا بعد كتابة حرفين على الأقل

    // تصفية المرضى الفريدين (حتى لا يتكرر نفس الاسم)
    const uniquePatients = Array.from(new Set(patientsList.map((p) => p.phone)))
      .map((phone) => patientsList.find((p) => p.phone === phone))
      .filter(
        (p) => p && (p.name.includes(searchStr) || p.phone.includes(searchStr)),
      );

    return uniquePatients.slice(0, 5); // أول 5 نتائج
  };

  const suggestions = getSuggestions();

  // تصفية سجل المرضى في التبويب الثاني
  const filteredPatients = patientsList.filter(
    (p) => p.name.includes(searchTerm) || p.phone.includes(searchTerm),
  );

  const todayStr = todayDate;
  const todayRevenue = patientsList
    .filter((p) => p.date === todayStr)
    .reduce((sum, p) => sum + Number(p.price), 0);

  return (
    <>
      <div className="print:hidden min-h-screen bg-gray-100 flex flex-col items-center py-10 px-4">
        {/* شريط المستخدم العلوي */}
        <div className="w-full max-w-5xl flex flex-wrap justify-between items-center mb-4 gap-3 text-gray-600 bg-white p-3 rounded-lg shadow-sm">
          <div>
            <div className="mb-1 flex items-center gap-3">
              {clinicLogoUrl && (
                <span
                  role="img"
                  aria-label={`شعار ${clinicName}`}
                  className="h-10 w-10 rounded bg-contain bg-center bg-no-repeat"
                  style={{ backgroundImage: `url("${clinicLogoUrl}")` }}
                />
              )}
              <div>
                <strong className="text-gray-800">{clinicName}</strong>
                {clinicPhone && (
                  <div className="text-xs text-gray-500">{clinicPhone}</div>
                )}
                {clinicAddress && (
                  <div className="text-xs text-gray-500">{clinicAddress}</div>
                )}
              </div>
            </div>
            مرحباً، <strong>{displayName}</strong> | وقت الدخول: {loginTime}
</div>
          <div className="flex flex-wrap gap-3">
            {/* زر المصروفات (يظهر للجميع) */}
            <button
              onClick={() => navigateTo("/admin", () => router.push("/admin"))}
              className="text-red-600 hover:underline font-bold"
            >
              {typeof window !== "undefined" &&
              localStorage.getItem("userRole") === "admin"
                ? "لوحة التحكم (الجرد)"
                : "تسجيل مصروفات"}
            </button>
            {/* أزرار المدير فقط */}
            {typeof window !== "undefined" &&
              localStorage.getItem("userRole") === "admin" && (
                <>
                  <button
                    onClick={() => navigateTo("/users", () => router.push("/users"))}
                    className="text-orange-600 hover:underline font-bold"
                  >
                    إدارة المستخدمين
                  </button>
                  <button
                    onClick={() => navigateTo("/settings", () => router.push("/settings"))}
                    className="text-teal-700 hover:underline font-bold"
                  >
                    بيانات المركز
                  </button>
                </>
              )}

            {/* زر إدارة الأطباء (يمكن للمدير والموظف رؤيته إذا أردت، أو حذفه من هنا) */}
            <button
              onClick={() => navigateTo("/doctors", () => router.push("/doctors"))}
              className="text-purple-600 hover:underline font-bold"
            >
              إدارة الأطباء
            </button>

            {/* زر تسجيل الخروج (للجميع) */}
            <button
              onClick={async () => {
                const { error } = await getSupabaseClient().auth.signOut({
                  scope: "local",
                });
                if (error) {
                  alert(`تعذر تسجيل الخروج: ${error.message}`);
                  return;
                }
                clearCachedProfile();
                navigateTo("/login", () => router.push("/login"));
              }}
              className="text-red-500 hover:underline"
            >
              تسجيل خروج
            </button>
          </div>
        </div>

        {/* شريط التبويبات */}
        <div className="flex bg-white rounded-lg shadow-md mb-6 overflow-hidden w-full max-w-2xl">
          <button
            onClick={() => setActiveTab("register")}
            className={`flex-1 py-3 font-bold text-center transition ${activeTab === "register" ? "bg-blue-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
          >
            تسجيل حالة جديدة
          </button>
          <button
            onClick={() => setActiveTab("list")}
            className={`flex-1 py-3 font-bold text-center transition ${activeTab === "list" ? "bg-blue-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
          >
            سجل المرضى
          </button>
        </div>

        {/* تبويب تسجيل الحالة */}
        {activeTab === "register" && (
          <div className="bg-white p-8 rounded-xl shadow-xl w-full max-w-md relative">
            <h1 className="text-2xl font-bold text-center text-blue-600 mb-6">
              تسجيل حالة جديدة
            </h1>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* اسم الحالة مع البحث التلقائي */}
              <div className="relative">
                <label className="block text-gray-700 font-semibold mb-1">
                  اسم الحالة
                </label>
                <input
                  type="text"
                  value={patientName}
                  onChange={(e) => {
                    setPatientName(e.target.value);
                    setShowSuggestions(true);
                    setHighlightedIndex(0);
                  }}
                  onFocus={() => setShowSuggestions(true)}
                  onBlur={() =>
                    setTimeout(() => setShowSuggestions(false), 200)
                  }
                  onKeyDown={(e) => {
                    if (!showSuggestions || suggestions.length === 0) return;
                    if (e.key === "ArrowDown") {
                      e.preventDefault();
                      setHighlightedIndex((prev) =>
                        prev < suggestions.length - 1 ? prev + 1 : prev,
                      );
                    } else if (e.key === "ArrowUp") {
                      e.preventDefault();
                      setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : 0));
                    } else if (e.key === "Enter") {
                      e.preventDefault();
                      selectPreviousPatient(suggestions[highlightedIndex]!);
                    }
                  }}
                  className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-blue-500"
                  placeholder="ابحث بالاسم أو اكتب اسماً جديداً..."
                />
              </div>

              {/* رقم التليفون مع البحث التلقائي */}
              <div className="relative">
                <label className="block text-gray-700 font-semibold mb-1">
                  رقم التليفون
                </label>
                <input
                  type="text"
                  value={patientPhone}
                  onChange={(e) => {
                    setPatientPhone(e.target.value);
                    setShowSuggestions(true);
                    setHighlightedIndex(0);
                  }}
                  onFocus={() => setShowSuggestions(true)}
                  onBlur={() =>
                    setTimeout(() => setShowSuggestions(false), 200)
                  }
                  onKeyDown={(e) => {
                    if (!showSuggestions || suggestions.length === 0) return;
                    if (e.key === "ArrowDown") {
                      e.preventDefault();
                      setHighlightedIndex((prev) =>
                        prev < suggestions.length - 1 ? prev + 1 : prev,
                      );
                    } else if (e.key === "ArrowUp") {
                      e.preventDefault();
                      setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : 0));
                    } else if (e.key === "Enter") {
                      e.preventDefault();
                      selectPreviousPatient(suggestions[highlightedIndex]!);
                    }
                  }}
                  className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-blue-500"
                  placeholder="ابحث برقم الهاتف..."
                />
              </div>

              {/* قائمة الاقتراحات (تظهر أسفل الحقلين) */}
              {/* قائمة الاقتراحات */}
              {showSuggestions &&
                suggestions.length > 0 &&
                (patientName.length >= 2 || patientPhone.length >= 2) && (
                  <div
                    className="absolute z-10 w-[calc(100%-4rem)] bg-white border border-gray-200 rounded-lg shadow-lg mt-1 max-h-40 overflow-y-auto"
                    style={{ top: "150px" }}
                  >
                    <div className="bg-blue-50 text-blue-800 text-xs font-bold p-2 border-b">
                      مرضى مسجلون مسبقاً (استخدم الأسهم و Enter):
                    </div>
                    {suggestions.map((p, idx) => (
                      <div
                        key={idx}
                        onClick={() => selectPreviousPatient(p!)}
                        onMouseEnter={() => setHighlightedIndex(idx)}
                        className={`p-2 border-b cursor-pointer text-sm flex justify-between ${highlightedIndex === idx ? "bg-blue-600 text-white" : "hover:bg-blue-100"}`}
                      >
                        <span>{p?.name}</span>
                        <span
                          className={
                            highlightedIndex === idx
                              ? "text-gray-200 text-xs"
                              : "text-gray-500 text-xs"
                          }
                        >
                          {p?.phone}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                            {/* حقل السن */}
              <div className="w-24">
                <label className="block text-gray-700 font-semibold mb-1">السن</label>
                <input
                  type="number"
                  value={patientAge}
                  onChange={(e) => setPatientAge(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg p-2"
                  placeholder="السن"
                />
              </div>

              {/* نوع الخدمة */}
              <div>
                <label className="block text-gray-700 font-semibold mb-1">نوع الخدمة</label>
                <select
                  value={serviceType}
                  onChange={(e) => {
                    setServiceType(e.target.value);
                    setServicePrice("");
                    setSelectedDoctorName("");
                    setSelectedRoom("");
                  }}
                  className="w-full border border-gray-300 rounded-lg p-2 mb-3"
                >
                  <option value="طوارئ">طوارئ</option>
                  <option value="معمل">معمل</option>
                  <option value="مستلزمات">مستلزمات</option>
                  <optgroup label="كشوفات العيادات">
                    {Array.from(new Set(doctors.map((d) => d.specialty))).map(
                      (spec, idx) => (
                        <option key={idx} value={`كشف ${spec}`}>
                          كشف {spec}
                        </option>
                      ),
                    )}
                  </optgroup>
                </select>

                {/* قائمة الأطباء (تظهر للكشوفات والطوارئ) */}
                {(serviceType.includes("كشف") || serviceType === "طوارئ" || serviceType === "معمل" || serviceType === "مستلزمات") && (
              <div className="mt-2">
                  <label className="block text-gray-700 font-semibold mb-1">الدكتور (اختياري)</label>
                <select
                      onChange={(e) => {
                        const selectedDoc = doctors.find((d) => (d.id && d.id === e.target.value) || d.name === e.target.value);
                        if (selectedDoc) {
                          setServicePrice(selectedDoc.price.toString());
                          setSelectedDoctorName(selectedDoc.name);
                          setSelectedRoom(selectedDoc.room || "");
                        } else {
                          setSelectedDoctorName("");
                          setSelectedRoom("");
                        }
                      }}
                      className="w-full border border-gray-300 rounded-lg p-2 bg-blue-50"
                      defaultValue=""
                    >
                      <option value="">-- بدون دكتور (تحويل خارجي) --</option>
                    {doctors
  .filter((d) => {
    if (serviceType === "طوارئ") return true; // عرض الكل في الطوارئ
    // في الكشوفات، نقارن التخصص بعد إزالة المسافات الزائدة
    return d.specialty.trim() === serviceType.replace("كشف ", "").trim();
  })
  .map((doc, idx) => (
    // استخدمنا idx (رقم الترتيب) بدلاً من id كخطة بديلة
    <option key={doc.id || idx} value={doc.id || doc.name}>
      {doc.name} ({doc.specialty}) - {doc.price} ج.م
    </option>
  ))}
                    </select>
                  </div>
                )}
              </div>

              {/* السعر */}
              <div>
                <label className="block text-gray-700 font-semibold mb-1">السعر (ج.م)</label>
                <input
                  type="number"
                  value={servicePrice}
                  onChange={(e) => setServicePrice(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg p-2"
                  placeholder="أدخل السعر"
                />
              </div>
              {/* وسيلة الدفع */}

              <div>
  <label className="block text-gray-700 font-semibold mb-1">وسيلة الدفع</label>
  <select
  value={paymentMethod}
  onChange={(e) => setPaymentMethod(e.target.value)}
  className="w-full border border-gray-300 rounded-lg p-2 bg-white text-gray-800 focus:ring-2 focus:ring-blue-500"
>
  <option value="كاش">كاش (نقدي)</option>
  <option value="فيزا">فيزا / ماستركارد</option>
  <option value="انستاباي">انستاباي (InstaPay)</option>
  <option value="محفظة إلكترونية">محفظة إلكترونية (فودافون كاش، إلخ)</option>
  <option value="تحويل بنكي">تحويل بنكي</option>
</select>
</div>

              {/* زر الحفظ */}
              <button
                type="submit"
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg transition"
              >
                حفظ وطباعة
              </button>
            </form>
          </div>
        )}

        {/* تبويب سجل المرضى */}
        {activeTab === "list" && (
          <div className="bg-white p-6 rounded-xl shadow-xl w-full max-w-4xl">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-gray-800">سجل المرضى</h2>

              {/* عرض الإيرادات للمدير فقط */}
              {typeof window !== "undefined" &&
                localStorage.getItem("userRole") === "admin" &&
                todayStr && (
                  <div className="bg-green-100 text-green-800 px-4 py-2 rounded-lg font-bold">
                    إيرادات اليوم: {todayRevenue} ج.م
                  </div>
                )}
            </div>

            <input
              type="text"
              placeholder="ابحث بالاسم أو رقم الهاتف..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full border border-gray-300 rounded-lg p-3 mb-4 focus:ring-2 focus:ring-blue-500"
            />

            <div className="overflow-x-auto">
              <table className="w-full text-right border-collapse">
                <thead>
                  <tr className="bg-gray-100 text-gray-700">
                    <th className="p-3 border-b">رقم الدور</th>
                    <th className="p-3 border-b">الاسم</th>
                    <th className="p-3 border-b">الخدمة</th>
                    <th className="p-3 border-b">السعر</th>
                    <th className="p-3 border-b">التاريخ</th>
                    <th className="p-3 border-b">الوقت</th>
                    <th className="p-3 border-b">الإجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPatients.map((p, idx) => (
                    <tr key={idx} className="hover:bg-gray-50">
                      <td className="p-3 border-b font-bold text-blue-600">
                        #{p.queueNumber}
                      </td>
                      <td className="p-3 border-b">{p.name}</td>
                      <td className="p-3 border-b">{p.service}</td>
                      <td className="p-3 border-b">{p.price} ج.م</td>
                      <td className="p-3 border-b text-sm text-gray-600 dark:text-gray-300">{p.date}</td>
                      <td className="p-3 border-b text-sm text-gray-600 dark:text-gray-300">{p.time}</td>
                      <td className="p-3 border-b text-sm">
                        <div className="flex gap-2">
                          <button onClick={() => handleRefund(p)} className="bg-red-100 text-red-600 px-2 py-1 rounded text-xs hover:bg-red-200">استرجاع</button>
                          <button onClick={() => handleSwap(p)} className="bg-blue-100 text-blue-600 px-2 py-1 rounded text-xs hover:bg-blue-200">استبدال</button>
                        </div>
                        </td>
                    </tr>
                  ))}
                  {filteredPatients.length === 0 && (
                    <tr>
                      <td colSpan={7} className="text-center p-6 text-gray-500">
                        لا توجد نتائج مطابقة
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* منطقة الطباعة */}
      <div className="hidden print:block print-area" dir="rtl">
        {printData && (
          <div
            style={{
              border: "1px solid black",
              padding: "10px",
              width: "100%",
              height: "100%",
              boxSizing: "border-box",
            }}
          >
            {clinicLogoUrl && (
              <div
                role="img"
                aria-label={`شعار ${clinicName}`}
                style={{
                  width: "48px",
                  height: "48px",
                  margin: "0 auto 5px",
                  backgroundImage: `url("${clinicLogoUrl}")`,
                  backgroundPosition: "center",
                  backgroundRepeat: "no-repeat",
                  backgroundSize: "contain",
                }}
              />
            )}
            <h2
              style={{
                textAlign: "center",
                margin: "0 0 5px 0",
                fontSize: "16px",
                fontWeight: "bold",
              }}
            >
              {clinicName || "المركز الطبي"}
            </h2>
            {clinicPhone && (
              <p style={{ textAlign: "center", margin: "0 0 5px 0", fontSize: "11px" }}>
                {clinicPhone}
              </p>
            )}
            {clinicAddress && (
              <p style={{ textAlign: "center", margin: "0 0 5px 0", fontSize: "10px" }}>
                {clinicAddress}
              </p>
            )}
            <hr style={{ border: "0.5px solid black", margin: "5px 0" }} />

            <div style={{ fontSize: "12px", lineHeight: "1.6" }}>
              {/* رقم الدور مع اسم القسم */}
              <p style={{ margin: "3px 0" }}>
                <strong>رقم الدور:</strong> {printData.queueNumber}{" "}
              </p>
              <p style={{ margin: "3px 0" }}>
                <strong>الخدمة:</strong> {printData.service}
              </p>
              {/* ({printData.category}) */}
              <p style={{ margin: "3px 0" }}>
                <strong>التاريخ:</strong> {printData.date}
              </p>
              <p style={{ margin: "3px 0" }}>
                <strong>الوقت:</strong> {printData.time}
              </p>
              <hr style={{ border: "0.5px dashed black", margin: "5px 0" }} />
              <p style={{ margin: "3px 0" }}>
                <strong>الاسم:</strong> {printData.name}
              </p>
              <p style={{ margin: "3px 0" }}>
                <strong>السن:</strong> {printData.age}
              </p>
              {printData.doctorName && (
                <>
                  <p style={{ margin: "3px 0" }}>
                    <strong>الدكتور:</strong> {printData.doctorName}
                  </p>
                  {printData.room && (
                    <p style={{ margin: "3px 0" }}>
                      <strong>رقم الغرفة:</strong> {printData.room}
                    </p>
                  )}
                </>
              )}

              <p style={{ margin: "3px 0" }}>
                <strong>السعر:</strong> {printData.price} ج.م
              </p>

              {printData.paymentMethod && (
                <p style={{ margin: "3px 0" }}>
                <strong>طريقة الدفع:</strong> {printData.paymentMethod}
                </p>
                )}
            </div>

            <hr style={{ border: "0.5px solid black", margin: "5px 0" }} />
            <p
              style={{
                textAlign: "center",
                margin: "5px 0 0 0",
                fontSize: "10px",
              }}
            >
              نتمني لكم الشفاء العاجل - يرجى الانتظار في صالة الانتظار
            </p>
          </div>
        )}
      </div>
    </>
  );
}

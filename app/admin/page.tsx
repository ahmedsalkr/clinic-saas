"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  cacheProfile,
  getCurrentProfile,
  isSubscriptionActive,
} from "@/lib/auth";
import { readLocalRecords, saveLocalRecords } from "@/lib/clinic-sync";
import { navigateTo } from "@/lib/navigation";

interface Expense {
  id: string;
  type: string;
  name: string;
  amount: number;
  reason: string;
  date: string;
  time: string;
  addedBy: string;
  paymentMethod?: string;
}

interface Patient {
  id: string;
  name: string;
  phone: string;
  age: string;
  service: string;
  price: string | number;
  queueNumber: number | string;
  date: string;
  time: string;
  addedBy?: string;
  doctorName?: string;
  room?: string;
  category?: string;
  paymentMethod?: string;
}

export default function AdminDashboard() {
  const router = useRouter();
  const [role, setRole] = useState<string | null>(null);
  const [userName, setUserName] = useState("");
  const [expenses, setExpenses] = useState<Expense[]>([]);
  
  const [patientsList, setPatientsList] = useState<Patient[]>([]);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  // حالات إدخال المصروفات
  const [expenseType, setExpenseType] = useState("موظف");
  const [expenseName, setExpenseName] = useState("");
  const [expenseAmount, setExpenseAmount] = useState("");
  const [expenseReason, setExpenseReason] = useState("");
  const [expensePaymentMethod, setExpensePaymentMethod] = useState("كاش");

  // حالات فلترة التاريخ
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  useEffect(() => {
    let active = true;
    const refreshLocalData = () => {
      setPatientsList(readLocalRecords<Patient>("patients"));
      setExpenses(readLocalRecords<Expense>("expenses"));
    };

    window.addEventListener("clinic-data-updated", refreshLocalData);
    getCurrentProfile()
      .then((profile) => {
        if (!active) return;
        if (!profile) {
          navigateTo("/login", () => router.replace("/login"));
          return;
        }
        if (!isSubscriptionActive(profile)) {
          navigateTo("/billing", () => router.replace("/billing"));
          return;
        }

        const todayIso = new Date().toISOString().split("T")[0];
        setStartDate(todayIso);
        setEndDate(todayIso);
        cacheProfile(profile);
        setRole(profile.role);
        setUserName(profile.fullName);
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

  const handleAddExpense = (e: React.FormEvent) => {
    e.preventDefault();
    if (!expenseName || !expenseAmount) {
      alert("يرجى إدخال اسم الشخص والمبلغ");
      return;
    }

    const now = new Date();
    const newExpense: Expense = {
      id: crypto.randomUUID(),
      type: expenseType,
      name: expenseName,
      amount: Number(expenseAmount),
      reason: expenseReason,
      date: now.toISOString().split("T")[0], // سيحفظ التاريخ بصيغة 2026-11-24
      time: now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
      addedBy: userName,
      paymentMethod: expensePaymentMethod,
    };

    const updatedExpenses = [newExpense, ...expenses];
    setExpenses(updatedExpenses);
    saveLocalRecords("expenses", updatedExpenses);

    setExpenseName("");
    setExpenseAmount("");
    setExpenseReason("");
    setExpensePaymentMethod("كاش");
    alert("تم تسجيل المصروف بنجاح");
  };

    
  // --- حسابات الإيرادات والمصروفات ---
  
  // فلترة المرضى حسب الفترة المحددة
      const filteredPatients = patientsList.filter((p) => {
    if (!startDate || !endDate) return false;
    // إذا كان التاريخ مخزناً بالصيغة القديمة (العربية)
    let pDate = p.date;
    if (pDate.includes("/")) {
        const parts = pDate.replace(/[٠-٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d).toString()).split("/");
        if (parts.length === 3) pDate = `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
    }
    return pDate >= startDate && pDate <= endDate;
  });

  // تجميع إيرادات الأطباء والخدمات
  const doctorRevenues: { [key: string]: number } = {};
  
  const myPatientsForRevenue = role === "admin" 
    ? filteredPatients 
    : filteredPatients.filter((p) => p.addedBy === userName);

  myPatientsForRevenue.forEach((p) => {
    const key = p.doctorName ? p.doctorName : p.service; 
    if (key && Number(p.price) > 0) {
      if (!doctorRevenues[key]) {
        doctorRevenues[key] = 0;
      }
      doctorRevenues[key] += Number(p.price);
    }
  });
  
  // إيرادات الموظف الحالي
  const myRevenue = filteredPatients
    .filter((p) => p.addedBy === userName)
    .reduce((sum, p) => sum + Number(p.price), 0);

  // إجمالي إيرادات المركز (للمدير)
  const totalRevenue = filteredPatients.reduce((sum, p) => sum + Number(p.price), 0);

  // فلترة المصروفات حسب الفترة المحددة
    const filteredExpenses = expenses.filter((e) => {
    if (!startDate || !endDate) return false;
    let eDate = e.date;
    if (eDate.includes("/")) {
        const parts = eDate.replace(/[٠-٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d).toString()).split("/");
        if (parts.length === 3) eDate = `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
    }
    return eDate >= startDate && eDate <= endDate;
  });

  // مصروفات الموظف الحالي
  const myExpenses = filteredExpenses
    .filter((e) => e.addedBy === userName)
    .reduce((sum, e) => sum + e.amount, 0);

  // إجمالي مصروفات المركز (للمدير)
  const totalExpenses = filteredExpenses.reduce((sum, e) => sum + e.amount, 0);

  // تحديد الأرقام بناءً على الصلاحية
  const displayRevenue = role === "admin" ? totalRevenue : myRevenue;
  const displayExpenses = role === "admin" ? totalExpenses : myExpenses;
  const displayNetProfit = displayRevenue - displayExpenses;

  const visibleExpenses = role === "admin"
    ? filteredExpenses
    : filteredExpenses.filter((e) => e.addedBy === userName);

  if (!role) return null;

  return (
    <div dir="rtl" className="min-h-screen bg-gray-100 dark:bg-gray-900 p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        
        {/* الشريط العلوي */}
        <div className="flex justify-between items-center bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm">
          <h1 className="text-2xl font-bold text-gray-800 dark:text-white">
            {role === "admin" ? "لوحة تحكم المدير (الجرد)" : "تسجيل المصروفات"}
          </h1>
          <button onClick={() => navigateTo("/", () => router.push("/"))} className="text-blue-600 dark:text-blue-400 hover:underline font-semibold">
            العودة للرئيسية
          </button>
        </div>

        {/* فلتر البحث بالتاريخ */}
        <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm flex flex-wrap gap-4 items-center print:hidden">
          <div>
            <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">من تاريخ</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="border p-2 rounded-lg dark:bg-gray-700 dark:text-white dark:border-gray-600" />
          </div>
          <div>
            <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">إلى تاريخ</label>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="border p-2 rounded-lg dark:bg-gray-700 dark:text-white dark:border-gray-600" />
          </div>
        </div>

        {/* جدول إيرادات الأطباء والخدمات */}
        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-md mb-6">
          <h2 className="text-xl font-bold mb-4 text-blue-600 dark:text-blue-400">
            {role === "admin" ? "إيرادات المركز (تفصيل حسب الدكتور/الخدمة)" : "إيراداتك (تفصيل حسب الدكتور/الخدمة)"}
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-right">
              <thead>
                <tr className="bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-white">
                  <th className="p-3 border-b dark:border-gray-600">الطبيب / الخدمة</th>
                  <th className="p-3 border-b dark:border-gray-600">إجمالي المبلغ المحصل</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(doctorRevenues).map(([name, amount], idx) => (
                  <React.Fragment key={idx}>
                    <tr 
                      onClick={() => setExpandedRow(expandedRow === name ? null : name)}
                      className="hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer transition-colors border-b dark:border-gray-600"
                    >
                      <td className="p-3 font-bold dark:text-gray-200 flex items-center justify-between">
                        <span>{name}</span>
                        <span className="text-xs text-blue-500">{expandedRow === name ? "▲ إخفاء" : "▼ تفاصيل"}</span>
                      </td>
                      <td className="p-3 text-green-600 dark:text-green-400 font-bold">
                        {amount} ج.م
                      </td>
                    </tr>

                    {expandedRow === name && (
                      <tr className="bg-blue-50 dark:bg-gray-900/50">
                        <td colSpan={2} className="p-4">
                          <p className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">تفاصيل المرضى:</p>
                          <ul className="space-y-1 text-sm">
                            {myPatientsForRevenue
                              .filter(p => (p.doctorName === name || (!p.doctorName && p.service === name)) && Number(p.price) > 0)
                              .map((p, i) => (
                                <li key={i} className="flex justify-between border-b border-gray-200 dark:border-gray-700 pb-1">
                                  <span className="dark:text-gray-300">{p.name} (دور #{p.queueNumber}) - {p.service}</span>
                                  <span className="text-green-600 dark:text-green-400">{p.price} ج.م</span>
                                </li>
                              ))}
                          </ul>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
                {Object.keys(doctorRevenues).length === 0 && (
                  <tr>
                    <td colSpan={2} className="text-center p-4 text-gray-500">
                      لا توجد إيرادات مسجلة في هذه الفترة
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>


                {/* جدول إيرادات المركز حسب وسيلة الدفع */}
        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-md mb-6">
          <h2 className="text-xl font-bold mb-4 text-orange-600 dark:text-orange-400">
            {role === "admin" ? "تحصيل المركز (حسب وسيلة الدفع)" : "تحصيلك (حسب وسيلة الدفع)"}
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-right">
              <thead>
                <tr className="bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-white">
                  <th className="p-3 border-b dark:border-gray-600">وسيلة الدفع</th>
                  <th className="p-3 border-b dark:border-gray-600">إجمالي المبلغ</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(
                  myPatientsForRevenue.reduce((acc, p) => {
          const method = p.paymentMethod || "كاش"; // افتراضي كاش للبيانات القديمة
                    acc[method] = (acc[method] || 0) + Number(p.price);
                    return acc;
                  }, {} as { [key: string]: number })
                ).map(([method, amount], idx) => (
                  <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                    <td className="p-3 border-b dark:border-gray-600 font-bold dark:text-gray-200">{method}</td>
                    <td className="p-3 border-b dark:border-gray-600 text-blue-600 dark:text-blue-400 font-bold">{amount} ج.م</td>
                  </tr>
                ))}
                {myPatientsForRevenue.length === 0 && (
                  <tr>
                    <td colSpan={2} className="text-center p-4 text-gray-500">لا توجد تحصيلات اليوم</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* كروت الإحصائيات */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-green-100 dark:bg-green-900/30 p-6 rounded-xl shadow-sm text-center">
            <p className="text-green-800 dark:text-green-400 font-semibold mb-1">
              {role === "admin" ? "إجمالي الإيرادات" : "إيراداتك"}
            </p>
            <p className="text-3xl font-bold text-green-900 dark:text-green-300">
              {displayRevenue} ج.م
            </p>
          </div>
          <div className="bg-red-100 dark:bg-red-900/30 p-6 rounded-xl shadow-sm text-center">
            <p className="text-red-800 dark:text-red-400 font-semibold mb-1">
              {role === "admin" ? "إجمالي المصروفات" : "مصروفاتك"}
            </p>
            <p className="text-3xl font-bold text-red-900 dark:text-red-300">
              {displayExpenses} ج.م
            </p>
          </div>
          <div className="bg-blue-100 dark:bg-blue-900/30 p-6 rounded-xl shadow-sm text-center">
            <p className="text-blue-800 dark:text-blue-400 font-semibold mb-1">
              {role === "admin" ? "صافي الربح" : "صافي ربحك"}
            </p>
            <p className={`text-3xl font-bold ${displayNetProfit >= 0 ? "text-blue-900 dark:text-blue-300" : "text-red-600"}`}>
              {displayNetProfit} ج.م
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* نموذج إضافة مصروف */}
          <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-md">
            <h2 className="text-xl font-bold mb-4 text-red-600 dark:text-red-400">تسجيل مصروف جديد</h2>
            <form onSubmit={handleAddExpense} className="space-y-4">
              <div>
                <label className="block text-gray-700 dark:text-gray-300 font-semibold mb-1">النوع</label>
                <select value={expenseType} onChange={(e) => setExpenseType(e.target.value)} className="w-full border dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg p-2">
                  <option value="موظف">موظف</option>
                  <option value="دكتور">دكتور</option>
                  <option value="مستلزمات">مستلزمات عيادة</option>
                  <option value="نثريات">نثريات (شاي، مواصلات)</option>
                </select>
              </div>
              <div>
                <label className="block text-gray-700 dark:text-gray-300 font-semibold mb-1">اسم الشخص / البيان</label>
                <input type="text" value={expenseName} onChange={(e) => setExpenseName(e.target.value)} className="w-full border dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg p-2" placeholder="مثال: د. أحمد، أو مساحيق تنظيف" />
              </div>
              <div>
                <label className="block text-gray-700 dark:text-gray-300 font-semibold mb-1">المبلغ (ج.م)</label>
                <input type="number" value={expenseAmount} onChange={(e) => setExpenseAmount(e.target.value)} className="w-full border dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg p-2" placeholder="أدخل المبلغ" />
              </div>

                        <div>
            <label className="block text-gray-700 dark:text-gray-300 font-semibold mb-1">طريقة الدفع</label>
              <select value={expensePaymentMethod} onChange={(e) => setExpensePaymentMethod(e.target.value)} className="w-full border dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg p-2">
              <option value="كاش">كاش</option>
              <option value="فيزا">فيزا</option>
              <option value="انستاباي">انستاباي</option>
              <option value="محفظة إلكترونية">محفظة إلكترونية</option>
            </select>
          </div>

              <div>
                <label className="block text-gray-700 dark:text-gray-300 font-semibold mb-1">السبب / ملاحظات</label>
                <input type="text" value={expenseReason} onChange={(e) => setExpenseReason(e.target.value)} className="w-full border dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg p-2" placeholder="اختياري" />
              </div>
              <button type="submit" className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-2 rounded-lg">إضافة المصروف</button>
            </form>
          </div>

          {/* سجل المصروفات */}
          <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-md">
            <h2 className="text-xl font-bold mb-4 text-gray-800 dark:text-white">
              {role === "admin" ? "سجل المصروفات (لجميع الموظفين)" : "المصروفات التي سجلتها"}
            </h2>
            <div className="overflow-y-auto max-h-[400px]">
              <table className="w-full text-right">
                <thead>
                  <tr className="bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-white">
                    <th className="p-2 border-b dark:border-gray-600">النوع</th>
                    <th className="p-2 border-b dark:border-gray-600">الاسم / البيان</th>
                    <th className="p-2 border-b dark:border-gray-600">المبلغ</th>
                    {role === "admin" && <th className="p-2 border-b dark:border-gray-600">بواسطة</th>}
                  </tr>
                </thead>
                <tbody>
                  {visibleExpenses.map((exp) => (
                    <tr key={exp.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                      <td className="p-2 border-b dark:border-gray-600 text-sm dark:text-gray-300">{exp.type}</td>
                      <td className="p-2 border-b dark:border-gray-600 dark:text-white">{exp.name}</td>
                      <td className="p-2 border-b dark:border-gray-600 text-red-600 dark:text-red-400 font-bold">{exp.amount} ج.م</td>
                      {role === "admin" && (
                        <td className="p-2 border-b dark:border-gray-600 text-xs text-gray-500 dark:text-gray-400">{exp.addedBy}</td>
                      )}
                    </tr>
                  ))}
                  {visibleExpenses.length === 0 && (
                    <tr>
                      <td colSpan={role === "admin" ? 4 : 3} className="text-center p-4 text-gray-500 dark:text-gray-400">لا توجد مصروفات مسجلة</td>
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
import { Resend } from "resend";

let resendClient: Resend | null = null;

function getResendClient() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("إعدادات البريد الإلكتروني غير مكتملة.");
  }

  if (!resendClient) {
    resendClient = new Resend(apiKey);
  }
  return resendClient;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character];
  });
}

export async function sendClinicCodeEmail(
  to: string,
  clinicName: string,
  clinicCode: string,
) {
  const loginUrl = `${(
    process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"
  ).replace(/\/+$/, "")}/login`;
  const safeLoginUrl = escapeHtml(loginUrl);
  const safeClinicName = escapeHtml(clinicName);
  const safeClinicCode = escapeHtml(clinicCode);

  const { error } = await getResendClient().emails.send({
    from: "onboarding@resend.dev",
    to,
    subject: `رمز الدخول إلى ${clinicName}`,
    html: `
      <!doctype html>
      <html lang="ar" dir="rtl">
        <body style="margin:0;background:#f3f4f6;padding:32px 16px;font-family:Arial,Tahoma,sans-serif;color:#1f2937;direction:rtl;text-align:right">
          <main style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:16px;padding:32px">
            <h1 style="margin:0 0 16px;color:#1d4ed8;font-size:24px">رمز المركز الطبي</h1>
            <p style="font-size:16px;line-height:1.8">مرحبًا،</p>
            <p style="font-size:16px;line-height:1.8">تم إنشاء مساحة <strong>${safeClinicName}</strong> بنجاح. استخدم رمز المركز التالي عند تسجيل الدخول:</p>
            <p dir="ltr" style="margin:24px 0;padding:16px;border-radius:10px;background:#eff6ff;text-align:center;color:#1d4ed8;font-size:28px;font-weight:bold;letter-spacing:4px">${safeClinicCode}</p>
            <p style="margin:24px 0">
              <a href="${safeLoginUrl}" style="display:inline-block;border-radius:8px;background:#1d4ed8;padding:12px 20px;color:#ffffff;text-decoration:none;font-weight:bold">تسجيل الدخول</a>
            </p>
            <p style="font-size:13px;line-height:1.8;color:#6b7280">إذا لم تطلب إنشاء هذا المركز، يمكنك تجاهل هذه الرسالة.</p>
          </main>
        </body>
      </html>
    `,
  });

  if (error) {
    throw new Error(`تعذر إرسال البريد الإلكتروني: ${error.message}`);
  }
}

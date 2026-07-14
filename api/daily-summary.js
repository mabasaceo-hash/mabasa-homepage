// 하루 1회 요약 메일.
// 최근 24시간 전화번호 클릭(call_clicks) + 상담 신청(consultation_requests) 건수를
// 이메일로 발송한다. Vercel Cron이 호출하며(vercel.json의 crons), CRON_SECRET으로 보호한다.
// Resend / Supabase 환경변수는 상담 폼(api/consultation.js)과 동일하게 재사용한다.

function json(res, status, body) {
  res.setHeader("Cache-Control", "no-store");
  return res.status(status).json(body);
}

async function countRows(supabaseUrl, key, table, sinceIso) {
  const filter = sinceIso ? `&created_at=gte.${encodeURIComponent(sinceIso)}` : "";
  const response = await fetch(`${supabaseUrl}/rest/v1/${table}?select=id${filter}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!response.ok) return null;
  const rows = await response.json();
  return Array.isArray(rows) ? rows.length : null;
}

export default async function handler(req, res) {
  // Vercel Cron 보호: CRON_SECRET이 설정돼 있으면 Authorization 헤더를 검증한다.
  if (process.env.CRON_SECRET) {
    const auth = req.headers["authorization"] || "";
    if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
      return json(res, 401, { ok: false, message: "Unauthorized" });
    }
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const callTable = process.env.SUPABASE_CALL_CLICKS_TABLE || "call_clicks";
  const consultTable = process.env.SUPABASE_CONSULTATION_TABLE || "consultation_requests";

  if (!supabaseUrl || !serviceRoleKey) {
    return json(res, 500, { ok: false, message: "Server configuration error" });
  }

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const [calls24, consults24, callsTotal, consultsTotal] = await Promise.all([
    countRows(supabaseUrl, serviceRoleKey, callTable, since),
    countRows(supabaseUrl, serviceRoleKey, consultTable, since),
    countRows(supabaseUrl, serviceRoleKey, callTable, null),
    countRows(supabaseUrl, serviceRoleKey, consultTable, null),
  ]);

  const today = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  const summary = {
    date: today,
    callClicks24h: calls24,
    consultations24h: consults24,
    callClicksTotal: callsTotal,
    consultationsTotal: consultsTotal,
  };

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.CONSULTATION_EMAIL_FROM;
  const to = (process.env.CONSULTATION_EMAIL_TO || "")
    .split(",")
    .map((email) => email.trim())
    .filter(Boolean);

  // 이메일 설정이 없으면 카운트만 반환(크론은 성공 처리)
  if (!apiKey || !from || to.length === 0) {
    return json(res, 200, { ok: true, emailed: false, summary });
  }

  const n = (v) => (v === null || v === undefined ? "-" : String(v));
  const text = [
    `[마바사] 홈페이지 일일 요약 (${today} 기준)`,
    "",
    "■ 최근 24시간",
    `- 전화번호 클릭: ${n(calls24)}건`,
    `- 상담 신청: ${n(consults24)}건`,
    "",
    "■ 누적 총계",
    `- 전화번호 클릭: ${n(callsTotal)}건`,
    `- 상담 신청: ${n(consultsTotal)}건`,
  ].join("\n");

  const html = `
    <div style="font-family:Arial,'Apple SD Gothic Neo','Malgun Gothic',sans-serif;color:#111827;line-height:1.6;">
      <h2 style="margin:0 0 4px;font-size:18px;">홈페이지 일일 요약</h2>
      <p style="margin:0 0 16px;color:#6b7280;">${today} 기준</p>
      <table style="border-collapse:collapse;border:1px solid #e5e7eb;min-width:320px;">
        <tr><th colspan="2" style="text-align:left;padding:8px 12px;background:#f5f7fb;border-bottom:1px solid #e5e7eb;">최근 24시간</th></tr>
        <tr><td style="padding:8px 12px;border-bottom:1px solid #eee;">전화번호 클릭</td><td style="padding:8px 12px;border-bottom:1px solid #eee;font-weight:700;">${n(calls24)}건</td></tr>
        <tr><td style="padding:8px 12px;border-bottom:1px solid #eee;">상담 신청</td><td style="padding:8px 12px;border-bottom:1px solid #eee;font-weight:700;">${n(consults24)}건</td></tr>
        <tr><th colspan="2" style="text-align:left;padding:8px 12px;background:#f5f7fb;border-bottom:1px solid #e5e7eb;">누적 총계</th></tr>
        <tr><td style="padding:8px 12px;border-bottom:1px solid #eee;">전화번호 클릭</td><td style="padding:8px 12px;border-bottom:1px solid #eee;">${n(callsTotal)}건</td></tr>
        <tr><td style="padding:8px 12px;">상담 신청</td><td style="padding:8px 12px;">${n(consultsTotal)}건</td></tr>
      </table>
    </div>`;

  const emailResponse = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to,
      subject: `[마바사] 일일 요약 ${today} · 전화클릭 ${n(calls24)} / 상담 ${n(consults24)}`,
      text,
      html,
    }),
  });

  if (!emailResponse.ok) {
    const detail = await emailResponse.text().catch(() => "");
    console.error("daily_summary_email_failed", {
      status: emailResponse.status,
      detail: detail.slice(0, 300),
    });
    return json(res, 502, { ok: false, message: "Email send failed", summary });
  }

  return json(res, 200, { ok: true, emailed: true, summary });
}

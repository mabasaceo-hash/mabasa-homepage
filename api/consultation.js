import { createHmac } from "node:crypto";

const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 5;
const MAX_BODY_BYTES = 16 * 1024;
const MAX_LENGTHS = {
  name: 40,
  phone: 30,
  businessName: 80,
  businessNumber: 20,
  email: 120,
  message: 1000,
};
const SELECT_OPTIONS = {
  industry: new Set(["retail", "manufacturing", "online", "service", "food", "it", "other"]),
  annualRevenue: new Set(["under-30m", "30m-100m", "100m-300m", "300m-1b", "over-1b"]),
  neededFund: new Set(["under-50m", "50m-100m", "100m-300m", "over-300m"]),
  existingLoan: new Set(["none", "under-30m", "30m-100m", "over-100m"]),
  overdueTax: new Set(["no", "yes", "unknown"]),
  interest: new Set([
    "policy-funding",
    "consulting",
    "additional-funding",
    "uiux-mvp",
    "operation-marketing",
  ]),
};
const OPTION_LABELS = {
  retail: "도소매업",
  manufacturing: "제조업",
  online: "통신판매업",
  service: "서비스업",
  food: "음식점업",
  it: "IT·개발업",
  other: "기타",
  "under-30m": "3천만원 미만",
  "30m-100m": "3천만원 ~ 1억원",
  "100m-300m": "1억원 ~ 3억원",
  "300m-1b": "3억원 ~ 10억원",
  "over-1b": "10억원 이상",
  "under-50m": "5천만원 이하",
  "50m-100m": "5천만원 ~ 1억원",
  "over-300m": "3억원 이상",
  none: "없음",
  "over-100m": "1억원 이상",
  no: "없음",
  yes: "있음",
  unknown: "잘 모르겠음",
  "policy-funding": "정책자금 신청",
  consulting: "담당 컨설턴트 1:1 상담",
  "additional-funding": "승인 후 추가 자금",
  "uiux-mvp": "UI/UX · MVP 제작",
  "operation-marketing": "운영 개선 · 마케팅 실행",
};
const buckets = new Map();

function json(response, status, body) {
  response.setHeader("Cache-Control", "no-store");
  return response.status(status).json(body);
}

function getHeader(request, name) {
  const value = request.headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

function getClientIp(request) {
  const forwardedFor = getHeader(request, "x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0].trim();
  return getHeader(request, "x-real-ip") || request.socket?.remoteAddress || "unknown";
}

function getAllowedOrigins(request) {
  const host = getHeader(request, "host");
  const forwardedProto = getHeader(request, "x-forwarded-proto") || "https";
  const configured = (process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  const origins = new Set(configured);

  if (host) origins.add(`${forwardedProto}://${host}`);
  if (process.env.VERCEL_URL) origins.add(`https://${process.env.VERCEL_URL}`);

  return origins;
}

function isAllowedOrigin(request) {
  const origin = getHeader(request, "origin");
  if (!origin) return true;
  const host = getHeader(request, "host");

  try {
    if (host && new URL(origin).host === host) return true;
  } catch (error) {
    return false;
  }

  return getAllowedOrigins(request).has(origin);
}

function setCorsHeaders(request, response) {
  const origin = getHeader(request, "origin");
  if (origin && isAllowedOrigin(request)) {
    response.setHeader("Access-Control-Allow-Origin", origin);
  }

  response.setHeader("Vary", "Origin");
  response.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function isMemoryRateLimited(request) {
  const key = getClientIp(request);
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || now > bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }

  bucket.count += 1;
  return bucket.count > RATE_LIMIT_MAX_REQUESTS;
}

function getIpHash(request, secret) {
  return createHmac("sha256", secret).update(getClientIp(request)).digest("hex");
}

async function isSupabaseRateLimited(request, supabaseUrl, serviceRoleKey) {
  const tableName = process.env.SUPABASE_RATE_LIMIT_TABLE || "consultation_rate_limits";
  const since = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString();
  const ipHash = getIpHash(request, process.env.RATE_LIMIT_SECRET || serviceRoleKey);
  const params = new URLSearchParams({
    select: "id",
    ip_hash: `eq.${ipHash}`,
    created_at: `gte.${since}`,
    limit: String(RATE_LIMIT_MAX_REQUESTS),
  });

  const rateLimitResponse = await fetch(`${supabaseUrl}/rest/v1/${tableName}?${params}`, {
    method: "GET",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
    },
  });

  if (!rateLimitResponse.ok) {
    console.error("rate_limit_check_failed", {
      status: rateLimitResponse.status,
      statusText: rateLimitResponse.statusText,
    });
    return false;
  }

  const recentRequests = await rateLimitResponse.json();
  return recentRequests.length >= RATE_LIMIT_MAX_REQUESTS;
}

async function recordRateLimitHit(request, supabaseUrl, serviceRoleKey) {
  const tableName = process.env.SUPABASE_RATE_LIMIT_TABLE || "consultation_rate_limits";
  const ipHash = getIpHash(request, process.env.RATE_LIMIT_SECRET || serviceRoleKey);

  const recordResponse = await fetch(`${supabaseUrl}/rest/v1/${tableName}`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({
      ip_hash: ipHash,
      source: "mabasa-landing",
    }),
  });

  if (!recordResponse.ok) {
    console.error("rate_limit_record_failed", {
      status: recordResponse.status,
      statusText: recordResponse.statusText,
    });
  }
}

function cleanText(value, maxLength) {
  if (typeof value !== "string") return "";
  return value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/[<>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function labelValue(value) {
  if (!value) return "-";
  return OPTION_LABELS[value] || value;
}

function parseBody(request) {
  if (!request.body) return {};
  if (typeof request.body === "string") return JSON.parse(request.body);
  return request.body;
}

function validatePayload(rawPayload) {
  const payload = {
    name: cleanText(rawPayload.name, MAX_LENGTHS.name),
    phone: cleanText(rawPayload.phone, MAX_LENGTHS.phone),
    businessName: cleanText(rawPayload.businessName, MAX_LENGTHS.businessName),
    businessNumber: cleanText(rawPayload.businessNumber, MAX_LENGTHS.businessNumber),
    email: cleanText(rawPayload.email, MAX_LENGTHS.email),
    industry: cleanText(rawPayload.industry, 40),
    annualRevenue: cleanText(rawPayload.annualRevenue, 40),
    neededFund: cleanText(rawPayload.neededFund, 40),
    existingLoan: cleanText(rawPayload.existingLoan, 40),
    overdueTax: cleanText(rawPayload.overdueTax, 40),
    interest: cleanText(rawPayload.interest, 60),
    message: cleanText(rawPayload.message, MAX_LENGTHS.message),
    privacy: rawPayload.privacy,
    website: cleanText(rawPayload.website, 200),
    formStartedAt: Number(rawPayload.formStartedAt || 0),
  };

  const requiredFields = [
    "name",
    "phone",
    "businessName",
    "industry",
    "annualRevenue",
    "neededFund",
    "existingLoan",
    "overdueTax",
    "interest",
  ];

  if (requiredFields.some((field) => !payload[field])) {
    return { ok: false, status: 400, message: "Required fields are missing" };
  }

  if (payload.website) {
    return { ok: false, status: 200, message: "ok" };
  }

  if (!payload.privacy || !(payload.privacy === "on" || payload.privacy === true)) {
    return { ok: false, status: 400, message: "Privacy consent is required" };
  }

  if (!/^[0-9+\-\s().]{8,30}$/.test(payload.phone)) {
    return { ok: false, status: 400, message: "Invalid phone number" };
  }

  if (payload.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) {
    return { ok: false, status: 400, message: "Invalid email address" };
  }

  for (const [field, allowedValues] of Object.entries(SELECT_OPTIONS)) {
    if (!allowedValues.has(payload[field])) {
      return { ok: false, status: 400, message: "Invalid option selected" };
    }
  }

  const now = Date.now();
  if (!payload.formStartedAt || now - payload.formStartedAt < 2000 || now - payload.formStartedAt > 86400000) {
    return { ok: false, status: 400, message: "Please submit the form again" };
  }

  return { ok: true, payload };
}

function getNotificationRecipients() {
  return (process.env.CONSULTATION_EMAIL_TO || "")
    .split(",")
    .map((email) => email.trim())
    .filter(Boolean);
}

function buildConsultationEmail(payload) {
  const crmUrl =
    process.env.CRM_HOMEPAGE_CONSULTATIONS_URL || "";
  const submittedAt = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());
  const rows = [
    ["접수일", submittedAt],
    ["성함", payload.name],
    ["연락처", payload.phone],
    ["사업자명", payload.business_name],
    ["사업자등록번호", payload.business_number],
    ["이메일", payload.email || "-"],
    ["업종", labelValue(payload.industry)],
    ["연 매출", labelValue(payload.annual_revenue)],
    ["필요 자금", labelValue(payload.needed_fund)],
    ["기존 대출", labelValue(payload.existing_loan)],
    ["연체·국세체납", labelValue(payload.overdue_tax)],
    ["관심 분야", labelValue(payload.interest)],
    ["문의 내용", payload.message || "-"],
  ];
  const plainText = [
    "[마바사] 신규 홈페이지 상담이 접수되었습니다.",
    "",
    ...rows.map(([label, value]) => `${label}: ${value}`),
    "",
    `CRM에서 확인: ${crmUrl}`,
  ].join("\n");
  const htmlRows = rows
    .map(
      ([label, value]) => `
        <tr>
          <th style="width:140px;padding:10px 12px;text-align:left;background:#f5f7fb;border-bottom:1px solid #e5e7eb;color:#334155;">${escapeHtml(label)}</th>
          <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;color:#111827;white-space:pre-wrap;">${escapeHtml(value)}</td>
        </tr>`
    )
    .join("");
  const html = `
    <div style="font-family:Arial,'Apple SD Gothic Neo','Malgun Gothic',sans-serif;color:#111827;line-height:1.5;">
      <h2 style="margin:0 0 12px;font-size:20px;">신규 홈페이지 상담 접수</h2>
      <p style="margin:0 0 18px;color:#4b5563;">홈페이지 상담 폼으로 새 문의가 들어왔습니다.</p>
      <table style="border-collapse:collapse;width:100%;max-width:720px;border:1px solid #e5e7eb;">${htmlRows}</table>
      <p style="margin:20px 0 0;">
        <a href="${escapeHtml(crmUrl)}" style="display:inline-block;padding:10px 14px;background:#0066ff;color:#ffffff;text-decoration:none;border-radius:6px;">CRM에서 확인하기</a>
      </p>
    </div>`;

  return { plainText, html };
}

async function sendConsultationEmailNotification(payload) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.CONSULTATION_EMAIL_FROM;
  const to = getNotificationRecipients();

  if (!apiKey || !from || to.length === 0) return;

  const { plainText, html } = buildConsultationEmail(payload);
  const emailResponse = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to,
      subject: `[마바사] 신규 홈페이지 상담 - ${payload.name}`,
      text: plainText,
      html,
      reply_to: payload.email || undefined,
    }),
  });

  if (!emailResponse.ok) {
    const detail = await emailResponse.text().catch(() => "");
    console.error("consultation_email_failed", {
      status: emailResponse.status,
      statusText: emailResponse.statusText,
      detail: detail.slice(0, 300),
    });
  }
}

async function forwardToGoogleSheets(payload) {
  const webhookUrl = process.env.GOOGLE_SHEETS_WEBHOOK_URL;
  const webhookSecret = process.env.GOOGLE_SHEETS_WEBHOOK_SECRET;

  if (!webhookUrl) return;

  if (!webhookSecret) {
    console.error("google_sheets_webhook_secret_missing");
    return;
  }

  const sheetsResponse = await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      secret: webhookSecret,
      submitted_at: new Date().toISOString(),
      data: payload,
    }),
  });

  if (!sheetsResponse.ok) {
    console.error("google_sheets_forward_failed", {
      status: sheetsResponse.status,
      statusText: sheetsResponse.statusText,
    });
  }
}

export default async function handler(request, response) {
  setCorsHeaders(request, response);

  if (request.method === "OPTIONS") {
    return response.status(204).end();
  }

  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return json(response, 405, { ok: false, message: "Method not allowed" });
  }

  if (!isAllowedOrigin(request)) {
    return json(response, 403, { ok: false, message: "Forbidden origin" });
  }

  const contentType = getHeader(request, "content-type") || "";
  if (!contentType.includes("application/json")) {
    return json(response, 415, { ok: false, message: "Unsupported media type" });
  }

  const contentLength = Number(getHeader(request, "content-length") || 0);
  if (contentLength > MAX_BODY_BYTES) {
    return json(response, 413, { ok: false, message: "Request body is too large" });
  }

  if (isMemoryRateLimited(request)) {
    response.setHeader("Retry-After", String(Math.ceil(RATE_LIMIT_WINDOW_MS / 1000)));
    return json(response, 429, { ok: false, message: "Too many requests" });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const tableName = process.env.SUPABASE_CONSULTATION_TABLE || "consultation_requests";

  if (!supabaseUrl || !serviceRoleKey) {
    return json(response, 500, {
      ok: false,
      message: "Server configuration error",
    });
  }

  if (await isSupabaseRateLimited(request, supabaseUrl, serviceRoleKey)) {
    response.setHeader("Retry-After", String(Math.ceil(RATE_LIMIT_WINDOW_MS / 1000)));
    return json(response, 429, { ok: false, message: "Too many requests" });
  }

  let parsedBody;
  try {
    parsedBody = parseBody(request);
  } catch (error) {
    return json(response, 400, { ok: false, message: "Invalid JSON body" });
  }

  const validation = validatePayload(parsedBody);
  if (!validation.ok) {
    return json(response, validation.status, {
      ok: validation.status === 200,
      message: validation.message,
    });
  }

  const {
    name,
    phone,
    businessName,
    businessNumber,
    email,
    industry,
    annualRevenue,
    neededFund,
    existingLoan,
    overdueTax,
    interest,
    message,
  } = validation.payload;

  const payload = {
    name,
    phone,
    business_name: businessName,
    business_number: businessNumber,
    email,
    industry,
    annual_revenue: annualRevenue,
    needed_fund: neededFund,
    existing_loan: existingLoan,
    overdue_tax: overdueTax,
    interest,
    message,
    privacy_agreed: true,
    source: "mabasa-landing",
    user_agent: request.headers["user-agent"] || null,
  };

  const supabaseResponse = await fetch(`${supabaseUrl}/rest/v1/${tableName}`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify(payload),
  });

  if (!supabaseResponse.ok) {
    console.error("supabase_insert_failed", {
      status: supabaseResponse.status,
      statusText: supabaseResponse.statusText,
    });
    return json(response, 502, {
      ok: false,
      message: "Failed to save consultation request",
    });
  }

  await recordRateLimitHit(request, supabaseUrl, serviceRoleKey);

  try {
    await sendConsultationEmailNotification(payload);
  } catch (error) {
    console.error("consultation_email_error", {
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }

  try {
    await forwardToGoogleSheets(payload);
  } catch (error) {
    console.error("google_sheets_forward_error", {
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }

  return json(response, 200, { ok: true });
}

// 홈페이지 전화번호 클릭 추적 엔드포인트.
// 전화번호(tel: 링크)를 누르면 클릭 1건을 call_clicks 테이블에 기록한다.
// 상담 폼(api/consultation.js)과 같은 Supabase 환경변수를 그대로 사용한다.

function json(res, status, body) {
  res.setHeader("Cache-Control", "no-store");
  return res.status(status).json(body);
}

function getHeader(req, name) {
  const value = req.headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return json(res, 405, { ok: false, message: "Method not allowed" });
  }

  // 같은 출처에서 온 요청만 허용 (간단한 남용 방지)
  const origin = getHeader(req, "origin");
  const host = getHeader(req, "host");
  if (origin) {
    try {
      if (new URL(origin).host !== host) {
        return json(res, 403, { ok: false, message: "Forbidden origin" });
      }
    } catch (error) {
      return json(res, 403, { ok: false, message: "Forbidden origin" });
    }
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const tableName = process.env.SUPABASE_CALL_CLICKS_TABLE || "call_clicks";

  if (!supabaseUrl || !serviceRoleKey) {
    return json(res, 500, { ok: false, message: "Server configuration error" });
  }

  let source = "unknown";
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    if (typeof body.source === "string" && body.source.trim()) {
      source = body.source.trim().slice(0, 60);
    }
  } catch (error) {
    // 본문이 없거나 깨져도 클릭 자체는 기록한다
  }

  const insertResponse = await fetch(`${supabaseUrl}/rest/v1/${tableName}`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({
      source,
      user_agent: getHeader(req, "user-agent") || null,
    }),
  });

  if (!insertResponse.ok) {
    console.error("call_click_insert_failed", {
      status: insertResponse.status,
      statusText: insertResponse.statusText,
    });
    return json(res, 502, { ok: false, message: "Failed to record click" });
  }

  return json(res, 200, { ok: true });
}

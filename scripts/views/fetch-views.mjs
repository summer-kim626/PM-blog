// 글 조회수 집계 (Node 20+, 의존성 없음): GA4 Data API → data/views.json
// GitHub Actions(.github/workflows/update-views.yml)가 주기적으로 실행한다.
// - 환경 변수: GA4_PROPERTY_ID(숫자 속성 ID), GA4_SERVICE_ACCOUNT_JSON(서비스 계정 키 JSON 전체)
//   둘 다 레포 Settings → Secrets and variables → Actions에 둔다. 코드·로그에 키를 남기지 않는다.
// - 측정값: GA4 screenPageViews(페이지 조회수), pagePath에 /posts/<slug>.html 이 들어간 행을 글별로 더한다.
// - posts/ 에 있는 글만 남기고, 값이 없으면 0. 숫자가 바뀌었을 때만 파일을 다시 쓴다(불필요한 커밋 방지).
import { createSign } from "node:crypto";
import { readFile, writeFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const OUT = "data/views.json";
const START_DATE = "2020-01-01";
const SLUG_IN_PATH = /\/posts\/(\d{4}-\d{2}-\d{2}-[a-z0-9-]+)(?:\.html)?(?:[?#]|$)/;

const b64url = obj => Buffer.from(JSON.stringify(obj)).toString("base64url");

// 서비스 계정 키로 JWT를 서명해 읽기 전용 액세스 토큰을 받는다
async function accessToken(sa) {
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${b64url({ alg: "RS256", typ: "JWT" })}.${b64url({
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/analytics.readonly",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  })}`;
  const sig = createSign("RSA-SHA256").update(unsigned).sign(sa.private_key).toString("base64url");
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${sig}` }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.access_token) throw new Error(`Google 인증 실패 (${res.status}): ${body.error_description || body.error || "응답 없음"}`);
  return body.access_token;
}

async function runReport(propertyId, token) {
  const res = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      dateRanges: [{ startDate: START_DATE, endDate: "today" }],
      dimensions: [{ name: "pagePath" }],
      metrics: [{ name: "screenPageViews" }],
      dimensionFilter: { filter: { fieldName: "pagePath", stringFilter: { matchType: "CONTAINS", value: "/posts/" } } },
      limit: 10000,
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const hint = res.status === 403 ? " — GA4 속성 [관리 → 속성 액세스 관리]에 서비스 계정 이메일을 '뷰어'로 추가했는지 확인하세요" : "";
    throw new Error(`GA4 Data API ${res.status}: ${body.error?.message || "응답 없음"}${hint}`);
  }
  return body.rows || [];
}

// GA4 행 → { slug: 조회수 } (글 목록에 있는 slug만, 없으면 0)
export function aggregate(rows, slugs) {
  const views = Object.fromEntries([...slugs].sort().map(s => [s, 0]));
  for (const row of rows) {
    const m = (row.dimensionValues?.[0]?.value || "").match(SLUG_IN_PATH);
    if (m && m[1] in views) views[m[1]] += Number(row.metricValues?.[0]?.value) || 0;
  }
  return views;
}

async function main() {
  const propertyId = (process.env.GA4_PROPERTY_ID || "").trim();
  const saJson = process.env.GA4_SERVICE_ACCOUNT_JSON || "";
  if (!/^\d+$/.test(propertyId)) throw new Error("GA4_PROPERTY_ID(숫자 속성 ID)가 없습니다");
  let sa;
  try { sa = JSON.parse(saJson); } catch { throw new Error("GA4_SERVICE_ACCOUNT_JSON이 없거나 JSON 형식이 아닙니다"); }
  if (!sa.client_email || !sa.private_key) throw new Error("서비스 계정 키에 client_email·private_key가 없습니다");

  const slugs = (await readdir("posts")).filter(f => /^\d{4}-\d{2}-\d{2}-[a-z0-9-]+\.html$/.test(f)).map(f => f.replace(/\.html$/, ""));
  const rows = await runReport(propertyId, await accessToken(sa));
  const views = aggregate(rows, slugs);

  const prev = await readFile(OUT, "utf8").then(JSON.parse).catch(() => null);
  if (prev && JSON.stringify(prev.views) === JSON.stringify(views)) {
    console.log("조회수 변경 없음");
    return;
  }
  const out = { updated_at: new Date().toISOString(), source: "GA4 screenPageViews", views };
  await writeFile(OUT, JSON.stringify(out, null, 2) + "\n");
  console.log(JSON.stringify(views, null, 2));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(e => { console.error(`::error::${e.message}`); process.exit(1); });
}

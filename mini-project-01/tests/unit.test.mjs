// 기능별 단위 테스트 (F2·F3·F5·F6·F7) — 실행: node --test mini-project-01/tests/
// 네트워크를 쓰지 않는다. Claude 호출은 globalThis.fetch를 가로채 모의 응답으로 대신한다.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parsePost, htmlToText, findCategory } from "../../scripts/cardnews/parse.mjs";
import { validate } from "../../scripts/cardnews/validate.mjs";
import { generate, MODEL, FALLBACK_MODEL } from "../../scripts/cardnews/ai.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = p => fs.readFileSync(path.join(ROOT, p), "utf8");
const sample = () => JSON.parse(read("cardnews/sample.json"));
const INDEX = read("index.html");
const POST = "2026-11-24-rice-vs-ice.html";

// ---------- F2 본문 추출 ----------
test("F2-1 글 파일에서 제목·카테고리·본문을 뽑는다", () => {
  const p = parsePost(read(`posts/${POST}`), POST, INDEX);
  assert.equal(p.slug, "2026-11-24-rice-vs-ice");
  assert.ok(p.title.length > 0);
  assert.ok(p.category.length > 0, "index.html posts 배열의 cat 값");
  assert.ok(p.text.length >= 50);
});
test("F2-2 GTM 스크립트·'목록으로' 링크는 본문에 없다", () => {
  const p = parsePost(read(`posts/${POST}`), POST, INDEX);
  assert.doesNotMatch(p.text, /googletagmanager|dataLayer|목록으로/);
});
test("F2-3 소제목은 '## ', 목록은 '- '로 남는다", () => {
  assert.equal(htmlToText("<h2>제목</h2><ul><li>하나</li><li>둘</li></ul>"), "## 제목\n- 하나\n- 둘");
});
test("F2-4 잘못된 파일명·<article> 없음은 오류", () => {
  assert.throws(() => parsePost("<article><h1>t</h1></article>", "bad.html"), /형식이 아닙니다/);
  assert.throws(() => parsePost("<div></div>", "2026-01-01-x.html"), /article/);
});
test("F2-5 posts 배열에 없는 글은 카테고리 빈 값", () => {
  assert.equal(findCategory(INDEX, "2099-01-01-none.html"), "");
});

// ---------- F3 결과 검증 ----------
test("F3-1 sample.json은 오류·경고 0건", () => {
  const r = validate(sample());
  assert.deepEqual(r, { errors: [], warnings: [] });
});
test("F3-2 카드 3장이면 '5~7장' 오류", () => {
  const d = sample(); d.cards = [d.cards[0], d.cards[1], d.cards.at(-1)];
  assert.match(validate(d).errors.join(), /5~7장/);
});
test("F3-3 첫 장 cover·끝 장 cta가 아니면 오류", () => {
  const d = sample(); d.cards.reverse();
  const e = validate(d).errors.join();
  assert.match(e, /cover/); assert.match(e, /cta/);
});
test("F3-4 모르는 도형은 지우고 경고만 남긴다", () => {
  const d = sample(); d.cards[1].figure = { shape: "star" };
  const r = validate(d);
  assert.equal(r.errors.length, 0);
  assert.equal(d.cards[1].figure, undefined);
  assert.match(r.warnings.join(), /모르는 도형/);
});
test("F3-5 글자 수 초과는 경고(실패 아님)", () => {
  const d = sample(); d.cards[0].headline = "가".repeat(25);
  const r = validate(d);
  assert.equal(r.errors.length, 0);
  assert.match(r.warnings.join(), /25자 \(최대 20\)/);
});
test("F3-6 해시태그에 # 자동 보정", () => {
  const d = sample(); d.hashtags = ["PM", "서비스 기획", "#a", "#b", "#c"];
  validate(d);
  assert.deepEqual(d.hashtags.slice(0, 2), ["#PM", "#서비스기획"]);
});

// ---------- F3 AI 호출 (모의 응답) ----------
const post = () => parsePost(read(`posts/${POST}`), POST, INDEX);
function mockFetch(replies) {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), body: JSON.parse(init.body) });
    const r = replies[Math.min(calls.length - 1, replies.length - 1)];
    return new Response(JSON.stringify(r.body), { status: r.status, headers: { "content-type": "application/json" } });
  };
  return calls;
}
const ok = (model = MODEL) => ({
  status: 200,
  body: {
    id: "msg_test", type: "message", role: "assistant", model, stop_reason: "end_turn",
    content: [{ type: "text", text: JSON.stringify((({ summary, cards, caption, hashtags }) => ({ summary, cards, caption, hashtags }))(sample())) }],
    usage: { input_tokens: 1, output_tokens: 1 },
  },
});
const err = (status, type) => ({ status, body: { type: "error", error: { type, message: type } } });
const quiet = { apiKey: "test-key", log: () => {} };

test("F3-7 키가 없으면 호출하지 않고 NO_KEY 오류", async () => {
  const calls = mockFetch([ok()]);
  await assert.rejects(generate(post(), { log: () => {} }), e => e.code === "NO_KEY");
  assert.equal(calls.length, 0);
});
test("F3-8 요청 형식: 모델·effort low·JSON 스키마·서버 대체", async () => {
  const calls = mockFetch([ok()]);
  const { result, attempts } = await generate(post(), quiet);
  const b = calls[0].body;
  assert.match(calls[0].url, /api\.anthropic\.com\/v1\/messages/);
  assert.equal(b.model, "claude-opus-5-5");
  assert.equal(b.output_config.effort, "low");
  assert.equal(b.output_config.format.type, "json_schema");
  assert.equal(b.fallbacks, "default");
  assert.equal(b.temperature, undefined);
  assert.equal(attempts, 1);
  assert.equal(result.slug, "2026-11-24-rice-vs-ice");
  assert.equal(result.model, MODEL);
});
test("F3-9 529 과부하면 2회차는 대체 모델", async () => {
  const calls = mockFetch([err(529, "overloaded_error"), ok(FALLBACK_MODEL)]);
  const { result, attempts } = await generate(post(), quiet);
  assert.equal(attempts, 2);
  assert.equal(calls[1].body.model, "claude-sonnet-5-5");
  assert.equal(result.model, "claude-sonnet-5-5");
});
test("F3-10 401 잘못된 키는 1회 호출 후 멈춤", async () => {
  const calls = mockFetch([err(401, "authentication_error")]);
  await assert.rejects(generate(post(), quiet), /401/);
  assert.equal(calls.length, 1);
});
test("F3-11 refusal 응답은 실패 처리", async () => {
  const r = ok(); r.body.stop_reason = "refusal"; r.body.stop_details = { category: "cyber" };
  const calls = mockFetch([r]);
  await assert.rejects(generate(post(), quiet), /거절/);
  assert.equal(calls.length, 1);
});
test("F3-12 형식 오류는 같은 모델로 1회 재시도 후 실패(최대 2회)", async () => {
  const bad = ok(); bad.body.content[0].text = '{"summary":[]}';
  const calls = mockFetch([bad]);
  await assert.rejects(generate(post(), quiet), /형식 오류/);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].body.model, MODEL);
});

// ---------- F5 결과 저장 (커밋된 산출물) ----------
const status = JSON.parse(read("data/cardnews/index.json"));
test("F5-1 index.json 상태 값과 필드", () => {
  for (const [slug, s] of Object.entries(status)) {
    assert.ok(["done", "warning", "failed"].includes(s.status), slug);
    for (const k of ["generated_at", "cards", "warnings", "error"]) assert.ok(k in s, `${slug}.${k}`);
  }
});
test("F5-2 완료된 글은 summary.json·PNG 장수가 상태와 같다", () => {
  for (const [slug, s] of Object.entries(status)) {
    if (s.status === "failed") continue;
    const dir = path.join(ROOT, "data/cardnews", slug);
    const pngs = fs.readdirSync(dir).filter(f => /^card-\d{2}\.png$/.test(f));
    assert.equal(pngs.length, s.cards, slug);
    const sum = JSON.parse(fs.readFileSync(path.join(dir, "summary.json"), "utf8"));
    assert.deepEqual(validate(sum).errors, [], slug);
  }
});
test("F5-3 PNG는 1080×1350", () => {
  for (const [slug, s] of Object.entries(status)) {
    if (s.status === "failed") continue;
    for (let i = 1; i <= s.cards; i++) {
      const buf = fs.readFileSync(path.join(ROOT, "data/cardnews", slug, `card-${String(i).padStart(2, "0")}.png`));
      assert.equal(buf.readUInt32BE(16), 1080, `${slug} card-${i} 너비`);
      assert.equal(buf.readUInt32BE(20), 1350, `${slug} card-${i} 높이`);
    }
  }
});

// ---------- F6 글 상단 요약 / F7 관리자 페이지 (정적 검사) ----------
test("F6-1 모든 글이 ai-summary.js를 불러온다", () => {
  for (const f of fs.readdirSync(path.join(ROOT, "posts")).filter(f => f.endsWith(".html"))) {
    assert.match(read(`posts/${f}`), /assets\/ai-summary\.js/, f);
  }
});
test("F6-2 summary.json을 못 읽으면 그리지 않고, 'AI 초안' 표기가 있다", () => {
  const js = read("assets/ai-summary.js");
  assert.match(js, /\.ok/);
  assert.match(js, /AI 초안/);
});
test("F7-1 관리자 페이지 CSP는 Anthropic·GitHub API로만 전송", () => {
  const html = read("admin/index.html");
  const csp = html.match(/connect-src([^;"]*)/)[1];
  assert.match(csp, /api\.anthropic\.com/);
  assert.match(csp, /api\.github\.com/);
  assert.doesNotMatch(html, /localStorage\.setItem/);
  assert.match(html, /noindex/);
});

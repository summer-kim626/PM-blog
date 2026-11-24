// F3 AI 생성: 추출한 글 → summary.json 내용 (AGENTS.md 3-1 스키마)
// Gemini REST API를 직접 부른다. 키는 환경 변수 GEMINI_API_KEY에서만 읽는다.
// 사용: node --env-file-if-exists=.env scripts/cardnews/generate.mjs posts/<파일>.html
import { fileURLToPath } from "node:url";
import { extractPost } from "./extract.mjs";
import { validate, SHAPES, LIMITS } from "./validate.mjs";

export const MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
const MAX_CALLS = 2; // 첫 호출 + 재시도 1회
const CALL_TIMEOUT_MS = Number(process.env.GEMINI_TIMEOUT_MS) || 120_000; // 응답이 없으면 끊는다
const RETRY_WAIT_MS = 15_000; // 503(과부하)·429(한도)·시간 초과는 잠시 기다렸다 재시도한다

const FIGURE_GUIDE = `
| shape | 언제 쓰나 | labels |
| versus | 두 가지를 비교·대조 | [A, B] |
| link | 두 가지를 잇는 관계 | [A, B, 연결 이름] |
| contrast | 고정 vs 변화, 꾸준함 vs 유연함 | [실선, 점선] |
| tree | 하나에서 뻗어나가는 생각·성장 | 없음 |
| steps | 단계적 과정·성장 | [1단계, 2단계, 3단계] |
| cycle | 반복·피드백·회고 | [위, 오른쪽 아래, 왼쪽 아래] |
| diverge | 여러 선택지·아이디어로 확장 | [왼쪽, 가운데, 오른쪽] |
| converge | 여러 갈래를 하나로 모음·우선순위 | [왼쪽, 가운데, 오른쪽, 결과] |
| checklist | 원칙·규칙·할 일 3개 | [항목1, 항목2, 항목3] |
| magnifier | 조사·분석·문제 찾기 | [대상] |
| bulb | 아이디어·깨달음 | 없음 |
| chart | 데이터·지표·증가 | [막대1, 막대2, 막대3] |
| target | 목표·핵심 하나에 집중 | [목표] |
| doc | 기록·글쓰기·문서 | 없음 |`.trim();

export function buildPrompt(post) {
  return `너는 PM 학습 블로그의 글을 인스타그램 카드뉴스 초안으로 바꾸는 편집자다.
아래 [글]만 근거로, 지정한 JSON 형식으로만 답한다. 설명이나 코드 블록 없이 JSON 객체 하나만 출력한다.

## 반드시 지킬 규칙
1. 글에 없는 사실·수치·인용·사례를 만들지 않는다. 확실하지 않으면 빼는 쪽을 택한다.
2. 말투는 블로그 본문과 같은 한국어 합니다체(예: "기록합니다", "남깁니다"). headline은 명사형으로 끝내도 된다.
3. 카드는 cover 1장 + point 3~5장 + cta 1장, 합계 5~7장. 순서는 cover → point들 → cta.
4. 글자 수(공백 포함): headline ${LIMITS.headline}자 이하, body ${LIMITS.body}자 이하, sub ${LIMITS.sub}자 이하, summary 각 ${LIMITS.summary}자 이하.
5. summary는 글 전체의 핵심 3줄. 독자가 글을 읽기 전에 보는 요약이다.
6. caption은 인스타그램 본문용 2~4문장. hashtags는 5~10개, 각각 "#"으로 시작하고 공백 없이.
7. cta 카드의 body는 블로그에서 전문을 읽도록 안내하는 문장으로 쓴다.

## 카드 도형(figure)
- 카드마다 내용에 맞는 도형을 아래 목록에서 하나만 고른다. 맞는 게 없으면 figure를 생략한다.
- labels는 각 ${LIMITS.label}자 이하, 글에 나온 단어로만 쓴다. "없음"인 도형은 labels를 넣지 않는다.
- 같은 도형을 연달아 쓰지 않는다. shape 값은 다음 중 하나: ${SHAPES.join(", ")}
${FIGURE_GUIDE}

## 출력 JSON 형식
{
  "summary": ["요약 1", "요약 2", "요약 3"],
  "cards": [
    { "type": "cover", "headline": "표지 문구", "sub": "보조 문구", "figure": { "shape": "doc" } },
    { "type": "point", "headline": "핵심 문구", "body": "설명", "figure": { "shape": "versus", "labels": ["A", "B"] } },
    { "type": "cta", "headline": "마무리 문구", "body": "블로그에서 전문 보기" }
  ],
  "caption": "인스타그램 캡션",
  "hashtags": ["#PM", "#서비스기획"]
}

[글]
제목: ${post.title}
카테고리: ${post.category || "(없음)"}

${post.text}`;
}

async function callGemini(prompt, apiKey) {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey }, // 키는 URL이 아닌 헤더로 보낸다
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json", temperature: 0.4 },
    }),
    signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
  }).catch(e => {
    if (e.name === "TimeoutError") throw Object.assign(new Error(`Gemini API 응답 없음 (${CALL_TIMEOUT_MS / 1000}초 초과)`), { transient: true });
    throw e;
  });
  if (!res.ok) {
    // 원본 응답은 남기지 않고 상태와 오류 메시지만 남긴다
    const err = await res.json().catch(() => ({}));
    throw Object.assign(new Error(`Gemini API ${res.status}: ${err?.error?.message?.slice(0, 200) || res.statusText}`), { status: res.status });
  }
  const json = await res.json();
  const parts = json?.candidates?.[0]?.content?.parts || [];
  const text = parts.filter(p => !p.thought && typeof p.text === "string").map(p => p.text).join("");
  if (!text) throw new Error(`응답에 텍스트가 없습니다 (finishReason: ${json?.candidates?.[0]?.finishReason || "알 수 없음"})`);
  return text;
}

function parseJson(text) {
  // 모델이 코드 블록으로 감싸 보내는 경우만 벗겨낸다
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  return JSON.parse(cleaned);
}

export async function generate(post, { apiKey = process.env.GEMINI_API_KEY, log = console.log } = {}) {
  if (!apiKey) throw Object.assign(new Error("GEMINI_API_KEY 가 없습니다."), { code: "NO_KEY" });

  const prompt = buildPrompt(post);
  let lastError;
  for (let attempt = 1; attempt <= MAX_CALLS; attempt++) {
    try {
      const data = parseJson(await callGemini(prompt, apiKey));
      const { errors, warnings } = validate(data);
      if (errors.length) throw new Error(`형식 오류: ${errors.join(" / ")}`);

      // 슬러그·제목·카테고리·시각은 AI가 아닌 코드가 채운다
      const result = {
        slug: post.slug,
        title: post.title,
        category: post.category,
        summary: data.summary,
        cards: data.cards,
        caption: data.caption,
        hashtags: data.hashtags,
        model: MODEL,
        generated_at: new Date().toISOString(),
      };
      return { result, warnings, attempts: attempt };
    } catch (e) {
      lastError = e;
      // 인증·권한·모델 없음(4xx, 429 제외)은 다시 불러도 같으므로 바로 멈춘다
      if (e.status && e.status >= 400 && e.status < 500 && e.status !== 429) break;
      if (attempt < MAX_CALLS) {
        const wait = e.transient || e.status === 429 || e.status >= 500 ? RETRY_WAIT_MS : 0;
        log(`  ${attempt}회차 실패, ${wait ? `${wait / 1000}초 뒤 ` : ""}재시도합니다: ${e.message}`);
        if (wait) await new Promise(r => setTimeout(r, wait));
      }
    }
  }
  throw lastError;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const file = process.argv[2];
  if (!file) { console.error("사용법: node scripts/cardnews/generate.mjs posts/<파일>.html [--prompt]"); process.exit(1); }
  const post = await extractPost(file);
  if (process.argv.includes("--prompt")) { console.log(buildPrompt(post)); process.exit(0); }
  try {
    const { result, warnings } = await generate(post);
    console.log(JSON.stringify(result, null, 2));
    warnings.forEach(w => console.warn(`경고 ${w}`));
  } catch (e) {
    console.error(`::error::${e.message}`);
    process.exit(1);
  }
}

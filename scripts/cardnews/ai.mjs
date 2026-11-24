// F3 AI 생성 (브라우저·Node 공용): 추출한 글 → summary.json 내용 (AGENTS.md 3-1 스키마)
// Claude Messages API를 공식 SDK(@anthropic-ai/sdk)로 부른다. 키는 인자로만 받고 어디에도 저장하지 않는다.
// - Node: generate.mjs가 환경 변수(ANTHROPIC_API_KEY 등)를 읽어 넘긴다. SDK는 node_modules에서 읽는다.
// - 관리자 페이지: 사용자가 입력한 키를 넘긴다. SDK는 import map으로 assets/vendor/anthropic-sdk.mjs를 읽는다.
import Anthropic from "@anthropic-ai/sdk";
import { validate, SHAPES, LIMITS } from "./validate.mjs";

export const MODEL = "claude-opus-5-5";
// 기본 모델이 과부하(529)·한도(429)·5xx·시간 초과면 2회차는 이 모델로 보낸다. 빈 값이면 대체하지 않는다.
export const FALLBACK_MODEL = "claude-sonnet-5-5";
const MAX_CALLS = 2; // 첫 호출 + 재시도 1회 (대체 모델로 넘어가는 경우 포함). SDK 자동 재시도는 끈다
const CALL_TIMEOUT_MS = 120_000; // 응답이 없으면 끊는다
// 요약·짧은 카피라 깊은 추론이 필요 없다. Opus 5.5는 생각을 끌 수 없어 effort로 깊이를 낮춘다
const EFFORT = "low";
const RETRY_WAIT_MS = 15_000; // 대체 모델 없이 같은 모델로 재시도할 때, 과부하면 잠시 기다린다

// 구조화 출력: 응답이 이 JSON 형태로만 오게 한다. 글자 수 등 세부 규칙은 validate()가 검사한다
const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "array", items: { type: "string" } },
    cards: {
      type: "array",
      items: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["cover", "point", "cta"] },
          headline: { type: "string" },
          sub: { type: "string" },
          body: { type: "string" },
          figure: {
            type: "object",
            properties: {
              shape: { type: "string", enum: SHAPES },
              labels: { type: "array", items: { type: "string" } },
            },
            required: ["shape"],
            additionalProperties: false,
          },
        },
        required: ["type", "headline"],
        additionalProperties: false,
      },
    },
    caption: { type: "string" },
    hashtags: { type: "array", items: { type: "string" } },
  },
  required: ["summary", "cards", "caption", "hashtags"],
  additionalProperties: false,
};

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

async function callClaude(client, model, prompt, { timeoutMs, effort }) {
  let res;
  try {
    res = await client.beta.messages.create(
      {
        model,
        max_tokens: 16000,
        // 안전 분류기가 거절하면 서버가 다른 모델로 이어서 답한다 (실제로 답한 모델은 res.model)
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: {
          ...(effort ? { effort } : {}),
          format: { type: "json_schema", schema: OUTPUT_SCHEMA },
        },
        messages: [{ role: "user", content: prompt }],
      },
      { timeout: timeoutMs },
    );
  } catch (e) {
    // 원본 응답은 남기지 않고 상태와 오류 메시지만 남긴다
    if (e instanceof Anthropic.APIConnectionTimeoutError) {
      throw Object.assign(new Error(`Claude API 응답 없음 (${timeoutMs / 1000}초 초과)`), { transient: true });
    }
    if (e instanceof Anthropic.APIConnectionError) {
      throw Object.assign(new Error(`Claude API 연결 실패: ${e.message}`), { transient: true });
    }
    if (e instanceof Anthropic.APIError) {
      const msg = e.error?.error?.message || e.message;
      throw Object.assign(new Error(`Claude API ${e.status}: ${String(msg).slice(0, 200)}`), { status: e.status });
    }
    throw e;
  }
  if (res.stop_reason === "refusal") {
    throw Object.assign(new Error(`모델이 요청을 거절했습니다 (${res.stop_details?.category || "분류 없음"})`), { status: 400 });
  }
  if (res.stop_reason === "max_tokens") throw new Error("응답이 최대 길이에서 잘렸습니다");
  const text = res.content.filter(b => b.type === "text").map(b => b.text).join("");
  if (!text) throw new Error(`응답에 텍스트가 없습니다 (stop_reason: ${res.stop_reason})`);
  return { text, model: res.model };
}

function parseJson(text) {
  // 구조화 출력이라 보통 JSON 그대로 오지만, 코드 블록으로 감싸 오면 벗겨낸다
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  return JSON.parse(cleaned);
}

export async function generate(post, {
  apiKey,
  model: firstModel = MODEL,
  fallbackModel = FALLBACK_MODEL,
  timeoutMs = CALL_TIMEOUT_MS,
  effort = EFFORT,
  log = console.log,
} = {}) {
  if (!apiKey) throw Object.assign(new Error("Claude API 키(ANTHROPIC_API_KEY)가 없습니다."), { code: "NO_KEY" });

  // 관리자 페이지는 사용자가 직접 입력한 본인 키로 부르므로 브라우저 호출을 허용한다
  const client = new Anthropic({ apiKey, maxRetries: 0, dangerouslyAllowBrowser: true });
  const prompt = buildPrompt(post);
  let lastError;
  let model = firstModel;
  for (let attempt = 1; attempt <= MAX_CALLS; attempt++) {
    try {
      const reply = await callClaude(client, model, prompt, { timeoutMs, effort });
      const data = parseJson(reply.text);
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
        model: reply.model, // 실제로 답한 모델 (대체 모델이면 그 이름)
        generated_at: new Date().toISOString(),
      };
      return { result, warnings, attempts: attempt };
    } catch (e) {
      lastError = Object.assign(e, { message: `[${model}] ${e.message}` });
      // 인증·권한·요청 오류·거절(4xx, 429 제외)은 다시 불러도 같으므로 바로 멈춘다
      if (e.status && e.status >= 400 && e.status < 500 && e.status !== 429) break;
      if (attempt < MAX_CALLS) {
        const busy = e.transient || e.status === 429 || e.status >= 500; // 529 = 과부하
        if (busy && fallbackModel && fallbackModel !== model) {
          // 과부하는 같은 모델로 다시 보내도 또 실패하기 쉬우므로 다른 모델로 바로 넘어간다
          log(`  ${attempt}회차 실패, 대체 모델 ${fallbackModel}로 재시도합니다: ${e.message}`);
          model = fallbackModel;
        } else {
          // 형식 오류 등은 같은 모델로 한 번 더
          log(`  ${attempt}회차 실패, ${busy ? `${RETRY_WAIT_MS / 1000}초 뒤 ` : ""}재시도합니다: ${e.message}`);
          if (busy) await new Promise(r => setTimeout(r, RETRY_WAIT_MS));
        }
      }
    }
  }
  throw lastError;
}

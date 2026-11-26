// 아티클 "figure 추가" (브라우저·Node 공용)
// 본문을 블록으로 나눠 번호를 붙여 보내면, Claude가 이해를 돕는 도형과 넣을 자리(블록 번호)를 고른다.
// 도형은 카드뉴스와 같은 목록(cardnews/figures.js)에서만 고르고, 그림은 코드가 그린다 (AGENTS.md 3-3).
// 모델·대체 모델·재시도 규칙은 카드뉴스 생성(ai.mjs)과 같다: 최대 2회, SDK 자동 재시도 끔.
import Anthropic from "@anthropic-ai/sdk";
import { callClaude, parseJson, MODEL, FALLBACK_MODEL, FIGURE_GUIDE } from "../cardnews/ai.mjs";
import { SHAPES, LIMITS } from "../cardnews/validate.mjs";
import { splitBlocks, isFigureBlock, readFigure, figureBlock } from "./markdown.mjs";

const MAX_FIGURES = 3;
const CAPTION_MAX = 30;
const MAX_CALLS = 2;
const CALL_TIMEOUT_MS = 120_000;

const SCHEMA = {
  type: "object",
  properties: {
    figures: {
      type: "array",
      items: {
        type: "object",
        properties: {
          after: { type: "integer" },
          shape: { type: "string", enum: SHAPES },
          labels: { type: "array", items: { type: "string" } },
          caption: { type: "string" },
        },
        required: ["after", "shape", "labels", "caption"],
        additionalProperties: false,
      },
    },
  },
  required: ["figures"],
  additionalProperties: false,
};

export function buildFigurePrompt({ title, blocks }) {
  const numbered = blocks.map((b, i) => {
    const f = isFigureBlock(b) ? readFigure(b) : null;
    return `[${i}] ${f ? `(이미 넣은 도형: ${f.shape})` : b}`;
  }).join("\n\n");
  return `너는 PM 학습 블로그 글에 독자의 이해를 돕는 도형(figure)을 넣는 편집자다.
아래 [블록]은 글 본문을 번호 붙인 덩어리로 나눈 것이다. 본문만 근거로, 지정한 JSON 형식으로만 답한다.

## 반드시 지킬 규칙
1. 비교·과정·순환·구조·우선순위처럼 그림으로 보면 더 빨리 이해되는 곳에만 넣는다. 0~${MAX_FIGURES}개. 마땅한 곳이 없으면 빈 배열.
2. after: 도형을 넣을 자리. 그 번호 블록의 바로 뒤에 들어간다. 그림이 설명하는 내용이 끝나는 블록을 고른다.
   제목(##) 블록 바로 뒤, 이미 도형이 있는 블록의 바로 앞뒤에는 넣지 않는다. 한 자리에 하나만.
3. shape는 아래 목록에서 하나만 고른다. 이미 넣은 도형과 같은 shape, 이번에 고른 것끼리 같은 shape는 쓰지 않는다.
4. labels는 각 ${LIMITS.label}자 이하, 본문에 나온 단어로만 쓴다. 목록의 labels 개수와 순서를 따른다. "없음"인 도형은 빈 배열.
5. caption은 그림이 보여 주는 내용을 ${CAPTION_MAX}자 이하 명사형으로 쓴다. 본문에 없는 사실·수치를 만들지 않는다.

## 도형 목록
${FIGURE_GUIDE}

## 출력 JSON 형식
{ "figures": [ { "after": 3, "shape": "steps", "labels": ["정의", "검증", "회고"], "caption": "문제 정의에서 회고까지의 흐름" } ] }

[글 제목] ${title || "(없음)"}

[블록]
${numbered}`;
}

// AI 답을 검사해 넣을 수 있는 것만 남긴다. 고칠 수 있는 건 고치고 경고로 남긴다.
export function checkFigures(raw, blocks) {
  const warnings = [];
  const used = new Set(blocks.map(b => readFigure(b)?.shape).filter(Boolean));
  const taken = new Set();
  const out = [];
  for (const f of Array.isArray(raw?.figures) ? raw.figures : []) {
    const where = `도형(${f?.shape ?? "?"})`;
    if (!SHAPES.includes(f?.shape)) { warnings.push(`${where}: 모르는 도형이라 뺐습니다`); continue; }
    if (!Number.isInteger(f.after) || f.after < 0 || f.after >= blocks.length) { warnings.push(`${where}: 위치 ${f.after}가 본문 밖이라 뺐습니다`); continue; }
    const near = [f.after, f.after + 1].some(i => blocks[i] && isFigureBlock(blocks[i]));
    if (near || /^#{1,6}\s/.test(blocks[f.after])) { warnings.push(`${where}: 제목 바로 뒤이거나 다른 도형 옆이라 뺐습니다`); continue; }
    if (taken.has(f.after) || used.has(f.shape)) { warnings.push(`${where}: 자리나 도형이 겹쳐 뺐습니다`); continue; }
    const labels = (f.labels || []).map(l => String(l).trim()).filter(Boolean);
    labels.forEach(l => l.length > LIMITS.label && warnings.push(`${where}: 라벨 "${l}" ${l.length}자 (최대 ${LIMITS.label})`));
    let caption = String(f.caption || "").trim();
    if (caption.length > CAPTION_MAX + 10) { warnings.push(`${where}: 설명이 길어 줄였습니다`); caption = caption.slice(0, CAPTION_MAX) + "…"; }
    taken.add(f.after);
    used.add(f.shape);
    out.push({ after: f.after, shape: f.shape, labels, caption });
    if (out.length === MAX_FIGURES) break;
  }
  return { figures: out, warnings };
}

// 블록 사이에 ```figure 블록을 넣은 새 마크다운
export function insertFigures(md, figures) {
  const blocks = splitBlocks(md);
  const at = new Map(figures.map(f => [f.after, f]));
  return blocks.flatMap((b, i) => (at.has(i) ? [b, figureBlock(at.get(i))] : [b])).join("\n\n") + "\n";
}

export async function suggestFigures({ title, markdown }, { apiKey, model: firstModel = MODEL, fallbackModel = FALLBACK_MODEL, log = () => {} } = {}) {
  if (!apiKey) throw new Error("Claude API 키가 없습니다");
  const blocks = splitBlocks(markdown);
  if (blocks.filter(b => !isFigureBlock(b)).join("").length < 80) throw new Error("본문이 너무 짧습니다. 내용을 더 쓴 뒤 다시 시도하세요");

  const client = new Anthropic({ apiKey, maxRetries: 0, dangerouslyAllowBrowser: true });
  const prompt = buildFigurePrompt({ title, blocks });
  let model = firstModel, lastError;
  for (let attempt = 1; attempt <= MAX_CALLS; attempt++) {
    try {
      const reply = await callClaude(client, model, prompt, { timeoutMs: CALL_TIMEOUT_MS, effort: "low", schema: SCHEMA });
      const { figures, warnings } = checkFigures(parseJson(reply.text), blocks);
      return { figures, warnings, markdown: figures.length ? insertFigures(markdown, figures) : markdown, model: reply.model, attempts: attempt };
    } catch (e) {
      lastError = Object.assign(e, { message: `[${model}] ${e.message}` });
      if (e.status && e.status >= 400 && e.status < 500 && e.status !== 429) break;
      const busy = e.transient || e.status === 429 || e.status >= 500;
      if (attempt < MAX_CALLS && busy && fallbackModel && fallbackModel !== model) {
        log(`대체 모델 ${fallbackModel}로 다시 시도합니다`);
        model = fallbackModel;
      }
    }
  }
  throw lastError;
}

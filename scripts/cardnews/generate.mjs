// F3 AI 생성 (Node 실행용): 환경 변수를 읽어 ai.mjs의 generate()를 부른다.
// 사용: node --env-file-if-exists=.env scripts/cardnews/generate.mjs posts/<파일>.html [--prompt]
//   ANTHROPIC_API_KEY(필수) · CLAUDE_MODEL · CLAUDE_FALLBACK_MODEL · CLAUDE_TIMEOUT_MS · CLAUDE_EFFORT
import { fileURLToPath } from "node:url";
import { extractPost } from "./extract.mjs";
import * as ai from "./ai.mjs";

export const MODEL = process.env.CLAUDE_MODEL || ai.MODEL;
export const { buildPrompt } = ai;

export function generate(post, { apiKey = process.env.ANTHROPIC_API_KEY, log = console.log } = {}) {
  return ai.generate(post, {
    apiKey,
    log,
    model: MODEL,
    fallbackModel: process.env.CLAUDE_FALLBACK_MODEL ?? ai.FALLBACK_MODEL,
    ...(Number(process.env.CLAUDE_TIMEOUT_MS) ? { timeoutMs: Number(process.env.CLAUDE_TIMEOUT_MS) } : {}),
    ...(process.env.CLAUDE_EFFORT != null ? { effort: process.env.CLAUDE_EFFORT } : {}),
  });
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

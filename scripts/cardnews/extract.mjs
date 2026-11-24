// F2 본문 추출: posts/YYYY-MM-DD-slug.html → { slug, title, category, text }
// 글의 <article> 안만 읽고, 스크립트·스타일·메타 줄·"목록으로" 링크는 뺀다. 파싱 규칙은 parse.mjs.
// 사용: node scripts/cardnews/extract.mjs posts/2026-11-18-start-pm-blog.html
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parsePost } from "./parse.mjs";

export { htmlToText } from "./parse.mjs";
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export async function extractPost(postPath) {
  const abs = path.resolve(ROOT, postPath);
  const [html, index] = await Promise.all([readFile(abs, "utf8"), readFile(path.join(ROOT, "index.html"), "utf8")]);
  return parsePost(html, path.basename(abs), index);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const file = process.argv[2];
  if (!file) { console.error("사용법: node scripts/cardnews/extract.mjs posts/<파일>.html"); process.exit(1); }
  console.log(JSON.stringify(await extractPost(file), null, 2));
}

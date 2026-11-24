// F2 본문 추출 (순수 함수): Node 스크립트(extract.mjs)와 관리자 페이지가 함께 쓴다.
// 파일을 읽지 않고, 이미 읽은 HTML 문자열만 받는다.

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", middot: "·", hellip: "…", mdash: "—", ndash: "–", rarr: "→", larr: "←" };

function decode(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === "#") {
      const code = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

// HTML 조각을 읽기 좋은 텍스트로 바꾼다. 제목은 "## ", 목록은 "- "로 남겨 AI가 구조를 알 수 있게 한다.
export function htmlToText(html) {
  return decode(
    html
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/<(script|style|noscript|svg)\b[\s\S]*?<\/\1>/gi, "")
      .replace(/<h[1-6]\b[^>]*>/gi, "\n\n## ")
      .replace(/<li\b[^>]*>/gi, "\n- ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|h[1-6]|ul|ol|li|blockquote|section|table|tr)>/gi, "\n")
      .replace(/<[^>]+>/g, "")
  )
    .replace(/[ \t ]+/g, " ")
    .split("\n").map(l => l.trim()).join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\n\n(?=- )/g, "\n") // 목록 항목 사이 빈 줄 제거
    .trim();
}

export const SLUG_RE = /^\d{4}-\d{2}-\d{2}-[a-z0-9-]+$/;

// index.html의 posts 배열에서 이 글의 cat 값을 찾는다. 없으면 빈 문자열(표지 칩을 그리지 않음).
export function findCategory(indexHtml, fileName) {
  const url = `posts/${fileName}`.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = indexHtml.match(new RegExp(`\\{[^{}]*?cat:\\s*"([^"]*)"[^{}]*?url:\\s*"${url}"[^{}]*\\}`));
  return m ? m[1] : "";
}

// 글 HTML → { slug, title, category, text }
export function parsePost(html, fileName, indexHtml = "") {
  const m = fileName.match(/^(\d{4}-\d{2}-\d{2}-[a-z0-9-]+)\.html$/);
  if (!m) throw new Error(`파일명이 YYYY-MM-DD-slug.html 형식이 아닙니다: ${fileName}`);

  const article = html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i);
  if (!article) throw new Error(`<article> 태그를 찾지 못했습니다: ${fileName}`);

  const body = article[1]
    .replace(/<div class="meta"[\s\S]*?<\/div>/i, "") // 카테고리·날짜 줄
    .replace(/<a class="back"[\s\S]*?<\/a>/i, "");    // "← 목록으로"
  const h1 = article[1].match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
  const title = h1 ? htmlToText(h1[1]).replace(/^## /, "") : "";
  if (!title) throw new Error(`<h1> 제목이 없습니다: ${fileName}`);

  // 본문에서 제목 줄은 빼고 보낸다 (제목은 따로 전달)
  const text = htmlToText(body).replace(/^## .*\n*/, "");
  if (text.length < 50) throw new Error(`본문이 너무 짧습니다(${text.length}자): ${fileName}`);

  return { slug: m[1], title, category: findCategory(indexHtml, fileName), text };
}

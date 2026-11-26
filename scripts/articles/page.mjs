// 아티클 발행 (브라우저·Node 공용): 글 HTML 페이지와 index.html 글 목록 항목을 만든다.
// 글 페이지는 기존 posts/*.html 과 같은 모양이고, parse.mjs(카드뉴스 F2)가 그대로 읽을 수 있게
// <article> 안에 .meta(한 줄, div 중첩 없음) · h1 · .lead · 본문 · a.back 순서를 지킨다.
import { esc } from "./markdown.mjs";

// 도형 스타일: cardnews/template.html 의 .figure 규칙과 같은 값 (선 굵기·강조색·라벨 글꼴)
export const FIGURE_CSS = `
  .fig { margin: 28px 0; padding: 24px 20px 18px; border: 1px solid var(--line); border-radius: 12px; background: var(--surface); }
  .fig svg { display: block; width: 100%; max-width: 520px; height: auto; margin: 0 auto; overflow: visible; }
  .fig .s, .fig .a { fill: none; stroke-width: 10; stroke-linecap: round; stroke-linejoin: round; }
  .fig .s { stroke: currentColor; }
  .fig .a { stroke: var(--accent); }
  .fig .thick { stroke-width: 22; }
  .fig .dash { stroke-width: 12; stroke-dasharray: 26 26; }
  .fig .bud { fill: var(--surface); }
  .fig .fill { fill: var(--accent); }
  .fig .lb { fill: currentColor; font-size: 46px; font-weight: 800; letter-spacing: -0.03em; }
  .fig .la { fill: var(--accent); }
  .fig figcaption { margin-top: 12px; text-align: center; font-size: 14px; color: var(--muted); }`;

// 글 본문 스타일 (기존 글 페이지와 같은 값). 관리자 미리보기는 앞에 범위 선택자를 붙여 쓴다.
export const ARTICLE_CSS = `
  article h1 { font-size: clamp(26px, 5vw, 36px); line-height: 1.3; letter-spacing: -0.03em; margin-bottom: 12px; }
  .meta { font-size: 13px; color: var(--muted); display: flex; flex-wrap: wrap; gap: 4px 10px; margin-bottom: 12px; }
  .meta b { color: var(--accent); font-weight: 600; }
  .meta .tag { color: var(--muted); }
  .lead { color: var(--muted); font-size: 17px; padding-bottom: 32px; border-bottom: 1px solid var(--line); margin-bottom: 32px; }
  article h2 { font-size: 21px; letter-spacing: -0.02em; margin: 40px 0 12px; }
  article h3 { font-size: 17px; margin: 28px 0 10px; }
  article p { margin-bottom: 16px; font-size: 16px; }
  article ul, article ol { margin: 0 0 16px 20px; }
  article li { margin-bottom: 6px; }
  article strong { color: var(--accent); font-weight: 700; }
  article p a, article li a { color: var(--accent); text-decoration: underline; text-underline-offset: 3px; }
  article img { max-width: 100%; border-radius: 10px; }
  article hr { border: none; border-top: 1px solid var(--line); margin: 32px 0; }
  article blockquote { background: var(--accent-soft); border-left: 3px solid var(--accent); padding: 14px 18px;
    border-radius: 0 10px 10px 0; margin: 24px 0; font-size: 15px; }
  article code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .9em; background: var(--surface);
    border: 1px solid var(--line); border-radius: 6px; padding: 1px 5px; }
  article pre { background: var(--surface); border: 1px solid var(--line); border-radius: 10px; padding: 14px 16px; margin: 0 0 20px; overflow-x: auto; }
  article pre code { border: none; padding: 0; background: none; }
  .table-wrap { overflow-x: auto; margin-bottom: 20px; }
  table { width: 100%; border-collapse: collapse; font-size: 15px; }
  th, td { border: 1px solid var(--line); padding: 10px 12px; text-align: left; vertical-align: top; }
  th { background: var(--surface); font-weight: 700; white-space: nowrap; }
  .back { display: inline-block; margin: 8px 0 0; font-size: 14px; color: var(--muted); }
  .back:hover { color: var(--accent); }${FIGURE_CSS}`;

// <article> 안쪽 (관리자 미리보기와 발행 페이지가 함께 쓴다)
export function articleInner(meta, bodyHtml) {
  const tags = (meta.tags || []).map(t => `<span class="tag">#${esc(t)}</span>`).join("");
  return `<div class="meta"><b>${esc(meta.category)}</b><span>${esc(meta.date)}</span>${tags}</div>
    <h1>${esc(meta.title)}</h1>
    <p class="lead">${esc(meta.description)}</p>

${bodyHtml}

    <a class="back" href="../">← 목록으로</a>`;
}

export function postHtml(meta, bodyHtml) {
  return `<!DOCTYPE html>
<html lang="ko">
<head>
<!-- Google Tag Manager -->
<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','GTM-T7HFLJRM');</script>
<!-- End Google Tag Manager -->
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(meta.title)} | PM Blog</title>
<meta name="description" content="${esc(meta.description)}">
${(meta.tags || []).length ? `<meta name="keywords" content="${esc(meta.tags.join(", "))}">\n` : ""}<!-- 관리자 페이지(아티클)에서 마크다운으로 작성·발행한 글. 원본: posts/md/${esc(meta.slug)}.md -->
<style>
  :root {
    --bg: #fafaf9; --surface: #ffffff; --text: #1c1917; --muted: #78716c;
    --line: #e7e5e4; --accent: #ea580c; --accent-soft: #fff7ed;
  }
  @media (prefers-color-scheme: dark) {
    :root { --bg: #0c0a09; --surface: #1c1917; --text: #f5f5f4; --muted: #a8a29e;
      --line: #292524; --accent: #fb923c; --accent-soft: #2a1a10; }
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Pretendard", "Apple SD Gothic Neo", "Noto Sans KR", sans-serif;
    background: var(--bg); color: var(--text); line-height: 1.8; word-break: keep-all; }
  a { color: inherit; text-decoration: none; }
  .wrap { max-width: 760px; margin: 0 auto; padding: 0 20px; }
  header { border-bottom: 1px solid var(--line); }
  nav { display: flex; justify-content: space-between; align-items: center; height: 64px; }
  .logo { font-weight: 800; font-size: 18px; letter-spacing: -0.02em; }
  .logo span { color: var(--accent); }
  nav ul { display: flex; gap: 20px; list-style: none; font-size: 14px; color: var(--muted); }
  nav ul a:hover { color: var(--text); }
  article { padding: 56px 0 32px; }${ARTICLE_CSS}
  footer { padding: 40px 0 56px; font-size: 13px; color: var(--muted); text-align: center; border-top: 1px solid var(--line); margin-top: 32px; }
</style>
</head>
<body>
<!-- Google Tag Manager (noscript) -->
<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=GTM-T7HFLJRM"
height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>
<!-- End Google Tag Manager (noscript) -->
<header>
  <div class="wrap">
    <nav>
      <a class="logo" href="../">PM<span>.</span>blog</a>
      <ul>
        <li><a href="../#board">글</a></li>
        <li><a href="../#about">소개</a></li>
        <li><a href="https://github.com/summer-kim626/PM-blog">GitHub</a></li>
      </ul>
    </nav>
  </div>
</header>

<main class="wrap">
  <article>
    ${articleInner(meta, bodyHtml)}
  </article>
</main>

<footer>© 2026 PM Blog · Hosted on GitHub Pages</footer>
<script src="../assets/ai-summary.js" defer></script>
</body>
</html>
`;
}

// index.html 의 allPosts 배열에 글 항목을 넣거나(새 글) 바꾼다(같은 url). 날짜 내림차순 자리에 둔다.
const J = v => JSON.stringify(v).replace(/</g, "\\u003c"); // 스크립트 안이므로 </script> 가 끊기지 않게
export function upsertPostEntry(indexHtml, meta) {
  const m = indexHtml.match(/(const allPosts = \[\n)([\s\S]*?)(\n[ \t]*\];)/);
  if (!m) throw new Error("index.html에서 글 목록(const allPosts = [ … ])을 찾지 못했습니다");
  const url = `posts/${meta.slug}.html`;
  const line = `    { date: ${J(meta.date)}, cat: ${J(meta.category)}, title: ${J(meta.title)}, desc: ${J(meta.description)}, url: ${J(url)}, tags: ${J(meta.tags || [])} }`;
  const lines = m[2].split("\n").filter(l => l.trim()).map(l => l.replace(/,\s*$/, ""));
  const old = lines.findIndex(l => l.includes(`url: ${J(url)}`));
  if (old >= 0) lines.splice(old, 1);
  const dateOf = l => (l.match(/date:\s*"([^"]+)"/) || [])[1] || "";
  let at = lines.findIndex(l => dateOf(l) <= meta.date);
  if (at < 0) at = lines.length;
  lines.splice(at, 0, line);
  return indexHtml.replace(m[0], () => m[1] + lines.join(",\n") + m[3]);
}

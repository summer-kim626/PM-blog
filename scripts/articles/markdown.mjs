// 아티클 마크다운 → 글 HTML (브라우저·Node 공용, 외부 라이브러리 없음)
// - 모든 글자는 먼저 이스케이프한 뒤 정해진 태그만 만든다. 마크다운 안의 HTML 태그는 글자 그대로 보인다.
// - 지원: ## 제목, 문단, 목록(-, 1.), > 인용, 표(|), ``` 코드, ---, **굵게**, *기울임*, `코드`, [링크](url), ![이미지](url)
// - 도형: ```figure 코드 블록에 JSON({ shape, labels, caption })을 넣는다. 그림은 renderFigure(카드뉴스 figures.js)가 그린다.

export const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// javascript: 같은 스킴은 막는다. http(s)·mailto·상대 경로·#만 허용
function safeUrl(u) {
  const t = u.trim();
  if (/^(https?:|mailto:)/i.test(t)) return t;
  if (/^[a-z][a-z0-9+.-]*:/i.test(t)) return "#";
  return t;
}

function inline(src) {
  const codes = [];
  let s = src.replace(/`([^`]+)`/g, (_, c) => `\u0000${codes.push(c) - 1}\u0000`);
  s = esc(s);
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, alt, url) => `<img src="${safeUrl(url)}" alt="${alt}" loading="lazy">`);
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, text, url) => {
    const ext = /^https?:/i.test(url);
    return `<a href="${safeUrl(url)}"${ext ? ' target="_blank" rel="noopener"' : ""}>${text}</a>`;
  });
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>");
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${esc(codes[i])}</code>`);
}

const LIST_RE = /^\s*([-*+]|\d+[.)])\s+/;
function kindOf(line, prev) {
  if (/^#{1,6}\s/.test(line)) return "h";
  if (LIST_RE.test(line) && !/^\s*(-{3,}|\*{3,})\s*$/.test(line)) return "li";
  if (prev === "li" && /^\s{2,}\S/.test(line)) return "li"; // 들여 쓴 줄은 앞 항목에 이어 붙인다
  if (/^\s*>/.test(line)) return "q";
  if (/^\s*\|/.test(line)) return "t";
  return "p";
}

// 본문을 블록 단위로 나눈다. 빈 줄·코드 블록·종류가 바뀌는 곳에서 끊는다.
// 도형 추가 AI는 이 블록 번호로 "몇 번 블록 뒤에 넣을지"를 답한다.
export function splitBlocks(md) {
  const lines = String(md).replace(/\r\n?/g, "\n").split("\n");
  const blocks = [];
  let cur = [], kind = null, fence = null;
  const flush = () => { if (cur.length) blocks.push(cur.join("\n")); cur = []; kind = null; };
  for (const line of lines) {
    if (fence) {
      cur.push(line);
      if (line.trim().startsWith(fence)) { fence = null; flush(); }
      continue;
    }
    const f = line.match(/^\s*(`{3,}|~{3,})/);
    if (f) { flush(); fence = f[1]; cur.push(line); continue; }
    if (!line.trim()) { flush(); continue; }
    const k = kindOf(line, kind);
    if (k === "h" || (kind && k !== kind)) flush();
    cur.push(line);
    kind = k;
    if (k === "h") flush();
  }
  flush();
  return blocks;
}

export const isFigureBlock = b => /^\s*(`{3,}|~{3,})\s*figure\s*$/m.test(b.split("\n")[0]);

// ```figure 블록 → { shape, labels, caption } (형식이 틀리면 null)
export function readFigure(block) {
  if (!isFigureBlock(block)) return null;
  const inner = block.split("\n").slice(1).filter(l => !/^\s*(`{3,}|~{3,})\s*$/.test(l)).join("\n");
  try {
    const f = JSON.parse(inner);
    return f && typeof f.shape === "string" ? { shape: f.shape, labels: Array.isArray(f.labels) ? f.labels.map(String) : [], caption: f.caption ? String(f.caption) : "" } : null;
  } catch { return null; }
}

export const figureBlock = f => "```figure\n" + JSON.stringify({ shape: f.shape, labels: f.labels || [], caption: f.caption || "" }) + "\n```";

function renderTable(lines) {
  const cells = l => l.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map(c => inline(c.trim()));
  if (lines.length < 2 || !/^\s*\|?\s*:?-{2,}/.test(lines[1])) return `<p>${lines.map(inline).join("<br>")}</p>`;
  const head = cells(lines[0]).map(c => `<th>${c}</th>`).join("");
  const rows = lines.slice(2).map(l => `<tr>${cells(l).map(c => `<td>${c}</td>`).join("")}</tr>`).join("\n");
  return `<div class="table-wrap"><table>\n<thead><tr>${head}</tr></thead>\n<tbody>\n${rows}\n</tbody>\n</table></div>`;
}

function renderBlock(block, { renderFigure, preview }) {
  const lines = block.split("\n");
  const first = lines[0];

  const fence = first.match(/^\s*(`{3,}|~{3,})\s*([\w-]*)/);
  if (fence) {
    if (fence[2] === "figure") {
      const f = readFigure(block);
      const svg = f && renderFigure ? renderFigure(f) : null;
      if (!svg) return preview ? `<p class="fig-error">도형을 그리지 못했습니다. \`\`\`figure 블록의 JSON과 shape 이름을 확인하세요.</p>` : "";
      return `<figure class="fig">${svg}${f.caption ? `<figcaption>${esc(f.caption)}</figcaption>` : ""}</figure>`;
    }
    const body = lines.slice(1);
    if (body.length && body[body.length - 1].trim().startsWith(fence[1])) body.pop();
    return `<pre><code>${esc(body.join("\n"))}</code></pre>`;
  }

  const h = first.match(/^(#{1,6})\s+(.*)$/);
  if (h) { const lv = h[1].length <= 2 ? 2 : 3; return `<h${lv}>${inline(h[2].replace(/\s+#+\s*$/, ""))}</h${lv}>`; }

  if (lines.length === 1 && /^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(first)) return "<hr>";

  if (LIST_RE.test(first)) {
    const ordered = /^\s*\d/.test(first);
    const items = [];
    for (const l of lines) {
      if (LIST_RE.test(l)) items.push(l.replace(LIST_RE, ""));
      else if (items.length) items[items.length - 1] += " " + l.trim();
    }
    const tag = ordered ? "ol" : "ul";
    return `<${tag}>\n${items.map(i => `  <li>${inline(i)}</li>`).join("\n")}\n</${tag}>`;
  }

  if (/^\s*>/.test(first)) return `<blockquote>${inline(lines.map(l => l.replace(/^\s*>\s?/, "")).join(" "))}</blockquote>`;
  if (/^\s*\|/.test(first)) return renderTable(lines);

  return `<p>${lines.map(l => inline(l.trim())).join(/ {2}$/.test(first) ? "<br>" : " ")}</p>`;
}

// options.renderFigure(figure) → SVG 문자열 | null, options.preview: 틀린 도형 블록을 오류 문구로 보여 줄지
export function renderMarkdown(md, options = {}) {
  return splitBlocks(md).map(b => renderBlock(b, options)).filter(Boolean).join("\n");
}

// ── 원본 파일(posts/md/<slug>.md): 위쪽 --- 사이에 메타데이터, 아래에 본문 ──
const META_KEYS = ["title", "slug", "category", "description", "tags", "date"];

export function toSource(meta, body) {
  const head = META_KEYS.map(k => `${k}: ${JSON.stringify(meta[k] ?? (k === "tags" ? [] : ""))}`).join("\n");
  return `---\n${head}\n---\n\n${String(body).replace(/\s+$/, "")}\n`;
}

export function parseSource(text) {
  const m = String(text).replace(/\r\n?/g, "\n").match(/^---\n([\s\S]*?)\n---\n?/);
  if (!m) return { meta: {}, body: String(text) };
  const meta = {};
  for (const line of m[1].split("\n")) {
    const kv = line.match(/^(\w+):\s*(.*)$/);
    if (!kv) continue;
    try { meta[kv[1]] = JSON.parse(kv[2]); } catch { meta[kv[1]] = kv[2]; }
  }
  return { meta, body: text.slice(m[0].length).replace(/^\n+/, "") };
}

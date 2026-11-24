// F6 글 상단 AI 3줄 요약
// 글 페이지(posts/<slug>.html)가 불러오면 data/cardnews/<slug>/summary.json 을 읽어
// 리드 문단 아래에 "3줄 요약 + AI 초안" 박스를 넣는다. 파일이 없거나 읽지 못하면 아무것도 그리지 않는다.
// 색은 글 페이지의 :root 토큰(--accent, --accent-soft, --line, --muted)만 쓴다.
// 사용: 글 HTML의 </body> 앞에 <script src="../assets/ai-summary.js" defer></script>
(() => {
  const slug = decodeURIComponent(location.pathname.split("/").pop() || "").replace(/\.html$/, "");
  if (!/^\d{4}-\d{2}-\d{2}-[a-z0-9-]+$/.test(slug)) return;
  const anchor = document.querySelector("article .lead") || document.querySelector("article h1");
  if (!anchor) return;

  const css = `
  .ai-summary { margin: 0 0 32px; padding: 18px 20px 16px; border: 1px solid var(--line);
    border-radius: 12px; background: var(--accent-soft); }
  .ai-summary-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 8px; }
  .ai-summary-head strong { font-size: 15px; letter-spacing: -0.01em; }
  .ai-badge { font-size: 12px; font-weight: 600; color: var(--accent); border: 1px solid currentColor;
    border-radius: 999px; padding: 1px 10px; white-space: nowrap; }
  .ai-summary ol { margin: 0 0 0 20px; padding: 0; font-size: 15px; }
  .ai-summary li { margin-bottom: 4px; }
  .ai-summary li::marker { color: var(--accent); font-weight: 700; }
  .ai-summary .ai-note { margin: 8px 0 0; font-size: 12px; color: var(--muted); }`;

  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text; // AI 문구는 항상 텍스트로만 넣는다
    return n;
  };

  fetch(`../data/cardnews/${slug}/summary.json`, { cache: "no-cache" })
    .then(r => (r.ok ? r.json() : null))
    .then(data => {
      const lines = Array.isArray(data?.summary) ? data.summary.filter(s => typeof s === "string" && s.trim()) : [];
      if (lines.length !== 3) return;

      const style = el("style");
      style.textContent = css;
      document.head.append(style);

      const box = el("aside", "ai-summary");
      box.setAttribute("aria-label", "AI가 만든 3줄 요약");
      const head = el("div", "ai-summary-head");
      head.append(el("strong", null, "3줄 요약"), el("span", "ai-badge", "AI 초안"));
      const ol = el("ol");
      lines.forEach(s => ol.append(el("li", null, s)));
      box.append(head, ol, el("p", "ai-note", "AI가 본문을 바탕으로 만든 요약입니다. 정확한 내용은 본문을 확인해 주세요."));
      anchor.after(box);

      // GTM: 요약이 화면에 보였을 때 한 번만 기록 (PRD 3.4 가설 검증용)
      if ("IntersectionObserver" in window) {
        const io = new IntersectionObserver(entries => {
          if (entries.some(e => e.isIntersecting)) {
            (window.dataLayer = window.dataLayer || []).push({ event: "ai_summary_view", post_slug: slug });
            io.disconnect();
          }
        }, { threshold: 0.5 });
        io.observe(box);
      }
    })
    .catch(() => {}); // 요약은 부가 기능이라 실패해도 글 읽기에 영향을 주지 않는다
})();

// 글 조회수 표시
// data/views.json(GA4 page_view 집계, .github/workflows/update-views.yml이 갱신)을 읽어
// 글 상단 .meta 줄 끝에 "조회수 N"을 붙인다. 파일이 없거나 이 글의 값이 없으면 아무것도 그리지 않는다.
// 사용: 글 HTML의 </body> 앞에 <script src="../assets/post-views.js" defer></script>
(() => {
  const slug = decodeURIComponent(location.pathname.split("/").pop() || "").replace(/\.html$/, "");
  const meta = document.querySelector("article .meta");
  if (!meta || !/^\d{4}-\d{2}-\d{2}-[a-z0-9-]+$/.test(slug)) return;
  fetch("../data/views.json", { cache: "no-cache" })
    .then(r => (r.ok ? r.json() : null))
    .then(data => {
      const n = data && data.views && data.views[slug];
      if (typeof n !== "number") return;
      const span = document.createElement("span");
      span.className = "views";
      span.textContent = `조회수 ${n.toLocaleString("ko-KR")}`;
      if (data.updated_at) span.title = `GA4 집계 · ${new Date(data.updated_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })} 기준`;
      meta.append(span);
    })
    .catch(() => {});
})();

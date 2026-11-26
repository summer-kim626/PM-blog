// 관리자 페이지 "아티클" 탭: 마크다운으로 글 쓰기 → 미리보기 → (GitHub 토큰이 있으면) 발행
// - 발행: 커밋 1개에 posts/<slug>.html(글 페이지) + posts/md/<slug>.md(원본) + index.html(글 목록 항목)
// - figure 추가: Claude가 본문 이해를 돕는 도형과 자리를 고르고, 카드뉴스와 같은 figures.js로 그린다
// - 임시 저장: 작성 중인 글은 이 브라우저 localStorage에만 둔다 (키·토큰은 넣지 않는다)
// - 발행일: 새 글은 [발행]을 누른 날(한국 날짜)로 자동. 수정할 때는 처음 발행일을 그대로 둔다
import { renderMarkdown, toSource, parseSource } from "../scripts/articles/markdown.mjs";
import { postHtml, articleInner, upsertPostEntry, ARTICLE_CSS } from "../scripts/articles/page.mjs";
import { suggestFigures } from "../scripts/articles/figure-ai.mjs";

// 글 페이지와 같은 본문·도형 스타일을 미리보기 영역에만 적용한다 (선택자 앞에 .article-preview)
function scopedArticleCss() {
  return ARTICLE_CSS.replace(/([^{}]+)\{/g, (_, sel) =>
    sel.split(",").map(x => `.article-preview ${x.trim()}`).join(", ") + " {");
}

const DRAFT_KEY = "article.draft";
const VIEW_KEY = "article.view"; // 작성/미리보기 중 마지막으로 본 화면
const SLUG_PART = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const today = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10); // 한국 날짜

export function initArticles(kit) {
  const { $, el, toast, secret, KEYS, gh, commit, checkToken, fromB64Text, getIndexHtml, getPosts, onPublished } = kit;
  const f = {
    title: $("#a-title"), slug: $("#a-slug"), prefix: $("#a-slug-prefix"), cat: $("#a-cat"), desc: $("#a-desc"),
    tags: $("#a-tags"), body: $("#a-body"),
  };
  const preview = $("#a-preview");
  const status = $("#a-status");
  const st = { editing: null, date: null, busy: false, dirty: false, undo: null };
  const style = document.createElement("style");
  style.textContent = scopedArticleCss();
  document.head.append(style);

  // ── 폼 ↔ 메타데이터 ──
  const pubDate = () => st.date || today();
  const fullSlug = () => (st.editing || `${pubDate()}-${f.slug.value.trim()}`);
  function readMeta() {
    return {
      title: f.title.value.trim(),
      slug: fullSlug(),
      category: f.cat.value.trim(),
      description: f.desc.value.trim(),
      tags: [...new Set(f.tags.value.split(/[,，]/).map(t => t.trim().replace(/^#/, "")).filter(Boolean))],
      date: pubDate(),
    };
  }
  function fill(meta, body, editing) {
    st.editing = editing || null;
    f.title.value = meta.title || "";
    f.cat.value = meta.category || "";
    f.desc.value = meta.description || "";
    f.tags.value = (meta.tags || []).join(", ");
    st.date = editing ? meta.date || editing.slice(0, 10) : null;
    f.body.value = body || "";
    if (editing) {
      f.prefix.textContent = editing.slice(0, 11);
      f.slug.value = editing.slice(11);
    } else {
      f.slug.value = meta.slugPart || "";
    }
    f.slug.readOnly = !!editing;
    showMode();
    st.undo = null;
    showStatus();
    syncPrefix();
    draw();
  }
  function syncPrefix() {
    if (!st.editing) f.prefix.textContent = `${today()}-`;
    $("#a-date").textContent = st.editing ? `${pubDate()} (처음 발행일 유지)` : `발행 시 자동 (${today()})`;
  }
  function showMode() {
    $("#a-mode").textContent = st.editing ? `수정 중: posts/${st.editing}.html` : "새 글";
  }

  // ── 작성 ↔ 미리보기 전환 (한 번에 하나만 보여 글쓰기에 집중) ──
  function setView(view, focus) {
    const write = view !== "preview";
    $("#a-write").hidden = !write;
    $("#a-preview-pane").hidden = write;
    for (const b of document.querySelectorAll("[data-view]")) b.setAttribute("aria-pressed", String(b.dataset.view === (write ? "write" : "preview")));
    try { localStorage.setItem(VIEW_KEY, write ? "write" : "preview"); } catch { /* 무시 */ }
    if (write && focus) f.body.focus();
    if (!write) draw();
  }
  for (const b of document.querySelectorAll("[data-view]")) b.addEventListener("click", () => setView(b.dataset.view, true));
  // ⌘/Ctrl + Shift + P 로도 전환
  document.addEventListener("keydown", e => {
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "p" && !$("#panel-articles").hidden) {
      e.preventDefault();
      setView($("#a-write").hidden ? "write" : "preview", true);
    }
  });

  // ── 미리보기 ──
  const renderFigure = fig => window.CardFigures?.render(fig)?.outerHTML || null;
  let drawTimer;
  function draw() {
    clearTimeout(drawTimer);
    drawTimer = setTimeout(() => {
      const meta = readMeta();
      const body = renderMarkdown(f.body.value, { renderFigure, preview: true });
      // 모든 글자는 esc()·inline()에서 이스케이프된 뒤라 innerHTML로 넣어도 태그가 실행되지 않는다
      preview.innerHTML = `<article>${articleInner({ ...meta, title: meta.title || "제목", description: meta.description || "한 줄 설명", category: meta.category || "카테고리" }, body)}</article>`;
      preview.querySelector(".back")?.removeAttribute("href");
    }, 120);
  }

  // ── 임시 저장 ──
  function saveDraft() {
    st.dirty = true;
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ meta: { ...readMeta(), slugPart: f.slug.value }, body: f.body.value, editing: st.editing, saved_at: Date.now() })); } catch { /* 저장 불가: 무시 */ }
  }
  function loadDraft() {
    try { return JSON.parse(localStorage.getItem(DRAFT_KEY) || "null"); } catch { return null; }
  }
  function clearDraft() { st.dirty = false; try { localStorage.removeItem(DRAFT_KEY); } catch { /* 무시 */ } }

  for (const input of Object.values(f)) {
    if (!input || input === f.prefix) continue;
    input.addEventListener("input", () => { saveDraft(); draw(); });
  }
  // 탭 키로 들여쓰기 대신 다음 칸으로 가는 기본 동작을 그대로 둔다 (키보드 사용자가 갇히지 않게)

  // ── 상태 표시 ──
  function showStatus(text, kind, extra) {
    status.className = `art-status${kind ? " " + kind : ""}`;
    status.replaceChildren();
    if (text) status.append(text);
    if (extra) status.append(" ", extra);
  }
  function updateButtons() {
    const hasAi = !!secret.get(KEYS.ai), hasGh = !!secret.get(KEYS.github);
    const fig = $("#a-figure"), pub = $("#a-publish");
    fig.disabled = st.busy;
    pub.disabled = st.busy;
    fig.title = hasAi ? "" : "Claude API 키가 필요합니다";
    pub.title = hasGh ? "" : "GitHub 토큰이 필요합니다";
    $("#a-need").textContent = [!hasAi && "figure 추가: Claude API 키 필요", !hasGh && "발행: GitHub 토큰 필요"].filter(Boolean).join(" · ");
  }
  function needKey(which) {
    $("#keys").open = true;
    (which === "ai" ? $("#ai-key") : $("#gh-token")).focus();
    toast(which === "ai" ? "먼저 Claude API 키를 입력하세요" : "발행하려면 GitHub 토큰을 입력하세요");
  }

  // ── 글 목록 (불러오기) ──
  function fillPicker() {
    const pick = $("#a-pick");
    const cur = pick.value;
    pick.replaceChildren(el("option", null, "기존 글 불러오기…"));
    pick.firstChild.value = "";
    for (const p of getPosts()) {
      const o = el("option", null, `${p.date} · ${p.title}`);
      o.value = p.slug;
      pick.append(o);
    }
    pick.value = cur;
    const cats = [...new Set(getPosts().map(p => p.cat).filter(Boolean))];
    $("#a-cats").replaceChildren(...cats.map(c => { const o = el("option"); o.value = c; return o; }));
  }

  async function openExisting(slug) {
    if (st.dirty && !confirm("작성 중인 내용이 사라집니다. 불러올까요?")) { $("#a-pick").value = ""; return; }
    try {
      const r = await fetch(`../posts/md/${slug}.md`, { cache: "no-cache" });
      if (r.status === 404) { toast("마크다운 원본이 없는 글(직접 만든 HTML)이라 여기서 고칠 수 없습니다"); return; }
      if (!r.ok) throw new Error(r.status);
      const { meta, body } = parseSource(await r.text());
      fill(meta, body, slug);
      clearDraft();
      toast("글을 불러왔습니다");
    } catch (e) {
      toast(`불러오지 못했습니다 (${e.message})`);
    } finally {
      $("#a-pick").value = "";
    }
  }
  $("#a-pick").addEventListener("change", e => e.target.value && openExisting(e.target.value));
  $("#a-new").addEventListener("click", () => {
    if (st.dirty && !confirm("작성 중인 내용을 지우고 새 글을 시작할까요?")) return;
    clearDraft();
    fill({}, "", null);
    f.title.focus();
  });

  // ── figure 추가 ──
  $("#a-figure").addEventListener("click", async () => {
    const apiKey = secret.get(KEYS.ai);
    if (!apiKey) return needKey("ai");
    const before = f.body.value;
    st.busy = true;
    updateButtons();
    const btn = $("#a-figure");
    btn.textContent = "figure 고르는 중…";
    showStatus("Claude가 본문을 읽고 도형 자리를 고르는 중… (최대 2분)", "busy");
    try {
      const r = await suggestFigures({ title: f.title.value.trim(), markdown: before }, { apiKey, log: m => showStatus(m, "busy") });
      if (f.body.value !== before) throw new Error("기다리는 동안 본문이 바뀌어 넣지 않았습니다. 다시 눌러 주세요");
      if (!r.figures.length) {
        showStatus(`도형을 넣을 만한 곳을 찾지 못했습니다.${r.warnings.length ? ` (${r.warnings.join(" / ")})` : ""}`, "warn");
        return;
      }
      st.undo = before;
      f.body.value = r.markdown;
      saveDraft();
      draw();
      const undo = el("button", "linkish", "되돌리기");
      undo.type = "button";
      undo.addEventListener("click", () => {
        if (st.undo == null) return;
        f.body.value = st.undo;
        st.undo = null;
        saveDraft();
        draw();
        showStatus("도형 추가를 되돌렸습니다.");
      });
      showStatus(`도형 ${r.figures.length}개를 넣었습니다 (${r.figures.map(x => x.shape).join(", ")} · ${r.model}). 위치와 라벨을 검토하세요.${r.warnings.length ? ` 경고: ${r.warnings.join(" / ")}` : ""}`, r.warnings.length ? "warn" : "ok", undo);
      setView("preview");
      setTimeout(() => preview.querySelector(".fig")?.scrollIntoView({ block: "center", behavior: "smooth" }), 200);
    } catch (e) {
      showStatus(`도형을 만들지 못했습니다: ${e.message}`, "failed");
    } finally {
      st.busy = false;
      btn.textContent = "figure 추가";
      updateButtons();
    }
  });

  // ── 발행 ──
  function validate(meta) {
    if (!meta.title) return [f.title, "제목을 입력하세요"];
    if (!st.editing && !SLUG_PART.test(f.slug.value.trim())) return [f.slug, "슬러그는 영문 소문자·숫자·하이픈(-)만 씁니다 (예: user-interview)"];
    if (!meta.category) return [f.cat, "카테고리를 입력하세요"];
    if (!meta.description) return [f.desc, "한 줄 설명을 입력하세요"];
    if (/[{}]/.test(meta.title + meta.description + meta.category)) return [f.title, "제목·설명·카테고리에는 중괄호({ })를 쓸 수 없습니다"];
    if (f.body.value.trim().length < 50) return [f.body, "본문을 50자 이상 쓰세요"];
    return null;
  }

  async function exists(token, path, head) {
    try { await gh(token, `/contents/${path}?ref=${head}`); return true; }
    catch (e) { if (e.status === 404) return false; throw e; }
  }

  $("#art-form").addEventListener("submit", async e => {
    e.preventDefault();
    if (st.busy) return;
    const token = secret.get(KEYS.github);
    if (!token) return needKey("github");
    syncPrefix(); // 자정을 넘겨 열어 둔 경우에도 누른 날짜로
    const meta = readMeta();
    const bad = validate(meta);
    if (bad) { bad[0].focus(); toast(bad[1]); return; }
    const editing = st.editing;
    if (!confirm(`${editing ? "수정한 글을" : "새 글을"} 블로그에 발행할까요?\n\nposts/${meta.slug}.html · 발행일 ${meta.date}\n바로 main 브랜치에 커밋되어 1~2분 뒤 공개됩니다.`)) return;

    st.busy = true;
    updateButtons();
    $("#a-publish").textContent = "발행 중…";
    showStatus("GitHub 토큰 확인 중…", "busy");
    try {
      await checkToken(token);
      const body = f.body.value;
      const page = postHtml(meta, renderMarkdown(body, { renderFigure }));
      let newIndex = "";
      showStatus("GitHub에 올리는 중…", "busy");
      const sha = await commit(token, `chore(article): ${meta.slug} 글 ${editing ? "수정" : "발행"}`, async head => {
        if (!editing && await exists(token, `posts/${meta.slug}.html`, head)) {
          throw new Error(`posts/${meta.slug}.html 이 이미 있습니다. 슬러그나 발행일을 바꾸세요`);
        }
        const idx = await gh(token, `/contents/index.html?ref=${head}`);
        newIndex = upsertPostEntry(fromB64Text(idx.content), meta);
        return [
          { path: `posts/${meta.slug}.html`, text: page },
          { path: `posts/md/${meta.slug}.md`, text: toSource(meta, body) },
          { path: "index.html", text: newIndex },
        ];
      });
      clearDraft();
      st.editing = meta.slug;
      st.date = meta.date;
      f.slug.readOnly = true;
      f.prefix.textContent = meta.slug.slice(0, 11);
      showMode();
      syncPrefix();
      onPublished(newIndex);
      fillPicker();
      const link = el("a", null, "글 보기 ↗");
      link.href = `../posts/${meta.slug}.html`;
      link.target = "_blank";
      link.rel = "noopener";
      showStatus(`발행했습니다 (${sha.slice(0, 7)}). 블로그 반영까지 1~2분 걸립니다.`, "ok", link);
      toast(editing ? "글을 수정했습니다" : "글을 발행했습니다");
    } catch (err) {
      showStatus(`발행하지 못했습니다: ${err.message}`, "failed");
    } finally {
      st.busy = false;
      $("#a-publish").textContent = "발행";
      updateButtons();
    }
  });

  window.addEventListener("beforeunload", e => { if (st.busy) e.preventDefault(); });

  // ── 시작 ──
  const draft = loadDraft();
  if (draft) {
    fill(draft.meta || {}, draft.body || "", draft.editing);
    st.dirty = true;
    showStatus("이 브라우저에 임시 저장된 글을 불러왔습니다.");
  } else {
    fill({}, "", null);
  }
  updateButtons();
  let lastView = "write";
  try { lastView = localStorage.getItem(VIEW_KEY) || "write"; } catch { /* 무시 */ }
  setView(lastView);

  return {
    refresh() { fillPicker(); updateButtons(); },
    keysChanged: updateButtons,
  };
}

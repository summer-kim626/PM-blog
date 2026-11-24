// F3 결과 검증 (AGENTS.md 3장)
// - errors: 구조가 틀려 카드를 만들 수 없음 → 재시도 / 실패 처리
// - warnings: 만들 수는 있지만 규칙을 어김(글자 수 등) → 기록만 하고 진행

export const SHAPES = [
  "versus", "link", "contrast", "tree", "steps", "cycle", "diverge",
  "converge", "checklist", "magnifier", "bulb", "chart", "target", "doc",
];
export const LIMITS = { headline: 20, body: 60, sub: 30, summary: 40, label: 6 };

const isStr = v => typeof v === "string" && v.trim().length > 0;

export function validate(data) {
  const errors = [];
  const warnings = [];
  const warn = (where, msg) => warnings.push(`${where}: ${msg}`);

  if (!data || typeof data !== "object" || Array.isArray(data)) return { errors: ["JSON 객체가 아닙니다"], warnings };

  // 요약 3줄
  if (!Array.isArray(data.summary) || data.summary.length !== 3 || !data.summary.every(isStr)) {
    errors.push("summary는 문자열 3개여야 합니다");
  } else {
    data.summary.forEach((s, i) => s.length > LIMITS.summary && warn(`summary[${i}]`, `${s.length}자 (최대 ${LIMITS.summary})`));
  }

  // 카드: cover 1 + point 3~5 + cta 1
  const cards = data.cards;
  if (!Array.isArray(cards) || cards.length < 5 || cards.length > 7) {
    errors.push(`cards는 5~7장이어야 합니다 (현재 ${Array.isArray(cards) ? cards.length : "없음"})`);
  } else {
    if (cards[0]?.type !== "cover") errors.push("첫 카드는 cover여야 합니다");
    if (cards.at(-1)?.type !== "cta") errors.push("마지막 카드는 cta여야 합니다");
    if (!cards.slice(1, -1).every(c => c?.type === "point")) errors.push("가운데 카드는 모두 point여야 합니다");

    let prevShape = null;
    cards.forEach((c, i) => {
      const where = `cards[${i}]`;
      if (!c || !isStr(c.headline)) { errors.push(`${where}.headline이 없습니다`); return; }
      for (const key of ["headline", "body", "sub"]) {
        if (c[key] != null && typeof c[key] !== "string") errors.push(`${where}.${key}는 문자열이어야 합니다`);
        else if (c[key] && c[key].length > LIMITS[key]) warn(`${where}.${key}`, `${c[key].length}자 (최대 ${LIMITS[key]})`);
      }
      if (c.type === "point" && !isStr(c.body)) warn(where, "point 카드에 body가 없습니다");

      // 도형: 모르는 이름은 지우고(도형 없이 렌더링) 경고만 남긴다
      if (c.figure != null) {
        const shape = c.figure?.shape;
        if (!SHAPES.includes(shape)) {
          warn(`${where}.figure`, `모르는 도형 "${shape}"을 뺐습니다`);
          delete c.figure;
        } else {
          if (c.figure.labels != null && !Array.isArray(c.figure.labels)) {
            warn(`${where}.figure.labels`, "배열이 아니라 뺐습니다");
            delete c.figure.labels;
          }
          (c.figure.labels || []).forEach((lb, k) => {
            if (String(lb).length > LIMITS.label) warn(`${where}.figure.labels[${k}]`, `${String(lb).length}자 (최대 ${LIMITS.label})`);
          });
          if (shape === prevShape) warn(`${where}.figure`, `"${shape}"를 연달아 썼습니다`);
        }
      }
      prevShape = c.figure?.shape ?? null;
    });
  }

  if (!isStr(data.caption)) errors.push("caption이 없습니다");

  if (!Array.isArray(data.hashtags) || !data.hashtags.every(isStr)) {
    errors.push("hashtags는 문자열 배열이어야 합니다");
  } else {
    data.hashtags = data.hashtags.map(t => (t.startsWith("#") ? t : `#${t}`).replace(/\s+/g, ""));
    if (data.hashtags.length < 5 || data.hashtags.length > 10) warn("hashtags", `${data.hashtags.length}개 (5~10개)`);
  }

  return { errors, warnings };
}

// 카드뉴스 도형 라이브러리
// - AI는 그림을 직접 그리지 않고, 아래 목록에서 카드 내용에 맞는 도형 이름과 짧은 라벨만 고른다.
// - 모든 도형은 800×480 viewBox 안에 그린다. 선은 .s(본색)·.a(강조색) 두 가지만 쓴다.
// - 라벨은 textContent로만 넣는다 (AI 출력에 태그가 섞여도 그대로 글자로 보임).
(function () {
  const NS = "http://www.w3.org/2000/svg";

  function s(tag, attrs = {}, ...kids) {
    const n = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    for (const k of kids) if (k != null && k !== "") n.append(k);
    return n;
  }
  const line = (x1, y1, x2, y2, cls = "s") => s("line", { x1, y1, x2, y2, class: cls });
  const path = (d, cls = "s") => s("path", { d, class: cls });
  const circle = (cx, cy, r, cls = "s") => s("circle", { cx, cy, r, class: cls });
  // 라벨: accent=true면 강조색, anchor로 정렬
  const label = (x, y, text, { accent = false, anchor = "middle", size } = {}) =>
    text ? s("text", { x, y, class: accent ? "lb la" : "lb", "text-anchor": anchor,
      "dominant-baseline": "central", ...(size ? { style: `font-size:${size}px` } : {}) }, String(text)) : null;
  // 화살촉: (x, y)가 끝점, ang은 진행 방향(라디안)
  function head(x, y, ang, cls = "s", len = 34) {
    const p = d => `${x + len * Math.cos(ang + d)},${y + len * Math.sin(ang + d)}`;
    return s("polyline", { points: `${p(Math.PI * 0.8)} ${x},${y} ${p(-Math.PI * 0.8)}`, class: cls });
  }
  const angle = (fx, fy, tx, ty) => Math.atan2(ty - fy, tx - fx);

  const SHAPES = {
    // 두 가지를 비교·대조 (A vs B)
    versus: L => [
      circle(185, 240, 135), circle(615, 240, 135, "a"),
      label(400, 240, "vs", { size: 64 }),
      label(185, 240, L[0]), label(615, 240, L[1], { accent: true }),
    ],
    // 두 가지를 잇는 연결·관계 (A ─ B)
    link: L => [
      circle(150, 240, 125), circle(650, 240, 125),
      line(275, 240, 525, 240, "a thick"),
      label(150, 240, L[0]), label(650, 240, L[1]), label(400, 185, L[2], { accent: true }),
    ],
    // 꾸준함과 유연함, 실선과 점선 (고정 vs 변화)
    contrast: L => [
      line(250, 50, 250, 380, "s thick"),
      line(550, 50, 550, 380, "a dash"),
      label(250, 440, L[0]), label(550, 440, L[1], { accent: true }),
    ],
    // 뿌리에서 뻗어나가는 생각·성장
    tree: () => {
      const br = [[400, 270, 400, 70], [400, 270, 290, 170], [400, 270, 510, 170],
        [400, 180, 320, 105], [400, 180, 480, 105], [290, 170, 215, 210], [510, 170, 585, 210]];
      return [
        path("M400 470 C 392 410, 408 330, 400 270", "a"),
        ...br.map(([a, b, c, d]) => line(a, b, c, d)),
        ...br.map(([, , c, d]) => circle(c, d, 22, "s bud")),
      ];
    },
    // 단계적 성장·프로세스 (계단)
    steps: L => [
      path("M90 430 H 270 V 320 H 450 V 210"),
      path("M450 210 H 630 V 100 H 710", "a"),
      head(710, 100, 0, "a"),
      label(180, 385, L[0]), label(360, 275, L[1]), label(540, 165, L[2], { accent: true }),
    ],
    // 반복·피드백·회고 (순환)
    cycle: L => {
      const cx = 400, cy = 250, r = 150, rad = d => d * Math.PI / 180;
      const pt = (d, rr = r) => [cx + rr * Math.cos(rad(d)), cy + rr * Math.sin(rad(d))];
      const nodes = [-90, 30, 150];
      const out = [];
      nodes.forEach((a, i) => {
        const [x1, y1] = pt(a + 14), [x2, y2] = pt(a + 106);
        const cls = i === 2 ? "a" : "s";
        out.push(path(`M${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2}`, cls));
        out.push(head(x2, y2, rad(a + 106 + 90), cls));
      });
      const lp = [[400, 50], [598, 360], [202, 360]];
      nodes.forEach((a, i) => out.push(label(lp[i][0], lp[i][1], L[i], { accent: i === 0 })));
      return out;
    },
    // 하나에서 여러 갈래로 확장 (선택지·아이디어)
    diverge: L => {
      const o = [400, 450];
      const ends = [[150, 130, 200, 250], [400, 110, 400, 300], [650, 130, 600, 250]];
      const out = [];
      ends.forEach(([x, y, c1x, c1y], i) => {
        const cls = i === 1 ? "a" : "s";
        out.push(path(`M${o[0]} ${o[1]} C ${o[0]} 330, ${c1x} ${c1y}, ${x} ${y}`, cls));
        out.push(head(x, y, angle(c1x, c1y, x, y), cls));
        out.push(label(x, y - 60, L[i], { accent: i === 1 }));
      });
      return out;
    },
    // 여러 갈래를 하나로 모으기 (집중·우선순위)
    converge: L => {
      const starts = [[150, 80, 200, 260, 360, 330], [400, 80, 400, 200, 400, 340], [650, 80, 600, 260, 440, 330]];
      const out = [];
      starts.forEach(([x, y, cx, cy, ex, ey], i) => {
        out.push(path(`M${x} ${y} C ${cx} ${cy}, ${ex} ${ey - 40}, ${ex} ${ey}`));
        out.push(head(ex, ey, angle(ex, ey - 40, ex, ey)));
        out.push(label(x, y - 45, L[i]));
      });
      out.push(circle(400, 400, 26, "a fill"));
      out.push(label(400, 460, L[3], { accent: true }));
      return out;
    },
    // 원칙·체크리스트
    checklist: L => [0, 1, 2].flatMap(i => {
      const y = 100 + i * 140;
      return [
        s("rect", { x: 110, y: y - 45, width: 90, height: 90, rx: 14, class: "s" }),
        s("polyline", { points: `${128},${y} ${150},${y + 24} ${186},${y - 26}`, class: "a" }),
        L[i] ? label(250, y, L[i], { anchor: "start" }) : line(250, y, 690, y),
      ];
    }),
    // 조사·분석·문제 찾기 (돋보기)
    magnifier: L => [
      circle(340, 210, 150),
      line(450, 320, 600, 460, "a thick"),
      label(340, 210, L[0]),
    ],
    // 아이디어·깨달음 (전구)
    bulb: () => [
      path("M335 310 C 250 260, 250 70, 400 60 C 550 70, 550 260, 465 310 L 465 360 L 335 360 Z"),
      line(355, 400, 445, 400), line(375, 440, 425, 440),
      line(400, 150, 400, 250, "a"), line(360, 180, 400, 150, "a"), line(440, 180, 400, 150, "a"),
      line(170, 190, 220, 190, "a"), line(580, 190, 630, 190, "a"),
      line(215, 60, 250, 95, "a"), line(585, 60, 550, 95, "a"),
    ],
    // 데이터·지표·성장 (막대 그래프)
    chart: L => [
      path("M110 40 V 400 H 710"),
      s("rect", { x: 190, y: 280, width: 100, height: 120, rx: 8, class: "s" }),
      s("rect", { x: 350, y: 200, width: 100, height: 200, rx: 8, class: "s" }),
      s("rect", { x: 510, y: 90, width: 100, height: 310, rx: 8, class: "a" }),
      label(240, 445, L[0]), label(400, 445, L[1]), label(560, 445, L[2], { accent: true }),
    ],
    // 목표·핵심 하나에 집중 (과녁)
    target: L => [
      circle(360, 250, 200), circle(360, 250, 130), circle(360, 250, 60, "a"),
      line(700, 40, 410, 215, "a"), head(410, 215, angle(700, 40, 410, 215), "a"),
      label(640, 400, L[0], { accent: true }),
    ],
    // 기록·글쓰기 (문서)
    doc: () => [
      path("M250 40 H 500 L 570 110 V 440 H 250 Z"),
      path("M500 40 V 110 H 570"),
      line(310, 170, 500, 170, "a thick"),
      line(310, 250, 510, 250), line(310, 320, 470, 320), line(310, 390, 490, 390),
    ],
  };

  // 도형 이름 → <svg>. 모르는 이름이면 null
  function render(figure) {
    const fn = figure && SHAPES[figure.shape];
    if (!fn) return null;
    const labels = Array.isArray(figure.labels) ? figure.labels : [];
    return s("svg", { viewBox: "0 0 800 480", preserveAspectRatio: "xMidYMid meet", "aria-hidden": "true" },
      ...fn(labels));
  }

  window.CardFigures = { render, names: Object.keys(SHAPES), MAX_LABEL: 6 };
})();

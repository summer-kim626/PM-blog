// F2 → F3 → F4 한 번에 실행: 글 1편 → data/cardnews/<slug>/summary.json + card-NN.png
// 사용: npm run cardnews -- posts/2026-11-18-start-pm-blog.html
//   --skip-ai  AI를 부르지 않고 이미 있는 summary.json으로 PNG만 다시 그린다
// 실패하면 빈 결과를 남기지 않고 종료 코드 1로 끝낸다 (AGENTS.md 3-2).
import { writeFile, mkdir, access } from "node:fs/promises";
import path from "node:path";
import { extractPost, ROOT } from "./extract.mjs";
import { generate } from "./generate.mjs";
import { render } from "./render.mjs";

const args = process.argv.slice(2);
const skipAi = args.includes("--skip-ai");
const files = args.filter(a => !a.startsWith("--"));
if (!files.length) {
  console.error("사용법: npm run cardnews -- posts/<파일>.html [--skip-ai]");
  process.exit(1);
}
if (!skipAi && !process.env.GEMINI_API_KEY) {
  console.error("::error::GEMINI_API_KEY 가 없습니다. .env 파일이나 환경 변수로 설정하세요.");
  process.exit(1);
}

let failed = 0;
for (const file of files) {
  const t0 = Date.now();
  try {
    console.log(`\n▶ ${file}`);
    const post = await extractPost(file);                                   // F2
    console.log(`  F2 추출: "${post.title}" (${post.text.length}자, 카테고리 ${post.category || "없음"})`);

    const dir = path.join("data", "cardnews", post.slug);
    const json = path.join(dir, "summary.json");
    let warnings = [];

    if (skipAi) {
      await access(path.join(ROOT, json)).catch(() => { throw new Error(`${json}이 없어 --skip-ai를 쓸 수 없습니다`); });
      console.log(`  F3 건너뜀: 기존 ${json} 사용`);
    } else {
      const { result, warnings: w, attempts } = await generate(post, { log: console.log }); // F3
      warnings = w;
      await mkdir(path.join(ROOT, dir), { recursive: true });
      await writeFile(path.join(ROOT, json), JSON.stringify(result, null, 2) + "\n");
      console.log(`  F3 생성: 카드 ${result.cards.length}장, 호출 ${attempts}회 → ${json}`);
    }

    const { files: pngs, warnings: renderWarnings } = await render(json, dir); // F4
    console.log(`  F4 렌더링: PNG ${pngs.length}장 → ${dir}/`);

    const all = [...warnings, ...renderWarnings.map(w => `카드 ${w.index}: ${w.type}${w.field ? ` ${w.field} ${w.length}/${w.max}자` : ""}${w.shape ? ` ${w.shape}` : ""}`)];
    all.forEach(w => console.log(`  ⚠ ${w}`));
    console.log(`  완료 (${((Date.now() - t0) / 1000).toFixed(1)}초)${all.length ? `, 경고 ${all.length}건` : ""}`);
  } catch (e) {
    failed++;
    console.error(`::error::${file}: ${e.message}`);
  }
}
process.exit(failed ? 1 : 0);

// F2 → F3 → F4 → F5 한 번에 실행: 글 → data/cardnews/<slug>/summary.json + card-NN.png
// 사용: npm run cardnews -- posts/2026-11-18-start-pm-blog.html [다른 글 …]
//   --skip-ai  AI를 부르지 않고 이미 있는 summary.json으로 PNG만 다시 그린다
// 결과와 상관없이 글마다 data/cardnews/index.json에 상태(done·warning·failed)를 남긴다 (F5).
// 실패하면 그 글의 결과 파일은 이전 상태로 되돌리고(빈 결과를 남기지 않음) 종료 코드 1로 끝낸다.
import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { extractPost, ROOT } from "./extract.mjs";
import { generate } from "./generate.mjs";
import { render } from "./render.mjs";
import { formatRenderWarning } from "./validate.mjs";

const INDEX = path.join(ROOT, "data", "cardnews", "index.json");

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

const readText = f => readFile(f, "utf8").catch(() => null);

// index.json: { "<slug>": { status, generated_at, updated_at, cards, warnings, error } }
async function updateIndex(slug, entry) {
  const index = JSON.parse((await readText(INDEX)) || "{}");
  index[slug] = { ...entry, updated_at: new Date().toISOString() };
  const sorted = Object.fromEntries(Object.entries(index).sort(([a], [b]) => a.localeCompare(b)));
  await mkdir(path.dirname(INDEX), { recursive: true });
  await writeFile(INDEX, JSON.stringify(sorted, null, 2) + "\n");
}

let failed = 0;
for (const file of files) {
  const t0 = Date.now();
  const slug = path.basename(file, ".html");
  const dir = path.join("data", "cardnews", slug);
  const json = path.join(dir, "summary.json");
  const jsonAbs = path.join(ROOT, json);
  const prevJson = await readText(jsonAbs); // 실패하면 이 상태로 되돌린다

  try {
    console.log(`\n▶ ${file}`);
    const post = await extractPost(file);                                    // F2
    console.log(`  F2 추출: "${post.title}" (${post.text.length}자, 카테고리 ${post.category || "없음"})`);

    let warnings = [];
    if (skipAi) {
      if (!prevJson) throw new Error(`${json}이 없어 --skip-ai를 쓸 수 없습니다`);
      console.log(`  F3 건너뜀: 기존 ${json} 사용`);
    } else {
      const { result, warnings: w, attempts } = await generate(post, { log: console.log }); // F3
      warnings = w;
      await mkdir(path.join(ROOT, dir), { recursive: true });
      await writeFile(jsonAbs, JSON.stringify(result, null, 2) + "\n");
      console.log(`  F3 생성: 카드 ${result.cards.length}장, 호출 ${attempts}회, 모델 ${result.model} → ${json}`);
    }

    const { files: pngs, warnings: renderWarnings } = await render(json, dir); // F4
    console.log(`  F4 렌더링: PNG ${pngs.length}장 → ${dir}/`);

    const all = [...warnings, ...renderWarnings.map(formatRenderWarning)];
    all.forEach(w => console.log(`::warning::${slug} ${w}`));

    const summary = JSON.parse(await readFile(jsonAbs, "utf8"));
    await updateIndex(slug, {                                                  // F5
      status: all.length ? "warning" : "done",
      generated_at: summary.generated_at,
      cards: pngs.length,
      warnings: all,
      error: null,
    });
    console.log(`  F5 상태: ${all.length ? `warning (경고 ${all.length}건)` : "done"} → data/cardnews/index.json`);
    console.log(`  완료 (${((Date.now() - t0) / 1000).toFixed(1)}초)`);
  } catch (e) {
    failed++;
    console.error(`::error::${file}: ${e.message}`);
    // F3는 됐는데 F4에서 실패한 경우 등: 새로 쓴 summary.json을 이전 상태로 되돌린다
    if (!skipAi) {
      if (prevJson) await writeFile(jsonAbs, prevJson);
      else await rm(jsonAbs, { force: true });
    }
    const prev = JSON.parse((await readText(INDEX)) || "{}")[slug];
    await updateIndex(slug, {
      status: "failed",
      generated_at: prev?.generated_at ?? null, // 이전에 성공한 결과가 있으면 그 시각을 남긴다
      cards: prev?.cards ?? 0,
      warnings: [],
      error: e.message.replaceAll(ROOT + path.sep, "").slice(0, 300), // 실행 환경의 절대 경로는 남기지 않는다
    });
  }
}
process.exit(failed ? 1 : 0);

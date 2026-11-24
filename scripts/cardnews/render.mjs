// F4 카드 렌더링: summary.json → card-01.png … (1080×1350)
// 저장소 루트를 임시 HTTP 서버로 띄우고, cardnews/template.html?capture 를 헤드리스 Chrome으로 열어
// .card 요소를 한 장씩 캡처한다. 브라우저는 내려받지 않고 설치된 Chrome을 쓴다(CHROME_PATH로 지정 가능).
// 사용: node scripts/cardnews/render.mjs <summary.json 경로> <출력 폴더>
import http from "node:http";
import { readFile, mkdir, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { ROOT } from "./extract.mjs";

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".json": "application/json", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml" };

// 저장소 안의 파일만 읽기 전용으로 내보내는 서버 (127.0.0.1, 임의 포트)
function serve(root) {
  const server = http.createServer(async (req, res) => {
    try {
      const rel = decodeURIComponent(new URL(req.url, "http://x").pathname);
      const file = path.join(root, path.normalize(rel));
      if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
      const body = await readFile(file);
      res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" }).end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
  return new Promise(resolve => server.listen(0, "127.0.0.1", () => resolve(server)));
}

export async function render(srcJson, outDir, { timeout = 30000 } = {}) {
  const src = path.resolve(ROOT, srcJson);
  if (!src.startsWith(ROOT + path.sep)) throw new Error(`JSON은 저장소 안에 있어야 합니다: ${srcJson}`);
  const out = path.resolve(ROOT, outDir);
  await mkdir(out, { recursive: true });

  const server = await serve(ROOT);
  const base = `http://127.0.0.1:${server.address().port}`;
  const srcUrl = "/" + path.relative(ROOT, src).split(path.sep).join("/");

  const browser = await chromium.launch(
    process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: "chrome" }
  );
  try {
    const page = await browser.newPage({ viewport: { width: 1080, height: 1350 }, deviceScaleFactor: 1 });
    await page.goto(`${base}/cardnews/template.html?capture&src=${encodeURIComponent(srcUrl)}`);
    await page.waitForFunction(() => window.__CARDS_READY || window.__CARDS_ERROR, null, { timeout });
    const error = await page.evaluate(() => window.__CARDS_ERROR);
    if (error) throw new Error(`템플릿 오류: ${error}`);

    const cards = await page.$$(".card");
    if (cards.length < 5 || cards.length > 7) throw new Error(`카드가 ${cards.length}장입니다 (5~7장)`);

    // 이전 결과가 더 많은 장이었을 수 있으므로 기존 카드 PNG를 먼저 지운다
    for (const f of await readdir(out)) if (/^card-\d+\.png$/.test(f)) await rm(path.join(out, f));

    const files = [];
    for (let i = 0; i < cards.length; i++) {
      const file = path.join(out, `card-${String(i + 1).padStart(2, "0")}.png`);
      await cards[i].screenshot({ path: file });
      files.push(file.startsWith(ROOT + path.sep) ? path.relative(ROOT, file) : file);
    }
    const warnings = await page.evaluate(() => window.__CARD_WARNINGS || []);
    return { files, warnings };
  } finally {
    await browser.close();
    server.close();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [src, out] = process.argv.slice(2);
  if (!src || !out) { console.error("사용법: node scripts/cardnews/render.mjs <summary.json> <출력 폴더>"); process.exit(1); }
  try {
    const { files, warnings } = await render(src, out);
    console.log(`PNG ${files.length}장: ${files.join(", ")}`);
    warnings.forEach(w => console.warn("경고", JSON.stringify(w)));
  } catch (e) {
    console.error(`::error::${e.message}`);
    process.exit(1);
  }
}

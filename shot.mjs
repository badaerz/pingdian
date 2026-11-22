// 视觉验收用截图器：给定 HTML 与视口，输出 PNG 到 shots/
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const [, , file, ...rest] = process.argv;
if (!file) { console.error("用法: node shot.mjs <html> [1440x900] [375x812]"); process.exit(1); }
const sizes = (rest.length ? rest : ["1440x900"]).map((s) => s.split("x").map(Number));

const outDir = path.join(process.cwd(), "shots");
await mkdir(outDir, { recursive: true });

const browser = await chromium.launch();
for (const [width, height] of sizes) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  await page.goto("file://" + path.resolve(file));
  await page.waitForTimeout(4200); // 等入场动效走完
  const name = `${path.basename(file, ".html")}-${width}.png`;
  await page.screenshot({ path: path.join(outDir, name), fullPage: height === 0 });
  console.log(path.join(outDir, name));
  await page.close();
}
await browser.close();

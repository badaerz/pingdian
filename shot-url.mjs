// 抓本地站点截图：node shot-url.mjs http://localhost:3000 1440x900 390x844
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const [, , url, ...sizes] = process.argv;
const outDir = path.join(process.cwd(), "shots");
await mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ args: ["--no-sandbox"] });
for (const spec of (sizes.length ? sizes : ["1440x900"])) {
  const [width, height] = spec.split("x").map(Number);
  const page = await browser.newPage({ viewport: { width, height } });
  const errors = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 120)); });
  await page.goto(url, { waitUntil: "networkidle", timeout: 60000 }).catch((e) => console.log("goto:", String(e).slice(0, 80)));
  await page.waitForTimeout(4500);
  await page.screenshot({ path: path.join(outDir, `local-${width}.png`) });
  console.log("shot", width, errors.length ? `errors=${errors.join(" | ")}` : "no console errors");
  await page.close();
}
await browser.close();

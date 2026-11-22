// 抓真实站点截图：用于研究获奖作品的版面与动效
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const sites = process.argv.slice(2);
const outDir = path.join(process.cwd(), "refs");
await mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ args: ["--no-sandbox"] });
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
  userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  locale: "en-US",
});
for (const site of sites) {
  const page = await ctx.newPage();
  const name = new URL(site).hostname.replace(/\./g, "_");
  try {
    await page.goto(site, { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForTimeout(14000);
    await page.screenshot({ path: path.join(outDir, `${name}-1.png`) });
    // 往下滚一屏，看第二节
    await page.mouse.wheel(0, 900);
    await page.waitForTimeout(5000);
    await page.screenshot({ path: path.join(outDir, `${name}-2.png`) });
    console.log("OK", site);
  } catch (error) {
    console.log("FAIL", site, String(error).slice(0, 120));
  } finally {
    await page.close();
  }
}
await browser.close();

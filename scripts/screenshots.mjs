// Drives the built app in headless Chromium with a fake microphone and saves a screenshot of each screen.
// Run `npm run build` first, then `npm run screenshots`. Needs: npx playwright install chromium (once).
// The app is served from memory under a fake address, so no port is opened.
import { chromium } from "playwright-core";
import { mkdir, readFile, stat } from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const out = join(root, "screenshots");
const types = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".wasm": "application/wasm", ".json": "application/json" };

await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", "--autoplay-policy=no-user-gesture-required"],
});
const context = await browser.newContext({ viewport: { width: 1100, height: 900 }, permissions: ["microphone"], acceptDownloads: true });
const page = await context.newPage();
page.on("console", (m) => { if (m.type() === "error") console.log("console error:", m.text()); });
page.on("pageerror", (e) => console.log("page error:", e.message));
await page.route("http://app.local/**", async (route) => {
  const url = new URL(route.request().url());
  let path = url.pathname === "/" ? "/index.html" : url.pathname;
  try {
    const file = join(dist, path);
    await stat(file);
    await route.fulfill({ status: 200, contentType: types[extname(file)] ?? "application/octet-stream", body: await readFile(file) });
  } catch {
    await route.fulfill({ status: 404, body: "not found" });
  }
});

const shot = async (name) => { await page.screenshot({ path: `${out}/${name}.png`, fullPage: true }); console.log("shot", name); };

await page.goto("http://app.local/");
await page.waitForSelector("h1");
await shot("01-welcome-loading");
await page.getByText("Transcription ready").waitFor({ timeout: 15000 });
await shot("02-welcome-ready");
await page.getByRole("button", { name: "Start", exact: true }).click();

await page.getByLabel("Title (required)").fill("Storm forecasting");
await page.getByLabel("Author (required)").fill("Luke Szyrmer");
await page.getByLabel("Topic tag").fill("forecasting");
await page.getByLabel("Repo link").fill("https://github.com/example/storm");
await page.getByText("handed-off").click();
await page.getByLabel("Aliases (synonyms, older names)").fill("wind forecast v2");
await page.getByRole("button", { name: "Add", exact: true }).first().click();
await page.getByLabel("People").fill("Alex");
await page.getByRole("button", { name: "Add", exact: true }).nth(3).click();
await shot("03-about");
await page.getByRole("button", { name: "Continue" }).click();

// question 1: record with the fake microphone
await page.getByRole("button", { name: "Start recording" }).click();
await page.waitForTimeout(2200);
await shot("04-recording");
await page.getByRole("button", { name: "Stop recording" }).click();
await page.getByText("Turning your answer into text").waitFor();
await shot("05-transcribing");
await page.waitForFunction(() => document.querySelector("textarea")?.value.includes("Stub transcript"), null, { timeout: 15000 });
await shot("06-words-appear");
await page.getByRole("button", { name: "Next question" }).click();

// approaches
await shot("07-approaches-empty");
await page.getByRole("button", { name: "Add an approach" }).click();
await page.getByLabel("1. Name it (required)").fill("Transformer model");
await page.getByText("Dead end", { exact: true }).click();
await page.getByLabel("3. What was the idea?").fill("Use a transformer for seasonal patterns.");
await page.getByLabel("4. Why did it fail?").fill("Too slow to retrain.");
await page.getByLabel(/5\. Links/).fill("https://github.com/example/storm/pull/42");
await page.getByRole("button", { name: "Add link" }).click();
await page.getByLabel(/5\. Links/).fill("https://example.com/forecast-notes");
await page.getByRole("button", { name: "Add link" }).click();
await page.getByLabel(/5\. Links/).fill("github.com/nolink");
await page.getByRole("button", { name: "Add link" }).click();
await shot("08-approach-form");
await page.getByLabel(/5\. Links/).fill("");
await page.getByRole("button", { name: "Save approach" }).click();
await page.getByRole("button", { name: "Add another approach" }).click();
await page.getByLabel("1. Name it (required)").fill("Gradient boosting");
await page.getByText("Worked", { exact: true }).click();
await page.getByLabel("3. What was the idea?").fill("Boosted trees on weather features.");
await page.getByLabel("4. Why did it work?").fill("It retrains in minutes.");
await page.getByRole("button", { name: "Save approach" }).click();
await shot("09-approach-list");
await page.getByRole("button", { name: "Done, next question" }).click();

// reload mid-flow: resume
await page.reload();
await page.getByRole("heading", { name: "Welcome back" }).waitFor();
await shot("10-resume");
await page.getByRole("button", { name: "Pick up where you left off" }).click();

await page.locator("textarea").first().fill("Forecast error down about 18 percent against the old baseline.");
await page.getByRole("button", { name: "Next question" }).click();
await page.locator("textarea").first().fill("Read the README, then run make setup.");
await page.getByRole("button", { name: "Next question" }).click();
await page.locator("textarea").first().fill("A forecasting model. It beat the old baseline. It is handed to the platform team.");
await shot("11-summary-question");
await page.getByRole("button", { name: "Review" }).click();
await shot("12-review");
const download = page.waitForEvent("download");
await page.getByRole("button", { name: "Save file" }).click();
const d = await download;
console.log("downloaded:", d.suggestedFilename());
await d.saveAs(`${out}/saved.md`);
await shot("13-saved");
await browser.close();

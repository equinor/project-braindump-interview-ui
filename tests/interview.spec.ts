import { expect, test } from "@playwright/test";

test("completes the short route with typed answers and saves markdown", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Project exit interview" }).first()).toBeVisible();
  await page.getByLabel("Project name").fill("Practice project");
  await page.getByLabel(/Your role in the project/).fill("Data scientist");
  await page.getByRole("button", { name: "Start", exact: true }).click();

  await expect(page.getByText("Question 1 of 9")).toBeVisible();
  await expect(page.getByRole("button", { name: /Tell the story of the project/ })).toBeVisible();
  await expect(page.getByText("Interview roadmap")).toBeVisible();
  await expect(page.getByRole("radio", { name: "I did or saw it" })).toBeChecked();
  const roadmapToggle = page.getByRole("button", { name: "Hide roadmap" });
  await expect(roadmapToggle).toHaveAttribute("aria-expanded", "true");
  await roadmapToggle.click();
  await expect(page.getByRole("button", { name: "Show roadmap" })).toHaveAttribute("aria-expanded", "false");
  await page.getByRole("button", { name: "Show roadmap" }).click();
  const roadmapBeforeQuestion = await page.locator(".question-list").evaluate((list) =>
    Boolean(list.compareDocumentPosition(document.getElementById("question-title")!) & Node.DOCUMENT_POSITION_FOLLOWING),
  );
  const questionBeforeRecorder = await page.locator("#question-title").evaluate((heading) =>
    Boolean(heading.compareDocumentPosition(document.querySelector(".answer-card")!) & Node.DOCUMENT_POSITION_FOLLOWING),
  );
  expect(roadmapBeforeQuestion).toBe(true);
  expect(questionBeforeRecorder).toBe(true);
  for (let question = 0; question < 9; question++) {
    if (question === 0) {
      await page.getByLabel("Your answer").fill("The project explored a practice dataset.");
    } else {
      await page.getByRole("button", { name: "Skip this question" }).click();
    }
    if (question < 8) await page.getByRole("button", { name: "Next question" }).click();
    else await page.getByRole("button", { name: "Review answers" }).click();
  }

  await expect(page.getByRole("heading", { name: "Review your answers" })).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save interview" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/Practice project - exit interview\.md$/);
  await expect(page.getByRole("heading", { name: "Saved." })).toBeVisible();
});

test("records an answer with the browser microphone", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Project name").fill("Recording practice");
  await page.getByLabel(/Your role in the project/).fill("Analyst");
  await page.getByRole("button", { name: "Start", exact: true }).click();

  await page.getByRole("button", { name: "Record answer" }).click();
  await expect(page.getByText("Recording", { exact: true })).toBeVisible();
  await expect(page.getByText("00:01", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Stop" }).click();
  await expect(page.locator("audio")).toBeVisible();
  await expect(page.getByText("Done", { exact: true })).toBeVisible({ timeout: 5000 });
});

test("lets someone choose Other and add their own explanation", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Project name").fill("Other answer practice");
  await page.getByLabel(/Your role in the project/).fill("Analyst");
  await page.getByRole("button", { name: "Start", exact: true }).click();
  const activeQuestion = await page.locator("#question-title").innerText();
  await page.getByRole("button", { name: "Other", exact: true }).click();
  await expect(page.getByRole("button", { name: "Other · Undo" })).toBeVisible();
  await page.getByLabel("Your answer").fill("The outcome was different from the options listed.");
  await page.getByRole("button", { name: "Next question" }).click();
  for (let question = 0; question < 7; question++) {
    await page.getByRole("button", { name: "Skip this question" }).click();
    await page.getByRole("button", { name: "Next question" }).click();
  }
  await page.getByRole("button", { name: "Review answers" }).click();
  await expect(page.getByLabel(`Answer: ${activeQuestion}`)).toHaveValue(
    "The outcome was different from the options listed.",
  );
  await expect(page.locator(".review-question").filter({ hasText: activeQuestion }).locator(".review-state")).toHaveText("Other");
});

test("uploads an audio answer and transcribes it in the background", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Project name").fill("Upload practice");
  await page.getByLabel(/Your role in the project/).fill("Analyst");
  await page.getByRole("button", { name: "Start", exact: true }).click();

  const sampleCount = 16_000;
  const wav = Buffer.alloc(44 + sampleCount * 2);
  wav.write("RIFF", 0);
  wav.writeUInt32LE(wav.length - 8, 4);
  wav.write("WAVE", 8);
  wav.write("fmt ", 12);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(16_000, 24);
  wav.writeUInt32LE(32_000, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(sampleCount * 2, 40);
  await page.locator('input[type="file"]').setInputFiles({
    name: "answer.wav",
    mimeType: "audio/wav",
    buffer: wav,
  });

  await expect(page.locator(".audio-label")).toContainText("answer.wav");
  await expect(page.getByText("Done", { exact: true })).toBeVisible({ timeout: 5000 });
});

test("keeps the interview usable after external network access is blocked", async ({ page }) => {
  await page.goto("/");
  await page.route("https://**/*", (route) => route.abort());
  await page.getByLabel("Project name").fill("Offline practice");
  await page.getByLabel(/Your role in the project/).fill("Engineer");
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await page.getByLabel("Your answer").fill("A local answer.");
  await expect(page.getByText("Question 1 of 9")).toBeVisible();
});

test("resumes the saved question and text answer after a reload", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Project name").fill("Resume practice");
  await page.getByLabel(/Your role in the project/).fill("Analyst");
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await page.getByLabel("Your answer").fill("Saved before the reload.");
  await page.getByRole("button", { name: "Next question" }).click();
  await page.reload();

  await expect(page.getByRole("heading", { name: "Continue where you left off?" })).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("Question 2 of 9")).toBeVisible();
  await page.getByRole("button", { name: /Tell the story of the project/ }).click();
  await expect(page.getByLabel("Your answer")).toHaveValue("Saved before the reload.");
});

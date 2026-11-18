import { describe, expect, it } from "vitest";
import {
  buildQuestionSequence,
  createEmptyAnswers,
  estimateMinutes,
  makeFileName,
  questionProgress,
  toMarkdown,
  type InterviewDraft,
} from "./domain";

describe("buildQuestionSequence", () => {
  it("uses the core questions when no type is selected", () => {
    expect(buildQuestionSequence([], "full")).toHaveLength(13);
    expect(buildQuestionSequence([], "short")).toHaveLength(9);
    expect(buildQuestionSequence([], "full").map((question) => question.id)).toContain("X7");
  });

  it("replaces X7 with data science and selected modules in selection order", () => {
    const questions = buildQuestionSequence(["forecasting", "classification"], "full");
    const index = questions.findIndex((question) => question.id === "DS1");
    expect(questions).toHaveLength(31);
    expect(questions.slice(index, index + 7).map((question) => question.id)).toEqual([
      "DS1", "DS2", "DS3", "DS4", "DS5", "DS6", "DS7",
    ]);
    expect(questions.findIndex((question) => question.id === "FC1")).toBeLessThan(
      questions.findIndex((question) => question.id === "CL1"),
    );
    expect(questions.map((question) => question.id)).not.toContain("X7");
  });

  it("keeps only essential questions for the short route", () => {
    expect(buildQuestionSequence(["forecasting"], "short")).toHaveLength(14);
    expect(buildQuestionSequence(["forecasting"], "short").every((question) => question.essential)).toBe(true);
    expect(buildQuestionSequence(["none"], "short").map((question) => question.id)).toContain("X7");
  });
});

describe("progress, estimates and markdown", () => {
  it("updates remaining time when answers are resolved", () => {
    const questions = buildQuestionSequence(["forecasting"], "short");
    const answers = createEmptyAnswers(questions);
    expect(answers.X1.mark).toBe("first-hand");
    answers.X1.state = "answered";
    const result = questionProgress(questions, answers, 1, "short");
    expect(result.answered).toBe(1);
    expect(result.remaining).toBe(13);
    expect(result.minutesLeft).toBe(26);
    expect(estimateMinutes(14, "full")).toBe(38);
  });

  it("creates a safe file name", () => {
    expect(makeFileName(' North Sea: "Alpha"/Beta? ', new Date(2026, 9, 27))).toBe(
      "2026-10-27 - North Sea AlphaBeta - exit interview.md",
    );
  });

  it("writes every question including skipped and other answers", () => {
    const projectTypes = ["forecasting"];
    const questions = buildQuestionSequence(projectTypes, "short");
    const answers = createEmptyAnswers(questions);
    answers.X1 = { ...answers.X1, state: "answered", text: "A reviewed story", mark: "first-hand" };
    answers.X2 = { ...answers.X2, state: "skipped" };
    answers.DS2 = { ...answers.DS2, state: "other", text: "The answer was outside the listed choices." };
    const draft: InterviewDraft = {
      projectName: "Project A",
      role: "Analyst",
      reason: "handover",
      projectTypes,
      route: "short",
      currentIndex: 0,
      answers,
      promptOpen: {},
      updatedAt: 0,
    };
    const markdown = toMarkdown(draft, new Date(2026, 9, 27));
    expect(markdown).toContain('interviewee_role: "Analyst"');
    expect(markdown).toContain("reason: handover");
    expect(markdown).toContain("**Source:** first-hand\nA reviewed story");
    expect(markdown).toContain("_Skipped_");
    expect(markdown).toContain("_Other_\nThe answer was outside the listed choices.");
    expect(markdown.match(/<!-- q:/g)).toHaveLength(questions.length);
  });
});

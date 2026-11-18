import config from "../data/interview-config.json";

export type Route = "short" | "full";
export type AnswerState = "waiting" | "answered" | "skipped" | "other";
export type SourceMark = "first-hand" | "heard" | "unsure";

export interface InterviewQuestion {
  id: string;
  text: string;
  essential: boolean;
  hint: string | null;
  prompts: string[];
  note: string | null;
  part: string;
}

export interface DraftAnswer {
  state: AnswerState;
  text: string;
  machineText: string;
  mark?: SourceMark;
  transcription: "idle" | "queued" | "running" | "done" | "failed";
  error?: string;
}

export interface InterviewDraft {
  projectName: string;
  role: string;
  reason: string;
  projectTypes: string[];
  route: Route;
  currentIndex: number;
  answers: Record<string, DraftAnswer>;
  promptOpen: Record<string, boolean>;
  updatedAt: number;
}

type Config = typeof config;
export const interviewConfig: Config = config;

export function buildQuestionSequence(
  projectTypes: string[],
  route: Route,
): InterviewQuestion[] {
  const core = config.core as InterviewQuestion[];
  const modules = config.modules;
  const dataModule = modules.find((module) => module.id === "data-science");
  const selectedModules = projectTypes
    .filter((type) => type !== "none")
    .map((type) => modules.find((module) => module.id === type))
    .filter((module): module is (typeof modules)[number] => Boolean(module));
  const dataQuestions =
    projectTypes.length === 0 || projectTypes.includes("none")
      ? core.filter((question) => question.id === "X7")
      : [
          ...(dataModule?.questions ?? []),
          ...selectedModules.flatMap((module) => module.questions),
        ];
  const expanded = config.sequence.flatMap((id) =>
    id === "@data"
      ? dataQuestions
      : core.filter((question) => question.id === id),
  ) as InterviewQuestion[];

  return route === "short"
    ? expanded.filter((question) => question.essential)
    : expanded;
}

export function estimateMinutes(questionCount: number, route: Route): number {
  return Math.ceil(
    questionCount * config.minutesPerQuestion[route],
  );
}

export function questionProgress(
  questions: InterviewQuestion[],
  answers: Record<string, DraftAnswer>,
  currentIndex: number,
  route: Route,
) {
  const resolved = Object.values(answers).filter(
    (answer) => answer.state !== "waiting",
  ).length;
  const remaining = Math.max(0, questions.length - resolved);
  const parts = [...new Set(questions.map((question) => question.part))].map(
    (part) => {
      const inPart = questions.filter((question) => question.part === part);
      const done = inPart.filter(
        (question) => answers[question.id]?.state !== "waiting",
      ).length;
      return {
        part,
        total: inPart.length,
        done,
        complete: done === inPart.length,
        current: questions[currentIndex]?.part === part,
      };
    },
  );
  return {
    answered: resolved,
    remaining,
    minutesLeft: estimateMinutes(remaining, route),
    parts,
  };
}

export function createEmptyAnswers(
  questions: InterviewQuestion[],
): Record<string, DraftAnswer> {
  return Object.fromEntries(
    questions.map((question) => [
      question.id,
      {
        state: "waiting" as const,
        text: "",
        machineText: "",
        mark: "first-hand" as const,
        transcription: "idle" as const,
      },
    ]),
  );
}

export function makeFileName(projectName: string, date = new Date()): string {
  const safeProject = projectName
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "")
    .replace(/[. ]+$/g, "")
    .trim()
    .replace(/\s+/g, " ");
  const dateString = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
  return `${dateString} - ${safeProject || "Project"} - exit interview.md`;
}

export function toMarkdown(draft: InterviewDraft, date = new Date()): string {
  const questions = buildQuestionSequence(draft.projectTypes, draft.route);
  const reason = config.reasons.find((item) => item.id === draft.reason)?.id;
  const types = draft.projectTypes.filter((type) => type !== "none");
  const lines = [
    "---",
    `project: ${yamlString(draft.projectName)}`,
    `date: ${formatDate(date)}`,
    `interviewee_role: ${yamlString(draft.role)}`,
    "type: capture-interview",
    "kind: exit",
    `reason: ${reason || "ending"}`,
    `project_types: [${types.join(", ")}]`,
    `route: ${draft.route}`,
    "guide_version: 1",
    "transcription_model: parakeet-tdt-0.6b-v2",
    "reviewed: true",
    "---",
    "",
  ];
  for (const question of questions) {
    const answer = draft.answers[question.id] ?? {
      state: "waiting" as const,
      text: "",
      mark: undefined,
    };
    const source =
      answer.mark === "first-hand"
        ? "first-hand"
        : answer.mark === "heard"
          ? "heard"
          : answer.mark === "unsure"
            ? "unsure"
            : "not marked";
    lines.push(
      `## ${question.id}. ${question.text}`,
      `<!-- q: ${question.id} -->`,
      `**Source:** ${source}`,
    );
    if (answer.state === "skipped") lines.push("_Skipped_");
    else if (answer.state === "other") {
      lines.push("_Other_");
      if (answer.text.trim()) lines.push(answer.text.trim());
    }
    else if (answer.text.trim()) lines.push(answer.text.trim());
    else lines.push("_Not answered_");
    lines.push("");
  }
  return lines.join("\n").trimEnd() + "\n";
}

function yamlString(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, " ")}"`;
}

function formatDate(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

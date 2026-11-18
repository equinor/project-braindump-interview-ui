// Plain data and rules for the braindump. No React, no browser APIs, so it can be tested alone.
// Everything here is deterministic: fixed questions, fixed headings, no AI.

export type Route = "short" | "full";
export type Tag = "" | "worked" | "dead-end" | "unsure";
export type Status = "" | "shipped" | "shelved" | "handed-off" | "ongoing";

export type QuestionKind = "text" | "approaches" | "repro";

export interface Question {
  id: string;
  heading: string; // the exact heading in the markdown file
  prompt: string;
  hints: string[];
  short: boolean; // asked on the short route
  kind: QuestionKind;
  maxSentences?: number; // when set, the answer box counts sentences against this
  stage?: string; // id of a stage in the config; shows the stage name and why we ask
  startingPoints?: string[] | "about"; // buttons that start the answer; "about" uses what was typed on the About form
}

export interface Stage {
  id: string;
  title: string;
  why: string; // "Why we ask: ..." shown at the top of the stage's first question
}

// The questions live in public/questions.json, not in code. This is what the app needs from that file.
export interface Config {
  stages: Stage[];
  questions: Question[]; // spoken order
  fileOrder: string[]; // order of the sections in the markdown file
  minutes: Record<Route, number>;
}

export class ConfigError extends Error {
  constructor(public readonly problems: string[]) {
    super(problems.join("\n"));
  }
}

const KINDS: QuestionKind[] = ["text", "approaches", "repro"];

export function parseConfig(raw: unknown): Config {
  const problems: string[] = [];
  const root = raw as Record<string, unknown> | null;
  if (!root || typeof root !== "object" || Array.isArray(root)) {
    throw new ConfigError(["The file must be a JSON object with a \"questions\" list."]);
  }
  const list = root.questions;
  if (!Array.isArray(list) || list.length === 0) {
    throw new ConfigError(['"questions" must be a list with at least one question.']);
  }
  const stages: Stage[] = [];
  if (root.stages !== undefined) {
    if (!Array.isArray(root.stages)) problems.push('"stages" must be a list.');
    else
      root.stages.forEach((item, index) => {
        const st = item as Record<string, unknown>;
        const id = typeof st?.id === "string" ? st.id.trim() : "";
        const title = typeof st?.title === "string" ? st.title.trim() : "";
        if (!id || !title) problems.push(`Stage ${index + 1} needs an "id" and a "title".`);
        else if (stages.some((x) => x.id === id)) problems.push(`The stage id "${id}" is used twice.`);
        else stages.push({ id, title, why: typeof st.why === "string" ? st.why.trim() : "" });
      });
  }
  const questions: Question[] = [];
  const seen = new Set<string>();
  list.forEach((item, index) => {
    const where = `Question ${index + 1}`;
    const q = item as Record<string, unknown>;
    if (!q || typeof q !== "object" || Array.isArray(q)) {
      problems.push(`${where} must be an object.`);
      return;
    }
    const text = (key: string) => (typeof q[key] === "string" ? (q[key] as string).trim() : "");
    const id = text("id");
    if (!id) problems.push(`${where} needs an "id".`);
    else if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(id)) problems.push(`${where}: the id "${id}" may only use letters, digits, - and _, and must start with a letter.`);
    else if (seen.has(id)) problems.push(`${where}: the id "${id}" is used twice.`);
    seen.add(id);
    const label = id ? `Question "${id}"` : where;
    if (!text("heading")) problems.push(`${label} needs a "heading", the section title in the file.`);
    if (!text("prompt")) problems.push(`${label} needs a "prompt", the question people are asked.`);
    let hints: string[] = [];
    if (q.hints !== undefined) {
      if (Array.isArray(q.hints) && q.hints.every((h) => typeof h === "string")) hints = (q.hints as string[]).map((h) => h.trim()).filter(Boolean);
      else problems.push(`${label}: "hints" must be a list of text.`);
    }
    if (q.short !== undefined && typeof q.short !== "boolean") problems.push(`${label}: "short" must be true or false.`);
    let maxSentences: number | undefined;
    if (q.maxSentences !== undefined) {
      if (typeof q.maxSentences === "number" && Number.isInteger(q.maxSentences) && q.maxSentences >= 1) maxSentences = q.maxSentences;
      else problems.push(`${label}: "maxSentences" must be a whole number of 1 or more.`);
    }
    let stage: string | undefined;
    if (q.stage !== undefined) {
      if (typeof q.stage === "string" && stages.some((x) => x.id === q.stage)) stage = q.stage;
      else problems.push(`${label}: the stage "${String(q.stage)}" is not listed under "stages".`);
    }
    let startingPoints: Question["startingPoints"];
    if (q.startingPoints !== undefined) {
      if (q.startingPoints === "about") startingPoints = "about";
      else if (Array.isArray(q.startingPoints) && q.startingPoints.every((x) => typeof x === "string")) {
        startingPoints = (q.startingPoints as string[]).map((x) => x.trim()).filter(Boolean);
      } else problems.push(`${label}: "startingPoints" must be a list of text, or "about".`);
    }
    const kind = (q.kind ?? "text") as QuestionKind;
    if (!KINDS.includes(kind)) problems.push(`${label}: "kind" must be one of ${KINDS.join(", ")}.`);
    questions.push({
      id,
      heading: text("heading").replace(/^#+\s*/, ""),
      prompt: text("prompt"),
      hints,
      short: q.short === true,
      kind: KINDS.includes(kind) ? kind : "text",
      ...(maxSentences ? { maxSentences } : {}),
      ...(stage ? { stage } : {}),
      ...(startingPoints ? { startingPoints } : {}),
    });
  });
  for (const kind of ["approaches", "repro"] as const) {
    if (questions.filter((q) => q.kind === kind).length > 1) problems.push(`Only one question can have kind "${kind}".`);
  }
  if (!questions.some((q) => q.short)) problems.push('No question has "short": true, so the short route would be empty.');

  const ids = questions.map((q) => q.id);
  let fileOrder: string[] = [];
  if (root.fileOrder !== undefined) {
    if (!Array.isArray(root.fileOrder) || !root.fileOrder.every((i) => typeof i === "string")) {
      problems.push('"fileOrder" must be a list of question ids.');
    } else {
      const listed = root.fileOrder as string[];
      for (const id of listed) if (!ids.includes(id)) problems.push(`"fileOrder" mentions "${id}", which is not a question id.`);
      if (new Set(listed).size !== listed.length) problems.push('"fileOrder" lists an id twice.');
      fileOrder = listed.filter((id) => ids.includes(id));
    }
  }
  fileOrder = [...fileOrder, ...ids.filter((id) => !fileOrder.includes(id))];

  const routes = (root.routes ?? {}) as Record<string, { minutes?: unknown } | undefined>;
  const minutes: Record<Route, number> = { short: 10, full: 25 };
  for (const r of ["short", "full"] as Route[]) {
    const m = routes[r]?.minutes;
    if (m === undefined) continue;
    if (typeof m === "number" && m > 0) minutes[r] = m;
    else problems.push(`"routes.${r}.minutes" must be a number above zero.`);
  }

  if (problems.length) throw new ConfigError(problems);
  return { stages, questions, fileOrder, minutes };
}

// Changes when the question ids or their order change, so a saved session knows its position may have moved.
export function configKey(config: Config): string {
  return config.questions.map((q) => q.id).join(",");
}

export const STATUSES: Exclude<Status, "">[] = ["shipped", "shelved", "handed-off", "ongoing"];

export interface Header {
  title: string;
  topic: string;
  author: string;
  repo: string;
  status: Status;
  statusAsOf: string; // YYYY-MM-DD
  aliases: string[];
  datasets: string[];
  models: string[];
  people: string[];
}

export interface Approach {
  id: string;
  name: string;
  tag: Tag;
  idea: string;
  why: string;
  links: string[];
}

export interface Repro {
  text: string;
  commands: string;
  lastChecked: string; // YYYY-MM-DD or empty
}

export interface Session {
  route: Route;
  stepIndex: number;
  header: Header;
  answers: Record<string, string>;
  approaches: Approach[];
  repro: Repro;
  configKey?: string;
}

export type Step =
  | { kind: "welcome" }
  | { kind: "about" }
  | { kind: "question"; id: string }
  | { kind: "details" }
  | { kind: "review" }
  | { kind: "saved" };

export function localDate(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function emptySession(): Session {
  return {
    route: "short",
    stepIndex: 0,
    header: {
      title: "",
      topic: "",
      author: "",
      repo: "",
      status: "",
      statusAsOf: localDate(),
      aliases: [],
      datasets: [],
      models: [],
      people: [],
    },
    answers: {},
    approaches: [],
    repro: { text: "", commands: "", lastChecked: "" },
  };
}

export function questionsFor(config: Config, route: Route): Question[] {
  return config.questions.filter((q) => route === "full" || q.short);
}

export function sequence(config: Config, route: Route): Step[] {
  return [
    { kind: "welcome" },
    { kind: "about" },
    ...questionsFor(config, route).map((q): Step => ({ kind: "question", id: q.id })),
    { kind: "details" },
    { kind: "review" },
    { kind: "saved" },
  ];
}

export function questionById(config: Config, id: string): Question {
  const found = config.questions.find((q) => q.id === id);
  if (!found) throw new Error(`Unknown question ${id}`);
  return found;
}

export function kindOf(config: Config, kind: QuestionKind): Question | undefined {
  return config.questions.find((q) => q.kind === kind);
}

// The stage heading and "why we ask" line, shown on the first question of each stage on the route.
export function stageIntro(config: Config, route: Route, question: Question): { label: string; why: string } | null {
  if (!question.stage) return null;
  const list = questionsFor(config, route);
  const first = list.find((q) => q.stage === question.stage);
  if (first?.id !== question.id) return null;
  const index = config.stages.findIndex((x) => x.id === question.stage);
  const stage = config.stages[index];
  const total = new Set(list.map((q) => q.stage).filter(Boolean)).size;
  const label = config.stages.length > 1 && total > 1 ? `Stage ${index + 1} of ${config.stages.length}: ${stage.title}` : `Stage ${index + 1}: ${stage.title}`;
  return { label, why: stage.why };
}

// Buttons that start an answer. "about" offers the title and topic typed on the About screen.
export function startingPointsFor(question: Question, header: Header): string[] {
  if (!question.startingPoints) return [];
  if (question.startingPoints !== "about") return question.startingPoints;
  const all = [header.title, header.topic].map((x) => x.trim()).filter(Boolean);
  return [...new Set(all)];
}

// Approach names that are not yet in the Models list, offered as one-tap suggestions on the Details screen.
export function modelSuggestions(header: Header, approaches: Approach[]): string[] {
  const have = new Set(header.models.map((m) => m.trim().toLowerCase()));
  const names = approaches.map((a) => a.name.trim()).filter(Boolean);
  return [...new Set(names)].filter((n) => !have.has(n.toLowerCase()));
}

export function routeInfo(config: Config, route: Route): { label: string; questions: number; minutes: number } {
  return { label: route === "short" ? "Short" : "Full", questions: questionsFor(config, route).length, minutes: config.minutes[route] };
}

// ---------- content checks ----------

export function trimmed(value: string | undefined): string {
  return (value ?? "").trim();
}

export function isCovered(session: Session, question: Question): boolean {
  if (question.kind === "approaches") return session.approaches.some((a) => trimmed(a.name) !== "");
  if (question.kind === "repro") {
    const r = session.repro;
    return trimmed(r.text) !== "" || trimmed(r.commands) !== "" || trimmed(r.lastChecked) !== "";
  }
  return trimmed(session.answers[question.id]) !== "";
}

export interface Coverage {
  id: string;
  heading: string;
  covered: boolean;
}

export function coverage(config: Config, session: Session): Coverage[] {
  return config.fileOrder.map((id) => {
    const q = questionById(config, id);
    return { id, heading: q.heading, covered: isCovered(session, q) };
  });
}

export function emptyHeaderFields(header: Header): string[] {
  const missing: string[] = [];
  if (!trimmed(header.title)) missing.push("title");
  if (header.aliases.length === 0) missing.push("aliases");
  if (!trimmed(header.topic)) missing.push("topic");
  if (header.datasets.length === 0) missing.push("datasets");
  if (header.models.length === 0) missing.push("models");
  if (header.people.length === 0) missing.push("people");
  if (!header.status) missing.push("status");
  if (!trimmed(header.statusAsOf)) missing.push("status_as_of");
  if (!trimmed(header.author)) missing.push("author");
  if (!trimmed(header.repo)) missing.push("repo");
  return missing;
}

// ---------- links ----------

export type LinkCheck = { ok: true; url: string; site: string } | { ok: false; reason: string };

export function checkLink(input: string): LinkCheck {
  const value = input.trim();
  if (!value) return { ok: false, reason: "Paste a link first." };
  if (!/^https?:\/\/\S+$/i.test(value)) return { ok: false, reason: "A link must start with http:// or https://." };
  try {
    const url = new URL(value);
    return { ok: true, url: value, site: url.hostname.replace(/^www\./, "") };
  } catch {
    return { ok: false, reason: "That does not look like a link." };
  }
}

export function siteOf(url: string): string {
  const check = checkLink(url);
  return check.ok ? check.site : url;
}

// ---------- text helpers ----------

export function countSentences(text: string): number {
  return text
    .split(/[.!?]+(?:\s|$)/)
    .map((s) => s.trim())
    .filter(Boolean).length;
}

export function appendText(existing: string, addition: string): string {
  const next = addition.trim();
  if (!next) return existing;
  const base = existing.replace(/\s+$/, "");
  return base ? `${base}\n\n${next}` : next;
}

export function formatClock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function fileName(session: Session): string {
  const clean = (value: string) => value.replace(/[\\/:*?"<>|]/g, "").replace(/\s+/g, " ").trim();
  const title = clean(session.header.title) || "Untitled";
  const date = trimmed(session.header.statusAsOf) || localDate();
  return `${date} - ${title} - braindump.md`;
}

// ---------- markdown ----------

function needsQuotes(value: string): boolean {
  return /^[\[\]{}>*&!|%@`'"#-]/.test(value) || /:\s|\s#|:$/.test(value) || /["']/.test(value);
}

function yamlScalar(value: string): string {
  const v = value.trim();
  if (v === "") return '""';
  return needsQuotes(v) ? JSON.stringify(v) : v;
}

function yamlList(items: string[]): string {
  const safe = items
    .map((i) => i.trim())
    .filter(Boolean)
    .map((i) => (/[,\[\]{}]/.test(i) || needsQuotes(i) ? JSON.stringify(i) : i));
  return `[${safe.join(", ")}]`;
}

export function frontmatter(header: Header): string {
  return [
    "---",
    `title: ${header.title.trim() ? yamlScalar(header.title) : ""}`.trimEnd(),
    `aliases: ${yamlList(header.aliases)}`,
    `topic: ${header.topic.trim() ? yamlScalar(header.topic) : ""}`.trimEnd(),
    `datasets: ${yamlList(header.datasets)}`,
    `models: ${yamlList(header.models)}`,
    `people: ${yamlList(header.people)}`,
    `status: ${header.status}`.trimEnd(),
    `status_as_of: ${header.statusAsOf.trim()}`.trimEnd(),
    `author: ${header.author.trim() ? yamlScalar(header.author) : ""}`.trimEnd(),
    `repo: ${header.repo.trim()}`.trimEnd(),
    "---",
  ].join("\n");
}

const TAG_LABEL: Record<Exclude<Tag, "">, string> = {
  worked: "worked",
  "dead-end": "dead end",
  unsure: "not sure",
};

export function whyLabel(tag: Tag): string {
  if (tag === "worked") return "Why it worked";
  if (tag === "dead-end") return "Why it failed";
  return "Why";
}

function approachesBody(approaches: Approach[]): string {
  const named = approaches.filter((a) => trimmed(a.name) !== "");
  return named
    .map((a, index) => {
      const lines: string[] = [];
      lines.push(`### ${index + 1}. ${a.name.trim()}${a.tag ? ` (${TAG_LABEL[a.tag]})` : ""}`);
      if (trimmed(a.idea)) lines.push(`**Idea:** ${a.idea.trim()}`);
      if (trimmed(a.why)) lines.push(`**${whyLabel(a.tag)}:** ${a.why.trim()}`);
      const links = a.links.map((l) => l.trim()).filter(Boolean);
      if (links.length) lines.push(links.map((l) => `- ${l}`).join("\n"));
      return lines.join("\n\n");
    })
    .join("\n\n");
}

function reproBody(repro: Repro): string {
  const parts: string[] = [];
  if (trimmed(repro.text)) parts.push(repro.text.trim());
  if (trimmed(repro.commands)) parts.push("```sh\n" + repro.commands.trim() + "\n```");
  if (trimmed(repro.lastChecked)) parts.push(`Last verified: ${repro.lastChecked.trim()}`);
  return parts.join("\n\n");
}

export function buildMarkdown(config: Config, session: Session): string {
  const sections: string[] = [];
  const notCovered: string[] = [];

  for (const id of config.fileOrder) {
    const q = questionById(config, id);
    let body = "";
    if (q.kind === "approaches") body = approachesBody(session.approaches);
    else if (q.kind === "repro") body = reproBody(session.repro);
    else body = trimmed(session.answers[q.id]);
    if (body) {
      sections.push(`## ${q.heading}\n\n${body}`);
    } else {
      sections.push(`## ${q.heading}\n\nNot covered`);
      notCovered.push(q.heading);
    }
  }

  const missingHeader = emptyHeaderFields(session.header);
  const list = [...notCovered.map((h) => `- ${h}`), ...missingHeader.map((f) => `- Header field: ${f}`)];
  sections.push(`## Not covered (skipped or unknown)\n\n${list.length ? list.join("\n") : "Nothing."}`);

  return `${frontmatter(session.header)}\n\n${sections.join("\n\n")}\n`;
}

// ---------- progress ----------

export function answeredCount(config: Config, session: Session): { answered: number; total: number } {
  const qs = questionsFor(config, session.route);
  return { answered: qs.filter((q) => isCovered(session, q)).length, total: qs.length };
}

export function newId(): string {
  return Math.random().toString(36).slice(2, 10);
}

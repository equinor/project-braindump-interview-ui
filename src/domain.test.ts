import { describe, expect, it } from "vitest";
import questionsFile from "../public/questions.json?raw";
import {
  ConfigError,
  appendText,
  buildMarkdown,
  checkLink,
  countSentences,
  coverage,
  emptySession,
  fileName,
  formatClock,
  modelSuggestions,
  parseConfig,
  questionsFor,
  routeInfo,
  sequence,
  stageIntro,
  startingPointsFor,
  whyLabel,
  type Session,
} from "./domain";

// The tests read the shipped questions file, so a bad edit to it fails here.
const config = parseConfig(JSON.parse(questionsFile));

function filled(): Session {
  const s = emptySession();
  s.header = {
    title: "Storm forecasting",
    topic: "forecasting",
    author: "Luke Szyrmer",
    repo: "https://github.com/example/storm",
    status: "handed-off",
    statusAsOf: "2026-11-17",
    aliases: ["wind forecast v2", "storm v1"],
    datasets: ["SCADA turbine data"],
    models: ["gradient boosting"],
    people: ["Alex", "Sam"],
  };
  s.answers = { summary: "A forecasting model. It is handed over.", qd: "Beat the old baseline.", start: "Read the README." };
  s.approaches = [
    { id: "a", name: "Transformer model", tag: "dead-end", idea: "Use a transformer.", why: "Too slow.", links: ["https://github.com/example/storm/pull/42"] },
    { id: "b", name: "Gradient boosting", tag: "worked", idea: "Boosted trees.", why: "Retrains in minutes.", links: ["https://example.com/forecast-notes"] },
  ];
  return s;
}

describe("routes", () => {
  it("short route asks five questions, full asks ten", () => {
    expect(questionsFor(config, "short").map((q) => q.id)).toEqual(["topic", "reader", "summary", "qd", "decisionmakers", "beneficiaries", "approaches", "results", "start"]);
    expect(questionsFor(config, "full")).toHaveLength(14);
  });

  it("sequence runs welcome, about, questions, details, review, saved", () => {
    const steps = sequence(config, "short");
    expect(steps[0].kind).toBe("welcome");
    expect(steps[1].kind).toBe("about");
    expect(steps.at(-3)?.kind).toBe("details");
    expect(steps.at(-2)?.kind).toBe("review");
    expect(steps.at(-1)?.kind).toBe("saved");
    expect(steps).toHaveLength(2 + 9 + 3);
  });
});

describe("markdown", () => {
  it("writes the template headings in file order, summary first", () => {
    const md = buildMarkdown(config, filled());
    const headings = md.split("\n").filter((l) => l.startsWith("## "));
    expect(headings).toEqual([
      "## Summary (3 lines)",
      "## What this is about",
      "## Who might come back to this",
      "## Question and decision",
      "## Decision-makers",
      "## Beneficiaries and personas",
      "## Data (sources, quirks, owner)",
      "## Approaches tried (including dead ends and why they failed)",
      "## Key choices and rationale",
      "## Results and confidence",
      "## Reproducibility (repo, env, commands, last verified)",
      "## Outcome",
      "## People and links",
      "## If you came back to this: start here",
      "## Not covered (skipped or unknown)",
    ]);
  });

  it("writes the frontmatter keys of the template", () => {
    const md = buildMarkdown(config, filled());
    const front = md.split("---")[1];
    expect(front).toContain("title: Storm forecasting");
    expect(front).toContain("aliases: [wind forecast v2, storm v1]");
    expect(front).toContain("topic: forecasting");
    expect(front).toContain("datasets: [SCADA turbine data]");
    expect(front).toContain("models: [gradient boosting]");
    expect(front).toContain("people: [Alex, Sam]");
    expect(front).toContain("status: handed-off");
    expect(front).toContain("status_as_of: 2026-11-17");
    expect(front).toContain("author: Luke Szyrmer");
    expect(front).toContain("repo: https://github.com/example/storm");
  });

  it("writes one entry per approach with idea, labelled why, and links of any kind", () => {
    const md = buildMarkdown(config, filled());
    expect(md).toContain("### 1. Transformer model (dead end)");
    expect(md).toContain("**Idea:** Use a transformer.");
    expect(md).toContain("**Why it failed:** Too slow.");
    expect(md).toContain("- https://github.com/example/storm/pull/42");
    expect(md).toContain("### 2. Gradient boosting (worked)");
    expect(md).toContain("**Why it worked:** Retrains in minutes.");
    expect(md).toContain("- https://example.com/forecast-notes");
  });

  it("labels skipped sections and lists them under Not covered, never invents", () => {
    const md = buildMarkdown(config, filled());
    expect(md).toContain("## Data (sources, quirks, owner)\n\nNot covered");
    const tail = md.split("## Not covered (skipped or unknown)")[1];
    expect(tail).toContain("- Data (sources, quirks, owner)");
    expect(tail).toContain("- Outcome");
    expect(tail).not.toContain("- Summary (3 lines)");
  });

  it("lists empty header fields under Not covered", () => {
    const s = emptySession();
    const md = buildMarkdown(config, s);
    expect(md).toContain("- Header field: title");
    expect(md).toContain("- Header field: repo");
  });

  it("writes reproducibility with a fenced command block and the date", () => {
    const s = filled();
    s.repro = { text: "Needs the weather data.", commands: "make setup\npython train.py", lastChecked: "2026-11-02" };
    const md = buildMarkdown(config, s);
    expect(md).toContain("```sh\nmake setup\npython train.py\n```");
    expect(md).toContain("Last verified: 2026-11-02");
  });

  it("quotes values YAML would misread", () => {
    const s = filled();
    s.header.title = "Storm: forecasting";
    s.header.aliases = ["a, b"];
    const md = buildMarkdown(config, s);
    expect(md).toContain('title: "Storm: forecasting"');
    expect(md).toContain('aliases: ["a, b"]');
  });
});

describe("coverage", () => {
  it("marks covered sections from content", () => {
    const rows = coverage(config, filled());
    const byId = Object.fromEntries(rows.map((r) => [r.id, r.covered]));
    expect(byId.summary).toBe(true);
    expect(byId.approaches).toBe(true);
    expect(byId.data).toBe(false);
    expect(byId.repro).toBe(false);
  });
});

describe("links", () => {
  it("accepts any http or https link and names the site", () => {
    expect(checkLink("https://www.example.com/a/b")).toEqual({ ok: true, url: "https://www.example.com/a/b", site: "example.com" });
    expect(checkLink("http://wiki.local/page")).toMatchObject({ ok: true, site: "wiki.local" });
  });
  it("rejects anything else with a reason", () => {
    expect(checkLink("")).toMatchObject({ ok: false });
    expect(checkLink("github.com/x")).toMatchObject({ ok: false });
    expect(checkLink("ftp://x.y")).toMatchObject({ ok: false });
  });
});

describe("text helpers", () => {
  it("counts sentences", () => {
    expect(countSentences("One. Two! Three?")).toBe(3);
    expect(countSentences("")).toBe(0);
  });
  it("appends with a blank line and ignores empty additions", () => {
    expect(appendText("", " hello ")).toBe("hello");
    expect(appendText("a", "b")).toBe("a\n\nb");
    expect(appendText("a", "  ")).toBe("a");
  });
  it("formats the clock", () => {
    expect(formatClock(42)).toBe("0:42");
    expect(formatClock(300)).toBe("5:00");
  });
  it("names the file with date and title and strips unsafe characters", () => {
    const s = filled();
    expect(fileName(s)).toBe("2026-11-17 - Storm forecasting - braindump.md");
    s.header.title = 'Storm/forecasting: "v2"';
    expect(fileName(s)).toBe("2026-11-17 - Stormforecasting v2 - braindump.md");
  });
  it("labels the why field from the tag", () => {
    expect(whyLabel("worked")).toBe("Why it worked");
    expect(whyLabel("dead-end")).toBe("Why it failed");
    expect(whyLabel("")).toBe("Why");
  });
});

describe("the questions file", () => {
  it("ships with fourteen questions, nine on the short route, and the summary written first", () => {
    expect(config.questions).toHaveLength(14);
    expect(config.fileOrder[0]).toBe("summary");
    expect(routeInfo(config, "short")).toEqual({ label: "Short", questions: 9, minutes: 15 });
    expect(routeInfo(config, "full")).toEqual({ label: "Full", questions: 14, minutes: 35 });
  });

  it("opens with the Frame it stage: topic, reader, then the 30-second gist", () => {
    expect(config.questions.slice(0, 3).map((q) => q.id)).toEqual(["topic", "reader", "summary"]);
    expect(config.questions.slice(0, 3).every((q) => q.stage === "frame" && q.short)).toBe(true);
    const [topic, reader, gist] = config.questions;
    expect(stageIntro(config, "short", topic)).toEqual({ label: "Stage 1: Frame it", why: "This sets how deep to go and what vocabulary the archive uses." });
    expect(stageIntro(config, "short", reader)).toBeNull(); // the stage heading shows once, on its first question
    expect(stageIntro(config, "short", gist)).toBeNull();
    expect(gist.prompt).toBe("If you had 30 seconds, how would you describe what this was and where it ended up?");
  });

  it("offers the title and topic from the About screen as starting points, and the person can always describe their own", () => {
    const topic = config.questions[0];
    const s = filled();
    expect(startingPointsFor(topic, s.header)).toEqual(["Storm forecasting", "forecasting"]);
    expect(startingPointsFor(config.questions[1], s.header)).toEqual([]);
    expect(startingPointsFor({ ...topic, startingPoints: ["A repo", "A notebook"] }, s.header)).toEqual(["A repo", "A notebook"]);
  });

  it("asks key choices before approaches, so The work stays together in the menu", () => {
    const ids = config.questions.map((q) => q.id);
    expect(ids.indexOf("data")).toBeLessThan(ids.indexOf("choices"));
    expect(ids.indexOf("choices")).toBeLessThan(ids.indexOf("approaches"));
    expect(ids.indexOf("approaches")).toBeLessThan(ids.indexOf("results"));
    // the file still follows the template: approaches, then key choices
    expect(config.fileOrder.indexOf("approaches")).toBeLessThan(config.fileOrder.indexOf("choices"));
  });

  it("asks who decides and who benefits, on both routes, right after the question and decision", () => {
    const ids = config.questions.map((q) => q.id);
    expect(ids.slice(ids.indexOf("qd"), ids.indexOf("qd") + 3)).toEqual(["qd", "decisionmakers", "beneficiaries"]);
    const decide = config.questions.find((q) => q.id === "decisionmakers")!;
    const benefit = config.questions.find((q) => q.id === "beneficiaries")!;
    expect(decide.short && benefit.short).toBe(true);
    expect(decide.prompt).toMatch(/decision/i);
    expect(benefit.prompt).toMatch(/benefits/i);
    const s = filled();
    s.answers.decisionmakers = "The head of operations decides; finance must agree.";
    s.answers.beneficiaries = "Control room operators who need a daily turbine forecast.";
    const md = buildMarkdown(config, s);
    expect(md).toContain("## Decision-makers\n\nThe head of operations decides; finance must agree.");
    expect(md).toContain("## Beneficiaries and personas\n\nControl room operators who need a daily turbine forecast.");
  });

  it("writes the framing sections after the summary", () => {
    const s = filled();
    s.answers.topic = "A wind forecasting model.";
    s.answers.reader = "A new data scientist who wants to retrain it.";
    const md = buildMarkdown(config, s);
    const headings = md.split("\n").filter((l) => l.startsWith("## ")).slice(0, 4);
    expect(headings).toEqual(["## Summary (3 lines)", "## What this is about", "## Who might come back to this", "## Question and decision"]);
    expect(md).toContain("## What this is about\n\nA wind forecasting model.");
    expect(md).toContain("## Who might come back to this\n\nA new data scientist who wants to retrain it.");
  });

  it("rejects a stage that is not listed and a bad starting-points value", () => {
    expect(() => parseConfig({ questions: [{ id: "a", heading: "A", prompt: "A?", short: true, stage: "nope" }] })).toThrow(/not listed under "stages"/);
    expect(() => parseConfig({ stages: [{ id: "s", title: "S" }], questions: [{ id: "a", heading: "A", prompt: "A?", short: true, startingPoints: 5 }] })).toThrow(/startingPoints/);
    expect(() => parseConfig({ stages: [{ id: "s" }], questions: [{ id: "a", heading: "A", prompt: "A?", short: true }] })).toThrow(/needs an "id" and a "title"/);
  });

  it("does not ask for the status again in Outcome, and asks why each person matters", () => {
    const outcome = config.questions.find((q) => q.id === "outcome")!;
    expect(outcome.hints.join(" ")).not.toMatch(/shipped|shelved|handed/i);
    const people = config.questions.find((q) => q.id === "people")!;
    expect(people.prompt).toMatch(/what can each of them help with/);
  });

  it("suggests approach names for the Models list, leaving out ones already there", () => {
    const s = filled();
    expect(modelSuggestions(s.header, s.approaches)).toEqual(["Transformer model"]); // "gradient boosting" is already listed
    s.header.models = [];
    expect(modelSuggestions(s.header, s.approaches)).toEqual(["Transformer model", "Gradient boosting"]);
    s.approaches.push({ id: "c", name: "  ", tag: "", idea: "", why: "", links: [] });
    expect(modelSuggestions(s.header, s.approaches)).toHaveLength(2);
  });

  it("reads the optional sentence limit and rejects a bad one", () => {
    expect(config.questions.find((q) => q.id === "summary")?.maxSentences).toBe(3);
    expect(config.questions.find((q) => q.id === "qd")?.maxSentences).toBeUndefined();
    expect(() => parseConfig({ questions: [{ id: "a", heading: "A", prompt: "A?", short: true, maxSentences: 0 }] })).toThrow(/maxSentences/);
  });

  it("lets questions be added, reordered and hidden from the short route without code", () => {
    const custom = parseConfig({
      routes: { short: { minutes: 5 } },
      fileOrder: ["why", "what"],
      questions: [
        { id: "what", heading: "What it is", prompt: "What is it?", short: true },
        { id: "why", heading: "Why it exists", prompt: "Why does it exist?", hints: ["Who needed it?"] },
        { id: "extra", heading: "Anything else", prompt: "Anything else?" },
      ],
    });
    expect(questionsFor(custom, "short").map((q) => q.id)).toEqual(["what"]);
    expect(questionsFor(custom, "full").map((q) => q.id)).toEqual(["what", "why", "extra"]);
    expect(custom.fileOrder).toEqual(["why", "what", "extra"]);
    expect(routeInfo(custom, "short").minutes).toBe(5);
    const s = emptySession();
    s.answers = { what: "A thing." };
    const md = buildMarkdown(custom, s);
    const headings = md.split("\n").filter((l) => l.startsWith("## "));
    expect(headings).toEqual(["## Why it exists", "## What it is", "## Anything else", "## Not covered (skipped or unknown)"]);
    expect(md).toContain("## What it is\n\nA thing.");
    expect(md).toContain("- Why it exists");
  });

  it("explains every problem in plain words", () => {
    const problems = (raw: unknown) => {
      try {
        parseConfig(raw);
        return [];
      } catch (error) {
        return (error as ConfigError).problems;
      }
    };
    expect(problems(null)[0]).toMatch(/JSON object/);
    expect(problems({ questions: [] })[0]).toMatch(/at least one question/);
    const many = problems({
      questions: [
        { id: "a", heading: "A", prompt: "A?", short: true },
        { id: "a", heading: "", prompt: "", kind: "wrong" },
        { id: "bad id", heading: "B", prompt: "B?" },
        { id: "c", heading: "C", prompt: "C?", kind: "repro" },
        { id: "d", heading: "D", prompt: "D?", kind: "repro" },
      ],
      fileOrder: ["a", "nope"],
    });
    expect(many.join("\n")).toMatch(/"a" is used twice/);
    expect(many.join("\n")).toMatch(/needs a "heading"/);
    expect(many.join("\n")).toMatch(/needs a "prompt"/);
    expect(many.join("\n")).toMatch(/"kind" must be one of/);
    expect(many.join("\n")).toMatch(/may only use letters/);
    expect(many.join("\n")).toMatch(/Only one question can have kind "repro"/);
    expect(many.join("\n")).toMatch(/"fileOrder" mentions "nope"/);
    expect(problems({ questions: [{ id: "x", heading: "X", prompt: "X?" }] }).join("\n")).toMatch(/short route would be empty/);
  });
});

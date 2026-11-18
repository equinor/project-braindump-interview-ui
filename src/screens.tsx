import { useCallback, useId, useMemo, useState, type ReactNode } from "react";
import {
  STATUSES,
  answeredCount,
  appendText,
  buildMarkdown,
  checkLink,
  countSentences,
  coverage,
  fileName,
  modelSuggestions,
  newId,
  questionsFor,
  routeInfo,
  sequence,
  siteOf,
  stageIntro,
  startingPointsFor,
  whyLabel,
  type Approach,
  type Header,
  type Question,
  type Route,
  type Session,
  type Status,
  type Tag,
} from "./domain";
import { useConfig } from "./config";
import { AnswerField, ListField } from "./voice";

// ---------- shared pieces ----------

export function Heading({ children, level = 1 }: { children: ReactNode; level?: 1 | 2 }) {
  // Move focus to the heading when a screen opens, so screen readers announce it.
  const setRef = useCallback((node: HTMLHeadingElement | null) => {
    node?.focus({ preventScroll: true });
  }, []);
  const Tag = level === 1 ? "h1" : "h2";
  return (
    <Tag ref={setRef} tabIndex={-1} className={level === 1 ? "title" : "subtitle"}>
      {children}
    </Tag>
  );
}

export function NavBar({
  onBack,
  onSkip,
  onNext,
  nextLabel = "Next question",
  nextDisabled = false,
  hint,
}: {
  onBack?: () => void;
  onSkip?: () => void;
  onNext: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
  hint?: string;
}) {
  return (
    <div className="nav">
      {hint && (
        <p className="nav__hint" role="status">
          {hint}
        </p>
      )}
      <div className="row">
        {onBack && (
          <button type="button" className="btn" onClick={onBack}>
            Back
          </button>
        )}
        {onSkip && (
          <button type="button" className="btn" onClick={onSkip}>
            Skip this question
          </button>
        )}
        <span className="row__spacer" />
        <button type="button" className="btn btn--primary" onClick={onNext} disabled={nextDisabled}>
          {nextLabel}
        </button>
      </div>
    </div>
  );
}

function ProgressLine({ session, id }: { session: Session; id: string }) {
  const config = useConfig();
  const list = questionsFor(config, session.route);
  const position = Math.max(0, list.findIndex((q) => q.id === id));
  return (
    <div className="progress">
      <progress value={position} max={list.length} aria-label="Questions answered so far" />
      <span>
        Question {position + 1} of {list.length}
        {session.route === "short" ? " (short route)" : ""}
      </span>
    </div>
  );
}

// ---------- 1 welcome ----------

export function Welcome({
  route,
  onRoute,
  onStart,
}: {
  route: Route;
  onRoute: (route: Route) => void;
  onStart: () => void;
}) {
  const config = useConfig();
  return (
    <section>
      <Heading>Talk through your project. You get a markdown file.</Heading>
      <dl className="consent">
        <div>
          <dt>You get</dt>
          <dd>A markdown file. You save it, then edit and publish it yourself.</dd>
        </div>
        <div>
          <dt>Your voice</dt>
          <dd>Turned into text on this computer, then the recording is deleted. Nothing is sent anywhere.</dd>
        </div>
        <div>
          <dt>You are in charge</dt>
          <dd>Skip any question, go back, or type instead. Please do not say passwords or personal details.</dd>
        </div>
      </dl>
      <fieldset className="choice">
        <legend>How long do you have?</legend>
        {(["short", "full"] as Route[]).map((r) => (
          <label key={r} className={route === r ? "choice__item choice__item--on" : "choice__item"}>
            <input type="radio" name="route" checked={route === r} onChange={() => onRoute(r)} />
            <span className="choice__title">{routeInfo(config, r).label}</span>
            <span>
              {routeInfo(config, r).questions} questions, about {routeInfo(config, r).minutes} minutes
            </span>
          </label>
        ))}
      </fieldset>
      <p className="muted">Skipped questions are listed under Not covered in the file.</p>
      <p className="muted">Recording works while the speech model loads. The text appears when it is ready.</p>
      <div className="nav">
        <div className="row">
          <span className="row__spacer" />
          <button type="button" className="btn btn--primary" onClick={onStart}>
            Start
          </button>
        </div>
      </div>
    </section>
  );
}

// ---------- 2 about this work ----------

export function About({
  header,
  onChange,
  onBack,
  onNext,
}: {
  header: Header;
  onChange: (patch: Partial<Header>) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const ids = { title: useId(), topic: useId(), author: useId(), repo: useId(), date: useId() };
  const repoOk = !header.repo.trim() || checkLink(header.repo).ok;
  const ready = header.title.trim() !== "" && header.author.trim() !== "" && repoOk;
  return (
    <section>
      <Heading>About this work</Heading>
      <p className="muted">Type or paste these. Anything left blank goes under Not covered.</p>
      <div className="grid">
        <div className="field">
          <label className="field__label" htmlFor={ids.title}>
            Title (required)
          </label>
          <input id={ids.title} className="input" value={header.title} onChange={(e) => onChange({ title: e.target.value })} />
        </div>
        <div className="field">
          <label className="field__label" htmlFor={ids.topic}>
            Topic tag
          </label>
          <input id={ids.topic} className="input" value={header.topic} onChange={(e) => onChange({ topic: e.target.value })} />
        </div>
        <div className="field">
          <label className="field__label" htmlFor={ids.author}>
            Author (required)
          </label>
          <input id={ids.author} className="input" value={header.author} onChange={(e) => onChange({ author: e.target.value })} />
        </div>
        <div className="field">
          <label className="field__label" htmlFor={ids.repo}>
            Repo link
          </label>
          <input
            id={ids.repo}
            className="input"
            value={header.repo}
            placeholder="https://"
            onChange={(e) => onChange({ repo: e.target.value })}
            aria-invalid={!repoOk}
          />
          {!repoOk && <p className="field__error">A link must start with http:// or https://.</p>}
        </div>
      </div>

      <fieldset className="choice choice--row">
        <legend>Status</legend>
        {STATUSES.map((s) => (
          <label key={s} className={header.status === s ? "pill pill--on" : "pill"}>
            <input type="radio" name="status" checked={header.status === s} onChange={() => onChange({ status: s as Status })} />
            {s}
          </label>
        ))}
      </fieldset>

      <div className="field field--narrow">
        <label className="field__label" htmlFor={ids.date}>
          Status as of
        </label>
        <input id={ids.date} className="input" type="date" value={header.statusAsOf} onChange={(e) => onChange({ statusAsOf: e.target.value })} />
        <p className="field__note">Today by default. Change it if the work stopped earlier.</p>
      </div>

      <NavBar onBack={onBack} onNext={onNext} nextLabel="Continue" nextDisabled={!ready} hint={ready ? undefined : "Needs a title and an author."} />
    </section>
  );
}

// ---------- 8 details for finding this ----------

export function Details({
  header,
  approaches,
  onChange,
  onBack,
  onNext,
}: {
  header: Header;
  approaches: Approach[];
  onChange: (patch: Partial<Header>) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  return (
    <section>
      <Heading>Details for finding this</Heading>
      <p className="muted">
        Optional. These fill the aliases, datasets, models and people in the file header. Anything left blank goes under Not covered.
      </p>
      <ListField id="details-aliases" label="Aliases (synonyms, older names)" items={header.aliases} onChange={(aliases) => onChange({ aliases })} placeholder="An older name or synonym" />
      <ListField id="details-datasets" label="Datasets" items={header.datasets} onChange={(datasets) => onChange({ datasets })} placeholder="A dataset name" />
      <ListField
        id="details-models"
        label="Models and methods"
        items={header.models}
        onChange={(models) => onChange({ models })}
        placeholder="A model or method"
        suggestions={modelSuggestions(header, approaches)}
        suggestionsLabel="From your approaches. Tap to add:"
      />
      <ListField
        id="details-people"
        label="People"
        items={header.people}
        onChange={(people) => onChange({ people })}
        placeholder="A name"
        note="Names only, for search. Why each person matters goes in your answer to the people question."
      />
      <NavBar onBack={onBack} onNext={onNext} nextLabel="Review" />
    </section>
  );
}

// ---------- 3 one question ----------

export function QuestionScreen({
  session,
  question,
  onAnswer,
  onBack,
  onNext,
  isLast,
}: {
  session: Session;
  question: Question;
  onAnswer: (id: string, value: string) => void;
  onBack: () => void;
  onNext: () => void;
  isLast: boolean;
}) {
  const [pending, setPending] = useState(0);
  const onPending = useCallback((_id: string, count: number) => setPending(count), []);
  const config = useConfig();
  const intro = stageIntro(config, session.route, question);
  const starts = startingPointsFor(question, session.header);
  const current = session.answers[question.id] ?? "";
  return (
    <section>
      {intro && (
        <div className="stage">
          <p className="stage__label">{intro.label}</p>
          {intro.why && <p className="stage__why">Why we ask: {intro.why}</p>}
        </div>
      )}
      <ProgressLine session={session} id={question.id} />
      <Heading level={2}>{question.prompt}</Heading>
      {starts.length > 0 && (
        <div className="starts" role="group" aria-label="Starting points">
          <p className="muted">Pick a starting point, or describe your own.</p>
          <div className="row">
            {starts.map((point) => (
              <button key={point} type="button" className="btn btn--small" onClick={() => onAnswer(question.id, appendText(current, point))}>
                {point}
              </button>
            ))}
          </div>
        </div>
      )}
      <AnswerField
        id={`q-${question.id}`}
        label="Your answer"
        value={session.answers[question.id] ?? ""}
        onChange={(value) => onAnswer(question.id, value)}
        hints={question.hints}
        primary
        rows={6}
        onPendingChange={onPending}
        note={question.maxSentences ? sentenceNote(session.answers[question.id] ?? "", question.maxSentences) : undefined}
      />
      <NavBar
        onBack={onBack}
        onSkip={(session.answers[question.id] ?? "").trim() === "" ? onNext : undefined}
        onNext={onNext}
        nextLabel={isLast ? "Review" : "Next question"}
        nextDisabled={pending > 0}
        hint={pending > 0 ? "An answer is still being recorded or turned into text." : undefined}
      />
    </section>
  );
}

function sentenceNote(text: string, max: number): string {
  const n = countSentences(text);
  const word = max === 1 ? "sentence" : "sentences";
  if (n === 0) return `Up to ${max} short ${word} work best.`;
  return n > max ? `${n} sentences. ${max} short ${max === 1 ? "one works" : "ones work"} best.` : `${n} of ${max} ${word}.`;
}

// ---------- 4 to 6 approaches ----------

const TAGS: { value: Exclude<Tag, "">; label: string }[] = [
  { value: "worked", label: "Worked" },
  { value: "dead-end", label: "Dead end" },
  { value: "unsure", label: "Not sure" },
];

function tagLabel(tag: Tag): string {
  return TAGS.find((t) => t.value === tag)?.label.toLowerCase() ?? "";
}

export function ApproachesScreen({
  session,
  question,
  onChange,
  onBack,
  onNext,
}: {
  session: Session;
  question: Question;
  onChange: (approaches: Approach[]) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const [editing, setEditing] = useState<Approach | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const approaches = session.approaches;

  if (editing) {
    return (
      <ApproachForm
        key={editing.id}
        number={Math.max(approaches.findIndex((a) => a.id === editing.id) + 1, approaches.length + (approaches.some((a) => a.id === editing.id) ? 0 : 1))}
        initial={editing}
        onCancel={() => setEditing(null)}
        onSave={(saved) => {
          const exists = approaches.some((a) => a.id === saved.id);
          onChange(exists ? approaches.map((a) => (a.id === saved.id ? saved : a)) : [...approaches, saved]);
          setEditing(null);
        }}
      />
    );
  }

  const add = () => setEditing({ id: newId(), name: "", tag: "", idea: "", why: "", links: [] });

  return (
    <section>
      <ProgressLine session={session} id={question.id} />
      <Heading level={2}>{question.prompt}</Heading>
      {approaches.length === 0 ? (
        <div className="panel">
          <p>Nothing added yet. Add each thing you tried, one at a time, in any order.</p>
          <p className="muted">Nothing to add? Skip this question. It is listed under Not covered in the file.</p>
          <button type="button" className="btn btn--primary" onClick={add}>
            Add an approach
          </button>
        </div>
      ) : (
        <>
          <p className="muted">
            Your list: {approaches.length} {approaches.length === 1 ? "approach" : "approaches"} so far. Add as many as you need, in any order.
          </p>
          <ol className="cards">
            {approaches.map((a, index) => (
              <li key={a.id} className="card">
                <div className="card__head">
                  <h3>
                    {index + 1}. {a.name || "Unnamed"}
                  </h3>
                  {a.tag && <span className={`tag tag--${a.tag}`}>{tagLabel(a.tag)}</span>}
                </div>
                {a.idea && (
                  <p>
                    <strong>Idea:</strong> {firstLine(a.idea)}
                  </p>
                )}
                {a.why && (
                  <p>
                    <strong>{whyLabel(a.tag)}:</strong> {firstLine(a.why)}
                  </p>
                )}
                {a.links.length > 0 && (
                  <p className="muted">
                    {a.links.length} {a.links.length === 1 ? "link" : "links"}: {a.links.map(siteOf).join(", ")}
                  </p>
                )}
                <div className="row">
                  <button type="button" className="btn btn--small" onClick={() => setEditing(a)}>
                    Edit
                  </button>
                  {confirmDelete === a.id ? (
                    <>
                      <button
                        type="button"
                        className="btn btn--small"
                        onClick={() => {
                          onChange(approaches.filter((x) => x.id !== a.id));
                          setConfirmDelete(null);
                        }}
                      >
                        Yes, delete
                      </button>
                      <button type="button" className="btn btn--small" onClick={() => setConfirmDelete(null)}>
                        Keep it
                      </button>
                    </>
                  ) : (
                    <button type="button" className="btn btn--small" onClick={() => setConfirmDelete(a.id)}>
                      Delete
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ol>
          <button type="button" className="btn" onClick={add}>
            Add another approach
          </button>
        </>
      )}
      <NavBar
        onBack={onBack}
        onSkip={approaches.length === 0 ? onNext : undefined}
        onNext={onNext}
        nextLabel={approaches.length === 0 ? "Next question" : "Done, next question"}
      />
    </section>
  );
}

function firstLine(text: string): string {
  const line = text.trim().split("\n")[0];
  return line.length > 140 ? `${line.slice(0, 140)}…` : line;
}

function ApproachForm({
  number,
  initial,
  onCancel,
  onSave,
}: {
  number: number;
  initial: Approach;
  onCancel: () => void;
  onSave: (approach: Approach) => void;
}) {
  const [draft, setDraft] = useState<Approach>(initial);
  const [pendingById, setPendingById] = useState<Record<string, number>>({});
  const [linkInput, setLinkInput] = useState("");
  const [linkError, setLinkError] = useState<string | null>(null);
  const nameId = useId();
  const linkId = useId();
  const pending = useMemo(() => Object.values(pendingById).reduce((a, b) => a + b, 0), [pendingById]);
  const onPending = useCallback((id: string, count: number) => setPendingById((p) => (p[id] === count ? p : { ...p, [id]: count })), []);

  const addLink = () => {
    const check = checkLink(linkInput);
    if (!check.ok) {
      setLinkError(check.reason);
      return;
    }
    if (!draft.links.includes(check.url)) setDraft({ ...draft, links: [...draft.links, check.url] });
    setLinkInput("");
    setLinkError(null);
  };

  const whyText =
    draft.tag === "worked" ? "Why did it work?" : draft.tag === "dead-end" ? "Why did it fail?" : "Why did it work or fail?";

  return (
    <section>
      <Heading level={2}>{initial.name ? "Edit approach" : `New approach (number ${number})`}</Heading>
      <div className="steps">
        <div className="field">
          <label className="field__label" htmlFor={nameId}>
            1. Name it (required)
          </label>
          <input id={nameId} className="input" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="A short name, for example Gradient boosting" />
        </div>

        <fieldset className="choice choice--row">
          <legend>2. How did it go?</legend>
          {TAGS.map((t) => (
            <label key={t.value} className={draft.tag === t.value ? "pill pill--on" : "pill"}>
              <input type="radio" name="tag" checked={draft.tag === t.value} onChange={() => setDraft({ ...draft, tag: t.value })} />
              {t.label}
            </label>
          ))}
        </fieldset>

        <AnswerField id="approach-idea" label="3. What was the idea?" value={draft.idea} onChange={(idea) => setDraft((d) => ({ ...d, idea }))} rows={4} onPendingChange={onPending} />
        <AnswerField id="approach-why" label={`4. ${whyText}`} value={draft.why} onChange={(why) => setDraft((d) => ({ ...d, why }))} rows={4} onPendingChange={onPending} />

        <div className="field">
          <label className="field__label" htmlFor={linkId}>
            5. Links (optional, as many as you like)
          </label>
          {draft.links.length > 0 && (
            <ul className="links">
              {draft.links.map((url) => (
                <li key={url}>
                  <a href={url} target="_blank" rel="noreferrer noopener">
                    {url}
                  </a>
                  <span className="chip chip--site">{siteOf(url)}</span>
                  <button type="button" className="btn btn--small" onClick={() => setDraft({ ...draft, links: draft.links.filter((l) => l !== url) })}>
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="row row--grow">
            <input
              id={linkId}
              className="input"
              value={linkInput}
              placeholder="Paste a link: a branch, pull request, notebook, ticket, doc or page"
              onChange={(e) => {
                setLinkInput(e.target.value);
                setLinkError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addLink();
                }
              }}
              aria-invalid={linkError !== null}
            />
            <button type="button" className="btn" onClick={addLink} disabled={!linkInput.trim()}>
              Add link
            </button>
          </div>
          {linkError && (
            <p className="field__error" role="alert">
              {linkError}
            </p>
          )}
          <p className="field__note">Any link works. Add as many as you need.</p>
        </div>
      </div>

      <div className="nav">
        {pending > 0 && <p className="nav__hint">An answer is still being recorded or turned into text.</p>}
        {draft.name.trim() === "" && <p className="nav__hint">Only the name is needed to save.</p>}
        <div className="row">
          <button type="button" className="btn btn--primary" disabled={draft.name.trim() === "" || pending > 0} onClick={() => onSave({ ...draft, name: draft.name.trim() })}>
            Save approach
          </button>
          <button type="button" className="btn" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </section>
  );
}

// ---------- 7 reproducibility ----------

export function ReproScreen({
  session,
  question,
  onChange,
  onBack,
  onNext,
}: {
  session: Session;
  question: Question;
  onChange: (patch: Partial<Session["repro"]>) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const dateId = useId();
  const [pendingById, setPendingById] = useState<Record<string, number>>({});
  const pending = Object.values(pendingById).reduce((a, b) => a + b, 0);
  const onPending = useCallback((id: string, count: number) => setPendingById((p) => (p[id] === count ? p : { ...p, [id]: count })), []);
  const empty = !session.repro.text.trim() && !session.repro.commands.trim() && !session.repro.lastChecked;
  return (
    <section>
      <ProgressLine session={session} id={question.id} />
      <Heading level={2}>{question.prompt}</Heading>
      <AnswerField id="q-repro" label="Your answer" value={session.repro.text} onChange={(text) => onChange({ text })} hints={question.hints} primary rows={4} onPendingChange={onPending} />
      <AnswerField
        id="repro-commands"
        label="Commands: paste them, do not say them"
        value={session.repro.commands}
        onChange={(commands) => onChange({ commands })}
        mono
        rows={4}
        note="Speech is poor for commands and links, so these are typed or pasted."
        recordLabel="Say it instead"
        onPendingChange={onPending}
      />
      <div className="field field--narrow">
        <label className="field__label" htmlFor={dateId}>
          Last checked
        </label>
        <input id={dateId} className="input" type="date" value={session.repro.lastChecked} onChange={(e) => onChange({ lastChecked: e.target.value })} />
      </div>
      <NavBar onBack={onBack} onSkip={empty ? onNext : undefined} onNext={onNext} nextDisabled={pending > 0} hint={pending > 0 ? "An answer is still being recorded or turned into text." : undefined} />
    </section>
  );
}

// ---------- 8 review and save ----------

export function Review({
  session,
  onBack,
  onJump,
  onSave,
}: {
  session: Session;
  onBack: () => void;
  onJump: (id: string) => void;
  onSave: (markdown: string, name: string) => void;
}) {
  const config = useConfig();
  const generated = useMemo(() => buildMarkdown(config, session), [config, session]);
  const [edited, setEdited] = useState<string | null>(null);
  const text = edited ?? generated;
  const rows = coverage(config, session);
  const name = fileName(session);
  const [copied, setCopied] = useState(false);
  const areaId = useId();

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <section>
      <Heading>Review and save</Heading>
      <p className="muted">Skim for names and acronyms the transcript got wrong. Fix anything. Nothing is saved until you press Save file.</p>
      <p className="filename">{name}</p>
      <div className="review">
        <div className="field">
          <label className="field__label" htmlFor={areaId}>
            The markdown file
          </label>
          <textarea id={areaId} className="input input--mono input--tall" value={text} onChange={(e) => setEdited(e.target.value)} spellCheck={false} />
          {edited !== null && (
            <p className="field__note">
              You edited the file directly. These edits are not carried back to your answers.{" "}
              <button type="button" className="link" onClick={() => setEdited(null)}>
                Discard my edits
              </button>
            </p>
          )}
        </div>
        <aside className="outline" aria-label="Sections">
          <h2 className="outline__title">Sections</h2>
          <ul>
            {rows.map((r) => (
              <li key={r.id} className={r.covered ? "outline__item outline__item--covered" : "outline__item outline__item--skipped"}>
                <span>
                  {r.heading.split(" (")[0]}
                  <span className="outline__state"> {r.covered ? "covered" : "skipped"}</span>
                </span>
                <button type="button" className="btn btn--small" onClick={() => onJump(r.id)}>
                  {r.covered ? "Edit" : "Answer now"}
                </button>
              </li>
            ))}
          </ul>
          <p className="muted">The Not covered section at the end of the file lists what was skipped.</p>
        </aside>
      </div>
      <div className="nav">
        <div className="row">
          <button type="button" className="btn" onClick={onBack}>
            Back
          </button>
          <button type="button" className="btn" onClick={copy}>
            {copied ? "Copied" : "Copy as markdown"}
          </button>
          <span className="row__spacer" />
          <button type="button" className="btn btn--primary" onClick={() => onSave(text, name)}>
            Save file
          </button>
        </div>
      </div>
    </section>
  );
}

// ---------- saved and resume ----------

export function Saved({
  name,
  markdown,
  onAnother,
}: {
  name: string;
  markdown: string;
  onAnother: () => void;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <section>
      <Heading>Saved</Heading>
      <p className="callout callout--ok" role="status">
        {name} was downloaded.
      </p>
      <p>Open the file, edit it, then publish it yourself. This tool stops at the saved file.</p>
      <div className="nav">
        <div className="row">
          <button
            type="button"
            className="btn"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(markdown);
                setCopied(true);
              } catch {
                setCopied(false);
              }
            }}
          >
            {copied ? "Copied" : "Copy as markdown"}
          </button>
          <span className="row__spacer" />
          <button type="button" className="btn btn--primary" onClick={onAnother}>
            Start another
          </button>
        </div>
      </div>
      <p className="muted">Start another clears your saved answers from this browser.</p>
    </section>
  );
}

export function Resume({
  session,
  onContinue,
  onStartOver,
}: {
  session: Session;
  onContinue: () => void;
  onStartOver: () => void;
}) {
  const config = useConfig();
  const { answered, total } = answeredCount(config, session);
  const steps = sequence(config, session.route);
  const next = steps[Math.min(session.stepIndex, steps.length - 1)];
  const left = questionsFor(config, session.route)
    .filter((q) => !coverage(config, session).find((c) => c.id === q.id)?.covered)
    .map((q) => q.heading.split(" (")[0]);
  return (
    <section>
      <Heading>Welcome back</Heading>
      <p className="subtitle">Project: {session.header.title || "not named yet"}</p>
      <p>
        {answered} of {total} questions answered.
      </p>
      <progress value={answered} max={total} aria-label="Questions answered" />
      <div className="panel">
        {left.length > 0 ? <p>Left: {left.join(", ")}.</p> : <p>Every question has an answer.</p>}
        <p className="muted">Your text is saved in this browser. Recordings are never saved.</p>
      </div>
      <div className="nav">
        <div className="row">
          <button type="button" className="btn btn--primary" onClick={onContinue}>
            {next.kind === "question" ? "Pick up where you left off" : "Continue"}
          </button>
          <button type="button" className="btn" onClick={onStartOver}>
            Start over
          </button>
        </div>
      </div>
    </section>
  );
}

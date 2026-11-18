import { useEffect, useMemo, useState } from "react";
import logo from "../branding/equinor-logo-horizontal-red.svg";
import { ConfigGate, useConfig } from "./config";
import { configKey, emptySession, questionById, sequence, type Header, type Route, type Session } from "./domain";
import { About, ApproachesScreen, Details, QuestionScreen, ReproScreen, Resume, Review, Saved, Welcome } from "./screens";
import { clearSession, loadSession, saveSession } from "./storage";
import { ModelStatusPill, TranscriptionProvider } from "./transcription";

export function App() {
  return (
    <TranscriptionProvider>
      <ConfigGate>
        <Shell />
      </ConfigGate>
    </TranscriptionProvider>
  );
}

function download(markdown: string, name: string) {
  const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function Shell() {
  const config = useConfig();
  const [session, setSession] = useState<Session>(() => {
    const stored = loadSession();
    if (!stored) return emptySession();
    // A finished interview starts fresh next time.
    if (stored.stepIndex >= sequence(config, stored.route).length - 1) return emptySession();
    // The questions file changed since this was saved: keep the answers, go back to the About form.
    if (stored.configKey !== configKey(config)) return { ...stored, stepIndex: Math.min(stored.stepIndex, 1), configKey: configKey(config) };
    return stored;
  });
  const [resume, setResume] = useState(() => session.stepIndex > 1);
  const [saved, setSaved] = useState<{ markdown: string; name: string } | null>(null);

  const steps = useMemo(() => sequence(config, session.route), [config, session.route]);
  const index = Math.min(session.stepIndex, steps.length - 1);
  const step = steps[index];

  useEffect(() => {
    saveSession({ ...session, configKey: configKey(config) });
  }, [session, config]);

  const goTo = (target: number) => {
    setSession((s) => ({ ...s, stepIndex: Math.max(0, Math.min(target, sequence(config, s.route).length - 1)) }));
    window.scrollTo({ top: 0 });
  };
  const next = () => goTo(index + 1);
  const back = () => goTo(index - 1);

  const setHeader = (patch: Partial<Header>) => setSession((s) => ({ ...s, header: { ...s.header, ...patch } }));
  const setAnswer = (id: string, value: string) => setSession((s) => ({ ...s, answers: { ...s.answers, [id]: value } }));
  const setRoute = (route: Route) => setSession((s) => ({ ...s, route }));

  const jump = (id: string) => {
    const full = sequence(config, "full").findIndex((s) => s.kind === "question" && s.id === id);
    const inRoute = steps.findIndex((s) => s.kind === "question" && s.id === id);
    if (inRoute >= 0) return goTo(inRoute);
    // The question is not on the short route: switch to the full route so it can be answered.
    setSession((s) => ({ ...s, route: "full", stepIndex: full }));
    window.scrollTo({ top: 0 });
  };

  const startOver = () => {
    clearSession();
    setSaved(null);
    setSession(emptySession());
    setResume(false);
  };

  let body;
  if (resume) {
    body = <Resume session={session} onContinue={() => setResume(false)} onStartOver={startOver} />;
  } else if (step.kind === "welcome") {
    body = <Welcome route={session.route} onRoute={setRoute} onStart={next} />;
  } else if (step.kind === "about") {
    body = <About header={session.header} onChange={setHeader} onBack={back} onNext={next} />;
  } else if (step.kind === "question") {
    const question = questionById(config, step.id);
    const isLast = steps[index + 1]?.kind === "review";
    if (question.kind === "approaches") {
      body = <ApproachesScreen session={session} question={question} onChange={(approaches) => setSession((s) => ({ ...s, approaches }))} onBack={back} onNext={next} />;
    } else if (question.kind === "repro") {
      body = <ReproScreen session={session} question={question} onChange={(patch) => setSession((s) => ({ ...s, repro: { ...s.repro, ...patch } }))} onBack={back} onNext={next} />;
    } else {
      body = <QuestionScreen key={question.id} session={session} question={question} onAnswer={setAnswer} onBack={back} onNext={next} isLast={isLast} />;
    }
  } else if (step.kind === "details") {
    body = <Details header={session.header} approaches={session.approaches} onChange={setHeader} onBack={back} onNext={next} />;
  } else if (step.kind === "review") {
    body = (
      <Review
        session={session}
        onBack={back}
        onJump={jump}
        onSave={(markdown, name) => {
          download(markdown, name);
          setSaved({ markdown, name });
          next();
        }}
      />
    );
  } else {
    body = <Saved name={saved?.name ?? "Your file"} markdown={saved?.markdown ?? ""} onAnother={startOver} />;
  }

  return (
    <>
      <header className="masthead">
        <div className="masthead__inner">
          <img className="masthead__logo" src={logo} alt="Equinor" />
          <span className="masthead__title">Project braindump</span>
          <ModelStatusPill />
        </div>
      </header>
      <main className={step.kind === "review" && !resume ? "page page--wide" : "page"}>{body}</main>
    </>
  );
}

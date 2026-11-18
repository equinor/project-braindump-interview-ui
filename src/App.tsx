import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  buildQuestionSequence,
  createEmptyAnswers,
  estimateMinutes,
  interviewConfig,
  makeFileName,
  questionProgress,
  toMarkdown,
  type DraftAnswer,
  type InterviewDraft,
  type Route,
  type SourceMark,
} from "./domain";
import { ParakeetTranscriber } from "./transcriber";

const DRAFT_KEY = "exit-interview-draft-v1";
const transcriber = new ParakeetTranscriber();
type Screen = "welcome" | "question" | "review" | "saved";
type RecordingState = "idle" | "recording" | "paused";
type AudioItem = { blob: Blob; name: string; seconds: number; url: string };
type FolderHandle = {
  name: string;
  queryPermission(options: { mode: "readwrite" }): Promise<PermissionState>;
  requestPermission(options: { mode: "readwrite" }): Promise<PermissionState>;
  getFileHandle(
    name: string,
    options: { create: boolean },
  ): Promise<{ createWritable(): Promise<{ write(data: string): Promise<void>; close(): Promise<void> }> }>;
};

const emptyDraft = (): InterviewDraft => ({
  projectName: "",
  role: "",
  reason: "ending",
  projectTypes: [],
  route: "short",
  currentIndex: 0,
  answers: {},
  promptOpen: {},
  updatedAt: Date.now(),
});

export default function App() {
  const [draft, setDraft] = useState<InterviewDraft>(emptyDraft);
  const [screen, setScreen] = useState<Screen>("welcome");
  const [hasDraft, setHasDraft] = useState(false);
  const [storageAvailable, setStorageAvailable] = useState(true);
  const [folder, setFolder] = useState<FolderHandle | null>(null);
  const [model, setModel] = useState({ state: transcriber.state, percent: 0 });
  const [message, setMessage] = useState("");
  const [questionListOpen, setQuestionListOpen] = useState(true);
  const [error, setError] = useState("");
  const [recordingState, setRecordingState] = useState<RecordingState>("idle");
  const [seconds, setSeconds] = useState(0);
  const [level, setLevel] = useState(0);
  const [audioByQuestion, setAudioByQuestion] = useState<Record<string, AudioItem[]>>({});
  const [savedLocation, setSavedLocation] = useState("");
  const [savedFilename, setSavedFilename] = useState("");
  const [removeDraft, setRemoveDraft] = useState(true);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordingStartedAt = useRef(0);
  const recordingDurationRef = useRef(0);
  const recordingPausedRef = useRef(false);
  const timerRef = useRef<number | undefined>(undefined);
  const audioContextRef = useRef<AudioContext | null>(null);
  const levelFrameRef = useRef<number | undefined>(undefined);
  const transcriptionQueueRef = useRef<Promise<void>>(Promise.resolve());
  const modelReadyRef = useRef<Promise<void>>(Promise.resolve());
  const completedAudioRef = useRef(new WeakSet<Blob>());

  const questions = useMemo(
    () => buildQuestionSequence(draft.projectTypes, draft.route),
    [draft.projectTypes, draft.route],
  );
  const activeQuestion = questions[draft.currentIndex];
  const answers = draft.answers;
  const progress = questionProgress(questions, answers, draft.currentIndex, draft.route);
  const pendingCount = Object.values(answers).filter(
    (answer) => answer.transcription === "queued" || answer.transcription === "running",
  ).length;

  useEffect(() => {
    try {
      const saved = localStorage.getItem(DRAFT_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as InterviewDraft;
        if (parsed.projectName && parsed.answers) {
          setDraft({
            ...parsed,
            answers: Object.fromEntries(
              Object.entries(parsed.answers).map(([id, answer]) => [
                id,
                {
                  ...answer,
                  state: (answer.state as string) === "unknown" ? "other" : answer.state,
                  mark: answer.mark ?? "first-hand",
                },
              ]),
            ),
          });
          setHasDraft(true);
        }
      }
    } catch {
      setStorageAvailable(false);
    }

    void prepareTranscriber();
    return () => {
      window.clearInterval(timerRef.current);
      if (levelFrameRef.current) cancelAnimationFrame(levelFrameRef.current);
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  function prepareTranscriber() {
    const preparation = transcriber.prepare((progress) =>
      setModel({ state: "loading", percent: progress.percent }),
    );
    modelReadyRef.current = preparation;
    void preparation.then(
      () => {
        setModel({ state: "ready", percent: 100 });
        setError("");
      },
      (reason: unknown) => {
        setModel({ state: "failed", percent: 0 });
        setError(reason instanceof Error ? reason.message : String(reason));
      },
    );
    return preparation;
  }

  useEffect(() => {
    if (screen === "question" || screen === "review" || screen === "welcome") {
      headingRef.current?.focus();
    }
  }, [screen, draft.currentIndex]);

  useEffect(() => {
    try {
      if (draft.projectName && Object.keys(draft.answers).length) {
        localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...draft, updatedAt: Date.now() }));
        setHasDraft(true);
      }
    } catch {
      setStorageAvailable(false);
    }
  }, [draft]);

  useEffect(() => {
    const unsaved = recordingState === "recording" || recordingState === "paused" || pendingCount > 0;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!unsaved) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [recordingState, pendingCount]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === "Enter" && screen === "question") {
        event.preventDefault();
        goNext();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const updateDraft = useCallback((patch: Partial<InterviewDraft>) => {
    setDraft((current) => ({ ...current, ...patch, updatedAt: Date.now() }));
  }, []);

  function ensureAnswer(questionId: string): DraftAnswer {
    return (
      draft.answers[questionId] ?? {
        state: "waiting",
        text: "",
        machineText: "",
        mark: "first-hand",
        transcription: "idle",
      }
    );
  }

  function updateAnswer(questionId: string, patch: Partial<DraftAnswer>) {
    setDraft((current) => ({
      ...current,
      updatedAt: Date.now(),
      answers: {
        ...current.answers,
        [questionId]: {
          ...(current.answers[questionId] ?? {
            state: "waiting",
            text: "",
            machineText: "",
            mark: "first-hand",
            transcription: "idle",
          }),
          ...patch,
        },
      },
    }));
  }

  function startInterview() {
    if (!draft.projectName.trim() || !draft.role.trim()) {
      setError("Add the project name and your role before you start.");
      return;
    }
    const sequence = buildQuestionSequence(draft.projectTypes, draft.route);
    updateDraft({
      answers: createEmptyAnswers(sequence),
      currentIndex: 0,
    });
    setHasDraft(true);
    setScreen("question");
    setQuestionListOpen(true);
    setError("");
  }

  function continueInterview() {
    setDraft((current) => {
      const sequence = buildQuestionSequence(current.projectTypes, current.route);
      const next = Object.keys(current.answers).length
        ? current.answers
        : createEmptyAnswers(sequence);
      return { ...current, answers: next, currentIndex: Math.min(current.currentIndex, sequence.length - 1) };
    });
    setScreen("question");
    setQuestionListOpen(true);
  }

  function discardDraft() {
    if (!window.confirm("Start again? This removes the saved answers on this computer.")) return;
    localStorage.removeItem(DRAFT_KEY);
    setDraft(emptyDraft());
    setHasDraft(false);
    setScreen("welcome");
    setError("");
  }

  async function chooseFolder() {
    const picker = (window as Window & {
      showDirectoryPicker?: () => Promise<FolderHandle>;
    }).showDirectoryPicker;
    if (!picker) {
      setError("This browser can't choose a save folder. The interview will download at the end.");
      return;
    }
    try {
      const selected = await picker();
      setFolder(selected);
      setError("");
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === "AbortError") return;
      setError("The folder wasn't selected. You can still save by downloading the file.");
    }
  }

  function toggleType(typeId: string, checked: boolean) {
    const selected = draft.projectTypes.filter((id) => id !== typeId && id !== "none");
    if (typeId === "none" && checked) updateDraft({ projectTypes: ["none"] });
    else updateDraft({ projectTypes: checked ? [...selected, typeId] : selected });
  }

  function goToQuestion(index: number) {
    if (recordingState !== "idle") {
      setError("Stop or pause your recording before moving to another question.");
      return;
    }
    updateDraft({ currentIndex: index });
    setScreen("question");
    setError("");
  }

  function goNext() {
    if (recordingState !== "idle") {
      setError("Stop or pause your recording before moving to another question.");
      return;
    }
    if (draft.currentIndex < questions.length - 1) {
      updateDraft({ currentIndex: draft.currentIndex + 1 });
    } else {
      setScreen("review");
    }
    setError("");
  }

  function goBack() {
    if (draft.currentIndex > 0) updateDraft({ currentIndex: draft.currentIndex - 1 });
    setError("");
  }

  function changeState(questionId: string, state: DraftAnswer["state"]) {
    const answer = ensureAnswer(questionId);
    updateAnswer(questionId, {
      state: answer.state === state ? (answer.text.trim() ? "answered" : "waiting") : state,
      transcription: answer.state === state ? answer.transcription : "idle",
    });
  }

  async function beginRecording() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("This browser can't record audio. You can upload a recording or type your answer.");
      return;
    }
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((type) =>
        MediaRecorder.isTypeSupported(type),
      );
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        const totalMs = recordingDurationRef.current +
          (!recordingPausedRef.current
            ? Date.now() - recordingStartedAt.current
            : 0);
        const elapsed = Math.min(300, Math.max(1, Math.round(totalMs / 1000)));
        addAudio(blob, `Recording ${new Date().toLocaleTimeString()}`, elapsed, activeQuestion.id);
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        window.clearInterval(timerRef.current);
        setRecordingState("idle");
        setSeconds(elapsed);
        recordingDurationRef.current = 0;
        recordingPausedRef.current = false;
        setMessage(elapsed >= 300
          ? "Recording stopped at the 5-minute limit. You can add more with Record more."
          : "Recording stopped. Your audio is on this computer.");
      };
      recorder.start();
      recordingStartedAt.current = Date.now();
      recordingDurationRef.current = 0;
      recordingPausedRef.current = false;
      setRecordingState("recording");
      setSeconds(0);
      setMessage("Recording started.");
      startMeter(stream);
      startRecordingTimer(recorder);
    } catch (reason) {
      const name = reason instanceof DOMException ? reason.name : "";
      setError(
        name === "NotFoundError"
          ? "We can't find a microphone. You can upload a recording or type your answer."
          : "The microphone is blocked. Click the icon in the address bar, allow the microphone, then try again. You can also upload a recording or type your answer.",
      );
    }
  }

  function startMeter(stream: MediaStream) {
    try {
      const context = new AudioContext();
      audioContextRef.current = context;
      const analyser = context.createAnalyser();
      const source = context.createMediaStreamSource(stream);
      source.connect(analyser);
      analyser.fftSize = 256;
      const values = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteTimeDomainData(values);
        const average = values.reduce((sum, value) => sum + Math.abs(value - 128), 0) / values.length;
        setLevel(Math.min(100, Math.round(average * 2.8)));
        levelFrameRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch {
      setLevel(0);
    }
  }

  function pauseRecording() {
    const recorder = recorderRef.current;
    if (!recorder) return;
    if (recorder.state === "recording") {
      recordingDurationRef.current += Date.now() - recordingStartedAt.current;
      recordingPausedRef.current = true;
      window.clearInterval(timerRef.current);
      recorder.pause();
      setRecordingState("paused");
      setMessage("Recording paused.");
    } else if (recorder.state === "paused") {
      recorder.resume();
      recordingStartedAt.current = Date.now();
      recordingPausedRef.current = false;
      setRecordingState("recording");
      setMessage("Recording resumed.");
      startRecordingTimer(recorder);
    }
  }

  function startRecordingTimer(recorder: MediaRecorder) {
    window.clearInterval(timerRef.current);
    timerRef.current = window.setInterval(() => {
      const elapsed = Math.floor(
        (recordingDurationRef.current + Date.now() - recordingStartedAt.current) / 1000,
      );
      setSeconds(elapsed);
      if (elapsed === interviewConfig.limits.warnAtSeconds) setMessage("30 seconds left.");
      if (elapsed >= interviewConfig.limits.maxAnswerSeconds && recorder.state !== "inactive") recorder.stop();
    }, 250);
  }

  function stopRecording() {
    if (recorderRef.current && recorderRef.current.state !== "inactive") recorderRef.current.stop();
    if (levelFrameRef.current) cancelAnimationFrame(levelFrameRef.current);
    void audioContextRef.current?.close();
    setLevel(0);
  }

  function addAudio(blob: Blob, name: string, length: number, questionId: string) {
    const item = { blob, name, seconds: length, url: URL.createObjectURL(blob) };
    setAudioByQuestion((current) => ({
      ...current,
      [questionId]: [...(current[questionId] ?? []), item],
    }));
    updateAnswer(questionId, { state: "answered", transcription: "queued" });
    setMessage("Audio saved on this computer. You can keep answering while transcription runs.");
    void transcribeAudio(item, questionId);
  }

  function transcribeAudio(item: AudioItem, questionId: string) {
    updateAnswer(questionId, { transcription: "queued" });
    const queued = transcriptionQueueRef.current.then(async () => {
      updateAnswer(questionId, { transcription: "running" });
      try {
        await modelReadyRef.current;
        const samples = await decodeToMono16k(item.blob);
        const result = await transcriber.transcribe(samples);
        completedAudioRef.current.add(item.blob);
        setDraft((current) => {
          const previous = current.answers[questionId] ?? {
            state: "waiting" as const,
            text: "",
            machineText: "",
            transcription: "idle" as const,
          };
          const machineText = [previous.machineText, result.text].filter(Boolean).join("\n\n");
          const text = previous.text === previous.machineText || !previous.text
            ? machineText
            : [previous.text, result.text].filter(Boolean).join("\n\n");
          return {
            ...current,
            updatedAt: Date.now(),
            answers: {
              ...current.answers,
              [questionId]: { ...previous, text, machineText, state: "answered", transcription: "done" },
            },
          };
        });
        setMessage("Transcription done.");
      } catch {
        updateAnswer(questionId, {
          transcription: "failed",
          error: "We couldn't turn this into text. Try again, or type your answer. Your recording is still here.",
        });
      }
    });
    transcriptionQueueRef.current = queued;
    return queued;
  }

  async function retryTranscription(questionId: string) {
    const items = (audioByQuestion[questionId] ?? []).filter(
      (item) => !completedAudioRef.current.has(item.blob),
    );
    for (const item of items) await transcribeAudio(item, questionId);
  }

  function recordAgain(questionId: string) {
    (audioByQuestion[questionId] ?? []).forEach((item) => URL.revokeObjectURL(item.url));
    setAudioByQuestion((current) => ({ ...current, [questionId]: [] }));
    updateAnswer(questionId, {
      state: "waiting",
      text: "",
      machineText: "",
      transcription: "idle",
      mark: "first-hand",
      error: undefined,
    });
    void beginRecording();
  }

  function uploadFile(file?: File) {
    if (!file || !activeQuestion) return;
    const supported = /\.(mp3|m4a|wav|webm|ogg)$/i.test(file.name) || file.type.startsWith("audio/");
    if (!supported) {
      setError("We can't read that file. Try an mp3, m4a, wav, webm or ogg recording.");
      return;
    }
    const item = { blob: file, name: file.name, seconds: 0, url: URL.createObjectURL(file) };
    const audio = new Audio();
    audio.preload = "metadata";
    audio.onloadedmetadata = () => {
      if (audio.duration > interviewConfig.limits.maxAnswerSeconds) {
        URL.revokeObjectURL(item.url);
        setError("That recording is longer than 5 minutes. Cut it into shorter parts and add them one by one.");
        return;
      }
      item.seconds = Math.ceil(audio.duration || 1);
      setAudioByQuestion((current) => ({
        ...current,
        [activeQuestion.id]: [...(current[activeQuestion.id] ?? []), item],
      }));
      updateAnswer(activeQuestion.id, { state: "answered", transcription: "queued" });
      setMessage(`Added ${file.name}. It will be transcribed in the background.`);
      void transcribeAudio(item, activeQuestion.id);
      setError("");
    };
    audio.onerror = () => {
      URL.revokeObjectURL(item.url);
      setError("We can't read that file. Try an mp3, m4a, wav, webm or ogg recording.");
    };
    audio.src = item.url;
  }

  function createDraftFromCurrent(): InterviewDraft {
    return {
      ...draft,
      answers: { ...draft.answers },
    };
  }

  async function saveInterview() {
    const content = toMarkdown(createDraftFromCurrent());
    let filename = makeFileName(draft.projectName);
    let location = "downloads";
    if (folder) {
      try {
        let permission = await folder.queryPermission({ mode: "readwrite" });
        if (permission !== "granted") permission = await folder.requestPermission({ mode: "readwrite" });
        if (permission !== "granted") throw new Error("Permission refused");
        filename = await writeUniqueFile(folder, filename, content);
        location = folder.name;
      } catch {
        downloadFile(filename, content);
        setError("We couldn't save to that folder, so we downloaded the file instead.");
      }
    } else {
      downloadFile(filename, content);
    }
    setSavedFilename(filename);
    setSavedLocation(location);
    setScreen("saved");
    setMessage("Interview saved.");
  }

  async function writeUniqueFile(handle: FolderHandle, originalName: string, content: string) {
    const dot = originalName.lastIndexOf(".");
    const stem = originalName.slice(0, dot);
    const extension = originalName.slice(dot);
    let candidate = originalName;
    let suffix = 2;
    while (true) {
      try {
        await handle.getFileHandle(candidate, { create: false });
        candidate = `${stem} (${suffix++})${extension}`;
      } catch {
        break;
      }
    }
    const file = await handle.getFileHandle(candidate, { create: true });
    const writable = await file.createWritable();
    await writable.write(content);
    await writable.close();
    return candidate;
  }

  function downloadFile(filename: string, content: string) {
    const url = URL.createObjectURL(new Blob([content], { type: "text/markdown;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function copyMarkdown() {
    try {
      await navigator.clipboard.writeText(toMarkdown(createDraftFromCurrent()));
      setMessage("Markdown copied.");
    } catch {
      setError("Clipboard access was blocked. Select and copy the saved file after downloading it.");
    }
  }

  function startAnother() {
    if (removeDraft) {
      localStorage.removeItem(DRAFT_KEY);
      setHasDraft(false);
    }
    setDraft(emptyDraft());
    setAudioByQuestion({});
    setFolder(null);
    setScreen("welcome");
  }

  const statusText =
    pendingCount > 0
      ? `Transcribing ${pendingCount} ${pendingCount === 1 ? "answer" : "answers"}`
      : model.state === "ready"
        ? "Transcription ready"
        : model.state === "loading"
          ? `Getting transcription ready, ${model.percent}% (first time only)`
          : "Transcription couldn't start";

  return (
    <div className="app-shell">
      <header className="site-header">
        <img src="/branding/equinor-logo-horizontal-red.svg" alt="Equinor" className="brand-logo" />
        <div className="header-title">Project exit interview</div>
        <div className={`transcription-status ${model.state === "ready" ? "is-ready" : ""}`} aria-live="polite">
          <span className="status-dot" aria-hidden="true" />
          {statusText}
        </div>
      </header>
      <main className="main-content">
        {!storageAvailable && (
          <div className="alert" role="status">
            Your browser won't let us save progress on this computer. You can keep going, but a refresh would lose your answers.
          </div>
        )}
        {error && <div className="alert" role="alert">{error}</div>}
        {!error && model.state === "failed" && (
          <div className="alert" role="alert">
            Transcription couldn't start. Your recordings are safe. You can try again, or type your answers.
            <button className="text-button" onClick={() => void prepareTranscriber()}>Try again</button>
          </div>
        )}
        {!isSupportedBrowser() && (
          <div className="alert" role="status">This works best in Chrome on a Mac. Some parts may not work here. You can still type your answers.</div>
        )}

        {screen === "welcome" && (
          hasDraft ? (
            <section className="resume-card" aria-labelledby="resume-title">
              <p className="eyebrow">Saved on this computer</p>
              <h1 id="resume-title" ref={headingRef} tabIndex={-1}>Continue where you left off?</h1>
              <p className="resume-project">Project: <strong>{draft.projectName}</strong></p>
              <p>
                You answered {questionProgress(buildQuestionSequence(draft.projectTypes, draft.route), draft.answers, draft.currentIndex, draft.route).answered} of {buildQuestionSequence(draft.projectTypes, draft.route).length} questions.
              </p>
              <div className="resume-actions">
                <button className="button button-primary" onClick={continueInterview}>Continue</button>
                <button className="button button-secondary" onClick={discardDraft}>Start a new interview</button>
              </div>
            </section>
          ) : (
            <section className="welcome" aria-labelledby="welcome-title">
              <p className="eyebrow">Project knowledge capture</p>
              <h1 id="welcome-title" ref={headingRef} tabIndex={-1}>Project exit interview</h1>
              <p className="intro">Record what was done, and why.</p>
              <p className="welcome-copy">
                You answer out loud, one question at a time. Your voice is turned into text on this computer. Nothing is sent anywhere.
              </p>
              <form onSubmit={(event) => { event.preventDefault(); startInterview(); }}>
                <div className="field">
                  <label htmlFor="project-name">Project name</label>
                  <input id="project-name" value={draft.projectName} onChange={(event) => updateDraft({ projectName: event.target.value })} autoComplete="off" />
                </div>
                <div className="field">
                  <label htmlFor="role">Your role in the project <span className="helper">(we don't need your name)</span></label>
                  <input id="role" value={draft.role} onChange={(event) => updateDraft({ role: event.target.value })} autoComplete="organization-title" />
                </div>
                <fieldset className="choice-group">
                  <legend>Why are you doing this interview?</legend>
                  {interviewConfig.reasons.map((item) => (
                    <label className="choice-row" key={item.id}>
                      <input type="radio" name="reason" value={item.id} checked={draft.reason === item.id} onChange={() => updateDraft({ reason: item.id })} />
                      <span>{item.label}</span>
                    </label>
                  ))}
                </fieldset>
                <fieldset className="choice-group">
                  <legend>What kind of project was it? <span className="helper">(pick all that apply)</span></legend>
                  <div className="type-grid">
                    {interviewConfig.projectTypes.map((type) => (
                      <label className="choice-row" key={type.id}>
                        <input type="checkbox" checked={draft.projectTypes.includes(type.id)} onChange={(event) => toggleType(type.id, event.target.checked)} />
                        <span>{type.label}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
                <fieldset className="choice-group route-group">
                  <legend>How much time do you have?</legend>
                  {(["short", "full"] as Route[]).map((route) => {
                    const count = buildQuestionSequence(draft.projectTypes, route).length;
                    const mins = estimateMinutes(count, route);
                    return (
                      <label className={`route-choice ${draft.route === route ? "selected" : ""}`} key={route}>
                        <input type="radio" name="route" value={route} checked={draft.route === route} onChange={() => updateDraft({ route })} />
                        <span className="route-copy">
                          <strong>{route === "short" ? "Short: the essential questions" : "Full: every question"}</strong>
                          <span>{count} questions, about {mins >= 60 ? `${Math.floor(mins / 60)} hour${mins >= 120 ? "s" : ""}${mins % 60 ? ` ${mins % 60} minutes` : ""}` : `${mins} minutes`}</span>
                          <span className="helper">{route === "short" ? "Covers the essentials. Optional detail questions are left out." : "Includes every question and follow-up for a fuller record."}</span>
                        </span>
                      </label>
                    );
                  })}
                </fieldset>
                <div className="folder-row">
                  <div>
                    <strong>Where should we save it?</strong>
                    <span className="helper folder-hint">{folder ? `Chosen folder: ${folder.name}` : "Optional. Otherwise, we'll download the file at the end."}</span>
                  </div>
                  <button type="button" className="button button-secondary" onClick={() => void chooseFolder()}>{folder ? "Choose another folder" : "Choose a folder"}</button>
                </div>
                <div className="form-footer">
                  <p className="helper">
                    {!draft.projectName.trim() || !draft.role.trim()
                      ? `Add ${!draft.projectName.trim() && !draft.role.trim() ? "the project name and your role" : !draft.projectName.trim() ? "the project name" : "your role"} to start.`
                      : "Your answers are saved on this computer as you go."}
                  </p>
                  <button type="submit" className="button button-primary" disabled={!draft.projectName.trim() || !draft.role.trim()}>Start</button>
                </div>
              </form>
            </section>
          )
        )}

        {screen === "question" && activeQuestion && (
          <section aria-labelledby="question-title" className="question-screen">
            <div className="progress-area">
              <div className="progress-segments" aria-label={`${progress.answered} of ${questions.length} questions answered`}>
                {progress.parts.map((part) => (
                  <div className="progress-part" key={part.part} title={`${part.part}: ${part.done} of ${part.total}`}>
                    {Array.from({ length: part.total }, (_, index) => (
                      <span className={`progress-unit ${index < part.done ? "complete" : ""} ${part.current ? "current-part" : ""}`} key={`${part.part}-${index}`} />
                    ))}
                  </div>
                ))}
              </div>
              <div className="progress-label">
                <span>Question {draft.currentIndex + 1} of {questions.length} · {activeQuestion.part}</span>
                <span>About {progress.minutesLeft} minutes left</span>
                <button
                  className="text-button all-questions-button"
                  aria-expanded={questionListOpen}
                  aria-controls="interview-roadmap"
                  onClick={() => setQuestionListOpen((open) => !open)}
                >
                  {questionListOpen ? "Hide roadmap" : "Show roadmap"}
                </button>
              </div>
              {questionListOpen && (
                <div className="question-list" id="interview-roadmap" aria-label="Interview roadmap">
                  <div className="list-heading">
                    <div>
                      <p className="eyebrow">Interview roadmap</p>
                      <strong>All questions</strong>
                    </div>
                  </div>
                  {questions.map((question, index) => (
                    <button className={`question-list-item ${index === draft.currentIndex ? "active" : ""}`} key={question.id} onClick={() => goToQuestion(index)}>
                      <span className="state-mark">{stateLabel(answers[question.id]?.state ?? "waiting")}</span>
                      <span><strong>{question.id}</strong> {question.text}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="question-heading-row">
              <div>
                <p className="eyebrow">{activeQuestion.part}</p>
                <h1 id="question-title" ref={headingRef} tabIndex={-1}>{activeQuestion.text}</h1>
              </div>
            </div>
            {draft.route === "full" && activeQuestion.essential && (
              <p className="essential-note">Essential question <span>These are the questions included in the short route.</span></p>
            )}
            {activeQuestion.note && <p className="question-note">{activeQuestion.note}</p>}

            <div className="answer-card" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); uploadFile(event.dataTransfer.files[0]); }}>
              <div className="record-disclaimer">To record, your browser will ask to use the microphone. The audio stays on this computer.</div>
              {recordingState === "idle" ? (
                <div className="capture-options">
                  <button className={`record-button ${audioByQuestion[activeQuestion.id]?.length ? "record-more" : ""}`} onClick={() => void beginRecording()}>
                    <span className="record-icon" aria-hidden="true" />{audioByQuestion[activeQuestion.id]?.length ? "Record more" : "Record answer"}
                  </button>
                  <label className="upload-button button button-secondary">
                    Upload audio
                    <input type="file" accept=".mp3,.m4a,.wav,.webm,.ogg,audio/*" onChange={(event) => uploadFile(event.target.files?.[0])} />
                  </label>
                  <span className="or-label">or</span>
                  <button className="text-button type-link" onClick={() => document.getElementById(`answer-${activeQuestion.id}`)?.focus()}>Type instead</button>
                </div>
              ) : (
                <div className="recording-panel">
                  <div className="recording-status">
                    <span className="recording-dot" />
                    <strong>{recordingState === "paused" ? "Recording paused" : "Recording"}</strong>
                    <span className="timer">{formatTime(seconds)}</span>
                    <div className="level-meter" aria-label="Microphone level">
                      {Array.from({ length: 20 }, (_, index) => <span className={index < Math.round(level / 5) ? "lit" : ""} key={index} />)}
                    </div>
                  </div>
                  <div className="recording-controls">
                    <button className="button button-primary" onClick={stopRecording}>Stop</button>
                    <button className="button button-secondary" onClick={pauseRecording}>{recordingState === "paused" ? "Resume" : "Pause"}</button>
                  </div>
                  <p className="helper">Maximum recording time: 5 minutes</p>
                </div>
              )}
              {activeQuestion.prompts.length > 0 && (
                <div className="prompt-box">
                  <button className="prompt-toggle" aria-expanded={Boolean(draft.promptOpen[activeQuestion.id])} onClick={() => updateDraft({ promptOpen: { ...draft.promptOpen, [activeQuestion.id]: !draft.promptOpen[activeQuestion.id] } })}>
                    Need a prompt? <span aria-hidden="true">{draft.promptOpen[activeQuestion.id] ? "−" : "+"}</span>
                  </button>
                  {draft.promptOpen[activeQuestion.id] && (
                    <ul>{activeQuestion.prompts.map((prompt) => <li key={prompt}>{prompt}</li>)}</ul>
                  )}
                </div>
              )}
              {(audioByQuestion[activeQuestion.id] ?? []).map((item, index) => (
                <div className="audio-item" key={`${item.name}-${index}`}>
                  <div className="audio-label">{item.name} <span>{formatTime(item.seconds)}</span></div>
                  <audio controls src={item.url} aria-label={`Playback: ${item.name}`} />
                  {(audioByQuestion[activeQuestion.id]?.length ?? 0) === 1 && <button className="text-button" onClick={() => recordAgain(activeQuestion.id)}>Record again</button>}
                  {index === 0 && (audioByQuestion[activeQuestion.id]?.length ?? 0) > 1 && <span className="helper">Recording {index + 1} of {audioByQuestion[activeQuestion.id].length}</span>}
                </div>
              ))}
              <fieldset className="marks" disabled={!answerHasContent(ensureAnswer(activeQuestion.id), audioByQuestion[activeQuestion.id])}>
                <legend>How do you know this? <span className="helper">(optional)</span></legend>
                {interviewConfig.marks.map((mark) => (
                  <label key={mark.id}>
                    <input type="radio" name={`mark-${activeQuestion.id}`} checked={ensureAnswer(activeQuestion.id).mark === mark.id} onChange={() => updateAnswer(activeQuestion.id, { mark: mark.id as SourceMark })} />
                    {mark.label}
                  </label>
                ))}
              </fieldset>
              {ensureAnswer(activeQuestion.id).transcription === "running" && (
                <div className="transcript-state" role="status">Turning your answer into text… <span>You can keep answering.</span></div>
              )}
              {ensureAnswer(activeQuestion.id).transcription === "failed" && (
                <div className="alert compact" role="alert">{ensureAnswer(activeQuestion.id).error} <button className="text-button" onClick={() => void retryTranscription(activeQuestion.id)}>Try again</button></div>
              )}
              <div className="answer-editor">
                <div className="answer-editor-head">
                  <label htmlFor={`answer-${activeQuestion.id}`}>Your answer</label>
                  {ensureAnswer(activeQuestion.id).machineText && ensureAnswer(activeQuestion.id).text !== ensureAnswer(activeQuestion.id).machineText && (
                    <span className="edited-label">Edited <button className="text-button" onClick={() => updateAnswer(activeQuestion.id, { text: ensureAnswer(activeQuestion.id).machineText })}>Undo my edits</button></span>
                  )}
                  {ensureAnswer(activeQuestion.id).transcription === "done" && <span className="done-label">Done</span>}
                </div>
                <textarea
                  id={`answer-${activeQuestion.id}`}
                  value={ensureAnswer(activeQuestion.id).text}
                  onChange={(event) => updateAnswer(activeQuestion.id, {
                    text: event.target.value,
                    state: ensureAnswer(activeQuestion.id).state === "other"
                      ? "other"
                      : event.target.value ? "answered" : "waiting",
                  })}
                  onFocus={() => setMessage("")}
                  placeholder="Type your answer here. It saves as you type."
                  rows={5}
                />
                <p className="helper">Saved as you type. You can edit the transcript here.</p>
              </div>
            </div>
            <div className="question-actions">
              <div className="secondary-actions">
                <button className="button button-secondary" onClick={() => changeState(activeQuestion.id, "skipped")}>{answers[activeQuestion.id]?.state === "skipped" ? "Skipped · Undo" : "Skip this question"}</button>
                <button className="button button-secondary" onClick={() => changeState(activeQuestion.id, "other")}>{answers[activeQuestion.id]?.state === "other" ? "Other · Undo" : "Other"}</button>
              </div>
              <div className="navigation-actions">
                <button className="button button-secondary" onClick={goBack} disabled={draft.currentIndex === 0}>Back</button>
                <button className="button button-primary" onClick={goNext}>{draft.currentIndex === questions.length - 1 ? "Review answers" : "Next question"}</button>
              </div>
            </div>
            <p className="shortcut-note">Keyboard shortcut: Ctrl or Cmd + Enter for next question</p>
          </section>
        )}

        {screen === "review" && (
          <section className="review-screen" aria-labelledby="review-title">
            <p className="eyebrow">Almost there</p>
            <h1 id="review-title" ref={headingRef} tabIndex={-1}>Review your answers</h1>
            <p className="intro">Read through, fix anything the transcript got wrong, then save.</p>
            <div className="name-reminder"><strong>Check for names.</strong> Replace them with roles, for example “the platform team”.</div>
            {questions.map((question, index) => {
              const answer = ensureAnswer(question.id);
              return (
                <article className="review-question" key={question.id}>
                  <div className="review-question-heading">
                    <div>
                      <p className="eyebrow">{question.part}</p>
                      <h2>{index + 1}. {question.text}</h2>
                      <span className={`review-state ${answer.state === "answered" ? "is-done" : ""}`}>{stateLabel(answer.state)}{draft.route === "full" && question.essential && answer.state === "waiting" ? " (essential)" : ""}</span>
                    </div>
                    <button className="button button-secondary" onClick={() => goToQuestion(index)}>{answer.state === "waiting" ? "Answer now" : "Go to question"}</button>
                  </div>
                  {answer.state !== "skipped" && (
                    <textarea aria-label={`Answer: ${question.text}`} value={answer.text} onChange={(event) => updateAnswer(question.id, {
                      text: event.target.value,
                      state: answer.state === "other" ? "other" : event.target.value ? "answered" : "waiting",
                    })} rows={Math.min(8, Math.max(3, Math.ceil(answer.text.length / 90)))} placeholder={answer.state === "other" ? "Add your different answer or explanation here" : "No answer yet"} />
                  )}
                  {(audioByQuestion[question.id] ?? []).map((item) => <audio controls src={item.url} key={item.url} aria-label={`Playback: ${item.name}`} />)}
                  <fieldset className="marks review-marks">
                    <legend>How do you know this? <span className="helper">(optional)</span></legend>
                    {interviewConfig.marks.map((mark) => (
                      <label key={mark.id}>
                        <input type="radio" name={`review-mark-${question.id}`} checked={answer.mark === mark.id} onChange={() => updateAnswer(question.id, { mark: mark.id as SourceMark })} />
                        {mark.label}
                      </label>
                    ))}
                  </fieldset>
                </article>
              );
            })}
            <div className="review-save">
              <button className="button button-primary save-button" disabled={pendingCount > 0} onClick={() => void saveInterview()}>Save interview</button>
              {pendingCount > 0 && <p className="helper">Waiting for {pendingCount} {pendingCount === 1 ? "answer" : "answers"} to finish turning into text.</p>}
              <p className="helper">Unanswered questions won't stop you from saving.</p>
            </div>
          </section>
        )}

        {screen === "saved" && (
          <section className="saved-screen" aria-labelledby="saved-title">
            <p className="eyebrow">Interview complete</p>
            <h1 id="saved-title" ref={headingRef} tabIndex={-1}>Saved.</h1>
            <div className="saved-confirmation">
              <strong>{savedFilename}</strong>
              <span>{savedLocation === "downloads" ? "Downloaded to your downloads folder." : `Saved in ${savedLocation}.`}</span>
            </div>
            <p>Give this file to the person who keeps the project record.</p>
            <div className="saved-actions">
              <button className="button button-secondary" onClick={() => void copyMarkdown()}>Copy as markdown</button>
              <button className="button button-primary" onClick={startAnother}>Start another interview</button>
            </div>
            <label className="remove-draft">
              <input type="checkbox" checked={removeDraft} onChange={(event) => setRemoveDraft(event.target.checked)} />
              Remove this interview from this browser
            </label>
          </section>
        )}
      </main>
      <div className="sr-only" aria-live="polite" aria-atomic="true">{message}</div>
      <footer className="site-footer">
        <span>All answers stay on this computer.</span>
        <button className="text-button about-link" onClick={() => setMessage(message === "about" ? "" : "about")}>About transcription</button>
        {message === "about" && <p className="about-copy">Speech is transcribed on this computer using NVIDIA Parakeet TDT 0.6B v2 (English), licensed under CC BY 4.0. No recording or answer is sent anywhere.</p>}
      </footer>
    </div>
  );
}

function stateLabel(state: DraftAnswer["state"]) {
  return state === "answered" ? "Answered" : state === "skipped" ? "Skipped" : state === "other" ? "Other" : "Not answered";
}

function answerHasContent(answer: DraftAnswer, items?: AudioItem[]) {
  return Boolean(answer.text.trim() || items?.length);
}

function formatTime(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
  const seconds = Math.floor(totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function isSupportedBrowser() {
  return /Chrome/.test(navigator.userAgent) && /Mac/.test(navigator.platform);
}

async function decodeToMono16k(blob: Blob): Promise<Float32Array> {
  const AudioContextConstructor = window.AudioContext;
  const context = new AudioContextConstructor();
  try {
    const buffer = await context.decodeAudioData(await blob.arrayBuffer());
    const mono = new Float32Array(buffer.length);
    for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
      const data = buffer.getChannelData(channel);
      for (let index = 0; index < data.length; index++) mono[index] += data[index] / buffer.numberOfChannels;
    }
    if (buffer.sampleRate === 16_000) return mono;
    const outputLength = Math.ceil((mono.length * 16_000) / buffer.sampleRate);
    const output = new Float32Array(outputLength);
    const ratio = buffer.sampleRate / 16_000;
    for (let index = 0; index < outputLength; index++) {
      output[index] = mono[Math.min(mono.length - 1, Math.floor(index * ratio))] ?? 0;
    }
    return output;
  } finally {
    await context.close();
  }
}

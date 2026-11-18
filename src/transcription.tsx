import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Transcriber } from "./transcriber";
import { StubTranscriber } from "./stubTranscriber";
import { decodeTo16k } from "./audio";

export interface ModelStatus {
  state: "idle" | "loading" | "ready" | "failed";
  percent: number;
}

interface TranscriptionApi {
  model: ModelStatus;
  kind: Kind;
  transcribe(blob: Blob): Promise<string>;
  retryModel(): void;
  recordingOwner: string | null;
  setRecordingOwner(id: string | null): void;
}

const Context = createContext<TranscriptionApi | null>(null);

type Kind = "stub" | "parakeet";
const params = new URLSearchParams(window.location.search);

// The real speech model is used when its files are present. ?transcriber=stub or =parakeet forces one.
async function pickKind(): Promise<Kind> {
  const forced = params.get("transcriber");
  if (forced === "stub" || forced === "parakeet") return forced;
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}models/model-manifest.json`, { cache: "no-store" });
    if (response.ok && ((await response.json()) as { ready?: boolean }).ready === true) return "parakeet";
  } catch {
    /* no model files: use the stub */
  }
  return "stub";
}

async function createTranscriber(kind: Kind): Promise<Transcriber> {
  if (kind === "parakeet") {
    const { ParakeetTranscriber } = await import("./transcriber");
    return new ParakeetTranscriber();
  }
  return new StubTranscriber(params.get("stub") === "fail");
}

export function TranscriptionProvider({ children }: { children: ReactNode }) {
  const [model, setModel] = useState<ModelStatus>({ state: "idle", percent: 0 });
  const [recordingOwner, setRecordingOwner] = useState<string | null>(null);
  const [kind, setKind] = useState<Kind>("parakeet");
  const transcriber = useRef<Transcriber | null>(null);
  const ready = useRef<Promise<void> | null>(null);
  const started = useRef(false);

  const start = useCallback(() => {
    started.current = true;
    setModel({ state: "loading", percent: 0 });
    const run = (async () => {
      const chosen = await pickKind();
      setKind(chosen);
      const t = await createTranscriber(chosen);
      transcriber.current = t;
      await t.prepare((p) => setModel({ state: "loading", percent: Math.round(p.percent) }));
      setModel({ state: "ready", percent: 100 });
    })();
    ready.current = run;
    run.catch(() => setModel({ state: "failed", percent: 0 }));
  }, []);
  const startRef = useRef(start);
  startRef.current = start;

  useEffect(() => {
    if (!started.current) start();
  }, [start]);

  const transcribe = useCallback(async (blob: Blob) => {
    if (!ready.current) startRef.current();
    const preparation = ready.current;
    if (!preparation) throw new Error("The speech model has not started.");
    await preparation; // recording works while the model loads; text appears once it is ready
    const audio = await decodeTo16k(blob);
    const activeTranscriber = transcriber.current;
    if (!activeTranscriber) throw new Error("The speech model is not ready.");
    const result = await activeTranscriber.transcribe(audio);
    return result.text;
  }, []);

  const value = useMemo<TranscriptionApi>(
    () => ({ model, kind, transcribe, retryModel: start, recordingOwner, setRecordingOwner }),
    [model, kind, transcribe, start, recordingOwner],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useTranscription(): TranscriptionApi {
  const value = useContext(Context);
  if (!value) throw new Error("TranscriptionProvider is missing.");
  return value;
}

export function ModelStatusPill() {
  const { model, kind, retryModel } = useTranscription();
  const label =
    model.state === "ready"
      ? "Transcription ready"
      : model.state === "failed"
        ? "Transcription could not start"
        : `Transcription: getting ready ${model.percent}%`;
  return (
    <div className={`status status--${model.state}`} role="status" aria-live="polite">
      <span className="status__label">{label}</span>
      {kind === "stub" && <span className="status__note">demo</span>}
      {model.state === "failed" && (
        <button type="button" className="link" onClick={retryModel}>
          Try again
        </button>
      )}
    </div>
  );
}

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { appendText, formatClock, newId } from "./domain";
import { useTranscription } from "./transcription";

const LIMIT_SECONDS = 300;
const WARN_SECONDS = 270;

interface Job {
  id: string;
  status: "working" | "failed";
}

// One recording at a time: Start recording, Stop recording, then text appears.
// The recording stays in memory only until it has become text, then it is dropped.
export function useVoiceCapture(id: string, onText: (text: string) => void) {
  const { transcribe, recordingOwner, setRecordingOwner } = useTranscription();
  const [phase, setPhase] = useState<"idle" | "recording">("idle");
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const blobs = useRef(new Map<string, Blob>());
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const timer = useRef<number | undefined>(undefined);
  const onTextRef = useRef(onText);
  onTextRef.current = onText;

  const runJob = useCallback(
    (jobId: string) => {
      const blob = blobs.current.get(jobId);
      if (!blob) return;
      setJobs((all) => all.map((j) => (j.id === jobId ? { ...j, status: "working" } : j)));
      transcribe(blob)
        .then((text) => {
          blobs.current.delete(jobId); // audio is discarded once it is text
          setJobs((all) => all.filter((j) => j.id !== jobId));
          onTextRef.current(text);
        })
        .catch(() => setJobs((all) => all.map((j) => (j.id === jobId ? { ...j, status: "failed" } : j))));
    },
    [transcribe],
  );

  const releaseStream = useCallback(() => {
    window.clearInterval(timer.current);
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  }, []);

  const stop = useCallback(() => {
    if (recorder.current && recorder.current.state !== "inactive") recorder.current.stop();
    releaseStream();
    setRecordingOwner(null);
    setPhase("idle");
  }, [releaseStream, setRecordingOwner]);

  const start = useCallback(async () => {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("This browser cannot record. You can type your answer instead.");
      return;
    }
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.current = media;
      chunks.current = [];
      const rec = new MediaRecorder(media);
      recorder.current = rec;
      rec.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.current.push(event.data);
      };
      rec.onstop = () => {
        const blob = new Blob(chunks.current, { type: rec.mimeType || "audio/webm" });
        chunks.current = [];
        if (blob.size === 0) return;
        const jobId = newId();
        blobs.current.set(jobId, blob);
        setJobs((all) => [...all, { id: jobId, status: "working" }]);
        runJob(jobId);
      };
      rec.start();
      setRecordingOwner(id);
      setSeconds(0);
      setPhase("recording");
      let elapsed = 0;
      timer.current = window.setInterval(() => {
        elapsed += 1;
        setSeconds(elapsed);
        if (elapsed >= LIMIT_SECONDS) stop();
      }, 1000);
    } catch (e) {
      releaseStream();
      const name = (e as DOMException)?.name;
      setError(
        name === "NotFoundError"
          ? "We can't find a microphone. You can type your answer."
          : "The microphone is blocked. Click the icon in the address bar, allow the microphone, then try again. You can also type your answer.",
      );
    }
  }, [id, releaseStream, runJob, setRecordingOwner, stop]);

  useEffect(
    () => () => {
      if (recorder.current && recorder.current.state !== "inactive") {
        recorder.current.onstop = null;
        recorder.current.stop();
        setRecordingOwner(null);
      }
      releaseStream();
    },
    [releaseStream, setRecordingOwner],
  );

  return {
    phase,
    seconds,
    error,
    jobs,
    start,
    stop,
    retry: runJob,
    discard: (jobId: string) => {
      blobs.current.delete(jobId);
      setJobs((all) => all.filter((j) => j.id !== jobId));
    },
    busyElsewhere: recordingOwner !== null && recordingOwner !== id,
  };
}

export function RecordControls({
  capture,
  primary = false,
  label = "Start recording",
}: {
  capture: ReturnType<typeof useVoiceCapture>;
  primary?: boolean;
  label?: string;
}) {
  const { phase, seconds, error, jobs, start, stop, retry, discard, busyElsewhere } = capture;
  return (
    <div className="record">
      {phase === "idle" ? (
        <button
          type="button"
          className={primary ? "btn btn--record" : "btn"}
          onClick={start}
          disabled={busyElsewhere}
        >
          {label}
        </button>
      ) : (
        <div className="record__live">
          <button type="button" className="btn btn--stop" onClick={stop}>
            Stop recording
          </button>
          <span className="record__dot" aria-hidden="true" />
          <span className="record__time" role="timer" aria-live="off">
            {formatClock(seconds)} of {formatClock(LIMIT_SECONDS)}
          </span>
          {seconds >= WARN_SECONDS && <span className="record__warn">30 seconds left.</span>}
        </div>
      )}
      {error && (
        <p className="callout callout--error" role="alert">
          {error}
        </p>
      )}
      {jobs.map((job) =>
        job.status === "working" ? (
          <p key={job.id} className="callout" role="status">
            Turning your answer into text…
          </p>
        ) : (
          <div key={job.id} className="callout callout--error" role="alert">
            <p>
              We couldn't turn this into text. Your recording is kept until it is text. Try again, or type your answer.
            </p>
            <div className="row">
              <button type="button" className="btn btn--small" onClick={() => retry(job.id)}>
                Try again
              </button>
              <button type="button" className="btn btn--small" onClick={() => discard(job.id)}>
                Discard recording
              </button>
            </div>
          </div>
        ),
      )}
    </div>
  );
}

export function AnswerField({
  id,
  label,
  value,
  onChange,
  hints,
  primary = false,
  mono = false,
  rows = 5,
  note,
  onPendingChange,
  recordLabel,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  hints?: string[];
  primary?: boolean;
  mono?: boolean;
  rows?: number;
  note?: string;
  onPendingChange?: (id: string, pending: number) => void;
  recordLabel?: string;
}) {
  const areaId = useId();
  const valueRef = useRef(value);
  valueRef.current = value;
  const capture = useVoiceCapture(id, (text) => onChange(appendText(valueRef.current, text)));
  const pending = capture.jobs.length + (capture.phase === "recording" ? 1 : 0);
  useEffect(() => {
    onPendingChange?.(id, pending);
  }, [id, pending, onPendingChange]);
  useEffect(() => () => onPendingChange?.(id, 0), [id, onPendingChange]);

  return (
    <div className="field">
      <label className="field__label" htmlFor={areaId}>
        {label}
      </label>
      {hints && hints.length > 0 && (
        <details className="hints">
          <summary>Need a prompt?</summary>
          <ul>
            {hints.map((h) => (
              <li key={h}>{h}</li>
            ))}
          </ul>
        </details>
      )}
      <textarea
        id={areaId}
        className={mono ? "input input--mono" : "input"}
        rows={rows}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Type here, or press Start recording."
        spellCheck={!mono}
      />
      {note && <p className="field__note">{note}</p>}
      <RecordControls capture={capture} primary={primary} label={recordLabel} />
    </div>
  );
}

// A list of short items (aliases, datasets, models, people). Type one, or say one and fix the text.
export function ListField({
  id,
  label,
  items,
  onChange,
  placeholder,
  note,
  suggestions,
  suggestionsLabel,
}: {
  id: string;
  label: string;
  items: string[];
  onChange: (items: string[]) => void;
  placeholder: string;
  note?: string;
  suggestions?: string[];
  suggestionsLabel?: string;
}) {
  const inputId = useId();
  const [draft, setDraft] = useState("");
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const capture = useVoiceCapture(id, (text) => setDraft(appendText(draftRef.current, text).replace(/\s*\n+\s*/g, " ")));

  const add = () => {
    const value = draft.trim();
    if (!value || items.includes(value)) {
      setDraft("");
      return;
    }
    onChange([...items, value]);
    setDraft("");
  };

  return (
    <div className="field">
      <label className="field__label" htmlFor={inputId}>
        {label}
      </label>
      {items.length > 0 && (
        <ul className="chips">
          {items.map((item) => (
            <li key={item} className="chip">
              <span>{item}</span>
              <button type="button" className="chip__remove" aria-label={`Remove ${item}`} onClick={() => onChange(items.filter((i) => i !== item))}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="row row--grow">
        <input
          id={inputId}
          className="input"
          value={draft}
          placeholder={placeholder}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              add();
            }
          }}
        />
        <button type="button" className="btn" onClick={add} disabled={!draft.trim()}>
          Add
        </button>
      </div>
      <RecordControls capture={capture} label="Say it" />
      {suggestions && suggestions.length > 0 && (
        <div className="suggest">
          <p className="field__note">{suggestionsLabel ?? "Suggestions:"}</p>
          <div className="row">
            {suggestions.map((name) => (
              <button key={name} type="button" className="btn btn--small" onClick={() => onChange([...items, name])}>
                Add {name}
              </button>
            ))}
          </div>
        </div>
      )}
      {note && <p className="field__note">{note}</p>}
    </div>
  );
}

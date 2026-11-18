export interface Transcriber {
  prepare(onProgress: (progress: { stage: string; percent: number }) => void): Promise<void>;
  transcribe(
    audio: Float32Array,
    onProgress?: (percent: number) => void,
  ): Promise<{ text: string }>;
  readonly state: "idle" | "loading" | "ready" | "failed";
}

type WorkerResponse =
  | { type: "progress"; stage: string; percent: number }
  | { type: "ready" }
  | { type: "transcript"; text: string }
  | { type: "error"; message: string };

export class ParakeetTranscriber implements Transcriber {
  private currentState: Transcriber["state"] = "idle";
  private readonly worker = new Worker(new URL("./transcriber.worker.ts", import.meta.url), {
    type: "module",
  });
  private nextId = 0;
  private preparePromise?: Promise<void>;
  private readonly pending = new Map<
    number,
    {
      resolve: (response: WorkerResponse) => void;
      reject: (error: Error) => void;
      onProgress?: (response: Extract<WorkerResponse, { type: "progress" }>) => void;
    }
  >();

  constructor() {
    this.worker.addEventListener("message", (event: MessageEvent<WorkerResponse & { id: number }>) => {
      const request = this.pending.get(event.data.id);
      if (!request) return;
      if (event.data.type === "progress") {
        request.onProgress?.(event.data);
      } else if (event.data.type === "error") {
        this.pending.delete(event.data.id);
        request.reject(new Error(event.data.message));
      } else {
        this.pending.delete(event.data.id);
        request.resolve(event.data);
      }
    });
    this.worker.addEventListener("error", (event) => {
      for (const [id, request] of this.pending) {
        this.pending.delete(id);
        request.reject(new Error(event.message || "The transcription worker stopped unexpectedly."));
      }
      this.currentState = "failed";
    });
  }

  get state() {
    return this.currentState;
  }

  async prepare(onProgress: (progress: { stage: string; percent: number }) => void) {
    if (this.currentState === "ready") return;
    if (this.preparePromise) return this.preparePromise;
    this.currentState = "loading";
    this.preparePromise = this.request({ type: "prepare" }, (progress) =>
        onProgress({ stage: progress.stage, percent: progress.percent }),
      ).then(() => {
        this.currentState = "ready";
      }).catch((error: unknown) => {
        this.currentState = "failed";
        throw error;
      }).finally(() => {
        this.preparePromise = undefined;
      });
    return this.preparePromise;
  }

  async transcribe(audio: Float32Array, onProgress?: (percent: number) => void) {
    if (this.currentState !== "ready") throw new Error("The speech model is not ready.");
    const response = await this.request(
      { type: "transcribe", audio: audio.buffer },
      (progress) => onProgress?.(progress.percent),
      [audio.buffer],
    );
    if (response.type !== "transcript") throw new Error("The speech model returned no transcript.");
    return { text: response.text };
  }

  private request(
    message: { type: "prepare" } | { type: "transcribe"; audio: ArrayBuffer },
    onProgress?: (progress: Extract<WorkerResponse, { type: "progress" }>) => void,
    transfer: Transferable[] = [],
  ) {
    const id = this.nextId++;
    return new Promise<WorkerResponse>((resolve, reject) => {
      this.pending.set(id, { resolve, reject, onProgress });
      this.worker.postMessage({ ...message, id }, transfer);
    });
  }
}

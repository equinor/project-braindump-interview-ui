import type { Transcriber } from "./transcriber";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// A stand-in for the speech model so the whole flow can be clicked through.
// It pretends to load for a few seconds and then "transcribes" with a placeholder.
// Add ?stub=fail to the address to see the could-not-start state.
export class StubTranscriber implements Transcriber {
  private current: Transcriber["state"] = "idle";
  constructor(private readonly fail = false) {}

  get state() {
    return this.current;
  }

  async prepare(onProgress: (progress: { stage: string; percent: number }) => void) {
    this.current = "loading";
    for (let percent = 0; percent <= 100; percent += 10) {
      onProgress({ stage: "Getting transcription ready", percent });
      await sleep(350);
      if (this.fail && percent >= 40) {
        this.current = "failed";
        throw new Error("The stub transcriber was told to fail.");
      }
    }
    this.current = "ready";
  }

  async transcribe(audio: Float32Array, onProgress?: (percent: number) => void) {
    onProgress?.(0);
    await sleep(900);
    onProgress?.(100);
    const seconds = Math.max(1, Math.round(audio.length / 16000));
    return { text: `[Stub transcript of ${seconds} seconds. Replace this with what you said.]` };
  }
}

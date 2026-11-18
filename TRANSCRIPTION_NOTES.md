# Transcription notes: what an earlier spike found

An earlier spike built a plain test page that transcribes audio inside the browser with an open-weight speech model. This note summarises what it did and learned, so the interface can use the same approach. If that code is available to you (a folder called `spike-b-browser-transcription` or `project-logbook`), reuse its worker, audio conversion and model preparation script. If it is not, build from this note. Any route that meets the constraints is acceptable.

## What worked

- **Model:** NVIDIA Parakeet TDT 0.6B v2 (English), as an ONNX conversion at `ysdede/parakeet-tdt-0.6b-v2-onnx`, at a pinned revision. About 661 MB in two ONNX files.
- **Library:** `parakeet.js` 1.4.4 on top of `onnxruntime-web` 1.24.1. The wrapper supplies the decoding loop that the raw ONNX files need.
- **Backend:** the worker selects WebGPU (in a hybrid mode where ONNX Runtime may place some work on the CPU), and retries with WebAssembly if starting fails.
- **Audio:** converted to 16 kHz mono floating-point samples before going to the model.
- **Runs in a Web Worker,** so the page stays responsive.
- **Same origin:** the model files, the ONNX Runtime WebAssembly files and the application are all served from the page's own origin. The library's default path can fetch from a public CDN, so the app sets its own paths. The page's content security policy limits connections to its own origin.
- **Preparation script:** downloads the pinned model files, checks their SHA-256 values against the upstream ones, and writes the local file sizes and hashes to a manifest. The model files are kept out of version control.
- **Development server headers:** cross-origin isolation headers (`Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp`) are needed for multi-threaded WebAssembly and for memory measurement.

## Measured so far

On an Apple M4 Pro in Chrome, a 13-second synthetic clip transcribed at about 0.09 times real time (so a two-minute answer would take roughly 11 seconds, if that holds for speech). Loading the model and transcribing worked offline, with no network requests after the model loaded.

## The known problem, and what it means for the interface

**The browser did not keep the 661 MB model between page loads.** The second load took 18.1 seconds and downloaded the files again. The target for a cached load was under 15 seconds.

Consequences for the interface:
- Assume the model may need loading on every visit. Never block the person on it.
- Start loading as soon as the page opens, and show honest progress.
- Let people record while it loads, and transcribe afterwards.

**Worth trying, as a side task:** make the model persist. Ask for persistent storage (`navigator.storage.persist()`), and keep the model files in the Cache Storage or the origin private file system, written by your own code, instead of relying on the ordinary HTTP cache, which may refuse files this large. Report whether a reload then loads from local storage, and how long it takes. If it works, say how.

## What is not known

- Accuracy on real spoken answers with project vocabulary and acronyms. The earlier spike only ran a synthetic clip.
- Speed on a managed Mac, and whether WebGPU is available there.
- Behaviour for answers close to the 5-minute limit. If quality or speed drops, split the audio into 30 to 60 second windows with a small overlap, and report what you did.

## The interface to build against

```ts
interface Transcriber {
  /** Starts loading the model. Safe to call more than once. */
  prepare(onProgress: (p: { stage: string; percent: number }) => void): Promise<void>;
  /** audio: mono samples at 16,000 Hz */
  transcribe(audio: Float32Array, onProgress?: (percent: number) => void): Promise<{ text: string }>;
  readonly state: 'idle' | 'loading' | 'ready' | 'failed';
}
```

Build two implementations:
- **Stub:** returns placeholder text such as "[Stub transcript of 134 seconds]" after a short delay and reports fake progress. Use it to build the interface and in tests.
- **Parakeet:** as above. Use it for the real transcription run.

The interview code only ever talks to the interface.

## Attribution to show in the app

"Speech model: NVIDIA Parakeet TDT 0.6B v2 (English), licensed under CC BY 4.0. ONNX conversion and packaging by ysdede, based on the ONNX export by istupakov." Link to the model cards. Put it in a small "About" link or a footer line.

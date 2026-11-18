import * as ortModule from "onnxruntime-web";
import { ParakeetModel } from "parakeet.js";
import type { BackendMode } from "parakeet.js/parakeet";

const ort = ortModule;
const modelBase = new URL("/models/", self.location.origin);
const modelFiles = {
  encoder: new URL("encoder-model.int8.onnx", modelBase).href,
  decoder: new URL("decoder_joint-model.int8.onnx", modelBase).href,
  tokenizer: new URL("vocab.txt", modelBase).href,
};
let model: ParakeetModel | undefined;
let totalBytes = 0;
let progressRequestId = 0;
let fetchInstrumented = false;
const fileProgress = new Map<string, number>();

function send(id: number, message: Record<string, unknown>) {
  self.postMessage({ ...message, id });
}

function instrumentModelFetch() {
  if (fetchInstrumented) return;
  fetchInstrumented = true;
  const originalFetch = self.fetch.bind(self);
  self.fetch = async (input, init) => {
    const requestUrl = input instanceof Request ? input.url : String(input);
    const url = new URL(requestUrl, self.location.href);
    if (url.origin !== modelBase.origin || !url.pathname.startsWith(modelBase.pathname)) {
      return originalFetch(input, init);
    }
    const response = await originalFetch(input, init);
    if (!response.ok || !response.body) return response;
    const filename = url.pathname.split("/").pop() ?? "model file";
    const reader = response.body.getReader();
    let received = 0;
    const stream = new ReadableStream({
      async pull(controller) {
        const { done, value } = await reader.read();
        if (done) {
          controller.close();
          return;
        }
        received += value.byteLength;
        fileProgress.set(filename, Math.max(fileProgress.get(filename) ?? 0, received));
        const loaded = [...fileProgress.values()].reduce((sum, size) => sum + size, 0);
        send(progressRequestId, {
          type: "progress",
          stage: `Loading speech model (${Math.min(99, Math.floor(loaded * 100 / totalBytes))}%)`,
          percent: Math.min(99, Math.floor(loaded * 100 / totalBytes)),
        });
        controller.enqueue(value);
      },
      cancel(reason) {
        return reader.cancel(reason);
      },
    });
    return new Response(stream, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  };
}

self.addEventListener("message", async (event: MessageEvent<{
  id: number;
  type: "prepare" | "transcribe";
  audio?: ArrayBuffer;
}>) => {
  const { id } = event.data;
  try {
    if (event.data.type === "prepare") {
      if (!model) {
        progressRequestId = id;
        send(id, { type: "progress", stage: "Checking local speech model", percent: 0 });
        const response = await fetch(new URL("model-manifest.json", modelBase));
        if (!response.ok) {
          throw new Error("Speech model files are missing. Run `npm run prepare:model` in the app folder.");
        }
        const manifest = await response.json() as { ready?: boolean; totalBytes?: number };
        if (manifest.ready !== true || !manifest.totalBytes) {
          throw new Error("Speech model files are missing. Run `npm run prepare:model` in the app folder.");
        }
        totalBytes = manifest.totalBytes;
        fileProgress.clear();
        instrumentModelFetch();
        send(id, { type: "progress", stage: "Loading speech model", percent: 1 });
        ort.env.wasm.wasmPaths = new URL("/vendor/ort/", self.location.origin).href;
        const backend: BackendMode = "gpu" in navigator ? "webgpu-hybrid" : "wasm";
        const config = {
          encoderUrl: modelFiles.encoder,
          decoderUrl: modelFiles.decoder,
          tokenizerUrl: modelFiles.tokenizer,
          backend,
          preprocessorBackend: "js" as const,
          nMels: 128,
          subsampling: 8,
          cpuThreads: Math.max(1, Math.min(navigator.hardwareConcurrency || 4, 8)),
          verbose: false,
        };
        try {
          model = await ParakeetModel.fromUrls(config);
        } catch (error) {
          if (backend === "wasm") throw error;
          send(id, { type: "progress", stage: "Retrying with CPU processing", percent: 99 });
          model = await ParakeetModel.fromUrls({ ...config, backend: "wasm" });
        }
      }
      send(id, { type: "ready" });
      return;
    }

    if (!model || !event.data.audio) throw new Error("The speech model is not ready.");
    const samples = new Float32Array(event.data.audio);
    const result = await model.transcribeLongAudio(samples, 16_000, {
      returnTimestamps: false,
      chunkLengthS: 90,
    });
    send(id, { type: "transcript", text: result.text });
  } catch (error) {
    send(id, { type: "error", message: error instanceof Error ? error.message : String(error) });
  }
});

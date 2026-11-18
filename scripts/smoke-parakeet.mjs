// Loads the real Parakeet model in Node (CPU, WebAssembly) and transcribes a 16 kHz mono WAV.
// A smoke test for the files and wiring only: it is not the browser path (no WebGPU, no worker).
// Usage: node scripts/smoke-parakeet.mjs path/to/clip.wav
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as ort from "onnxruntime-web";
import { ParakeetModel } from "parakeet.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const models = join(root, "public/models");
const wavPath = process.argv[2];
if (!wavPath) throw new Error("Give a 16 kHz mono 16-bit WAV file.");

// Serve the local model files to the library, which fetches them by URL.
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = String(input instanceof Request ? input.url : input);
  if (url.startsWith("http://local/models/")) {
    const body = await readFile(join(models, url.split("/models/")[1]));
    return new Response(body, { status: 200 });
  }
  return realFetch(input, init);
};

const wav = await readFile(wavPath);
const dataAt = wav.indexOf("data") + 8;
const pcm = new Int16Array(wav.buffer.slice(wav.byteOffset + dataAt, wav.byteOffset + wav.byteLength - ((wav.byteLength - dataAt) % 2)));
const samples = Float32Array.from(pcm, (v) => v / 32768);
console.log(`clip: ${(samples.length / 16000).toFixed(1)} s`);

ort.env.wasm.wasmPaths = pathToFileURL(join(root, "node_modules/onnxruntime-web/dist/")).href;
ort.env.wasm.numThreads = 4;
let t = Date.now();
const model = await ParakeetModel.fromUrls({
  encoderUrl: join(models, "encoder-model.int8.onnx"),
  decoderUrl: join(models, "decoder_joint-model.int8.onnx"),
  tokenizerUrl: "http://local/models/vocab.txt",
  backend: "wasm",
  preprocessorBackend: "js",
  nMels: 128,
  subsampling: 8,
  cpuThreads: 4,
  verbose: false,
});
console.log(`model loaded in ${((Date.now() - t) / 1000).toFixed(1)} s`);
t = Date.now();
const result = await model.transcribeLongAudio(samples, 16000, { returnTimestamps: false, chunkLengthS: 90 });
const took = (Date.now() - t) / 1000;
console.log(`transcribed in ${took.toFixed(1)} s (${(took / (samples.length / 16000)).toFixed(2)} x real time)`);
console.log("text:", JSON.stringify(result.text));

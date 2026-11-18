import { cp, mkdir, readdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = resolve(root, "node_modules/onnxruntime-web/dist");
const target = resolve(root, "public/vendor/ort");
const files = (await readdir(source)).filter((file) => /^ort-wasm-.*\.(?:mjs|wasm)$/.test(file));
if (!files.length) throw new Error(`No ONNX Runtime WebAssembly files found in ${source}`);
await mkdir(target, { recursive: true });
for (const file of files) await cp(resolve(source, file), resolve(target, file));
console.log(`Copied ${files.length} ONNX Runtime files.`);

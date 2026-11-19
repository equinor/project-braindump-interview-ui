import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const modelDirectory = resolve(root, "public/models");
const repo = "ysdede/parakeet-tdt-0.6b-v2-onnx";
const revision = "db4a768f5795e0f508187a34241fbeeef6ebb0d3";
const files = [
  {
    name: "encoder-model.int8.onnx",
    sizeBytes: 652184014,
    sha256: "3e0581fda6ab843888b51e56d7ee78b6d5bc3237ec113af1f732d1d5286aa155",
  },
  {
    name: "decoder_joint-model.int8.onnx",
    sizeBytes: 8998286,
    sha256: "a449f49acd68979d418651dd2dcb737cc0f1bf0225e009e29ee326354edbf7d3",
  },
  {
    name: "vocab.txt",
    sizeBytes: 10409,
    sha256: "d5b4ca312b07f10cc89b6ff1f500201b5bd826dc3f9500c115caeb36c0b10831",
  },
];

await mkdir(modelDirectory, { recursive: true });

async function hashFile(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

for (const file of files) {
  const path = resolve(modelDirectory, file.name);
  let valid = false;
  try {
    valid = (await stat(path)).size === file.sizeBytes && (await hashFile(path)) === file.sha256;
  } catch {
    valid = false;
  }
  if (!valid) {
    console.log(`Downloading and verifying ${file.name} from the pinned speech model.`);
    const url = `https://huggingface.co/${repo}/resolve/${revision}/${file.name}?download=true`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Could not download ${file.name}: ${response.status}`);
    const temporaryPath = `${path}.part`;
    await writeFile(temporaryPath, Buffer.from(await response.arrayBuffer()));
    if ((await stat(temporaryPath)).size !== file.sizeBytes ||
        (await hashFile(temporaryPath)) !== file.sha256) {
      await rm(temporaryPath, { force: true });
      throw new Error(`Verification failed for ${file.name}; the downloaded file was discarded.`);
    }
    await rename(temporaryPath, path);
    console.log(`Downloaded and verified ${file.name}.`);
  } else {
    console.log(`Verified existing ${file.name}.`);
  }
}

const manifest = {
  ready: true,
  model: "NVIDIA Parakeet TDT 0.6B v2 (English)",
  repo,
  revision,
  licence: "CC BY 4.0",
  attribution: "NVIDIA Corporation; ONNX conversion and packaging by ysdede.",
  totalBytes: files.reduce((total, file) => total + file.sizeBytes, 0),
  files,
};
await writeFile(resolve(modelDirectory, "model-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Model ready (${(manifest.totalBytes / 1024 ** 2).toFixed(1)} MiB).`);

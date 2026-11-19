# Project Braindump

A single-page app for a quick project braindump that ends in one markdown file, in Equinor branding.
The person answers fixed questions by typing, recording, or uploading audio, fixes the text, and saves a `.md` file that follows
the documentation template (header fields plus eleven sections). They then edit and publish it themselves.

Design source: the Project Braindump Miro board, workflow frames 1 to 9 and reference frames R1 to R3.
The plain-text wireframes are in `../spike-e-audio-interview/`.

## Run

```sh
npm install          # once after cloning; installs ONNX Runtime and the other dependencies
npm run dev          # prepares the speech model on first start, then opens http://127.0.0.1:5173
npm test             # domain rules: routes, markdown template, links, file name
npm run build
npm run screenshots  # after a build: drives the app with a fake microphone, saves screenshots/
```

The first `npm run dev` downloads and verifies about 631 MiB of speech model files. Later starts reuse the local copy.
An internet connection is needed for the first start; audio stays on the computer.

Open it in Chrome. The first screen shows "Transcription: getting ready N%", then "Transcription ready".
Add `?stub=fail` to see the could-not-start state.

## Change the questions

The questions are not in the code. They are in `public/questions.json`. Edit that file, save it and refresh the page:
no rebuild. For a built copy, edit `dist/questions.json` the same way.

```json
{
  "routes": { "short": { "minutes": 10 }, "full": { "minutes": 25 } },
  "fileOrder": ["summary", "qd"],
  "questions": [
    { "id": "qd", "heading": "Question and decision", "prompt": "What question were you answering?",
      "hints": ["Who asked it?"], "short": true }
  ]
}
```

- `id`: short unique name. Saved answers are filed under it, so avoid renaming it mid-project.
- `heading`: the section title in the markdown file. `prompt`: what people are asked.
- `hints`: optional prompts shown below the question as subdued gray-blue text on white. Any number, including none.
- `maxSentences`: optional. Shows a counter such as "2 of 3 sentences" under the answer box. It counts; it never blocks.
- `short`: true to ask it on the short route. The route counts and the welcome screen update by themselves.
- `kind`: optional. `text` (default), `approaches` (the list of things tried, with idea, why it worked or failed,
  and links) or `repro` (an answer plus pasted commands and a last-checked date). Use the last two at most once.
- `stage`: optional id of a stage listed under the top-level `stages` (each has `id`, `title` and a `why` line). The first
  question of a stage shows "Stage 1: Frame it" and "Why we ask: ..." above it.
- `startingPoints`: optional list of text shown as buttons that start the answer, or `"about"` to offer the title and topic typed on
  the About screen. People can always describe their own.
- `fileOrder`: optional order of the sections in the file. Ids left out follow in the order asked.
- Add, remove or reorder questions freely. Skipped or removed sections show under "Not covered" as before.

If the file has a mistake, the page shows what is wrong in plain words instead of starting. The header fields
(title, author, status and so on) are not part of this file. They are asked on two screens: About this work at the
start (title, topic, author, repo, status) and Details for finding this at the end (aliases, datasets, models, people). The Models list offers your approach names as one-tap suggestions.

## What is real and what is a stand-in

- Real: the flow, the ten questions and two routes, the About form, the approaches list (idea, why it worked or
  failed, any number of links), the review screen, saving the file, resuming after a reload, typing, recording,
  uploading audio, the one-recording-at-a-time rule, the 5-minute cap, and discarding audio once it is text.
- Speech model: `npm run dev` downloads and verifies the pinned Parakeet model into `public/models` when it is
  missing. You can also run `npm run prepare:model` explicitly. Without those files, the app uses a clearly labeled
  demo transcriber with placeholder text.
  Parakeet, parakeet.js and onnxruntime-web are not on the company tech radar, so check that before production.
- Checked without a browser: `node scripts/smoke-parakeet.mjs clip.wav` loads the real model in Node (CPU) and
  transcribes a 16 kHz mono WAV. It proves the files and library work, not the browser path (worker, WebGPU, microphone).

## Rules the code follows

- No AI. Questions, headings, hints and the markdown are fixed rules. The only trained model is speech to text.
- Nothing leaves the computer. The page may only connect to its own origin.
- Recorded and uploaded audio stays in memory until it is text, then it is dropped. Only text is saved in the browser.
- Unanswered sections and empty header fields are written under "Not covered". Nothing is invented.

## Equinor branding

Colours, logo and spacing are defined locally in `branding/` (see `branding/BRAND.md`):
white page, North Sea 1 text and main buttons, Energy red used once per view (the Start recording button, then the
recording dot), teal for ready, dark red on a warm panel for problems. The type is Arial because the Equinor font
files are not in this folder; add the `@font-face` rules from `branding/tokens.css` if you have them through Equinor.
The Equinor Design System (EDS, Adopt on the tech radar) is not used yet: this follows the local brand tokens.
Check anything that leaves the engagement against the Equinor Communication Toolbox.

## Tech radar

React, TypeScript, Vite, Vitest and npm are Adopt. Playwright is Assess, so `playwright-core` is used only by the
dev-only screenshot script and is not part of the app.

## Not verified

The build and the 29 tests pass (they read the shipped `questions.json`, so a bad edit fails them). The app has not been opened in a browser from the assistant's sandbox,
which blocks Chromium, so the screens, the microphone and the layout still need a first look.

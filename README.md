# project-exit App

Local prototype for the project exit interview. The interface follows `BRIEF.md`,
`SCREENS.md`, the supplied question configuration and Equinor brand tokens.

## Run locally

```sh
npm install
npm run prepare:model
npm run dev
```

The app opens on the local Vite address. Speech is transcribed locally in your
browser with NVIDIA Parakeet. The first setup downloads about 661 MB of model
files.

Recorded and uploaded audio stays in memory, while interview text is saved in
browser storage so the draft can resume after a reload. The model and runtime
files stay on the same local origin; recordings and transcripts are not sent
to a server.

## Checks

```sh
npm run build
npm test
npm run test:e2e
```

Playwright's Chromium browser must be installed once with
`npx playwright install chromium`.

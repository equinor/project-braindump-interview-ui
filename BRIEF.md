# Spike D: the interview interface

**Time box:** two to three days. **This is a user interface spike.** The point is to find out whether answering questions out loud, one at a time, feels effortless, and whether it works with transcription that runs inside the browser. A prototype that people enjoy using is the goal. Code quality comes second.

## Why

A data science team wants to capture what was done on a project, and why, before the knowledge walks away. The plan is a tool that interviews a team member: it asks questions one at a time, records spoken answers, turns them into text on the person's own computer, and saves a file.

That only works if people **finish** the interview. A clumsy recorder gets abandoned halfway. This spike builds the real interface so we can learn:
- whether people can get through an interview without help, and without getting stuck or losing work
- whether it holds up with in-browser transcription, whose model is large (about 660 MB) and, in an earlier spike, did not stay cached between page loads. The interface must never make people wait for it.

## What to build

A web app, run locally, where one person:
1. says what the project is and picks a few options
2. is asked questions one at a time, and for each one **speaks** (records), **uploads** an audio file, or **types**
3. sees the answer turn into text, which they can correct
4. reviews all the answers and saves a markdown file

Everything happens on their own computer. No audio or text is sent anywhere.

Screens, wireframes and the exact wording are in `SCREENS.md`. Read it with this brief.

## The experience goals

"Frictionless" here means these, and the spike is judged against them.

| Goal | How we check it |
|---|---|
| **Starts fast** | A first-time person is recording their first answer within 60 seconds of opening the page, with no install, no sign-in and no help |
| **Never blocked by the model** | People can record answers while the model loads. Text appears when it is ready. |
| **One decision at a time** | Every screen has one clear main action |
| **Nothing is lost** | After a reload, a closed tab or a crash, the interview resumes at the right question with the written answers intact. The person is warned before leaving if something would be lost. |
| **Always oriented** | The person always knows which question they are on, how many are left, and roughly how long it will take |
| **Every mistake is recoverable** | Re-record, undo a skip, go back, edit the text, restart a question |
| **Finishable** | Three test users complete the short route in about 30 minutes, without help |
| **Accessible** | Works with the keyboard alone and with a screen reader. WCAG 2.2 AA. |

## Scope

**In scope**
- The core flow: welcome, one question at a time (record, upload or type), background transcription, review, save.
- **Short route:** a choice at the start to be asked only the essential questions.
- **Project types and modules:** the person picks the kind of project, which adds that kind's extra questions.
- **Save to a chosen folder:** in Chrome, write the file straight into a folder the person picks. Where that is not possible, download it.
- **Resume:** answers survive a refresh or closing the tab. Audio is not kept, only text.

**Out of scope**
- Speaker labels, live captions while speaking, accounts, any server, analytics, any call to a language model, follow-up questions that adapt to the answer, saving audio, more than one interviewee.
- A phone layout. Desktop and laptop first. It must not break at narrow widths, but it need not be polished.

## The questions

The questions, their follow-up prompts and the rules for building the sequence are in `data/interview-config.json`. **Do not write question text into the code.** Read it from that file, so the questions can change without touching the app.

How the sequence is built:
- Without a data science project type, the interview is the 13 core questions (9 essential).
- With one or more types picked, question X7 is replaced by the data science questions (7, of which 4 are essential), followed by the module for each picked type (5 to 7 questions each), in the order the types were picked. Then the remaining core questions.
- Each question belongs to a part (for example "The story", "What was done", "About forecasting"). Show the part name.
- Example: a forecasting project is 25 questions in the full route and 14 in the short route.
- Rough time: about 2.7 minutes per question in the full route and 2.0 in the short route (see `minutesPerQuestion`). A full interview for a typical data science project takes about an hour. The short route takes about 25 to 30 minutes.

**The short route is the preselected choice** on the welcome screen. Show both options with their question counts and time estimates, and say plainly what each means. Report in the findings which people chose which, and why.

## UX requirements

These are the best-practice requirements. Each is testable.

### Orientation and progress
- A progress bar divided by part, plus text such as "Question 4 of 14 · What was done". The time-left estimate updates as questions are answered or skipped.
- The part name sits above the question.
- The question text is the heading and the first thing read. Follow-up prompts are collapsed behind a link ("Need a prompt?"), closed by default, and the open or closed choice is remembered.
- The person can move back and forward freely. An "All questions" list shows the state of each (answered, skipped, don't know, waiting) and lets them jump.
- In the full route, essential questions carry a small label, which explains what the short route drops.

### Answering
- Three ways to answer, all visible at once on the question screen, with no menu: **Record** (the most prominent), **Upload audio**, **Type**.
- **Record:**
  - A large button. The browser's microphone permission is requested at the first press, preceded by one line saying why (see `SCREENS.md`).
  - While recording: an elapsed timer, a live level meter (so people can see the microphone works), a clear "Recording" label with a dot, a big Stop button, and pause and resume.
  - Limit of 5 minutes per recording (`limits` in the config). A soft warning at 4:30, and an automatic stop at 5:00 with a plain explanation.
  - After stopping: a playback control and "Record again". The answer is kept without an extra confirmation step. "Next" is the main action.
  - An answer can have more than one recording ("Record more"). The text is joined in order.
- **Upload:** a file picker, plus drag and drop onto the whole question area. Accept common audio formats (mp3, m4a, wav, webm, ogg). Show the file name and length. Give a clear message for an unsupported format or a file over the limit.
- **Type:** a text box that saves as you type. A spoken answer can be edited by typing.
- **Skip** and **I don't know** are one click each and always visible. Each can be undone.
- **How do you know this?** Three optional choices after an answer exists: "I did or saw it", "I was told it", "Not sure" (from `marks` in the config). One choice at most. Not required to continue. Can be changed in review.
- **Focus and keyboard:** on every new question, move focus to the question heading, and make the Record button the first control after it. Any shortcut must not be a single character key, so it cannot clash with typing or with assistive technology. Ctrl or Cmd with Enter goes to the next question, and the shortcut is shown on screen. Do not use Ctrl or Cmd with R or Shift.

### Transcription feedback
- Each answer is transcribed in the background as soon as it is saved, one at a time. The person never waits for it to go on.
- Each answer shows its state in words: "Getting transcription ready…" (with what is happening and a percentage), "Turning your answer into text…", "Done", or "We couldn't turn this into text" with "Try again" and "Type it instead".
- A small status in the page header summarises it: "Transcription ready", "Getting transcription ready, 42% (first time only)", "Transcribing 1 answer".
- The model starts loading as soon as the page opens, not when it is first needed.
- The transcript appears under the question and can be edited in place. An "edited" marker shows when it differs from the machine's text, with "Undo my edits".
- If the model cannot load or the browser cannot run it, say so once and plainly. Offer "Try again". Recorded audio is kept in memory so it can be transcribed when the model recovers. Typing always works.

### Review and saving
- One scrollable page with every question and its answer: status, text you can edit in place, playback while the audio is still in memory, the "how do you know" choice, and a way to go back to the question to record again.
- Unanswered essential questions are shown gently, with an "Answer now" link. They do not block saving.
- A reminder before saving: "Check for names. Replace them with roles, for example 'the platform team'." *Could have:* a button that highlights capitalised words that may be names.
- The main action is "Save interview". It is disabled, with a reason, while answers are still being transcribed.
- **Folder:** on the welcome screen the person may choose a folder to save to. Where the browser supports it, the app remembers the choice and writes the file straight there. If no folder was chosen, or the browser cannot do it, or permission is refused, the file downloads instead. An existing file is never overwritten: add "(2)".
- **After saving:** confirm the file name and where it went. Offer "Copy as markdown" and "Start another interview". Offer to remove the draft from the browser, with removal as the default.

### Resume
- The draft is saved after every change: project details, answers (text), marks, states, position, route and types. No audio.
- On opening with a draft, show one screen: "Continue where you left off" (project name, question 7 of 14) as the main action, and "Start a new interview" as secondary, with a confirmation before discarding.
- One draft at a time is enough.
- Warn before leaving the page only when something would be lost: a recording in progress or an answer still being transcribed.

### Errors and recovery
Every error says what happened, what is still safe, and what to do next, in one or two plain sentences. Cover at least:
- microphone permission denied (with how to fix it in Chrome), and no microphone found
- the model fails to load, or loading is slow
- transcription fails for one answer
- an unsupported file or a file that is too long
- browser storage full or blocked
- folder permission refused, or the folder is no longer available
- an unsupported browser (say Chrome on a Mac is the tested one, and what still works)

### Accessibility
- WCAG 2.2 AA. Semantic HTML with landmarks and a sensible heading order.
- Visible focus ring (3 px) on every control. Everything reachable and usable by keyboard.
- Click and tap targets at least 44 px.
- Status updates go to a polite live region and errors to an assertive one. The recording state is announced at start, at stop and at the time warning, not every second. It never relies on colour or animation alone.
- Respect reduced motion: no pulsing when it is set.
- Usable at 200% zoom with no loss of content or function.
- Choices are real radio groups and check boxes, with labels. Errors are linked to their fields.
- Test the whole short route once with VoiceOver on a Mac.

### Privacy and trust
- One plain line at the welcome screen and before the first recording: "Your voice is turned into text on this computer. Nothing is sent anywhere."
- The page sets a content security policy that only allows its own origin. After the model has loaded, the page makes no network requests, and a test proves it.
- Ask for the person's **role**, not their name. The saved file has no personal name unless the person typed one into an answer, which the review reminder addresses.
- Audio is not kept after transcription. There is no "keep audio" feature.

### Performance
- The interface never freezes while transcribing, because the model runs in a Web Worker.
- A repeat visit is interactive in under 2 seconds, not counting the model.
- Recording starts within 300 ms of pressing Record, once permission has been given.
- Release audio buffers after transcription.

### Layout
- A single column, about 720 px wide at most, so lines stay readable. Works from 1024 px down to 360 px with no horizontal scroll.
- One logo per page. No imagery.

## Branding

Follow `branding/BRAND.md` and use `branding/tokens.css`. In short: white page, dark North Sea text, one Energy red accent per view, Equinor font with an Arial fallback, the supplied horizontal logo top left, sentence case, plain wording. The header holds the logo and the title "Project exit interview".

## The saved file

One markdown file per interview. The name is `YYYY-MM-DD - <project> - exit interview.md`, with characters that are not allowed in file names removed.

```markdown
---
project: <project name>
date: 2026-10-27
interviewee_role: <role>
type: capture-interview
kind: exit
reason: ending | paused | handover | leaving
project_types: [forecasting]
route: short | full
guide_version: 1
transcription_model: parakeet-tdt-0.6b-v2
reviewed: true
---

## X1. Tell the story of the project in a couple of minutes.
<!-- q: X1 -->
**Source:** first-hand | heard | unsure | not marked
<the reviewed text>

## X6. What were the main decisions, and why were they made?
<!-- q: X6 -->
**Source:** not marked
_Skipped_

## DS3. How did you prepare the data?
<!-- q: DS3 -->
**Source:** not marked
_I don't know_
```

Every question in the sequence appears, in order, even if skipped or unknown. Questions left out by the short route do not appear. The `**Source:**` line maps the choices: "I did or saw it" is `first-hand`, "I was told it" is `heard`, "Not sure" is `unsure`, and none is `not marked`.

## Technical constraints

- A static web app. TypeScript and Vite. React is acceptable and preferred for the interface state. Keep dependencies few. If an earlier spike's vanilla JavaScript code is easier to extend, you may reuse it, and say why.
- Keep the interview logic in plain functions that can be tested without a browser: building the question sequence from the config (types, modules, short route), progress and time estimates, the file name, and the markdown output.
- Put transcription behind a small interface (audio in, text out, with progress). Provide a **stub** implementation that returns placeholder text after a short delay, for building the interface and for tests. The real one is described in `TRANSCRIPTION_NOTES.md`.
- Chrome on a Mac is the target. Other browsers: best effort, with a clear message.
- Content security policy: `default-src 'self'; connect-src 'self'; media-src 'self' blob:; worker-src 'self' blob:; script-src 'self' 'wasm-unsafe-eval'`. Adjust only as needed, and note any change.
- Tests: Vitest for the logic. Playwright for the flow, using Chrome's fake microphone (`--use-fake-device-for-media-stream`, `--use-fake-ui-for-media-stream`, `--use-file-for-fake-audio-capture=<wav file>`), the stub transcriber, and one test with the network blocked after load.

## How to evaluate it

1. **Automated checks** pass.
2. **Accessibility:** a keyboard-only run of the whole short route, a VoiceOver run, 200% zoom, a contrast check, and reduced motion.
3. **Heuristic review** against the ten usability heuristics, recorded in `FINDINGS.md`.
4. **Usability test with three people** who know a data science project but have not seen the app. The task: "Document your project using the short route." Use a project with nothing confidential in it, or a practice project. Watch without helping. Record the time to the first recorded answer, the total time, every hesitation or question, every error, and whether they would have given up. Afterwards ask: how easy was it, from 1 to 5; would you finish a one-hour interview; what annoyed you.
5. **Real transcription run:** five questions with the real model on a Mac. Record the waiting time per answer and in total.

## Done when

- the app runs locally, and the automated checks pass
- a person can go from opening the page to a saved file, in the short route, with typed, recorded and uploaded answers
- resume works after a reload and after closing the tab
- the saved file matches the format above
- the accessibility checks, the heuristic review and the three-person test are done
- `FINDINGS.md` is filled in

## What to report

Copy the headings from `FINDINGS.md` and answer them. The most useful part is what made people hesitate or give up.

# Screens, states and wording

Wireframes are plain text and show layout and wording, not final visuals. Follow `branding/BRAND.md` for the look. Wording is plain and short, in sentence case. Keep it unless a usability test shows a problem.

All screens share one header: the Equinor logo at the top left, the title "Project exit interview", and a small transcription status on the right.

## 1. Welcome

```
[equinor logo]   Project exit interview                    [Transcription: getting ready 42%]

Project exit interview
Record what was done, and why.

You answer out loud, one question at a time. Your voice is turned into text
on this computer. Nothing is sent anywhere.

Project name
[______________________________]

Your role in the project                  (we don't need your name)
[______________________________]

Why are you doing this interview?
( ) The project is ending     ( ) The project is paused
( ) The project is changing hands     ( ) I am leaving the project

What kind of project was it?           (pick all that apply)
[ ] Anomaly detection   [ ] Forecasting   [ ] Schedule optimisation
[ ] Classification      [ ] Visual classification (images or video)
[ ] Other data science  [ ] None of these

How long do you have?
(•) Short: the essential questions    14 questions, about 30 minutes
( ) Full: every question              25 questions, about 1 hour 10 minutes

Where should we save it?   (optional)
[Choose a folder]   or we'll download the file at the end

                                                   [ Start ]
```

- Counts and times update as the person picks types and the route.
- "Start" is the main action. It is enabled when the project name and role are filled in. Say what is missing if it is pressed too early.
- "None of these" clears the other types, and picking any other type clears it.
- If a draft exists, this screen is replaced by the resume screen.

## 2. Resume

```
Continue where you left off?

Project: <name>
You answered 6 of 14 questions. Last saved a few minutes ago.

[ Continue ]            Start a new interview
```

Starting a new interview asks: "Start again? This removes the saved answers on this computer." with "Start again" and "Keep my answers".

## 3. A question

```
[logo]   Project exit interview                    [Transcription ready]

[#####|#####|##---|-----|-----|-----]      Question 4 of 14 · about 20 minutes left
What was done                                                          [All questions]

What came out of it?                          (36 px, the heading)
Need a prompt?  v

  ( collapsed: when opened )
  - What works, and how well? Give numbers if you can.
  - Compared with what: a baseline, the way it was done before?
  ...

   [     ( ) Record answer      ]           Upload audio        Type instead

  [ Skip this question ]  [ I don't know ]

  [ Back ]                                                       [ Next question ]
                                                          Ctrl or Cmd + Enter
```

States of the answer area:

**Ready.** The Record button is the one Energy-red element. Below it: "Upload audio" (or drop a file anywhere here) and "Type instead".

**Recording.**
```
   o Recording    02:14          ||||||||||||||||----
   [ Stop ]   [ Pause ]
```
The Stop button is dark (North Sea 1). The small dot is the only Energy-red element. At 4:30: "30 seconds left." At 5:00 the recording stops: "Recording stopped at the 5-minute limit. You can add more with Record more."

**Recorded, transcribing.**
```
   > [audio player 02:14]      Record again    Record more

   How do you know this?   ( ) I did or saw it   ( ) I was told it   ( ) Not sure

   Turning your answer into text…        (or: Getting transcription ready, 42%. You can keep answering.)
```

**Transcribed.**
```
   Your answer                                     [edited]  Undo my edits
   [ text box with the transcript, editable                         ]
```

**Skipped or don't know.** The answer area shows "Skipped" or "You said you don't know" with "Undo".

**Typing.** A text box, "Saved as you type".

Behaviour:
- The progress bar has one segment per part, filled in proportion to the questions answered.
- "Next question" is always available. It never waits for transcription.
- On the last question the button reads "Review answers".
- "All questions" opens a list with the state of each question and lets the person jump.

## 4. Review

```
Review your answers
Read through, fix anything the transcript got wrong, then save.

Check for names. Replace them with roles, for example "the platform team".

What was done
  1. Tell the story of the project…                      Done     [Edit] [Go to question]
     <text>
     How do you know this?  (•) I did or saw it  ( ) I was told it  ( ) Not sure
  2. What was the need…                                  Not answered (essential)  [Answer now]

[ Save interview ]
```
- When some answers are still transcribing: the button is disabled, with "Waiting for 2 answers to finish turning into text."

## 5. Saved

```
Saved.
2026-10-27 - Project name - exit interview.md   in <folder name>   (or: downloaded)

Give this file to the person who keeps the project record.

[ Copy as markdown ]     [ Start another interview ]

[x] Remove this interview from this browser
```

## Wording

| Moment | Text |
|---|---|
| Before the first recording | "To record, your browser will ask to use the microphone. The audio stays on this computer." |
| Microphone blocked | "The microphone is blocked. Click the icon in the address bar, allow the microphone, then try again. You can also upload a recording or type your answer." |
| No microphone | "We can't find a microphone. You can upload a recording or type your answer." |
| Model loading, first time | "Getting transcription ready (first time only): 42%. You can keep answering." |
| Model failed | "Transcription couldn't start. Your recordings are safe. You can try again, or type your answers." |
| Transcribing | "Turning your answer into text…" |
| One answer failed | "We couldn't turn this into text. Try again, or type your answer. Your recording is still here." |
| Time warning | "30 seconds left." |
| Time limit | "Recording stopped at the 5-minute limit. You can add more with Record more." |
| Unsupported audio file | "We can't read that file. Try an mp3, m4a, wav, webm or ogg recording." |
| File too long | "That recording is longer than 5 minutes. Cut it into shorter parts and add them one by one." |
| Storage blocked | "Your browser won't let us save progress on this computer. You can keep going, but a refresh would lose your answers." |
| Folder refused | "We couldn't save to that folder, so we downloaded the file instead." |
| Other browser | "This works best in Chrome on a Mac. Some parts may not work here. You can still type your answers." |
| Leaving with something unsaved | "An answer is still being turned into text. If you leave now, it will be lost." |
| Skipped | "Skipped. Undo" |
| Saved | "Saved." |

## State of one question

Each question holds: its state (`waiting`, `answered`, `skipped`, `unknown`), zero or more recordings with their text, the typed text if any, the edited text, the mark, and a transcription state per recording (`queued`, `running`, `done`, `failed`). Keep these as plain data in one place, so the draft can be saved and restored and the file written from it.

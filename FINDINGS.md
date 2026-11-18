# Spike D findings: the interview interface

Fill in after the spike. Short answers are fine. Numbers where you have them.

## What was built
- Date, who built it, tools and model(s) used:
- Stack and dependencies, and whether any earlier code was reused:
- Which of the extras made it in: short route, project types and modules, save to a folder, resume
- Font used: Equinor or Arial fallback
- Anything in the brief that was changed, and why:

## Experience goals
| Goal | Result | Evidence |
|---|---|---|
| First answer recorded within 60 seconds, first-time person, no help | | |
| Never blocked by the model | | |
| One main action per screen | | |
| Nothing lost after reload, closed tab or crash | | |
| Always oriented (question, remaining, time) | | |
| Every mistake recoverable | | |
| Short route finished in about 30 minutes without help | | |
| Accessible (keyboard, screen reader, WCAG 2.2 AA) | | |

## Automated checks
- Logic tests (sequence, short route, modules, time estimate, file name, markdown output): passing? how many:
- Flow test with fake microphone and stub transcriber:
- Offline test (network blocked after load):
- Anything not covered:

## Usability test (three people)
| | Person 1 | Person 2 | Person 3 |
|---|---|---|---|
| Role (no names) | | | |
| Time to first recorded answer | | | |
| Total time | | | |
| Route chosen, and why | | | |
| Hesitations or questions asked | | | |
| Errors or wrong turns | | | |
| Would have given up? Where? | | | |
| Ease, 1 to 5 | | | |
| Would finish a one-hour interview? | | | |
| What annoyed them | | | |
| What they liked | | | |

- The three biggest problems seen, most serious first:
- Changes made after the test, or recommended:

## Heuristic review
| Heuristic | Rating (fine, minor, major) | Notes |
|---|---|---|
| Visibility of system status | | |
| Match between the system and the real world | | |
| User control and freedom | | |
| Consistency and standards | | |
| Error prevention | | |
| Recognition rather than recall | | |
| Flexibility and efficiency of use | | |
| Aesthetic and minimalist design | | |
| Help users recognise, diagnose and recover from errors | | |
| Help and documentation | | |

## Accessibility
| Check | Result | Notes |
|---|---|---|
| Whole short route by keyboard alone | | |
| Whole short route with VoiceOver | | |
| 200% zoom, no loss of content or function | | |
| Contrast of every text and control | | |
| Reduced motion respected | | |
| Focus moves to the question on each step | | |
| Status and errors announced | | |
| Targets at least 44 px | | |

## Real transcription run (five questions, real model, on a Mac)
- Machine (chip, memory, managed or not):
- Backend used (WebGPU or WebAssembly):
- Model load time, first load and reload:
- Did the model stay cached? Did the persistent storage approach work?
- Transcription time per answer, and the length of each answer:
- Total time spent waiting on transcription during the run:
- Accuracy: what the transcripts got wrong (kinds of errors, not content):
- Anything that blocked or confused the person because of the model:

## Branding
- Colours, type, logo and layout checked against `branding/BRAND.md`:
- Energy red used once per view? Any contrast failures?
- Anything the guidelines did not cover that you had to decide:

## The saved file
- Does the output match the format in the brief? Sample files checked: ___
- Short route, long route, skipped and don't-know cases, several recordings in one answer:
- Did the folder save work? Fall back to download correctly?
- Any characters or edge cases that broke the file name or the markdown:

## Open issues
-

## Recommendation
- Keep as designed:
- Change:
- Drop:
- Which route should be preselected, and what did people choose?
- Is this ready to become the interface for the real build? What has to be true first?

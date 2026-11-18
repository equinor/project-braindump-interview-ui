# Equinor look for the interview app

This app is an internal Equinor prototype. These rules come from the Equinor design guidelines, which were built from the official brand files (colour swatches, the Equinor font family and the logo files). Colours, fonts and logos are official. Sizes and layout rules are working defaults. The Equinor Communication Toolbox is the authority, so check anything that leaves the engagement against it.

The design in one line: clean and calm, a lot of white space, dark blue text, and one bright red used sparingly as the single point of emphasis.

## Colour

`tokens.css` has every value and role. The rules:

- **Mostly white, with dark North Sea text** (`#243746`). Light tints (`#DFF5FF`) for quiet panels. Energy red (`#FF1243`) as a small accent only, about 5% of the surface or less.
- **One Energy element per view.** On the question screen it is the Record button before recording starts. While recording, the Stop button turns dark (North Sea 1) and the small recording dot becomes the one Energy element.
- **Energy is never body text, and never a large fill.** White text on Energy passes only at large bold sizes (18.66 px bold or 24 px and up), so any Energy button has a large bold label.
- **Main buttons** use North Sea 1 fill with white text (12:1). Secondary buttons are white with a North Sea 1 outline and text.
- **Success** uses Norwegian woods teal (`#007079`) on white, or a pale green panel (`#E6FAEC`). **Errors and cautions** use dark red text (`#7D0023`, 11:1) on a pale warm panel (`#FFE7D6`), never Energy red.
- **Lines** are 1 px, North Sea 6 or 7. No heavy borders, no shadows, no gradients, no dashed boxes.
- **Never rely on colour alone.** Every status has a word or an icon as well.
- **Contrast** (checked): North Sea 1 on white 12.3, on `#DFF5FF` 10.9, on `#FFE7D6` 10.3. Secondary text `#49709C` on white 5.2. Teal on white 5.8. All body text must reach 4.5.

## Type

- **Typeface:** Equinor, in Regular (400), Medium (500) and Bold (700). **Fallback: Arial.** Say in your findings which one was used.
- The font files are proprietary and the licence terms are unconfirmed. Use them for Equinor work, and do not publish them or send them outside the engagement. They are not included in this folder. If you have them through Equinor, use the `@font-face` rules in `tokens.css`.
- **Sentence case** for everything. Not all caps, not title case.
- **Sizes (web):** question text 28 to 36 px Medium. Section labels 20 px Medium. Body 17 px Regular. Buttons and labels 16 px Medium. Captions 14 px minimum. Line height 1.5 for body and 1.2 for headings.
- Left-aligned, ragged right. Emphasis in Medium or Bold, not underline. Italic sparingly.

## Logo

- **File:** `equinor-logo-horizontal-red.svg` (the horizontal logo, taken from the Equinor template). PNG versions are in the Equinor design guidelines folder.
- **Placement:** top left of the header, on a white background. **One logo per page.**
- **Size:** at least 80 px wide on screen. Keep clear space around it of at least the height of the letter "e" in the wordmark.
- **Don't** stretch, rotate, recolour, outline, add effects, put it in a box, or put the red logo on a coloured background. Never redraw or retype it.

## Layout

- White space first. Page margins of at least 5% of the width. Content column at most about 720 px wide, so lines stay readable.
- **Spacing scale:** 4, 8, 16, 24, 32, 48, 64 px.
- **Shape:** soft corners, 4 to 8 px radius, on cards, inputs and buttons.
- **Icons:** simple line or solid, one colour (North Sea 1), one stroke weight. No emoji.
- No imagery is needed.

## Tone of voice

Plain, direct, factual and human. Short sentences. Say what the thing is and why it matters. No hype and no jargon. Sentence-case headings. Address the person as "you".

## Checklist before handing it over

1. Fonts: Equinor, or Arial if substituted, and stated.
2. Colours: only the hex values in `tokens.css`. Energy used once per view.
3. Logo: the supplied file, red on white, with clear space, unaltered.
4. Text: sentence case, one main message per screen.
5. Contrast: all body text 4.5:1 or better.

# Writing for Acme

> **Skeleton.** Every section below is a **Stub**: a heading and one line on
> what goes there. The bootstrap (step 4) fills them from the owner's answers,
> and the project owns the guide from then on. Until then the app's language is
> English, left to right (`frontend/src/lib/locale.ts`), and the only rule is
> the one in "Check before shipping". Delete this note when the last stub is
> filled.

How to write text a user reads or hears. It covers every screen, and also what
is not on a screen: screen-reader labels, page titles and descriptions, and
emails. Start at [DESIGN.md](DESIGN.md) if you have not written the brief yet.

## 1. Who is speaking, to whom

**Stub.** *The voice in two or three sentences, an example of what it says and
an example of what it never says.*

## 2. Form of address

**Stub.** *Whether the text says "you", "we" or neither, in the language's own
terms; the person's gender and number where the language marks them.*

## 3. Writing the language naturally

**Stub.** *The habits of the language this product is written in that a
translation would miss. For English, the variety's habits the market needs
(UK or US spelling, how dates and times are written), or "none beyond the
guide".*

## 4. Phrasebook

**Stub.** *One wording per meaning, in rows: actions, calls to action, states,
words, links and labels. Each wording is the owner's; add a row only with the
owner's approval, and move a replaced wording to "Never".*

## 5. By kind of text

**Stub.** *One short rule each for buttons, links, headings, field labels,
errors, empty states, emails, page titles and descriptions.*

## 6. Check before shipping

Run this over every string you wrote or changed:

1. **Aloud.** Read it aloud. Would you say it to a friend?
2. **The worry.** Which worry in the brief does this sentence answer?
3. **The same meaning elsewhere.** Search `frontend/src` for other wordings
   of it, and use one.
4. **Whole sentences,** with counts and dates formatted by the code.
5. **New wordings** are named in the PR for the owner.

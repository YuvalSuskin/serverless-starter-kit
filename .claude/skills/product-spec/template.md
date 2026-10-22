# <Feature name>

**Prefix:** <PREFIX>
**Status:** draft
**Last updated:** YYYY-MM-DD
**Visual inputs:** none

<!-- One line per visual input read:
[<name>](<link>) (<tool>), read YYYY-MM-DD as <handoff | HTML export | PDF | screenshots>.
Mark a link only the owner can open *private*; with no link, say where the owner keeps it.
Then one reconciliation line: the spec-only affordances and the states the input does not show. -->

## 1. Intent

### The problem

<!-- One concrete story about one person in a real situation, never an abstraction. -->

### Why it matters

<!-- To that person, and to the business. -->

### Success

<!-- What is observably different for the user when this works. Nothing technical. -->

### In scope

### No-gos

<!-- What this spec deliberately leaves out. -->

## 2. Situations

<!-- One or more job stories per actor involved. Each worry names the rule, state or no-go that answers it. -->

**<Actor>**

> When <situation>, I want to <motivation>, so I can <outcome>.

Worries:

- "<worry in the user's words>" → <PREFIX>-R<n>

## 3. Journeys

<!-- P1: the smallest path useful on its own. P2/P3: additions, each demoable on its own.
Cover the unhappy paths that matter. Steps cite places and affordances by ID. -->

### <PREFIX>-J1 <name> (P1)

1. <step>

## 4. Places & affordances

<!-- New place test: can the user still act on what is behind it? No: a new place (a dialog, a confirmation).
Yes: part of the current place (a dropdown, revealed fields).
Affordances say WHAT is offered ("a way to retake"), never how it looks.
Here to: what the person is in this place to do, in a few words, in their terms.
Main: the ID of the affordance that does it; or "none" and the reason, for a
place that is only read or that offers a choice among equals.
Both say what matters most to the person, never where it sits or how it looks. -->

| ID | Place | Kind | Here to | Main | Reached from | Reference |
|---|---|---|---|---|---|---|

| ID | In | Affordance | Kind | Leads to |
|---|---|---|---|---|

## 5. States

<!-- One table per place. The five core states always appear. Every shared state in
docs/product/CLAUDE.md gets a row, or goes on the not-applicable line with its reason. -->

### <PREFIX>-P1 <place>

| State | What the user sees and can do |
|---|---|
| Ideal | |
| Empty | |
| Loading | |
| Partial | |
| Error | |

*Not applicable:* <state> (<reason>).

## 6. Rules

<!-- One behaviour each, checkable yes or no. Use can / sees / must / never; never "should".
No vague words (fast, easy, intuitive, seamless). Cite shared rules ("per LANG-2") instead of restating them.
Numbers only by limit ID. A withdrawn rule stays, struck through:
**<PREFIX>-R4.** ~~<text>~~ *Withdrawn YYYY-MM-DD: <reason>.* -->

**<PREFIX>-R1.** <rule>

## 7. Limits

<!-- Every number in the spec lives here and nowhere else. "Why" is a user or owner reason,
never engineering convenience. No justifiable reason: no number; write a checkable rule instead. -->

| ID | Limit | Value | Why users need it | At / beyond the edge |
|---|---|---|---|---|

## 8. Not in this version

<!-- Ideas the owner likes but has not committed to. Nothing here is a promise. -->

## 9. Assumptions & open questions

### Assumptions

<!-- Defaults chosen without asking, listed so the owner can veto any in one read. -->

### Open questions

<!-- While drafting: at most three, each also marked in the body as [OPEN: <question>].
Before approval, resolve each in one of two ways, never a third:
blocking (affects this version) -> answered, into the body and the log;
not for now -> deferred: what it affects moves to section 8, which names the question's bead.
An approved spec has no open questions left. -->

## 10. Log

### Clarifications

<!-- ### YYYY-MM-DD, then one line per decision: - Q: <question> → A: <answer>
Also write the answer into the section it affects. -->

### Design review

<!-- One entry per version reviewed, before the owner reads it:
YYYY-MM-DD — ran — <n> findings: taken <IDs changed>; to the owner <short list>.
or: YYYY-MM-DD — did not run — <reason>. -->

### Changelog

<!-- After approval only, one line per revision: YYYY-MM-DD — <IDs changed> — <why>. -->

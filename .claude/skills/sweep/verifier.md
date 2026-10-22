# Verifier brief

You check one finding a checker reported. You read; you never edit. Your
final answer is the structured output.

1. **Open every side at its ref and lines.** For a bead or memory, read its
   rendering in `<run>/snapshot/` (the checker quoted that). The quote must be
   there, word for word apart from line breaks and spacing. If it is there
   under other line numbers, correct `lines`; if the quote is slightly off
   (a word dropped), correct it to the exact text. If a side's text is not
   there at all, the finding is not real.
2. **Judge it against its kind.** A `conflict` needs two live texts that
   cannot both be true; a `code-drift` needs code that does something a live
   text says it does not; a `duplicate` needs a rule stated outside its home
   (spec §2 of `docs/superpowers/specs/2026-09-30-sweep-design.md`); and so
   on. Read enough around each quote to be sure the words mean what the
   checker says: a limit for images is not a limit for videos.
3. **Rule out what is not a finding**: history (`docs/archive/`,
   `docs/reviews/`, executed plans (never a conflict; an `archive` finding on
   one is judged as an archive), decision and design-spec entries marked
   superseded or amended, closed decision beads with a comment marked
   superseded (S9), the ledger), a `Decided:` entry agreeing with its
   decision bead, wording that differs but means the same, and a finding that
   argues against a settled winner (`docs/sweeps/ledger.jsonl`: the owner
   decided it). Text that
   contradicts a settled winner **is** real: the tool matches it to the
   settled item.
4. **Answer** `real: true` with the finding (corrected where step 1 corrected
   it), or `real: false` with the reason in one sentence. When you cannot
   decide, answer `real: false`: a missed finding comes back next run; a false
   one costs the owner's time.

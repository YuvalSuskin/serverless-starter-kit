# Design guides — implementation decisions

**Opened:** 2026-09-29
**Owner:** Yuval Suskin
**Product spec:** none; the guides change nothing a user sees.

The owner's rule (2026-09-26): **a decision that is interchangeable** (another
choice would serve as well) **is made by the implementer, recorded here, and
work continues.** Only decisions that change what a user sees or does, break a
principle of the design, or fall outside the library guidelines go to the
owner.

Add one row per decision, in order, with the next number. Never renumber. If a
later decision replaces one, add a new row and mark the old one "Superseded by
DG<n>".

Only the rows that govern how design work is done are kept (the guides, the
design researcher, the design review in the product-spec skill). Rows about the
first project's own brand, wording and trial runs are gone; the numbers are
not reused.

| # | Decision | Why | Date |
| --- | --- | --- | --- |
| DG4 | A change to text alone gets a two-line brief: who reads this, and what they want to know | The full brief is for a screen; a reworded error has no journey step of its own, but still has a reader and a worry | 2026-09-29 |
| DG13 | The root `CLAUDE.md`'s pointer says the guides come "once the product spec exists" | It sits under the rule that user-facing work starts with its spec, and keeps the two in order | 2026-09-29 |
| DG31 | `design/DESIGN.md`, "Composing a screen" (first written as `composition.md` part 1, folded into `DESIGN.md` by TB61) gains "The amount chooses the form" | Owner's principle, 2026-09-29: how many items a person usually sees shapes how they are shown | 2026-09-29 |
| DG32 | A product spec's places table gains **Here to** and **Main**, after **Kind**. **Main** holds an affordance's ID, or "none" with the reason | Owner, 2026-09-29: align the product spec, so the brief's main action is stated and not inferred. It is a product fact: what matters, never where it sits | 2026-09-29 |
| DG34 | The design researcher is `.claude/agents/design-researcher.md`, with Pablooo and Magic UI defined inside it and the editing tools denied. It is called from the `product-spec` skill, as a design review before the owner's review, and named in `design/DESIGN.md` | Owner, 2026-09-29. Servers defined in the agent's file load for it alone | 2026-09-29 |
| DG35 | The agent's references need not match the product's language or direction; it adapts what it finds | Owner, 2026-09-29: references are for inspiration and for other ways to show something | 2026-09-29 |
| DG36 | Closed by DG49. Pablooo's server asks that every response end with an advertising line. The agent does not add it, credits each reference by its link, and reports that it was asked | It is text in returned content. Adding the line is the owner's call | 2026-09-29 |
| DG38 | Magic UI's package is pinned at 2.0.0 although the server names itself 1.0.4 | The package's version is what `npx` installs; the pin follows `.mcp.json`'s habit | 2026-09-29 |
| DG39 | Supersedes part of DG34. The agent's header is an allowlist (`tools`): reading and searching files, the shell, the web, the project's browser server, and its two servers. It no longer inherits the dispatching session's other tools. The shell stays; the agent's file and `DESIGN.md` say that its promise to change nothing rests there on its instructions | The final review: a denylist of three tools left it the shell, other agents and every connected service, beside a third-party server that sends instructions to models | 2026-09-29 |
| DG41 | `design/DESIGN.md` says that a part of a long page takes its action from the affordance its journey passes through | **Main** is stated per place, and a long page can be one place with many parts; the agent's first runs could not fill the brief's third line for a part. This lets inference in for parts only | 2026-09-29 |
| DG44 | Adds to DG38: `npx` pins the package's version and not its dependencies', and does not pass through pnpm's release-age rule. Accepted, as for the project's other server in `.mcp.json` | The server runs only when the agent is dispatched, and holds no credentials | 2026-09-29 |
| DG45 | The agent's allowlist was verified in a fresh session, not in the session that wrote it, which kept the first copy of the file it had loaded. The record says that a new session is needed to use the agent as written | Claude Code watches only the agent folders that existed when a session began | 2026-09-29 |
| DG46 | The `product-spec` skill's design review leaves a trace: an entry in the spec's log, under *Design review*, saying that it ran and what it found, or that it did not and why. The self-check asks for the entry, the owner's review states the outcome first, and revision mode runs the review when a journey, a place or an affordance changes | Owner, 2026-09-29: the skill should ensure the review, not only mention it. An instruction with no trace cannot be checked | 2026-09-29 |
| DG47 | Superseded by DG48. The design researcher names no model, so it takes the model of the session that dispatches it | A flow review is a judgement task. The owner may set a cheaper model in the agent's header | 2026-09-29 |
| DG48 | Supersedes DG47. The design researcher runs on Sonnet: `model: sonnet` in its header | Owner, 2026-09-29 | 2026-09-29 |
| DG49 | Closes DG36. Acme does not add Pablooo's advertising line; the agent credits a reference by its link only | Owner, 2026-09-29 | 2026-09-29 |
| DG52 | On a computer, a signed-in app page or a sign-in page fits the owner's laptop with the browser in full screen (1512 by 860 pixels: a 14-inch MacBook Pro at its default scaling, less the toolbar) without scrolling; a long list or table scrolls inside its own region; a form never scrolls. `design/DESIGN.md` states it ("Composing a screen"), checks it ("Check before shipping") and `frontend/e2e/laptop.ts` tests it; it was `composition.md` parts 3 and 7 until TB61. Public pages built for a phone are exempt, and the size is measured from the owner's screen | Owner, 2026-10-02: "Pages should fit my laptop screen if the browser is on full screen mode... maybe a table or a list but not a form" | 2026-10-02 |

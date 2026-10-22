# tools/review-batch

`pnpm review-batch build <cards.json> --out <page.html>`: validate a review
batch's cards and build its review page. The owner-facing
entry is the `review-batch` skill (`.claude/skills/review-batch/`), whose batch
lead writes `cards.json` and publishes the page.

| File            | What it holds                                                                                                                            |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `src/cards.ts`  | The card and batch schema: the contract between drafters, the lead and the page                                                          |
| `src/state.ts`  | The page's decisions (answer keys, progress, Submit, order) as pure functions. **Inlined into the page**: it imports nothing at run time |
| `src/build.ts`  | Renders cards to HTML (drafts through `marked`, raw HTML shown as text) and fills `src/page.html`                                        |
| `src/page.html` | The page: styles, and the script that saves answers in the page's store                                                                  |

## Rules

- **Node runs the source directly**: relative imports end in `.ts`, and only
  erasable TypeScript syntax is allowed.
- **Everything shown is escaped** at build time; the page inserts no HTML at
  run time.
- **Store documents**: the page writes `answers/<bead-id>--r<round>` and
  `batch/state` (on submit); the lead writes only `batch/state`. Keep these
  names in step with the skill.
- **Template markers**: `{{TITLE}}`, `{{HEADING}}`, `{{CARDS}}`, and in scripts
  `"__BATCH_DATA__"` and `/* __PAGE_LOGIC__ */`, which stay valid for the
  formatter.

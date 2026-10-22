export const meta = {
  name: 'sweep',
  description: 'Consistency sweep: one checker per topic, one verifier per finding (run by the /sweep skill)',
  whenToUse: 'Only from the /sweep skill, which passes the run folder, the names of the topics to check and the mode.',
  phases: [
    { title: 'Check', detail: 'one checker per topic lists claims and reports contradictions' },
    { title: 'Verify', detail: 'one verifier per finding re-reads the original lines' },
  ],
}

// args: { root: string, runDir: string, topics: string[], mode: 'full' | 'continue' | 'verify', queued?: DraftFinding[], changed?: string[] }
// `topics`: the names of the topics to check. Each checker reads its topic
// from `<runDir>/topics-named.json`, so no topic travels inline (S8).
// `root`: the checkout to read (for verify mode, the batch worktree, with the
// batch's edits).
// `changed`: the refs a batch changed (files, bead:<id>, memory:<key>), for
// modes continue and verify.
// returns: { findings, requeued, dropped, failed: { topics: string[], verifications: string[] } }
// `requeued` is in the order of `args.queued`: the finding (corrected) when it
// still holds, null when the verifier found it stale, and the original
// finding, untouched, when its verifier failed. A non-empty `failed` means the
// run is partial: the lead resumes it or stops, and never files it.
// Shapes: tools/sweep/src/schema.ts. The lead gives the findings IDs and
// fingerprints with `pnpm sweep match`, which also drops any that fail the
// schema; this workflow never files anything.

// Text the tool accepts: at least one non-space character (schema.ts).
const TEXT = { type: 'string', pattern: '\\S' }

const SIDE = {
  type: 'object',
  additionalProperties: false,
  required: ['type', 'ref', 'quote'],
  properties: {
    type: {
      type: 'string',
      enum: ['decision', 'product-spec', 'design-spec', 'plan', 'research', 'claude-md', 'skill', 'agent', 'design', 'memory', 'bead', 'code', 'test'],
    },
    ref: {
      type: 'string',
      pattern: '^(bead:\\S+|memory:\\S+|(?![a-z][a-z0-9+.-]*:)[^\\s/]\\S*)$',
      description: 'A repo path (no leading /, no :line), bead:<id> or memory:<key>',
    },
    field: { ...TEXT, description: 'For a bead side: description, design, acceptance_criteria, notes, close_reason or comments' },
    lines: { type: 'array', items: { type: 'integer', minimum: 1 }, minItems: 2, maxItems: 2 },
    quote: TEXT,
    stableId: TEXT,
  },
}

const FINDING = {
  type: 'object',
  additionalProperties: false,
  required: ['kind', 'topic', 'claim', 'rootCause', 'sides', 'reach', 'proposedFix', 'prediction'],
  properties: {
    kind: {
      type: 'string',
      enum: ['conflict', 'code-drift', 'unrecorded-decision', 'unmarked-supersession', 'duplicate', 'promote', 'archive'],
    },
    topic: TEXT,
    claim: TEXT,
    rootCause: TEXT,
    sides: { type: 'array', items: SIDE, minItems: 1 },
    reach: { type: 'array', items: SIDE },
    proposedFix: TEXT,
    prediction: {
      type: 'object',
      additionalProperties: false,
      required: ['winner', 'rule', 'confidence'],
      properties: {
        winner: { type: ['integer', 'null'], minimum: 0 },
        rule: TEXT,
        confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
      },
    },
    suspectedCause: TEXT,
  },
}

const CHECKED = {
  type: 'object',
  required: ['findings'],
  properties: { findings: { type: 'array', items: FINDING } },
}

const VERDICT = {
  type: 'object',
  required: ['real', 'reason'],
  properties: {
    real: { type: 'boolean' },
    reason: { type: 'string' },
    finding: FINDING,
  },
}

const root = args.root
const runDir = args.runDir
const mode = args.mode || 'full'
const topics = args.topics || []
const queued = args.queued || []
const changed = args.changed || []
const dropped = []
const failed = { topics: [], verifications: [] }

const MODE = {
  full: 'Mode: full. Check everything in this topic.',
  continue:
    'Mode: continue. A batch was applied since the last run; this topic holds, or neighbours, what changed (listed below). Check everything in it, the changed places first.',
  verify:
    'Mode: verify. A batch was just applied. Report only contradictions its changes (listed below) created, between a changed place and anything else; everything else was already checked.',
}

function checkerPrompt(name) {
  return [
    `Follow the brief in ${root}/.claude/skills/sweep/checker.md.`,
    `Repo root: ${root}. Read every repo path relative to it, never another checkout.`,
    `Run folder: ${runDir}`,
    MODE[mode] || MODE.full,
    changed.length > 0 ? `Changed by the batch:\n${changed.join('\n')}` : '',
    `Topic: the entry named ${JSON.stringify(name)} in ${runDir}/topics-named.json. Read its files, code paths and neighbours from there.`,
  ].join('\n\n')
}

function verifierPrompt(finding, why) {
  return [
    `Follow the brief in ${root}/.claude/skills/sweep/verifier.md.`,
    `Repo root: ${root}. Read every repo path relative to it, never another checkout.`,
    `Run folder: ${runDir}`,
    why,
    'Finding:',
    JSON.stringify(finding, null, 2),
  ].join('\n\n')
}

/** The finding (corrected) if real; null if the verifier ruled it out; undefined if the verifier failed. */
async function verify(finding, label, why) {
  const verdict = await agent(verifierPrompt(finding, why), { phase: 'Verify', label, schema: VERDICT })
  if (!verdict) {
    failed.verifications.push(label)
    return undefined
  }
  if (verdict.real) return verdict.finding || finding
  dropped.push({ finding, reason: verdict.reason })
  return null
}

phase('Check')
const checked = await pipeline(
  topics,
  async (topic) => {
    const result = await agent(checkerPrompt(topic), { phase: 'Check', label: `check:${topic}`, schema: CHECKED })
    if (!result) failed.topics.push(topic)
    return result
  },
  (result, topic) =>
    parallel(
      ((result && result.findings) || []).map((finding, index) => () =>
        verify(finding, `verify:${topic}:${index + 1}`, 'A checker just reported this finding.'),
      ),
    ),
)

// Queued findings from earlier runs: a fix since may have made them stale.
const requeued = await parallel(
  queued.map((finding, index) => async () => {
    const verified = await verify(
      finding,
      `requeue:${index + 1}`,
      'This finding waited in the queue since an earlier run; the repo may have changed since. Drop it if its text is gone.',
    )
    // A failed verifier leaves the queued finding as it was: never stale by accident.
    return verified === undefined ? finding : verified
  }),
)

const findings = checked.filter(Boolean).flat().filter(Boolean)
const kept = requeued.filter(Boolean).length
log(`${findings.length} new findings and ${kept} of ${queued.length} queued ones survived verification; ${dropped.length} dropped`)
if (failed.topics.length + failed.verifications.length > 0) {
  log(`PARTIAL: ${failed.topics.length} checkers and ${failed.verifications.length} verifiers failed; resume this run or stop`)
}
return { findings, requeued, dropped, failed }

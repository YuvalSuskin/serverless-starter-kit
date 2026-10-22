// The Node the repo is pinned to (.nvmrc, the file every setup-node reads),
// and what local-check does when this shell runs another major
// (CI16). Node 26 has a global sessionStorage that Node 24 lacks, so a test
// passed here and failed in CI; and the proof (CI17) stands in for every check,
// which is only worth something on the repo's Node.

/** The major of "24.21.0", "v26.8.1" or "24"; undefined for anything else. */
export function majorOf(version: string | undefined): number | undefined {
  const match = /^v?(\d+)(?:\.|$)/.exec(version?.trim() ?? "");
  return match?.[1] === undefined ? undefined : Number(match[1]);
}

/**
 * Why this shell's Node is not the repo's, or undefined when it is, or when
 * the pin cannot be read (then there is nothing to hold it to).
 */
export function nodeProblem(opts: {
  pinned: string | undefined;
  actual: string;
}): string | undefined {
  const want = majorOf(opts.pinned);
  const have = majorOf(opts.actual);
  if (want === undefined || have === undefined || want === have) return undefined;
  return (
    `local-check: this shell runs Node ${opts.actual}, but the repo runs Node ${String(want)} ` +
    `(.nvmrc: ${opts.pinned?.trim() ?? ""}). A check on another major can pass here and fail on the repo's.\n` +
    `  Switch, then run this again: pnpm env use --global ${String(want)}  (or: nvm install && nvm use).`
  );
}

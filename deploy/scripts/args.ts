import {
  accountsFile,
  accountStage,
  NoAccountsError,
  requireAccount,
  requireAnyAccount,
} from "../src/stage.ts";

// `--stage <name>`, required by every deploy script.
export function stageArgument(argv: readonly string[]): string {
  const index = argv.indexOf("--stage");
  const stage = index === -1 ? undefined : argv[index + 1];
  if (stage === undefined || stage.startsWith("-")) {
    throw new Error("Name the stage: --stage <name>");
  }
  return stage;
}

/**
 * The deploy scripts' first check: prints one line and exits 1 when
 * accounts.json has no account for `--stage` (or, with no stage named, none at
 * all), before anything is built and before SST or AWS is reached.
 */
export function stopWithoutAccounts(argv: readonly string[]): void {
  const index = argv.indexOf("--stage");
  const stage = index === -1 ? undefined : argv[index + 1];
  const config = accountsFile();
  try {
    if (stage === undefined || stage.startsWith("-")) requireAnyAccount(config);
    else requireAccount(accountStage(stage), config);
  } catch (error) {
    if (!(error instanceof NoAccountsError)) throw error;
    console.error(error.message);
    process.exit(1);
  }
}

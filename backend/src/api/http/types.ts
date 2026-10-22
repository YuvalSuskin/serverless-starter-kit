import type { RouteContract } from "@acme/contracts";
import type { Env, Hono } from "hono";

import type { Platform } from "../../domain/platform";
import type { Mailer, MessageStore } from "../../domain/ports";

/** Hono's per-request variables. The skeleton has none; a sub-app's middleware adds its own. */
export type ApiEnv = Env;

type Api = Hono<ApiEnv>;

/** Everything the app is built from. The entries decide real or fake. */
export interface AppDeps {
  /** Skeleton: the demo's mail to the owner (the Mailer port), replaced by bootstrap step 6. */
  mailer: Mailer;
  /** Skeleton: the contact messages visitors sent, replaced by bootstrap step 6. */
  messages: MessageStore;
  /**
   * The ORIGIN_SECRET setting: only a request carrying it is served.
   */
  originSecret?: string;
  /** Skeleton: where the owner is mailed a new message (OWNER_EMAIL); none, and nothing is sent. */
  ownerAddress: string | undefined;
  platform: Platform;
  /** The deployment's name, on every log line. */
  stage: string;
}

/** A registered route. The registry of these is what the sweeps read. */
export interface Route {
  readonly contract: RouteContract;
  /** The input the registry's sweeps send to a freshly seeded app. */
  readonly example: () => unknown;
  register(app: Api, deps: AppDeps): void;
}

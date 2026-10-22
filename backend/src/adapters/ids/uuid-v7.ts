import { v7 } from "uuid";

import type { Ids } from "../../platform/ids";

export const uuidV7Ids: Ids = { next: () => v7() };

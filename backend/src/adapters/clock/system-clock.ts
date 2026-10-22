import type { Clock } from "../../platform/clock";

export const systemClock: Clock = { now: () => new Date() };

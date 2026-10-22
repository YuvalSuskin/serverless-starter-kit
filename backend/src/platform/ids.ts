// The only source of new ids in domain code: UUIDv7 in
// production, deterministic in tests.
export interface Ids {
  next(): string;
}

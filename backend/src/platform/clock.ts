// The only source of time in domain code. Date.now() and
// `new Date()` are lint errors in src/domain/.
export interface Clock {
  now(): Date;
}

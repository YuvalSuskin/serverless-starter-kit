// The one place the app's language and writing direction are set (decision
// D6). The root layout's <html lang dir> and every Intl formatter read from
// here, so changing the language later changes this module rather than a hunt
// for "en". Lint rejects hard-coded lang/dir and locale-less Intl anywhere
// else.
export const LOCALE = "en";
export const DIRECTION = "ltr";

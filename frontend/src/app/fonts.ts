// Skeleton: the template's one font, bundled; bootstrap swaps it if the project needs another script.
//
// The font ships with the app: Fontsource installs it as a package, and the
// build copies its woff2 files into the output, so the running app fetches
// nothing from a third party and the build needs no
// network. Never `next/font/google` (tests/bundled-fonts.test.ts).
//
// "Inter Variable" is the family name the package declares; tokens.json's
// type.ui.stack names it, and globals.css maps that stack to `font-sans`. The
// bare import loads the variable font, weights 100 to 900, as one @font-face
// per script with a unicode-range, so a page downloads only the scripts it
// shows (Latin, for English). To change the font, install another
// `@fontsource-variable/*` package, import it here and change the name in
// tokens.json.
import "@fontsource-variable/inter";

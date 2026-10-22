// For stories. Synthetic events cannot put an element into CSS :hover, and a
// story cannot switch on prefers-reduced-motion, so stories pin those rules
// through the CSSOM: the style rule matching `selector` inside the @media
// block whose condition includes `media`.
export function cssRuleIn(
  media: string,
  selector: (selectorText: string) => boolean,
): CSSStyleRule | undefined {
  for (const sheet of Array.from(document.styleSheets)) {
    for (const rule of Array.from(sheet.cssRules)) {
      if (!(rule instanceof CSSMediaRule) || !rule.conditionText.includes(media)) continue;
      const found = Array.from(rule.cssRules).find(
        (inner): inner is CSSStyleRule =>
          inner instanceof CSSStyleRule && selector(inner.selectorText),
      );
      if (found) return found;
    }
  }
  return undefined;
}

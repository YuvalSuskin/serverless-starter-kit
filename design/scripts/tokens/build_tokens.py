"""Generate design/tokens/tokens.css from design/tokens/tokens.json.

One source, one consumer: designers read the JSON, the front end imports the
CSS. Generating rather than maintaining both is the only way the two stay
honest. The build is deterministic: running it twice leaves the worktree
clean.
"""
import json, os

HERE   = os.path.dirname(os.path.abspath(__file__))     # design/scripts/tokens
DESIGN = os.path.dirname(os.path.dirname(HERE))         # design
TOKENS = os.path.join(DESIGN, "tokens")
SRC    = os.path.join(TOKENS, "tokens.json")
OUT    = os.path.join(TOKENS, "tokens.css")

d = json.load(open(SRC, encoding="utf-8"))
L = []


def block(title, pairs):
    if not pairs:
        return
    L.append("  /* %s */" % title)
    w = max(len(k) for k, _ in pairs)
    for k, v in pairs:
        L.append("  --%s:%s %s;" % (k, " " * (w - len(k)), v))
    L.append("")


block("colour", [(k, v["hex"]) for k, v in d["colour"].items() if k != "$comment"])
block("semantic", [(k, v) for k, v in d["semantic"].items() if k != "$comment"])
block("state", [("%s-%s" % (n, side), val)
                for n, s in d["state"].items() if n != "$comment"
                for side, val in s.items()])
block("type", [("font-ui", d["type"]["ui"]["stack"])])
block("type scale (steps by sqrt(2))",
      [("size-%s" % k, "%grem" % (v / 16))
       for k, v in d["type"]["scale_px"].items() if k != "$comment"])
block("radius", [("r-%s" % k, v) for k, v in d["radius"].items() if k != "$comment"])
block("motion", [("motion-%s" % k, v) for k, v in d["motion"].items() if k != "$comment"])


css = ("/* GENERATED FILE -- do not edit.\n"
       "   Source: design/tokens/tokens.json\n"
       "   Rebuild: python3 design/scripts/tokens/build_tokens.py\n"
       "\n"
       "   Acme design tokens v%s. The font face is declared by the Fontsource\n"
       "   package that frontend/src/app/fonts.ts imports; this file only names\n"
       "   the stack.\n"
       "*/\n:root{\n%s}\n" % (d["version"], "\n".join(L).rstrip() + "\n"))

open(OUT, "w", encoding="utf-8").write(css)
print("  wrote design/tokens/tokens.css  (%d bytes)" % len(css))

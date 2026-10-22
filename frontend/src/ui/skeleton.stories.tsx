import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { expect, waitFor } from "storybook/test";

import { expectSameBox } from "@/lib/geometry";
import { cn } from "@/lib/utils";

import { cssRuleIn } from "../../tests/css-rules";
import { untilAllSettled } from "../../tests/story-motion";
import { Skeleton, SKELETON_DELAY_MS, SkeletonGroup, SkeletonText } from "./skeleton";

const meta = {
  component: Skeleton,
  tags: ["mobile"],
} satisfies Meta<typeof Skeleton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <div className="flex flex-col gap-3 p-4">
      <Skeleton className="h-10 w-48 rounded-input" />
      <Skeleton className="h-32 w-32 rounded-photo" />
      <Skeleton className="h-24 w-64 rounded-card" />
    </div>
  ),
};

export const DelayedReveal: Story = {
  render: () => (
    <SkeletonGroup label="The items are on their way…">
      <div data-testid="skeleton-content">
        <Skeleton className="h-10 w-32 rounded-input" />
      </div>
    </SkeletonGroup>
  ),
  play: async ({ canvasElement }) => {
    // Rule 1: nothing shows at all until just before SKELETON_DELAY_MS elapses.
    await new Promise((resolve) => setTimeout(resolve, SKELETON_DELAY_MS - 50));
    await expect(canvasElement.querySelector('[data-testid="skeleton-content"]')).toBeNull();
    await expect(canvasElement.querySelector('[role="status"]')).toBeNull();

    // Once SKELETON_DELAY_MS has elapsed: status wrapper with label and
    // children are in the DOM.
    await waitFor(
      () => {
        if (!canvasElement.querySelector('[data-testid="skeleton-content"]')) {
          throw new Error("skeleton-content not yet revealed");
        }
      },
      { timeout: SKELETON_DELAY_MS + 500 },
    );

    const status = canvasElement.querySelector('[role="status"]');
    await expect(status).not.toBeNull();
    await expect(status?.textContent).toContain("The items are on their way…");
  },
};

const STEPS = ["050", "075", "100", "200", "300", "400", "500"] as const;
const LEADINGS = ["none", "tight", "snug", "normal"] as const;
type StepKey = (typeof STEPS)[number];
type LeadingKey = (typeof LEADINGS)[number];

const STEP_CLASSES = {
  "050": "text-050",
  "075": "text-075",
  "100": "text-100",
  "200": "text-200",
  "300": "text-300",
  "400": "text-400",
  "500": "text-500",
} as const;

const LEADING_CLASSES = {
  none: "leading-none",
  tight: "leading-tight",
  snug: "leading-snug",
  normal: "leading-normal",
} as const;

const STEP_LEADING_PAIRS = STEPS.flatMap((step) => LEADINGS.map((leading) => ({ leading, step })));

// One pair's geometry check, pulled out of the loop so the loop itself stays
// simple (sonarjs/cognitive-complexity).
function assertPairMatches(canvasElement: HTMLElement, step: StepKey, leading: LeadingKey): void {
  const pair = canvasElement.querySelector(`[data-testid="pair-${step}-${leading}"]`);
  if (!pair) throw new Error(`Missing pair for ${step}-${leading}`);
  const skeleton = pair.children[0]?.firstElementChild;
  const realText = pair.children[1]?.firstElementChild;
  if (!skeleton || !realText) throw new Error(`Missing element for ${step}-${leading}`);
  expectSameBox(skeleton, realText);
}

export const TextGeometryMatch: Story = {
  render: () => (
    <div className="flex flex-col gap-6 p-4">
      {STEP_LEADING_PAIRS.map(({ leading, step }) => (
        <div key={`${step}-${leading}`} className="grid" data-testid={`pair-${step}-${leading}`}>
          <div className="col-start-1 row-start-1">
            <SkeletonText step={step} leading={leading} width="12rem" />
          </div>
          <div className="col-start-1 row-start-1">
            <p
              className={cn(
                "m-0 p-0 font-sans whitespace-nowrap text-foreground",
                STEP_CLASSES[step],
                LEADING_CLASSES[leading],
              )}
              style={{ width: "12rem" }}
            >
              Text for the geometry check
            </p>
          </div>
        </div>
      ))}
    </div>
  ),
  play: ({ canvasElement }) => {
    for (const { leading, step } of STEP_LEADING_PAIRS) {
      assertPairMatches(canvasElement, step, leading);
    }
  },
};

// Tailwind v4 nests its utilities' @media blocks inside an unnamed @layer
// rule; lift each media rule to the sheet's top level so cssRuleIn (which
// only looks at the sheet's own direct cssRules) can find it.
function liftNestedMediaRules(sheet: CSSStyleSheet, group: CSSGroupingRule): void {
  for (const inner of Array.from(group.cssRules)) {
    if (inner instanceof CSSMediaRule) {
      sheet.insertRule(inner.cssText, sheet.cssRules.length);
    }
  }
}

function exposeLayerMediaRules(): void {
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      for (const rule of Array.from(sheet.cssRules)) {
        if ("cssRules" in rule && !(rule instanceof CSSMediaRule)) {
          liftNestedMediaRules(sheet, rule as CSSGroupingRule);
        }
      }
    } catch {
      // Ignore cross-origin stylesheets
    }
  }
}

export const ReducedMotionPulses: Story = {
  parameters: { motion: "real" }, // tests motion itself (.storybook/preview.tsx)
  render: () => <Skeleton className="h-10 w-24 rounded-input" />,
  play: async () => {
    exposeLayerMediaRules();
    const rule = cssRuleIn("prefers-reduced-motion", (selector) =>
      selector.includes("animate-none"),
    );
    await expect(rule).toBeDefined();
    await expect(rule?.style.animation).toMatch(/none/);
    await untilAllSettled();
  },
};

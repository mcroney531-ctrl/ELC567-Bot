# Recommended Implementation Sequence

## Phase 1 — Data model
Create the canonical step model and status enum.

```ts
export type StepStatus = 'locked' | 'available' | 'current' | 'completed';
```

Keep status derivation centralized.

## Phase 2 — Reusable primitives
Build `StageCard`, `TimelineWaypoint`, `TimelinePath`, `CompletionOverlay`, and `StepStateProgression`. Do not hard-code a separate component per stage.

## Phase 3 — JourneyMap composition
Place 01 / 03 / 05 above, 02 / 04 below, with one continuous line behind and stems between cards and waypoints.

## Phase 4 — State styling
Implement Locked, Available, Current, Completed in that order. Use one canonical mapping from state to card treatment, waypoint treatment, interaction rule, and accessibility semantics.

## Phase 5 — Progression logic
Support the complete sequence through step 05. Update state and derive presentation; avoid arbitrary DOM class mutation.

## Phase 6 — Animation
Add Available hover/focus response, Current pulse, enter-stage motion, completion handoff animation, then reduced-motion fallback.

## Phase 7 — Responsive pass
Desktop/tablet preserve alternating composition. Mobile should reflow into a vertical or compact zig-zag path without page-level horizontal scrolling.

## Phase 8 — Accessibility / QA
Verify keyboard, focus, ARIA, reduced motion, contrast, revisiting completed stages, and no layout shift.

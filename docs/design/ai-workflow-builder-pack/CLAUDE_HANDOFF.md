# Claude Handoff — Timeline Base Build

Start implementing the AI Workflow Builder journey-map home screen using the locked structure and state behavior.

## Goal of this pass

Get the reusable timeline system in place before we continue refining polish.

This means:

- implement the 5-step staggered journey map
- implement the node state machine
- wire the visual states into reusable components
- use the included reference assets as visual targets
- keep the system data-driven

## Do not do in this pass

- do not redesign the workflow
- do not replace the timeline with tabs
- do not invent a new palette
- do not create rainbow timeline segments
- do not fully recolor completed cards
- do not remove access to completed steps
- do not over-animate the page

## Locked state logic

- Locked = dimmed, inaccessible
- Available = calm green, ready to start
- Current = green active/pulsing
- Completed = locked-like interior + live native-color outer stroke + large circled check overlay + matching stage-colored completed star on timeline

## Implementation target scenarios

Support these states cleanly:

- 01 available / 02–05 locked
- 01 current / 02–05 locked
- 01 completed / 02 available / 03–05 locked
- 02 current / 01 completed / 03–05 locked
- mid-flow
- late-flow
- final active
- all completed

## Deliverables for this pass

1. reusable journey-map components
2. reusable node/card state styling
3. responsive behavior
4. reduced-motion-safe pulse behavior
5. a working state model that can render the key progression scenarios

Use the included assets and guide. If something is ambiguous, preserve the locked behavior rather than improvising a new system.

# AI Workflow Builder — Timeline / Journey Map Implementation Guide

This pack gives you a clean starting point to implement the timeline home screen and the step-state behavior.

## What is locked

The baseline is now locked in for:

- the 5-step staggered journey-map structure
- the silver/glacier squiggly timeline line
- the alternating card layout
- the overall dark SaaS / glassmorphism environment
- the node state behavior
- the bottom step-state progression explainer

The five stages are:

1. Identify
2. Map
3. Envision
4. Refine
5. Deploy

## Structural layout

Use a horizontal journey map with alternating cards:

- 01 / 03 / 05 above the line
- 02 / 04 below the line
- a single continuous silver-glacier connector line
- short vertical stems from line to each card
- numbered circular waypoints on the line

This is the home screen / base-camp screen.

## Stage identity colors

Keep stage identity colors stable:

- 01 Identify = blue
- 02 Map = aqua / teal
- 03 Envision = orange / amber
- 04 Refine = violet / purple
- 05 Deploy = cyan / cool blue-teal

The timeline line itself stays neutral silver / glacier.

## State behavior

Each step progresses through:

LOCKED -> AVAILABLE -> CURRENT -> COMPLETED

### Locked

- muted / dimmed interior
- low-saturation, cooled presentation
- lock cue
- subdued text and icon
- silver/glacier waypoint
- not enterable

### Available

- native stage identity visible again
- calm green readiness treatment
- clickable
- green static node
- ready to start

### Current

- active green treatment
- same general green family as Available, but stronger
- subtle pulse / glow to distinguish it from Available
- currently in progress
- accessible / re-enterable

### Completed

This treatment is locked and important.

- base interior substantially replicates the locked state
- icon and text remain in the card, but dimmed
- only the outer stroke remains vividly colored with the stage’s native color
- overlay a large circled checkmark over the dimmed icon/text area
- the circled checkmark color should match that stage’s completed timeline star color
- the waypoint below transitions to a stage-colored completed star marker
- completed steps stay revisitable

Completed is not bright/live. It is a cooled, settled, finished state.

## Node / waypoint behavior

Use waypoint behavior as follows:

- Locked waypoint = silver/glacier circle with number
- Available waypoint = calm green numbered circle
- Current waypoint = brighter green numbered circle with pulse
- Completed waypoint = stage-colored star marker

Keep the line itself one neutral color.

## Progression logic

Expected step progression:

- initial: 01 available, 02–05 locked
- when 01 is entered: 01 current, 02–05 locked
- when 01 completes: 01 completed, 02 available, 03–05 locked
- when 02 is entered: 01 completed, 02 current, 03–05 locked
- continue this pattern through 05

There should generally be only one current step and one next available step.

## Motion / transition behavior

Available and Current enter the stage workspace via the existing GSAP motion system.

The map should feel like a home screen, not a toll booth. Users should be able to:

- enter the next available step
- continue directly forward
- return to the journey map
- revisit completed steps

When reduced motion is enabled, do not pulse or heavily animate, but preserve clear visual distinction.

## Accessibility

Do not rely on color alone.

Use:

- lock icon for locked
- clear affordance for available
- aria-current or equivalent for current
- check overlay for completed
- usable keyboard focus states
- reduced-motion support

## Bottom explainer strip

The bottom strip should explain the actual progression:

Locked -> Available -> Current -> Completed

It should use the same production component styling as the timeline states whenever practical.

## Included asset pack

See `/assets` for isolated transparent assets.

The assets are reference-quality implementation targets, not production-ready code exports.

Key included assets:

- full page template
- locked card sample
- available card sample
- current card sample
- completed card sample
- locked waypoint
- available waypoint
- current waypoint
- completed waypoint star
- bottom progression strip

## Notes for implementation

Prioritize the state architecture and reusable components over pixel-perfect micro-polish in the first pass.

Build the system data-first.

Recommended component breakdown:

- JourneyMap
- JourneyHeader
- TimelinePath
- TimelineWaypoint
- StageCard
- CompletionOverlay
- StepStateProgression

Recommended status enum:

```ts
export type StepStatus = 'locked' | 'available' | 'current' | 'completed';
```

Derive card treatment, waypoint treatment, and interaction behavior from a canonical status model.

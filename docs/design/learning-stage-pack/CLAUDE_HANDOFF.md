# Claude Handoff — Learning Stage Base Implementation

Implement the **main learning/stage area** for AI Workflow Builder.

This is the screen the learner sees after entering a stage from the journey map.

## Main goal

Create a production-ready component structure for the learning-stage shell and its top progression behavior before further visual polish.

## Locked high-level direction

- Keep the same overall brand/theme as the home timeline.
- The learning stage should feel like the user has moved from the dark navigation/control room into a clean working surface.
- The page uses a **dark shell + light content workspace**.
- The **top horizontal mini-node bar** is a compressed echo of the home journey map.
- The **left contextual panel** is primarily a simple illustration/vector area plus stage framing.
- The **right workspace** is where the actual lesson content, inputs, prompts, examples, and CTA live.
- The **overall page chrome stays constant**; do not tint the entire page based on the current stage.
- **Only the mini nodes at the top should express progression-state changes.**

## Absolutely preserve

1. top mini-node behavior mirrors the home timeline logic
2. completed top mini-nodes use the same exact stage-colored star behavior we approved
3. do not replace completed top states with generic blue checks
4. keep the page light/dark split, not full dark and not full white
5. left illustration panel stays simple and not overloaded with extra text
6. right lesson area stays spacious, clean, readable, and content-first

## Deliverables for this pass

- reusable learning-stage shell component(s)
- reusable top mini-node progression component
- state-driven rendering for locked / available / current / completed in the top mini-node strip
- sample stage implementation for Stage 01
- data-driven support for the full progression sequence
- responsive layout behavior
- reduced-motion-safe current pulse behavior

## What not to do

- do not redesign the home timeline
- do not turn the top bar into generic tabs
- do not tint the entire page by stage/state
- do not make the left panel text-heavy
- do not make the workspace look like a generic dashboard app
- do not use generic blue completed icons in the top bar
- do not remove the relationship to the home-screen state system

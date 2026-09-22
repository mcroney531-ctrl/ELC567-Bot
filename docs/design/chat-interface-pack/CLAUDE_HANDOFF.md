# Claude Handoff — AI Workflow Coach Chat Interface

Implement the AI Workflow Coach chat screen using the attached package as the authoritative handoff.

## Context

This chat screen lives inside the same AI Workflow Builder experience whose home timeline and main learning-stage shell are already being implemented.

Do not redesign those systems here.

The chat should feel like a **new mode inside the same product**, not a separate app.

## Locked architecture

### 1. Keep the global shell consistent

Use the same dark/slate shell and top progression bar as the learning-stage screen.

Do not add a new cinematic hero/header.
Do not tint the entire page by stage.
Do not introduce a second navigation system.

### 2. Top progression stays visible

The horizontal mini-node strip remains visible across the top and follows the exact same state rules as the home timeline / learning-stage shell.

Completed mini-nodes use the same stage-colored stars:

- 01 Identify = blue star
- 02 Map = teal/aqua star
- 03 Envision = orange/amber star
- 04 Refine = violet/purple star
- 05 Deploy = cyan/teal star

Do not replace completed nodes with generic blue checks.

### 3. Body becomes a chat workspace

Desktop structure:

- narrow left context rail
- dominant right conversation area

The left rail should be approximately 180–240px and primarily contain:

- stage number/title
- stage vector/illustration
- one short current-focus statement
- optional within-stage micro-progress

Do not make it a second lesson column.

### 4. Conversation area

Use a pale / off-white chat canvas.

Assistant messages:
- left aligned
- soft white/frosted card
- narrow stage-colored or blue accent edge
- compact AI Workflow Coach avatar
- readable width, not full-screen

User messages:
- right aligned
- darker slate/blue bubble
- white text
- visibly distinct but still within the same design system

### 5. Structured in-chat coaching cards

The assistant may insert lightweight structured cards between messages.

Examples:

- Your problem so far
- Try making this more specific
- Example from a similar team
- Keep refining
- Next step

These are not separate pages.
They should feel like native assistant content embedded in the conversation.

### 6. Composer

Anchor the composer at the bottom of the conversation area.

Use:

- rounded text field
- optional attachment/context button
- optional voice/mic affordance only if existing product behavior supports it
- circular or rounded send button

Keep the composer visually clean and persistent.

### 7. Responsive behavior

On smaller widths:

- context rail collapses or stacks above chat
- top mini-node strip remains readable
- bubbles use a larger fraction of the screen width
- composer remains easy to use

The mobile reference on the board is directional, not a rigid pixel-perfect target.

## Do not do

- do not create a giant hero image
- do not dark-theme the whole conversation canvas
- do not make every assistant response plain prose
- do not make the context rail text-heavy
- do not duplicate progression indicators inside the conversation
- do not hardcode progression state separately from the existing canonical step state
- do not treat the visual reference as a single background image

## Implementation goal

Build a reusable, state-driven chat shell that can be used across all five workflow stages while preserving the same top progression/state logic as the rest of the product.

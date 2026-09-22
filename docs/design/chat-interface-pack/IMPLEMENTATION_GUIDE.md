# AI Workflow Coach Chat — Implementation Guide

## 1. Purpose

The chat interface is the conversational coaching mode inside the AI Workflow Builder.

The home screen answers:
**Where am I in the journey?**

The learning stage answers:
**What am I learning / doing?**

The chat answers:
**How do I think this through with the AI coach?**

The interface should therefore prioritize conversational flow while preserving the product's existing orientation and progression cues.

## 2. Layout

### Desktop

Use this structure:

```text
Top shell / mini-node progression
-------------------------------------------------------------
Context rail | Chat header + conversation
             | Assistant bubble
             |                  User bubble
             | Assistant bubble
             | Structured coaching card
             | ...
             | Composer
```

Recommended width split:

- context rail: 180–240px
- chat area: remaining width

### Mobile / narrow embedded viewport

- top mini-node strip stays at the top
- context rail collapses into a compact stage summary/header
- conversation becomes single-column
- composer stays fixed/sticky at bottom of chat viewport

## 3. Global shell

Reuse the locked learning-stage shell.

- dark slate top bar
- off-white/light content canvas
- stable page chrome
- no stage-wide recoloring

The chat page should inherit the same overall spacing, radii, and typography system.

## 4. Top mini-node progression

This component should ideally be the same production component used in the main learning stage.

Do not fork the state logic.

### Locked
- neutral glacier/silver
- dimmed icon
- unavailable

### Available
- calm green
- static

### Current
- bright green
- subtle pulse

### Completed
- stage-colored star
- revisitable

The chat screen should not invent any additional state language.

## 5. Context rail

The context rail exists to keep the conversation grounded in the current stage.

Recommended content:

- small `STAGE 01`
- `Identify`
- short descriptor: `Define the problem worth solving.`
- simple stage vector / process illustration
- `Current focus` block
- optional tiny within-stage step list

If a within-stage step list is used, keep it lightweight and secondary.

The rail should not scroll independently unless content truly requires it.

## 6. Chat header

Recommended default:

- assistant avatar
- `AI Workflow Coach`
- small online/active indicator
- short support line, e.g. `Your guide for turning ideas into real workflows.`
- compact `Working on: Identify` chip on the right

Avoid oversized headers.

## 7. Assistant message styling

Assistant messages should feel calm and instructional.

Suggested treatment:

- left aligned
- max-width around 66–74%
- soft white / pale gray-blue card
- subtle shadow
- narrow stage-colored or blue-gray accent edge
- assistant avatar outside or slightly overlapping the bubble
- timestamp/metadata kept quiet

Messages may contain:

- plain prose
- bullets
- numbered steps
- inline emphasized phrases
- embedded coaching cards

## 8. User message styling

User messages should clearly contrast with assistant messages.

Suggested treatment:

- right aligned
- max-width around 60–70%
- deeper slate/blue fill
- white text
- rounded shape
- no heavy glow
- small `YOU` / timestamp metadata if needed

## 9. Structured coaching cards

Use these when the assistant wants to crystallize or scaffold the learner's thinking.

### Your problem so far

Purpose:
- summarize the learner's current working problem statement

### Try making this more specific

Purpose:
- offer missing dimensions or questions

### Example from a similar team

Purpose:
- provide a concise analogous example

### Keep refining

Purpose:
- signal that the learner should continue elaborating

### Next step

Purpose:
- transition the user toward saving/progressing

These cards should be visually lighter than modal dialogs and remain part of the conversation flow.

## 10. Composer behavior

The composer should stay anchored at the bottom of the chat area.

Recommended elements:

- message input
- optional attachment/context button
- optional mic only if supported by the real product
- send button

States to support:

- idle
- typing
- submitting
- disabled while a send is in-flight if needed
- error/retry state

Do not clear unsent text unexpectedly.

## 11. Conversation behavior

Preserve existing application behavior wherever possible.

Recommended UI behaviors:

- scroll to newest message when user sends
- avoid force-scrolling while the user is reading older messages
- show assistant typing/loading state
- allow retry if a message fails
- keep draft input stable during transient failures
- maintain accessible live-region behavior for new assistant responses if appropriate

## 12. Relationship to stage progression

The chat itself should not silently advance the stage unless the existing application rules say it should.

Stage progression should remain driven by the canonical workflow state.

The chat can surface a `Next step` coaching card or `Save and continue` affordance when conditions are met, but it should not create a parallel progression engine.

## 13. Accessibility

- visible keyboard focus
- semantic message grouping
- useful labels for composer controls
- current stage indicated semantically
- reduced motion supported
- sufficient contrast for dark user bubbles and pale assistant cards
- message timestamps should not be the only way to determine sequence

## 14. Embedded Storyline / GitHub constraints

This experience may run in a web page embedded inside a Storyline slide.

Prioritize:

- stable dimensions
- predictable scroll behavior
- no accidental body-level horizontal overflow
- sticky composer inside the app shell rather than browser chrome
- responsive behavior for constrained iframe-like dimensions

## 15. Implementation priority

First pass should prioritize:

1. reusable architecture
2. real state reuse
3. correct message alignment / spacing
4. top progression consistency
5. mobile behavior
6. structured coaching cards
7. final micro-polish

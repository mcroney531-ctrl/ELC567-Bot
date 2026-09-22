# Top Progression State Spec

The chat top bar must mirror the same state language as the home timeline and main learning stage.

## State sequence

LOCKED -> AVAILABLE -> CURRENT -> COMPLETED

## Locked

- glacier/silver
- dimmed stage icon
- not clickable unless product rules say otherwise

## Available

- calm green
- static
- can be entered

## Current

- brighter green
- subtle pulse
- `aria-current="step"`

## Completed

Use a stage-colored star.

Exact family mapping:

- Identify -> blue star
- Map -> teal/aqua star
- Envision -> orange/amber star
- Refine -> violet/purple star
- Deploy -> cyan/teal star

Do not use generic blue checks for completed nodes.
Do not change the full page color when a node changes state.

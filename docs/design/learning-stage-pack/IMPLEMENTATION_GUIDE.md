# Learning Stage Implementation Guide

## 1. Purpose of this screen

This screen is the **inside** of a step.

The home timeline is the navigation / map.
The learning stage is the workbench where the user actually learns, writes, responds, and progresses.

The feeling should be:

- same design system
- same product family
- different job

## 2. Locked page architecture

Use a three-part structure:

### A. Top shell bar

Contains:

- Back to Journey affordance on the left
- top mini-node progression strip across the center/top area
- optionally Resources/help on the far right if needed

This top bar visually connects the stage screen back to the home timeline.

### B. Main body split layout

Two-column structure:

- **Left contextual panel** ~28–35%
- **Right lesson workspace** ~65–72%

### C. Bottom actions inside the workspace

Primary CTA lives inside the workspace, usually aligned bottom-right.

## 3. Locked visual direction

- dark/slate outer shell
- light content area
- subtle rounded corners
- soft glass / SaaS polish
- restrained shadows
- lots of white/off-white space
- very limited glow inside the lesson workspace
- strong readability and hierarchy

Do not turn the stage screen into a neon scene.

## 4. Constant shell rule

The full page background / shell **does not change color per stage**.

Preserve a stable shell across the entire learning experience.

What can change:

- top mini-node state styling
- left illustration/vector
- small stage accent usage
- stage title / content

What should not broadly change:

- page chrome
- workspace background
- dark header shell
- major layout structure

## 5. Top mini-node strip

This is a compressed version of the home progression system.

It should contain mini nodes for:

01 Identify
02 Map
03 Envision
04 Refine
05 Deploy

Use the same step ordering and the same progression logic.

The mini nodes should be compact, horizontally aligned, and always visible at the top.

### Top mini-node states

#### Locked
- muted silver/glacier treatment
- dimmed stage icon
- not enterable

#### Available
- calm green treatment
- static
- ready state

#### Current
- brighter green treatment
- subtle pulse
- active state

#### Completed
- stage-colored star treatment
- same exact color family behavior as the approved home timeline completed stars
- not a generic blue check

Important: the top mini-node strip should follow the real progression state sequence.

## 6. Left contextual panel

This panel is intentionally simple.

Keep it to:

- stage number
- stage title
- one short framing sentence
- one vector / illustration anchor
- optional tiny progress cue like `Step 1 of 5`
- optional short supporting tagline / quote

Do not overstuff this area.

The panel’s main job is orientation and stage identity.

## 7. Illustration direction for the left panel

Use simple, clean vector/process artwork inspired by the provided boards.

The strongest direction is to adapt or echo the process/diagram/workflow-style imagery from the provided inspiration boards.

The illustration should:

- feel soft, modern, and product-like
- be readable at a glance
- support the stage concept
- not dominate the whole screen
- keep the same polished visual family as the rest of the module

## 8. Right lesson workspace

This is the core instructional area.

Recommended hierarchy:

- small lesson label (e.g. `Lesson 1`)
- main lesson title
- brief instruction paragraph
- primary question/prompt block
- learner input or activity area
- support/examples/tips area
- small informational/help strip if useful
- primary CTA (Continue)

The layout should remain flexible enough for later stage-specific lesson variations.

## 9. Stage content example (Stage 01)

Use a working sample for Stage 01 like:

- Stage: Identify
- Lesson title: Let's find the right problem.
- Prompt: What problem do you want to solve?
- Short helper examples below
- Continue CTA

This sample is an implementation target, not a hard content lock.

## 10. Progression behavior

The learning stage should support the same progression states as the home system.

Expected progression examples:

- 01 current, 02–05 locked
- 01 completed, 02 available, 03–05 locked
- 02 current, 01 completed, 03–05 locked
- 03 current, 01–02 completed, 04–05 locked
- 04 current, 01–03 completed, 05 locked
- 05 current, 01–04 completed
- final state where all are completed

## 11. Interaction rules

- Back to Journey returns to the home timeline
- current step is re-enterable
- completed steps are revisitable
- future locked steps are not directly enterable unless existing product logic says otherwise
- available next step can be entered

## 12. Motion

Use restrained motion.

- current top mini-node may pulse subtly
- hover/focus states should be soft
- page transitions should preserve continuity with the home screen
- respect reduced motion

## 13. Accessibility

- keyboard navigation works
- focus rings are visible
- state is not communicated by color alone
- `aria-current` on current mini node or equivalent
- clear labels for completed/locked states
- reduced-motion support for pulse animations

## 14. Responsive behavior

Preserve the same basic structure across smaller sizes.

Desktop:
- left panel + right workspace

Tablet:
- left panel may shrink but remain present

Mobile:
- stack the left contextual panel above the workspace
- keep top mini-node strip accessible and readable

Avoid horizontal scrolling for the core lesson content.

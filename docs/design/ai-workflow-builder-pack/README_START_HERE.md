# AI Workflow Builder — Claude Implementation Pack

Start here.

This folder contains the locked design direction, implementation guidance, isolated visual assets, reference boards, and starter code for rebuilding the AI Workflow Builder journey-map home screen.

The purpose of this pass is **not** to redesign the product. It is to implement the approved journey-map structure and step-state behavior as reusable, data-driven UI.

## What Claude should do first

1. Read `CLAUDE_HANDOFF.md`.
2. Read `IMPLEMENTATION_GUIDE.md`.
3. Read `STATE_BEHAVIOR_SPEC.md`.
4. Inspect `/reference` to understand the locked composition and progression behavior.
5. Inspect `/assets` for isolated visual targets.
6. Use `/template` as a starter, not as a mandate if the existing codebase already has a better component structure.
7. Build the state system and reusable components before chasing micro-polish.

## Locked decisions

- 5-step staggered journey map
- single silver/glacier squiggly timeline line
- 01 / 03 / 05 above, 02 / 04 below
- dark charcoal/slate SaaS environment with restrained circuitry
- stage identity colors stay stable
- state lifecycle is Locked → Available → Current → Completed
- Available and Current are both green; Current is distinguished by pulse/intensity
- Completed uses a locked-like interior, native stage-color outer stroke, large circled check overlay, and matching stage-colored star on the timeline
- completed stages stay revisitable
- timeline is the home/base-camp view, not a mandatory toll booth between every step

## Folder map

- `/assets` — isolated reference assets generated independently, not crops from a full board
- `/reference` — approved boards for overall visual and behavioral reference
- `/template` — starter TSX/CSS plus scenario data
- `CLAUDE_HANDOFF.md` — concise execution brief
- `IMPLEMENTATION_GUIDE.md` — full build guidance
- `STATE_BEHAVIOR_SPEC.md` — exact state semantics and transitions
- `DESIGN_TOKENS.md` — working visual tokens and CSS variables
- `ASSET_MANIFEST.md` — what each asset is for
- `QA_CHECKLIST.md` — acceptance criteria
- `IMPLEMENTATION_SEQUENCE.md` — recommended build order
- `PROMPT_FOR_CLAUDE.txt` — copy/paste kickoff prompt

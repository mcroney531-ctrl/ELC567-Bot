# QA / Acceptance Checklist

## Structure
- [ ] 5 stages visible
- [ ] 01 / 03 / 05 above the line
- [ ] 02 / 04 below the line
- [ ] one continuous glacier line
- [ ] no rainbow connector segments
- [ ] no layout shift during state changes

## Locked
- [ ] dimmed / muted interior
- [ ] lock cue present
- [ ] silver/glacier numbered node
- [ ] not enterable
- [ ] stage name remains visible

## Available
- [ ] calm green readiness treatment
- [ ] no pulse
- [ ] clickable
- [ ] native identity visible

## Current
- [ ] brighter green than Available
- [ ] subtle pulse or glow modulation
- [ ] reduced motion disables pulse
- [ ] current step remains enterable
- [ ] `aria-current="step"` or equivalent

## Completed
- [ ] interior looks like Locked, not active
- [ ] native stage-color outer stroke remains live
- [ ] original icon/text remain beneath in dimmed state
- [ ] large circled check overlays content
- [ ] check color matches completed marker family
- [ ] numbered waypoint becomes star-in-circle marker
- [ ] marker is stage-colored, not universally gold
- [ ] completed stage remains revisitable

## Flow
- [ ] 01 starts Available
- [ ] entering 01 makes it Current
- [ ] finishing 01 makes 01 Completed + 02 Available
- [ ] progression continues correctly through 05
- [ ] only one Current at a time
- [ ] only one next Available at a time

## Navigation
- [ ] map is reachable as home/base-camp
- [ ] direct continuation to next step is possible
- [ ] return-to-map exists
- [ ] completed steps can be revisited

## Responsive
- [ ] no required page-level horizontal scroll
- [ ] touch targets remain usable
- [ ] mobile preserves progression order
- [ ] text remains readable

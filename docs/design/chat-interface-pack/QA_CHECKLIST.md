# Chat Interface QA Checklist

## Shell
- [ ] same dark shell as the learning-stage UI
- [ ] pale/light chat canvas
- [ ] no stage-wide recoloring

## Top progression
- [ ] uses canonical step state
- [ ] locked = glacier/silver
- [ ] available = calm green
- [ ] current = brighter green/pulse
- [ ] completed = stage-colored star
- [ ] no generic blue completed checks

## Context rail
- [ ] narrow and secondary
- [ ] stage number/title present
- [ ] simple vector/illustration present
- [ ] current focus present
- [ ] no excessive instructional copy

## Conversation
- [ ] assistant left aligned
- [ ] user right aligned
- [ ] bubble max widths prevent full-width walls of text
- [ ] structured coaching cards render inside conversation flow
- [ ] timestamps/metadata stay visually quiet

## Composer
- [ ] sticky/anchored at bottom
- [ ] keyboard accessible
- [ ] send state handled
- [ ] failure/retry handled
- [ ] draft text preserved during transient error

## Responsive
- [ ] desktop context rail + chat layout works
- [ ] mobile collapses/stack appropriately
- [ ] mini-node strip remains understandable
- [ ] no horizontal body overflow

## Accessibility
- [ ] visible focus
- [ ] semantic current step
- [ ] reduced motion supported
- [ ] message sequence is understandable without relying on timestamps alone

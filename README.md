# ELC567-Bot

Interactive activities for ELC567.

## [`brainstorm-workflow/`](brainstorm-workflow/)

A five-step AI-integration brainstorming activity for Articulate Rise. The learner names a
repetitive task, maps how they currently do it, talks it through with a coach that pushes on the
vague parts, and leaves with a master prompt they can paste into Claude or ChatGPT and use that day.

Ships as one self-contained `index.html` — paste it into a Rise custom block and it works.
The Step 4 coach runs on a built-in scripted fallback with no backend at all, and swaps to a live
LLM by setting a single endpoint URL. See [the activity README](brainstorm-workflow/README.md)
for embedding, the endpoint contract, and a worked proxy example.

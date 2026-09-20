# Marcus Reyes - Regional sales manager, 12 accounts

_The clean case. Specific answers at every turn - this is the ceiling._

## What they typed

**Problem:** Every Thursday I spend about three hours pulling numbers for the Friday pipeline review - same twelve accounts, same slides, and half of it is retyping what Salesforce already knows.

1. Export current-quarter opportunities - _Salesforce_
2. Clean and pivot the numbers - _Excel_
3. Rebuild the twelve account slides - _PowerPoint_
4. Write the summary email to my director - _Outlook_

**handoff:** Step 3, rebuilding the slides. Same twelve layouts every week with new numbers dropped in, and it eats an hour and a half on its own.
**output:** One slide per account: account name, quarter-to-date number against target, the two deals most likely to close, and one line on risk. Same order every week, no more than 40 words per slide.
**keep:** The risk line. That is my read on the account from calls I have had, and it is the only part my director actually reads closely.
**context:** Never estimate a number - if a field is blank in the export, write MISSING and leave it. Account names must match Salesforce exactly including the Inc and LLC suffixes. Anything above 250k needs a legal review flag.

## The master prompt it produced

```
## CONTEXT
Every Thursday I spend about three hours pulling numbers for the Friday pipeline review - same twelve accounts, same slides, and half of it is retyping what Salesforce already knows.

My current process, end to end:
1. Export current-quarter opportunities — tools: Salesforce
2. Clean and pivot the numbers — tools: Excel
3. Rebuild the twelve account slides — tools: PowerPoint
4. Write the summary email to my director — tools: Outlook

Tools involved: Salesforce, Excel, PowerPoint, Outlook.

## WHAT I NEED YOU TO DO
Take over this step of my workflow: Rebuild the twelve account slides (PowerPoint).

## WHAT STAYS WITH ME
The risk line. That is my read on the account from calls I have had, and it is the only part my director actually reads closely.

## OUTPUT I EXPECT
One slide per account: account name, quarter-to-date number against target, the two deals most likely to close, and one line on risk. Same order every week, no more than 40 words per slide.

## THINGS YOU NEED TO KNOW
Never estimate a number - if a field is blank in the export, write MISSING and leave it. Account names must match Salesforce exactly including the Inc and LLC suffixes. Anything above 250k needs a legal review flag.

## HOW TO WORK WITH ME
If something above is missing for a given run, ask me for it before you produce anything.
Never invent facts, names, numbers, or quotes — mark a gap as [MISSING: what you need] and keep going.
```

---

# Dana Whitcomb - Grants coordinator, small nonprofit

_The vague case. Every answer is mush. Does the activity produce something honest about that, or something that only looks finished?_

## What they typed

**Problem:** I spend way too long every month writing up our grant reports and it is basically the same thing each time.

1. Gather program numbers from the team - _Email, Google Sheets_
2. Write the narrative section - _Google Docs_
3. Format to each funder's template - _Word_

**handoff:** Probably the writing part. It just takes forever.
**output:** Just something that sounds professional and is not so dry.
**keep:** I do not know, I guess the parts about impact?
**context:** Not really anything, just make it good.

## The master prompt it produced

```
## CONTEXT
I spend way too long every month writing up our grant reports and it is basically the same thing each time.

My current process, end to end:
1. Gather program numbers from the team — tools: Email, Google Sheets
2. Write the narrative section — tools: Google Docs
3. Format to each funder's template — tools: Word

Tools involved: Email, Google Sheets, Google Docs, Word.

## WHAT I NEED YOU TO DO
Take over this step of my workflow: Write the narrative section (Google Docs).
In my words: I want a first draft I can edit.

## WHAT STAYS WITH ME
The impact stories. Those come from site visits and I write those myself.

## OUTPUT I EXPECT
[NEEDS DETAIL - too vague to act on yet]
I do not know really, just better than what I write now.

## THINGS YOU NEED TO KNOW
[NEEDS DETAIL - too vague to act on yet]
Nothing comes to mind.

## HOW TO WORK WITH ME
If something above is missing for a given run, ask me for it before you produce anything.
Never invent facts, names, numbers, or quotes — mark a gap as [MISSING: what you need] and keep going.

Before you start, note that I left OUTPUT I EXPECT and THINGS YOU NEED TO KNOW too vague to act on. Ask me the questions that would pin those sections down, and wait for my answers before producing anything.
```

---

# Amara Osei - Clinical research coordinator

_The over-handover case. Chat 1 offers up the judgment call; chat 2 takes it back. Does the finished prompt end up coherent or self-contradicting?_

## What they typed

**Problem:** Every week I write screening summaries for people who contacted us about the diabetes trial - about fifteen a week, and I am copying the same eligibility language over and over.

1. Pull the intake questionnaire responses - _REDCap_
2. Check each against inclusion and exclusion criteria - _Protocol PDF_
3. Write a one-paragraph screening summary - _Word_
4. Log the outcome - _REDCap_

**handoff:** Honestly all of it. Step 2 especially - checking criteria is just matching a list.
**output:** One paragraph per candidate, plain language, stating which criteria they meet and which they do not. No more than 150 words.
**keep:** The final eligible or not eligible call. That has to be me - it goes in the regulatory file with my name on it.
**context:** Never infer a value that was not in the questionnaire - if something is missing, say MISSING. Never use the participant name, only the study ID. And it must never state that someone is eligible, only whether the criteria are met.

## The master prompt it produced

```
## CONTEXT
Every week I write screening summaries for people who contacted us about the diabetes trial - about fifteen a week, and I am copying the same eligibility language over and over.

My current process, end to end:
1. Pull the intake questionnaire responses — tools: REDCap
2. Check each against inclusion and exclusion criteria — tools: Protocol PDF
3. Write a one-paragraph screening summary — tools: Word
4. Log the outcome — tools: REDCap

Tools involved: REDCap, Protocol PDF, Word.

## WHAT I NEED YOU TO DO
Take over this step of my workflow: Check each against inclusion and exclusion criteria (Protocol PDF).

One explicit exception to that: The final eligible or not eligible call. That has to be me - it goes in the regulatory file with my name on it. Do not produce that part at all, and do not guess at it - leave it to me.

## WHAT STAYS WITH ME
The final eligible or not eligible call. That has to be me - it goes in the regulatory file with my name on it.

## OUTPUT I EXPECT
One paragraph per candidate, plain language, stating which criteria they meet and which they do not. No more than 150 words.

## THINGS YOU NEED TO KNOW
Never infer a value that was not in the questionnaire - if something is missing, say MISSING. Never use the participant name, only the study ID. And it must never state that someone is eligible, only whether the criteria are met.

## HOW TO WORK WITH ME
If something above is missing for a given run, ask me for it before you produce anything.
Never invent facts, names, numbers, or quotes — mark a gap as [MISSING: what you need] and keep going.
```

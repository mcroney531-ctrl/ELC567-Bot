/*
 * Test personas for the coach.
 *
 * Each is a complete run: what they type into the capture form, and what they
 * answer in each of the three chats. They are chosen to stress different
 * things - a clean specific run, a vague one, and one where the learner's first
 * instinct is to hand over the judgment they must keep.
 */
export const PERSONAS = [
  {
    id: 'marcus',
    name: 'Marcus Reyes',
    role: 'Regional sales manager, 12 accounts',
    tests: 'The clean case. Specific answers at every turn - this is the ceiling.',
    problem:
      'Every Thursday I spend about three hours pulling numbers for the Friday pipeline review - ' +
      'same twelve accounts, same slides, and half of it is retyping what Salesforce already knows.',
    steps: [
      ['Export current-quarter opportunities', 'Salesforce'],
      ['Clean and pivot the numbers', 'Excel'],
      ['Rebuild the twelve account slides', 'PowerPoint'],
      ['Write the summary email to my director', 'Outlook']
    ],
    handoff:
      'Step 3, rebuilding the slides. Same twelve layouts every week with new numbers dropped in, ' +
      'and it eats an hour and a half on its own.',
    output:
      'One slide per account: account name, quarter-to-date number against target, the two deals ' +
      'most likely to close, and one line on risk. Same order every week, no more than 40 words per slide.',
    keep:
      'The risk line. That is my read on the account from calls I have had, and it is the only part ' +
      'my director actually reads closely.',
    context:
      'Never estimate a number - if a field is blank in the export, write MISSING and leave it. ' +
      'Account names must match Salesforce exactly including the Inc and LLC suffixes. Anything ' +
      'above 250k needs a legal review flag.'
  },

  {
    id: 'dana',
    name: 'Dana Whitcomb',
    role: 'Grants coordinator, small nonprofit',
    tests: 'The vague case. Every answer is mush. Does the activity produce something honest about that, or something that only looks finished?',
    problem:
      'I spend way too long every month writing up our grant reports and it is basically the same ' +
      'thing each time.',
    steps: [
      ['Gather program numbers from the team', 'Email, Google Sheets'],
      ['Write the narrative section', 'Google Docs'],
      ["Format to each funder's template", 'Word']
    ],
    handoff: 'Probably the writing part. It just takes forever.',
    output: 'Just something that sounds professional and is not so dry.',
    keep: 'I do not know, I guess the parts about impact?',
    context: 'Not really anything, just make it good.'
  },

  {
    id: 'amara',
    name: 'Amara Osei',
    role: 'Clinical research coordinator',
    tests: 'The over-handover case. Chat 1 offers up the judgment call; chat 2 takes it back. Does the finished prompt end up coherent or self-contradicting?',
    problem:
      'Every week I write screening summaries for people who contacted us about the diabetes trial ' +
      '- about fifteen a week, and I am copying the same eligibility language over and over.',
    steps: [
      ['Pull the intake questionnaire responses', 'REDCap'],
      ['Check each against inclusion and exclusion criteria', 'Protocol PDF'],
      ['Write a one-paragraph screening summary', 'Word'],
      ['Log the outcome', 'REDCap']
    ],
    handoff: 'Honestly all of it. Step 2 especially - checking criteria is just matching a list.',
    output:
      'One paragraph per candidate, plain language, stating which criteria they meet and which they ' +
      'do not. No more than 150 words.',
    keep:
      'The final eligible or not eligible call. That has to be me - it goes in the regulatory file ' +
      'with my name on it.',
    context:
      'Never infer a value that was not in the questionnaire - if something is missing, say MISSING. ' +
      'Never use the participant name, only the study ID. And it must never state that someone is ' +
      'eligible, only whether the criteria are met.'
  }
];

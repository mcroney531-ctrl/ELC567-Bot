/*
 * Thirty ready-to-paste test runs.
 *
 * The three in personas.mjs are the regression set - they are imported here
 * rather than duplicated, so there is one copy of each. The other 27 exist to
 * be grabbed while testing by hand: different jobs, different answer quality,
 * and a run of deliberate edge cases.
 *
 * Fields map exactly to the activity: problem and steps go in block 1, then
 * handoff / output / keep / context are the four chat answers in order.
 * `retry` is what that person says if the coach pushes back.
 */
import { PERSONAS as CORE } from './personas.mjs';

export const TAGS = {
  clean: 'Answers specifically',
  vague: 'Answers vaguely',
  contradiction: 'Contradicts themselves',
  'keeps-all': 'Reluctant to hand over anything',
  edge: 'Edge case for the interface',
  subjective: 'Quality is a matter of taste',
  regulated: 'High stakes / regulated'
};

const EXTRA = [
  // ---------------- answers specifically ----------------
  {
    id: 'priya', name: 'Priya Raghavan', role: 'Hospital scheduling coordinator', tags: ['clean'],
    tests: 'Clean run in a shift-work setting. Short workflow, hard constraints.',
    problem: 'Every day I get twenty or so shift swap requests by text and email, and I have to check each one against the roster rules before I can say yes or no.',
    steps: [['Collect the swap requests from text and email', 'Outlook, phone'],
            ['Check each against the roster rules', 'Kronos'],
            ['Reply to the nurse and update the roster', 'Outlook, Kronos']],
    handoff: 'Step 2, checking each request against the rules. It is the same seven rules every time and I do it twenty times a day.',
    output: 'For each request: the two names, the two shifts, which rules it passes, which it fails, and a one-line plain-English reason. No more than 60 words each.',
    keep: 'The final yes or no. Some of these are close calls about fairness and I have to own that with my staff.',
    context: 'Never guess at a rule. If a shift is missing from the roster export, write MISSING and stop. Use the badge number, not the name, in anything you write back.'
  },
  {
    id: 'tomas', name: 'Tomás Herrera', role: 'Restaurant general manager', tags: ['clean'],
    tests: 'Non-desk job, physical inventory, supplier ordering.',
    problem: 'Every Sunday night I count inventory and put in five supplier orders, and I spend two hours rebuilding the same order sheets from last week with different numbers.',
    steps: [['Count what is on the shelves', 'clipboard, MarketMan'],
            ['Compare against par levels', 'MarketMan'],
            ['Build the order for each of five suppliers', 'Excel'],
            ['Email each supplier', 'Gmail']],
    handoff: 'Step 3, building the five order sheets. Once I know the counts it is just arithmetic against par and I have done it wrong when I am tired.',
    output: 'One order sheet per supplier, their item codes in their order, quantity and unit only. No prices. Flag anything I am ordering more than 30 percent above last week.',
    keep: 'Anything perishable. I decide how much produce to buy based on what the weather is doing and how the weekend went.',
    context: 'Never round quantities up to a case unless the supplier only sells cases. Sysco item codes are seven digits, the others are five. If a par level is blank, write MISSING.'
  },
  {
    id: 'lena', name: 'Lena Fischer', role: 'HR generalist', tags: ['clean'],
    tests: 'Templated documents with legal exposure.',
    problem: 'I write about eight offer letters a month and each one is the same document with the salary, title, start date and equity swapped out, plus whatever the hiring manager negotiated.',
    steps: [['Pull the approved offer terms', 'Greenhouse'],
            ['Draft the letter from our template', 'Word'],
            ['Send for countersignature', 'DocuSign']],
    handoff: 'Step 2, drafting the letter. The template is fixed, it is just filling it correctly and getting the negotiated bits worded right.',
    output: 'Our standard letter, exactly the template order, with the six variable fields filled. Under one page. Formal but not stiff.',
    keep: 'Anything about the equity grant. That wording has been through legal and I do not improvise on it.',
    context: 'Never invent a start date - if it is not in the approved terms, write MISSING. Job titles must match the requisition exactly. Never mention bonus eligibility unless the terms include it.'
  },
  {
    id: 'wesley', name: 'Wesley Okafor', role: 'Municipal permits clerk', tags: ['clean'],
    tests: 'Public-facing writing with a compliance edge.',
    problem: 'I send about forty permit status letters a week and they are the same six paragraphs with a different address, permit number and reason for delay.',
    steps: [['Pull the permit record', 'Accela'],
            ['Work out which status letter applies', 'Accela'],
            ['Write and send the letter', 'Word, Outlook']],
    handoff: 'Step 3, writing the letter. There are six templates and I know which one applies by the time I get there.',
    output: 'Formal letter, our four-paragraph structure, plain language at about an eighth grade reading level. Under 250 words. Always ends with the appeal window.',
    keep: 'Any letter that involves a code violation. Those can end up in front of a hearing officer and I write those myself.',
    context: 'Never state a decision the record does not show. Permit numbers are formatted BLD-YYYY-NNNN. If the delay reason field is empty, write MISSING rather than guessing.'
  },
  {
    id: 'aditi', name: 'Aditi Sharma', role: 'Customer support lead, SaaS', tags: ['clean'],
    tests: 'Synthesis rather than templating - summarising many items into themes.',
    problem: 'Every Friday I read through the week’s support tickets and write up the top themes for the product team, which takes me most of an afternoon.',
    steps: [['Export the week’s resolved tickets', 'Zendesk'],
            ['Group them into themes by hand', 'Google Sheets'],
            ['Write the summary for product', 'Notion']],
    handoff: 'Step 2, the grouping. I am reading four hundred tickets and sorting them into maybe eight buckets, and that is the part that eats the afternoon.',
    output: 'Eight themes maximum, each with a count, two representative ticket IDs, and one sentence on what the customer was actually trying to do. Ranked by count.',
    keep: 'The recommendation at the end about what product should fix first. That is a judgement call about our roadmap and it is mine.',
    context: 'Never merge two themes that have different root causes just because the wording is similar. Use ticket IDs, never customer names. If a ticket has no resolution note, leave it out and say how many you left out.'
  },
  {
    id: 'colm', name: 'Colm Byrne', role: 'Construction estimator', tags: ['clean'],
    tests: 'Numeric comparison work where a mistake is expensive.',
    problem: 'For every project I get five to nine subcontractor bids in different formats and I have to normalise them into one comparison sheet before I can recommend anything.',
    steps: [['Collect the bid PDFs', 'email'],
            ['Pull the line items into a common format', 'Excel'],
            ['Flag scope gaps and exclusions', 'Excel'],
            ['Write the recommendation memo', 'Word']],
    handoff: 'Step 2, normalising the line items. Every sub formats their bid differently and I am retyping the same twelve trades into my sheet.',
    output: 'One row per trade, one column per bidder, dollars only. A separate list of anything a bidder excluded that others included. No commentary.',
    keep: 'The recommendation. Price is only half of it and the other half is whether I trust the crew to show up.',
    context: 'Never total a column that has a missing bid in it. Alternates are not base bid - keep them separate. If a bid has no date, write MISSING.'
  },
  {
    id: 'ruth', name: 'Ruth Delgado', role: 'School district data analyst', tags: ['clean'],
    tests: 'Education data with student privacy constraints.',
    problem: 'Every Monday I flag students whose attendance has dropped and write a short note to each school so they can follow up, about thirty notes a week.',
    steps: [['Pull last week’s attendance', 'PowerSchool'],
            ['Compare against the four-week average', 'Excel'],
            ['Write a note per school', 'Outlook']],
    handoff: 'Step 3, writing the notes. It is the same three sentences per student and I write thirty of them.',
    output: 'One short paragraph per school listing the flagged students by ID, their current rate against their average, and the drop. No more than 100 words per school.',
    keep: 'Anything about why a student might be absent. I do not speculate and neither should this.',
    context: 'Never use a student name, only the state ID. Never suggest a cause for the absence. If attendance data is incomplete for a week, say MISSING and do not calculate an average from partial data.'
  },

  // ---------------- answers vaguely ----------------
  {
    id: 'brett', name: 'Brett Halloran', role: 'Owner, three-van plumbing business', tags: ['vague'],
    tests: 'Vague and busy. Not evasive, just has never had to specify anything.',
    problem: 'I spend my evenings answering customer emails and it eats my whole night, every night.',
    steps: [['Read the day’s emails', 'Gmail'], ['Write back to each one', 'Gmail']],
    handoff: 'The emails. All of it really.',
    output: 'Just professional. Something that sounds like me but faster.',
    keep: 'I mean I should probably check them.',
    context: 'Not really. Just do it right.',
    retry: { handoff: 'Step 2, writing back. Mostly quotes and scheduling.',
             output: 'Short. Two or three sentences, friendly, no jargon.',
             keep: 'Anything with a price in it. I want to see those before they go.',
             context: 'Never quote a price. Leave a blank for it and I will fill it in.' }
  },
  {
    id: 'sofia', name: 'Sofia Marchetti', role: 'Marketing coordinator', tags: ['vague', 'subjective'],
    tests: 'Vague AND subjective - "on brand" is the whole spec in her head.',
    problem: 'I write social captions for three channels every week and it takes forever to make them not sound the same.',
    steps: [['Get the week’s content from the team', 'Slack'],
            ['Write captions for each channel', 'Google Docs'],
            ['Schedule them', 'Later']],
    handoff: 'The writing. Obviously.',
    output: 'On brand. You know, our voice.',
    keep: 'Hmm. I guess anything sensitive?',
    context: 'Not that I can think of.',
    retry: { handoff: 'Step 2. I want first drafts for each channel that I can then cut down.',
             output: 'Instagram under 125 characters, LinkedIn two short paragraphs, no hashtags anywhere. Never use an exclamation mark.',
             keep: 'Anything about a customer story. Those need their approval and I handle that.',
             context: 'Never name a client unless I have put the name in the brief. No emoji in LinkedIn.' }
  },
  {
    id: 'gerald', name: 'Gerald Whitmore', role: 'Independent insurance agent', tags: ['vague'],
    tests: 'Vague and stays vague. Both pushbacks fail - the marked-prompt path.',
    problem: 'The paperwork side of renewals takes up way more of my week than it should.',
    steps: [['Pull the renewal list', 'AMS360'], ['Prepare each renewal packet', 'Word'], ['Mail or email it out', 'Outlook']],
    handoff: 'The paperwork part.',
    output: 'Better than what I do now.',
    keep: 'Not sure.',
    context: 'Nothing really comes to mind.',
    retry: { handoff: 'Honestly all the paperwork.', output: 'Just cleaner I guess.',
             keep: 'I would have to think about it.', context: 'No, nothing.' }
  },
  {
    id: 'nadia', name: 'Nadia Hassan', role: 'Residential realtor', tags: ['vague', 'subjective'],
    tests: 'Vague, and the good answer is genuinely hard to articulate.',
    problem: 'I write listing descriptions for every property and after ten years they all sound identical to me.',
    steps: [['Walk the property and take notes', 'phone'],
            ['Pull the specs from the MLS sheet', 'MLS'],
            ['Write the description', 'MLS']],
    handoff: 'The writing bit.',
    output: 'Something that actually sells the place.',
    keep: 'I do not know really.',
    context: 'Just make it sound good.',
    retry: { handoff: 'Step 3. A first draft from my walkthrough notes and the specs.',
             output: 'Under 200 words, no more than two adjectives in a row, leads with the thing that is actually unusual about the house.',
             keep: 'Anything about the neighbourhood or schools. Fair housing rules and I will not risk it.',
             context: 'Never mention schools, demographics, or who would like the house. Never say a square footage that is not on the MLS sheet.' }
  },

  // ---------------- contradicts themselves ----------------
  {
    id: 'julian', name: 'Julian Feldman', role: 'Paralegal, litigation', tags: ['contradiction', 'regulated'],
    tests: 'Offers up the legal judgement in chat 1, pulls it back in chat 2.',
    problem: 'I summarise deposition transcripts for the attorneys, about four a month, and each one is three hundred pages I have to boil down to two.',
    steps: [['Read the transcript', 'Westlaw'],
            ['Pull out the relevant testimony', 'Word'],
            ['Write the summary memo', 'Word'],
            ['Flag anything that contradicts an earlier deposition', 'Word']],
    handoff: 'All of it honestly. Especially step 4, contradiction spotting is just comparing two documents.',
    output: 'Two pages maximum, chronological, every point cited to a page and line number. No characterisation, just what was said.',
    keep: 'Calling something a contradiction. That is a legal judgement and if I am wrong an attorney walks into a deposition with bad information.',
    context: 'Never paraphrase testimony without the page and line cite. Never infer what a witness meant. If a passage is unclear, quote it and say it is unclear.'
  },
  {
    id: 'hana', name: 'Hana Kimura', role: 'Pharmacy technician', tags: ['contradiction', 'regulated'],
    tests: 'Sweeping handoff on something with patient-safety consequences.',
    problem: 'I prepare the daily med reconciliation lists for the pharmacist and I am transcribing the same fields off intake forms fifty times a day.',
    steps: [['Pull the intake medication list', 'Epic'],
            ['Cross-check against the current profile', 'Epic'],
            ['Flag interactions and duplicates', 'Lexicomp'],
            ['Build the reconciliation sheet for the pharmacist', 'Excel']],
    handoff: 'Everything. Step 3 especially, interaction checking is a lookup table.',
    output: 'One row per medication: name, dose, route, frequency, source. Anything that differs between the two lists highlighted. Nothing else.',
    keep: 'The clinical call on whether an interaction actually matters for this patient. That is the pharmacist’s and I do not touch it.',
    context: 'Never infer a dose that is not written down. Never expand an abbreviation you are not certain of - flag it. Never say a drug is safe or unsafe, only that the lists differ.'
  },
  {
    id: 'owen', name: 'Owen Fitzgerald', role: 'Commercial loan officer', tags: ['contradiction', 'regulated'],
    tests: 'Wants the approve/decline call automated, then admits it cannot be.',
    problem: 'I write credit memos for every loan application and it is the same eight sections every time with different numbers in them.',
    steps: [['Pull the financials and credit report', 'nCino'],
            ['Calculate the ratios', 'Excel'],
            ['Write the credit memo', 'Word'],
            ['Recommend approve or decline', 'nCino']],
    handoff: 'The whole memo, and honestly step 4 too. The ratios tell you the answer.',
    output: 'Our eight-section memo, in order, ratios shown to two decimal places with the inputs beside them. Under three pages.',
    keep: 'The recommendation. It goes to committee with my name on it and there is always something the ratios do not show.',
    context: 'Never calculate a ratio from an incomplete statement - say MISSING. Never characterise the borrower. Never state a recommendation, only the figures.'
  },

  // ---------------- reluctant to hand anything over ----------------
  {
    id: 'margaret', name: 'Margaret Oyelaran', role: 'Clinical therapist, private practice', tags: ['keeps-all', 'regulated'],
    tests: 'Wants to keep every step. Tests whether the activity can produce anything useful when the honest answer is "not much".',
    problem: 'I write progress notes after every session, about twenty five a week, and it adds an hour to every day.',
    steps: [['Write the session note', 'SimplePractice'],
            ['Update the treatment plan if needed', 'SimplePractice'],
            ['Submit for billing', 'SimplePractice']],
    handoff: 'Honestly none of it. Every word of a progress note is clinical judgement and it is a legal record.',
    output: 'If it did anything it would just be the structure - our note format with the headings and nothing filled in.',
    keep: 'All of the content. Every observation, every intervention, every assessment.',
    context: 'Never write clinical content. Never infer a diagnosis. Never put anything in a note that I did not say happened.'
  },
  {
    id: 'desmond', name: 'Desmond Clarke', role: 'Investigative reporter', tags: ['keeps-all'],
    tests: 'Refuses the premise, sceptically. Tests the tone when the learner pushes back on the activity itself.',
    problem: 'I spend a full day a week just organising interview notes and documents so I can find things later.',
    steps: [['Transcribe interviews', 'Otter'],
            ['Tag documents by source and topic', 'DEVONthink'],
            ['Write the running chronology', 'Scrivener']],
    handoff: 'Step 2, the tagging. That is filing, not journalism. Nothing else.',
    output: 'Tags only. Source, date, topic, and whether it is on the record. No summaries, no interpretation.',
    keep: 'Everything else. The chronology is where I work out what the story is and I am not outsourcing that.',
    context: 'Never summarise a document. Never characterise a source. Never merge two sources into one entry. If a date is ambiguous, tag it unknown.'
  },

  // ---------------- edge cases for the interface ----------------
  {
    id: 'yuki', name: 'Yuki Tanaka', role: 'Veterinary practice manager', tags: ['edge', 'clean'],
    tests: 'Almost no software. Tests what the tools field does when the honest answer is paper.',
    problem: 'Every morning I go through yesterday’s paper intake forms and type them into the system, about thirty forms.',
    steps: [['Sort yesterday’s paper forms', 'paper'],
            ['Type each into the record', 'ezyVet'],
            ['File the paper copy', 'filing cabinet']],
    handoff: 'Step 2, the typing. It is transcription and I make mistakes when I rush it.',
    output: 'One record per form, our field order, exactly what is written on the form. Anything illegible marked, not guessed.',
    keep: 'Anything in the notes field about the animal’s condition. If the vet wrote it I want to read it myself.',
    context: 'Never expand an abbreviation. Never clean up a phone number, type what is written. If handwriting is unclear, write UNCLEAR and move on.'
  },
  {
    id: 'fabien', name: 'Fabien Roux', role: 'Logistics coordinator', tags: ['edge', 'clean'],
    tests: 'Seven workflow steps. Tests the step builder and how a long list reads in the finished prompt.',
    problem: 'Every shipment I book goes through the same seven-step paper trail, and a full booking takes forty minutes of copying the same details between systems.',
    steps: [['Take the booking request', 'email'],
            ['Check carrier capacity', 'Freightos'],
            ['Quote the customer', 'Excel'],
            ['Book the carrier', 'carrier portal'],
            ['Raise the customs paperwork', 'CustomsLink'],
            ['Send the confirmation pack', 'Outlook'],
            ['Log it in the ledger', 'SAP']],
    handoff: 'Step 6, the confirmation pack. Six documents that all say the same thing in different boxes.',
    output: 'The six standard documents, our field order, every reference number matching the booking exactly. No prose.',
    keep: 'The customs classification. Get that wrong and it is my licence, not a delayed box.',
    context: 'Never invent an HS code. Never round a weight. Container numbers are four letters then seven digits, and if one does not match that, stop and flag it.'
  },
  {
    id: 'grace', name: 'Grace Ampofo', role: 'Freelance bookkeeper', tags: ['edge', 'clean'],
    tests: 'Only two workflow steps, the minimum the activity accepts.',
    problem: 'Every month end I categorise about four hundred transactions across six clients and it is the same categories every time.',
    steps: [['Pull the month’s transactions', 'Xero'],
            ['Categorise each one', 'Xero']],
    handoff: 'Step 2. Ninety percent of them are the same twenty vendors every month.',
    output: 'One line per transaction with a proposed category and a confidence level. Anything below high confidence goes in a separate list for me.',
    keep: 'Anything I have not seen before, and anything over five hundred pounds. Those I look at myself.',
    context: 'Never create a new category. Never split a transaction. If a vendor is new, put it in the review list rather than guessing.'
  },
  {
    id: 'ivan', name: 'Ivan Petrov', role: 'Research lab manager', tags: ['edge'],
    tests: 'A very long problem statement. Tests how a wall of text renders and carries into the prompt.',
    problem: 'Every quarter I put together the compliance reporting pack for three funding bodies, and each one wants the same underlying information in a different structure with different terminology, so I end up rewriting the same fifteen facts three times over, plus there is a safety section that overlaps with our internal audit but not exactly, and the deadlines are two weeks apart which means I do it three times rather than once, and by the third one I have usually lost track of which version has the corrected headcount in it.',
    steps: [['Gather the quarter’s figures', 'Excel, LabArchives'],
            ['Write each funder’s report', 'Word'],
            ['Cross-check the three against each other', 'Word'],
            ['Submit', 'funder portals']],
    handoff: 'Step 2, writing the three reports from one set of figures. Same facts, three structures.',
    output: 'Three documents, each in that funder’s section order and their terminology. Every figure identical across all three. No narrative beyond what each section asks for.',
    keep: 'The safety section. That has my signature on it and I write it once, carefully, myself.',
    context: 'Never let a figure differ between the three reports. If a figure is provisional, say so in every report it appears in. Never use one funder’s terminology in another’s document.'
  },
  {
    id: 'bilal', name: 'Bilal Karim', role: 'IT support technician', tags: ['edge'],
    tests: 'Terse throughout, but genuinely specific. Tests whether the vagueness check fires on brevity alone.',
    problem: 'I write up ticket resolutions at the end of every day. Thirty tickets, the same six sentence shapes.',
    steps: [['Review the day’s closed tickets', 'Jira'], ['Write the resolution note', 'Jira']],
    handoff: 'Step 2. Draft note per ticket.',
    output: 'Four lines: symptom, cause, fix, prevention. Under 60 words. No jargon.',
    keep: 'Root cause when it is a guess. I mark those myself.',
    context: 'Never state a cause the ticket does not evidence. Asset tags are six digits. A missing field means MISSING.'
  },
  {
    id: 'rosa', name: 'Rosa Jiménez', role: 'Community college advisor', tags: ['edge'],
    tests: 'Answers questions with questions. Tests what happens when the learner will not commit.',
    problem: 'I write degree audit summaries for students, about forty a term, explaining what they still need in order to graduate.',
    steps: [['Run the degree audit', 'Banner'],
            ['Work out what is still outstanding', 'Banner'],
            ['Write the summary for the student', 'Outlook']],
    handoff: 'What would you suggest? Probably the writing?',
    output: 'What does a good one usually look like for something like this?',
    keep: 'What do most people keep?',
    context: 'Is there anything I should be worried about here?',
    retry: { handoff: 'Step 3 then. The summary email, from the audit output.',
             output: 'Plain language, under 200 words, a bulleted list of what is left and how many credits each one is.',
             keep: 'Any advice about what to take next term. That is a conversation, not an email.',
             context: 'Never tell a student they will graduate on a date. Never mention financial aid. If the audit has an exception on it, say to come and see me.' }
  },

  // ---------------- quality is a matter of taste ----------------
  {
    id: 'simone', name: 'Simone Aubert', role: 'Museum exhibit copywriter', tags: ['subjective'],
    tests: 'Craft work where good is genuinely contested. Tests whether an output spec can carry taste.',
    problem: 'I write wall labels for every object in a show, two hundred labels, and each one has to say the same kind of thing in fifty words.',
    steps: [['Read the curator’s object notes', 'Google Docs'],
            ['Check the object record', 'TMS'],
            ['Write the label', 'Google Docs'],
            ['Send to the curator for review', 'Google Docs']],
    handoff: 'Step 3, a first draft of each label from the curator notes and the object record.',
    output: 'Exactly fifty words. One idea per label. No art-historical jargon, no masterpiece, no rhetorical questions. Present tense.',
    keep: 'The opening sentence. That is what a visitor reads in the two seconds they give me, and I write those.',
    context: 'Never state a date or attribution that is not in the object record. If the record says attributed to, the label must say it too. Never describe what the artist was feeling.'
  },
  {
    id: 'theo', name: 'Theo Nkemelu', role: 'Podcast producer', tags: ['subjective', 'clean'],
    tests: 'Creative-adjacent, but with a hard format spec.',
    problem: 'Every episode needs show notes, timestamps and three social pull-quotes, and it takes me longer than the edit does.',
    steps: [['Get the transcript', 'Descript'],
            ['Write the episode summary', 'Notion'],
            ['Timestamp the chapters', 'Descript'],
            ['Pull three quotes for social', 'Notion']],
    handoff: 'Steps 2 and 4, the summary and the quote pulls. Timestamps I do while editing anyway.',
    output: 'Summary under 120 words in second person. Three quotes, each under 25 words, verbatim from the transcript with a timestamp.',
    keep: 'Which quotes actually go out. The best line for the show is not always the best line in the episode.',
    context: 'Quotes must be word for word, never tidied up. Never quote the ad read. If a guest asked for something off the record it is not in the transcript, so never fill gaps.'
  },
  {
    id: 'bridget', name: 'Bridget Nolan', role: 'Grant programme reviewer', tags: ['subjective', 'regulated'],
    tests: 'Evaluative writing where consistency between reviewers is the whole point.',
    problem: 'I score about sixty applications a round and write a scoring narrative for each one against five criteria.',
    steps: [['Read the application', 'Submittable'],
            ['Score against the five criteria', 'rubric'],
            ['Write the narrative for each score', 'Submittable'],
            ['Submit the review', 'Submittable']],
    handoff: 'Step 3, the narrative. The score is mine, but writing out why in the house style takes as long as reading the thing.',
    output: 'One paragraph per criterion, 60 to 80 words, quoting the application where it evidences the score. Neutral tone, no praise language.',
    keep: 'The scores themselves. Every one of them.',
    context: 'Never suggest a score. Never compare one applicant to another. Only quote what is in the application, and if a criterion is not addressed, say it is not addressed.'
  },

  // ---------------- high stakes / regulated ----------------
  {
    id: 'anders', name: 'Anders Lindqvist', role: 'Aircraft maintenance planner', tags: ['regulated', 'clean'],
    tests: 'Airworthiness records. The strictest guardrails in the set.',
    problem: 'Every check I plan generates the same work package paperwork, and I spend a day and a half transcribing task numbers between three systems.',
    steps: [['Pull the due tasks', 'AMOS'],
            ['Build the work package', 'AMOS'],
            ['Cross-check against the maintenance programme', 'PDF'],
            ['Issue to the hangar', 'AMOS']],
    handoff: 'Step 2, building the package from the due list. It is assembly, not engineering judgement.',
    output: 'One line per task: task number, revision, zone, estimated hours, required qualification. In task number order. Nothing else.',
    keep: 'Anything involving a deferral. Deferring a task is a signed engineering decision and it is mine.',
    context: 'Never transcribe a task number without its revision letter. Never combine two tasks. If the programme revision does not match the task revision, stop and flag it rather than resolving it.'
  },
  {
    id: 'cheryl', name: 'Cheryl Boateng', role: 'Child welfare case worker', tags: ['regulated', 'keeps-all'],
    tests: 'The highest-stakes case in the set, where the right answer is that most of it stays human.',
    problem: 'I write court report summaries for every case going to review, about twelve a month, and each one pulls from six months of case notes.',
    steps: [['Review the case notes', 'SACWIS'],
            ['Pull the chronology of contacts', 'SACWIS'],
            ['Write the summary', 'Word'],
            ['File with the court', 'court portal']],
    handoff: 'Step 2, the chronology. Dates, contact type, who was present. It is extraction from what I already wrote.',
    output: 'A table: date, contact type, participants, whether it was announced. Chronological. No narrative, no summary of what happened.',
    keep: 'Every word of the assessment. What the contacts mean for this child is the entire job, and it goes to a judge under my name.',
    context: 'Never characterise a contact. Never infer why a visit did not happen. Use initials, never full names of children. If a note is missing for a scheduled contact, show the gap rather than closing it.'
  }
];

/* The three regression personas plus the twenty-seven above. */
export const LIBRARY = CORE.map(function (p) {
  var tags = p.id === 'marcus' ? ['clean'] : p.id === 'dana' ? ['vague'] : ['contradiction', 'regulated'];
  return Object.assign({}, p, { tags: tags, core: true });
}).concat(EXTRA);

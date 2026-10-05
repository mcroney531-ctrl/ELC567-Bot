(function () {
  "use strict";

  /* ==========================================================================
     1. CONFIGURATION
     --------------------------------------------------------------------------
     The only block you need to touch to put a real LLM behind Step 4.
     Leave botEndpoint as null and the activity runs on the built-in scripted
     coach \u2014 fully usable, no backend, no API key in the page.
     ========================================================================== */

  var CONFIG = {
    // Full URL of YOUR proxy / serverless function that talks to the LLM.
    // null => built-in scripted coach.
    botEndpoint: null,

    // Extra headers for that request (e.g. { "x-course-key": "elc567" }).
    // Never put a provider API key here - this file is public to every learner.
    botHeaders: {},

    // Abandon a bot request after this many ms.
    botTimeoutMs: 45000,

    // localStorage key. Bump the suffix to invalidate saved data after a
    // breaking change to the activity.
    storageKey: "brainstorm_workflow_data",

    // Minimum characters before Step 1 counts as answered. A floor, not a cap:
    // everything downstream is written from this sentence.
    minProblemChars: 25,

    // Minimum filled-in workflow cards before Step 2 counts as answered.
    minWorkflowSteps: 2,

    // Minimum learner replies in Step 4 before Step 5 unlocks.
    minChatTurns: 2,

    // Which slice of the activity THIS block renders. Paste the same file into
    // several Rise custom blocks in one lesson and give each a different role;
    // they share state through localStorage and update each other live.
    //   "all"               - the whole five-step activity in one block (default)
    //   "intro"             - the framing and the worked example, nothing else
    //   "capture"           - steps 1-3 together in one block
    //   "problem"           - step 1 only: name the task
    //   "workflow"          - step 3 only: map the steps and tools
    //   "draft"             - step 2 only: the auto-built draft prompt, retired from the
    //                         journey and previewable only through this role
    //   "coach-handoff"     - chat 1: which step the AI takes over
    //   "coach-standards"   - chat 2: what good looks like, and what stays yours
    //   "coach-guardrails"  - chat 3: context and rules, then the finished prompt
    //   "artifact"          - step 5: the master prompt, editable and copyable
    // The three chat roles are separate conversations that build one shared
    // master prompt. Use any of them, in that order; you don't need all three.
    // Splitting only works where the blocks share an origin. Verify with
    // tools/rise-storage-probe.html before relying on it.
    blockRole: "all",

    // How often a split block re-checks storage for a sibling's work. The
    // storage event is the fast path, but a block below the fold is not
    // guaranteed to receive one, so this poll is the thing that actually
    // makes the split reliable. Cheap: one getItem and a string compare.
    syncPollMs: 1200,

    // A Rise lesson is light. Following the learner's OS dark mode would drop a
    // dark panel into a white lesson, so it stays light unless you turn this on.
    followSystemDarkMode: false
  };

  /* What each role renders, and which fields it is allowed to write. Ownership
     is what keeps blocks from trampling each other: a block writes back only
     its own fields, on top of whatever siblings have saved since. */
  var ROLES = {
    all:                { steps: [1, 2, 3, 4, 5], intro: true,  label: "",                  stage: "all" },
    intro:              { steps: [],              intro: true,  label: "",                  stage: null },
    capture:            { steps: [1, 2, 3],       intro: true,  label: "Set it up",         stage: null },
    problem:            { steps: [1],             intro: false, label: "Name it",           stage: null },
    workflow:           { steps: [2],             intro: false, label: "Map it",            stage: null },
    "coach-workflow":   { steps: [2],             intro: false, label: "Walk me through it", stage: "workflow" },
    "coach-tools":      { steps: [2],             intro: false, label: "Where it happens",   stage: "tools" },
    // The retired draft screen is not a stage any more; its preview reveals a
    // container that lives outside the step list.
    draft:              { steps: [],              intro: false, label: "Your draft",        stage: null },
    "coach-handoff":    { steps: [4],             intro: false, label: "Hand it over",      stage: "handoff" },
    "coach-standards":  { steps: [4],             intro: false, label: "Set the bar",       stage: "standards" },
    "coach-guardrails": { steps: [4],             intro: false, label: "Set the guardrails", stage: "guardrails" },
    artifact:           { steps: [5],             intro: false, label: "Your prompt",       stage: null }
  };

  /* Each conversation stage owns a slice of the answers that build the master
     prompt. Several chat blocks in one lesson are separate conversations
     writing into the same artifact - which is why ownership is per answer key,
     not per field. */
  var STAGES = {
    all:        { answers: ["handoff", "output", "keep", "context", "notes"], minTurns: 2 },
    // These two capture the workflow itself rather than an answer key, so they
    // own part of the steps array instead of a slice of botAnswers.
    workflow:   { answers: [], minTurns: 1, owns: "actions" },
    tools:      { answers: [], minTurns: 1, owns: "tools" },
    identify:   { answers: [],                                                minTurns: 2, owns: "problem" },
    map:        { answers: [],                                                minTurns: 1 },
    envision:   { answers: [],                                                minTurns: 1 },
    deploy:     { answers: [],                                                minTurns: 1 },
    handoff:    { answers: ["handoff"],                                       minTurns: 1 },
    standards:  { answers: ["output", "keep"],                                minTurns: 2 },
    guardrails: { answers: ["context", "notes"],                              minTurns: 1 }
  };
  /* Refine's contract, in one place.

     The order here is the order the coach asks in, the order the rail lists,
     and the order the gate fills. Nothing else may carry a second copy of it:
     the scripted turns are built from this list, the rail items are built from
     this list, and stepValid(4) reads this list. A live coach is told which
     entry is current rather than being trusted to walk them itself.

     `ask` is the question, shared by the scripted coach and the instruction a
     live model is given, so the two cannot drift into asking different things.
     `label` is what the learner sees on the rail before the conversation
     reaches it - naming the four up front is deliberate. */
  var REFINE_DECISIONS = [
    { key: "handoff", label: "What AI handles",
      ask: "Looking at the steps you mapped, which parts should AI take on or share with you?" },
    { key: "keep", label: "What stays yours",
      ask: "Now draw the line around what stays yours. What should AI not take over \u2014 " +
           "where do you still need your judgment, approval, relationship context, or final say?" },
    { key: "output", label: "What good looks like",
      ask: "Now set the bar. When AI finishes its part, what would a result look like that " +
           "you'd actually use? Think about format, length, tone, structure, and level of polish." },
    { key: "context", label: "What AI needs to know",
      ask: "Last piece. What does AI need to know or follow every time? Think rules, " +
           "source-of-truth details, naming conventions, exceptions, and anything it must " +
           "never invent.",
      /* Asked with the question, not after the answer: the learner's own tools
         are the likeliest source of a rule a newcomer would not guess, and it
         is no use as an afterthought once the decision is settled. */
      hint: function () {
        return workflowData.toolsAll.length
          ? "Anything about how " + toolsAsList() + " is set up that a newcomer wouldn't guess " +
            "counts here too."
          : "";
      } }
  ];

  /* The full journey's Refine stage is the conversation these decisions govern.
     A /role/ slice runs one of the older split scripts, which ask in their own
     order and own only part of the set, so they keep the turn-count rule. */
  function refineGoverned() { return TIMELINE; }

  /* Decided means accepted, not merely typed. A first thin answer is stored -
     in case the learner stops there - but it is still being challenged, so it
     does not count. The second answer is accepted whatever it says, and earns
     [NEEDS DETAIL] instead of another question. Coverage, not perfection. */
  function decided(key) { return !!workflowData.decided[key]; }

  function undecidedDecisions() {
    return REFINE_DECISIONS.filter(function (d) { return !decided(d.key); });
  }

  /* The one the coach is on: first in the list that has not been accepted. */
  function currentDecision() { return undecidedDecisions()[0] || null; }

  function refineComplete() { return undecidedDecisions().length === 0; }

  var ownsActions = function () { return STAGE && STAGES[STAGE].owns === "actions"; };
  var ownsTools = function () { return STAGE && STAGES[STAGE].owns === "tools"; };

  var OWNED_FIELDS = {
    all:      ["problem", "steps", "toolsAll", "idealOutcome", "aiRole",
               "masterPromptV1", "masterPromptV2", "v2Source"],
    capture:  ["problem", "steps", "toolsAll", "masterPromptV1"],
    problem:  ["problem"],
    workflow: ["steps", "toolsAll"],
    draft:    ["masterPromptV1"],
    artifact: ["masterPromptV2", "v2Source"]
  };
  var ROLE  = ROLES[CONFIG.blockRole] || ROLES.all;
  var OWNED = OWNED_FIELDS[CONFIG.blockRole] || [];   // chat blocks own no top-level fields
  var STAGE = ROLE.stage;                             // null for capture / artifact
  /* The two stages that take down the workflow itself rather than an opinion. */
  var isCaptureChat = !!(STAGE && STAGES[STAGE].owns);
  /* The full activity owns every stage there is, so it does not consult a list
     that would have to be kept in step with STATIONS. A slice owns what it
     declares. (ROLES.all.steps is left in place for readability; nothing reads
     it any more.) */
  var ownsStep = function (n) {
    return CONFIG.blockRole === "all" || ROLE.steps.indexOf(n) !== -1;
  };
  var ownsAnswer = function (k) {
    return STAGE ? STAGES[STAGE].answers.indexOf(k) !== -1 : false;
  };
  /* Which conversation is live.

     A slice has exactly one, fixed by its role. The full activity shows one
     stage at a time, so one chat serves all of them - the transcript it is
     bound to follows whichever stage is open. */
  /* Every stage needs an entry even when it has no coach: sKey() falls back to
     "all" without one, which would put stage 4's transcript on screen. */
  var STAGE_CONVO = { 1: "identify", 2: "map", 3: "envision", 4: "all", 5: "deploy" };

  function sKey() {
    if (!TIMELINE) return STAGE;
    return STAGE_CONVO[workflowData.progress.current] || "all";
  }
  function sMeta() { return STAGES[sKey()] || STAGES.all; }

  var convo = function () {
    var k = sKey();
    if (!k) return [];
    if (!workflowData.conversations[k]) workflowData.conversations[k] = [];
    return workflowData.conversations[k];
  };

  /* System prompt sent to a live endpoint. The fenced block instruction is what
     lets Step 5 lift the refined prompt back out of the conversation. */
  var BOT_SYSTEM_PROMPT = [
    "You are a workflow coach helping a working professional prepare one repetitive task for AI integration.",
    "They have already described their problem, mapped their workflow, and decided what a better version of it",
    "would look like. All of that context follows this message.",
    "",
    "Your job: turn their stated future state into an operating agreement, by settling four decisions with them.",
    "",
    "The four decisions, in this order:",
    "1. WHAT AI HANDLES  - which of their mapped steps AI takes on or shares.",
    "2. WHAT STAYS THEIRS - the judgment, approval, relationships or final say they keep.",
    "3. WHAT GOOD LOOKS LIKE - format, length, tone, structure, level of polish.",
    "4. WHAT AI NEEDS TO KNOW - rules, sources of truth, naming, exceptions, what it must never invent.",
    "",
    "The activity tells you which decision is current before each of your replies, and records the learner's",
    "answers itself. Ask about the current decision and nothing else. Do not skip ahead, do not bundle two",
    "decisions into one question, and do not decide on their behalf that a decision is settled - the activity",
    "does that.",
    "",
    "How to work:",
    "- Ask ONE question at a time, about the current decision. Keep replies under 120 words.",
    "- Push on a vague answer once before accepting it. \"Make it faster\", \"sounds professional\" and",
    "  \"just make it good\" are not specifications. Name the specific thing that would make the answer",
    "  usable - a length, a shape, a rule, something it must never do - rather than asking them to be",
    "  more specific in the abstract. The activity tells you when it has already pushed back once; when",
    "  it has, take the second answer as it stands, say plainly that you are marking it as needing detail,",
    "  and move on rather than asking a third time.",
    "- Work from the outcome and AI role they already wrote. Do not propose a different vision.",
    "- Be observant, concise, specific and nonjudgmental. Record what they decide; do not praise",
    "  an answer you are in no position to evaluate. \"That's the right instinct\" and \"great call\"",
    "  tell them nothing, and you cannot know whether the step they picked was the right one.",
    "  Reflecting an answer back accurately is worth more than approving of it.",
    "- Read their answers against each other. If they offer to hand over everything and then carve out a",
    "  judgment call, say so, and make the exception explicit. Never leave two instructions that contradict",
    "  each other on the highest-stakes part of their job.",
    "- Reference their actual steps and tools by name. Never invent details they did not give you.",
    "",
    "Do NOT write out, quote, preview or otherwise show the finished master prompt during this conversation,",
    "in a fenced block or any other way. The learner sees their prompt for the first time in a later stage,",
    "and the activity assembles it from the four decisions itself. A prompt shown here is stripped out before",
    "the learner reads your reply, so it only costs them an answer.",
    "",
    "When the activity tells you all four decisions are settled, do not ask another question.",
    "Give a short recap naming the four - the job, the boundary, the standard, the rules - and tell",
    "them to continue to the Deploy stage to review the finished prompt."
  ].join("\n");

  /* ==========================================================================
     2. STATE + PERSISTENCE
     ========================================================================== */

  function defaultData() {
    return {
      version: 4,
      problem: "",
      steps: [{ action: "", tools: "" }, { action: "", tools: "" }],
      toolsAll: [],
      // Envision's two answers. Top-level rather than in botAnswers because the
      // learner wrote them; botAnswers is what a coach got out of them.
      idealOutcome: "",
      aiRole: "",
      masterPromptV1: "",
      masterPromptV2: "",
      v2Source: "",          // "bot" | "template" | "user"
      // One transcript per stage, so several chat blocks are separate
      // conversations that still build one shared master prompt.
      conversations: { all: [], identify: [], map: [], envision: [], workflow: [], tools: [],
                       deploy: [], handoff: [], standards: [], guardrails: [] },
      mockProgress:  { all: 0,  identify: 0,  map: 0,  envision: 0,  workflow: 0,  tools: 0,
                       deploy: 0,  handoff: 0,  standards: 0,  guardrails: 0 },
      botAnswers: { handoff: "", output: "", keep: "", context: "", notes: [] },
      // one pushback per question, so a vague learner isn't trapped in a loop
      pushedBack: {},
      /* Which of Refine's four decisions have been accepted. Separate from
         botAnswers because a stored answer and a settled one are different
         states: the first thin attempt is written down while the coach is
         still challenging it. */
      decided: {},
      progress: { current: 1, unlocked: 1, done: {}, entered: {} }
    };
  }

  var workflowData = defaultData();
  var storageOK = true;
  var discarding = false;   // set by "Start over" so the unload flush can't resurrect the data

  function readStored() {
    var raw;
    try { raw = window.localStorage.getItem(CONFIG.storageKey); }
    catch (e) { storageOK = false; return null; }
    if (!raw) return null;
    try {
      var saved = JSON.parse(raw);
      if (!saved || typeof saved !== "object") return null;
      if (saved.version === 2) { saved = migrateV2(saved); migrated = true; }
      if (saved && saved.version === 3) { saved = migrateV3(saved); migrated = true; }
      if (!saved || saved.version !== 4) return null;
      var fresh = defaultData();
      Object.keys(fresh).forEach(function (k) {
        if (saved[k] !== undefined && saved[k] !== null) fresh[k] = saved[k];
      });
      if (!Array.isArray(fresh.steps) || !fresh.steps.length) fresh.steps = defaultData().steps;
      var blank = defaultData();
      if (!fresh.conversations || typeof fresh.conversations !== "object") fresh.conversations = blank.conversations;
      if (!fresh.mockProgress || typeof fresh.mockProgress !== "object") fresh.mockProgress = blank.mockProgress;
      Object.keys(blank.conversations).forEach(function (k) {
        if (!Array.isArray(fresh.conversations[k])) fresh.conversations[k] = [];
        if (typeof fresh.mockProgress[k] !== "number") fresh.mockProgress[k] = 0;
      });
      if (!fresh.botAnswers || typeof fresh.botAnswers !== "object") fresh.botAnswers = blank.botAnswers;
      if (!Array.isArray(fresh.botAnswers.notes)) fresh.botAnswers.notes = [];
      if (!fresh.pushedBack || typeof fresh.pushedBack !== "object") fresh.pushedBack = {};
      if (!fresh.decided || typeof fresh.decided !== "object") fresh.decided = {};
      if (!fresh.progress || typeof fresh.progress !== "object") fresh.progress = defaultData().progress;
      if (!fresh.progress.done || typeof fresh.progress.done !== "object") fresh.progress.done = {};
      // Saves written before the four-state map have no `entered`. Treat what
      // they finished as entered, and leave the rest to be opened normally.
      if (!fresh.progress.entered || typeof fresh.progress.entered !== "object") {
        fresh.progress.entered = {};
        Object.keys(fresh.progress.done).forEach(function (k) {
          if (fresh.progress.done[k]) fresh.progress.entered[k] = true;
        });
      }
      return fresh;
    } catch (e) { return null; }   /* corrupt payload - start clean */
  }

  /* v2 saves were written when stage 2 was a reading and stage 3 was the
     workflow form. Under v3 stage 2 is the form and stage 3 is Envision, so the
     old per-stage ticks mean different things and must not be carried across by
     number. Everything the learner actually wrote is kept; progression is
     re-derived from that work, conservatively.

     Envision cannot have been finished - its two fields did not exist - so the
     journey resumes there, and nothing after it stays ticked. */
  function migrateV2(old) {
    var next = defaultData();

    // Authored work, carried straight over.
    ["problem", "steps", "toolsAll", "masterPromptV1", "masterPromptV2", "v2Source"]
      .forEach(function (k) {
        if (old[k] !== undefined && old[k] !== null) next[k] = old[k];
      });
    if (old.botAnswers && typeof old.botAnswers === "object") {
      Object.keys(next.botAnswers).forEach(function (k) {
        if (old.botAnswers[k] !== undefined && old.botAnswers[k] !== null) {
          next.botAnswers[k] = old.botAnswers[k];
        }
      });
    }
    // Transcripts survive under the keys that still mean the same conversation.
    // "describe" is gone and its stage never had a coach, so there is nothing
    // to bring across from it.
    if (old.conversations && typeof old.conversations === "object") {
      Object.keys(next.conversations).forEach(function (k) {
        if (Array.isArray(old.conversations[k])) next.conversations[k] = old.conversations[k];
      });
    }
    if (old.mockProgress && typeof old.mockProgress === "object") {
      Object.keys(next.mockProgress).forEach(function (k) {
        if (typeof old.mockProgress[k] === "number") next.mockProgress[k] = old.mockProgress[k];
      });
    }
    if (old.pushedBack && typeof old.pushedBack === "object") next.pushedBack = old.pushedBack;

    /* Progression re-derived from the work itself rather than copied. The two
       tests below are the v3 meanings of stages 1 and 2; stageValidFromData is
       used rather than stepValid because this runs before any of it is wired. */
    var done = {};
    var problemOK = String(next.problem || "").trim().length >= CONFIG.minProblemChars;
    var filled = (next.steps || []).filter(function (st) {
      return String(st && st.action || "").trim() && String(st && st.tools || "").trim();
    });
    if (problemOK) done[1] = true;
    if (problemOK && filled.length >= CONFIG.minWorkflowSteps) done[2] = true;

    var resume = done[2] ? 3 : (done[1] ? 2 : 1);
    next.progress = {
      current: resume,
      unlocked: resume,
      done: done,
      entered: Object.keys(done).reduce(function (acc, k) { acc[k] = true; return acc; }, {})
    };
    next.version = 3;
    return next;
  }

  /* v3 saves predate Refine's decision set: they recorded the coach's answers
     but not whether each one had been settled or was still being challenged.

     The evidence for "settled" is the old scripted cursor, not the answer text.
     In v3 a first thin answer wrote botAnswers and set pushedBack, then stopped
     and waited - deliberately, because the coach was still challenging it - and
     only an accepted answer advanced mockProgress. So mockProgress is the count
     of decisions that had really been accepted, and text plus pushedBack is
     exactly the state of someone who closed the browser mid-challenge. Reading
     those as settled would hand them an unlocked Deploy for a question they
     never finished answering.

     The orders below are v3's, which are NOT the order Refine asks in now: the
     full script ran handoff, output, keep, context, and each slice ran its own
     part. They are written down here rather than derived, because they describe
     a shape of save that no longer exists and must not follow the live list
     when that list changes.

     Anything with no cursor evidence stays undecided and gets asked again. That
     costs a learner one answer; the other way round costs them a section of
     their prompt. */
  var V3_ACCEPTED_ORDER = {
    all:        ["handoff", "output", "keep", "context"],
    handoff:    ["handoff"],
    standards:  ["output", "keep"],
    guardrails: ["context"]
  };

  function migrateV3(old) {
    var next = old;
    next.decided = {};
    var seen = (next.mockProgress && typeof next.mockProgress === "object") ? next.mockProgress : {};
    Object.keys(V3_ACCEPTED_ORDER).forEach(function (convo) {
      var accepted = typeof seen[convo] === "number" ? seen[convo] : 0;
      V3_ACCEPTED_ORDER[convo].slice(0, accepted).forEach(function (k) {
        // A cursor past a key it has no answer for is not evidence of anything.
        if (String((next.botAnswers || {})[k] || "").trim()) next.decided[k] = true;
      });
    });
    next.version = 4;
    return next;
  }

  var migrated = false;   // set by readStored() when it upgrades an older payload

  function load() {
    var stored = readStored();
    if (stored) workflowData = stored;
    /* Write the upgrade straight back. Otherwise a learner who opens the page
       and leaves still has a v2 payload, and a sibling block reading storage
       would see the old shape and the old stage meanings. */
    if (migrated) { migrated = false; writeNow(); }
  }

  var saveTimer = null;

  /* Writes are debounced so typing doesn't hit localStorage on every keystroke. */
  function save() {
    if (!storageOK || discarding) return;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(writeNow, 250);
  }

  function writeNow() {
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
    if (!storageOK || discarding) return;
    try {
      var payload = JSON.stringify(mergedForWrite());
      window.localStorage.setItem(CONFIG.storageKey, payload);
      lastSeenRaw = payload;   // don't read our own write back as a sibling's
      flashSaved();
    } catch (e) {
      storageOK = false;
      var node = document.getElementById("bw-saved");
      if (node) node.textContent = "Autosave unavailable in this browser \u2014 finish in one sitting.";
    }
  }

  /* Write this block's own fields on top of whatever is in storage RIGHT NOW.
     A sibling block may have saved since we loaded, and a whole-object write
     would erase its work without a trace. */
  function mergedForWrite() {
    if (CONFIG.blockRole === "all") return workflowData;

    var base = readStored() || defaultData();
    OWNED.forEach(function (k) { base[k] = workflowData[k]; });

    if (STAGE) {   // a chat block writes back its own transcript and its own answers
      base.conversations = base.conversations || defaultData().conversations;
      base.mockProgress = base.mockProgress || defaultData().mockProgress;
      base.botAnswers = base.botAnswers || defaultData().botAnswers;
      base.conversations[STAGE] = workflowData.conversations[STAGE];
      base.mockProgress[STAGE] = workflowData.mockProgress[STAGE];
      base.pushedBack = base.pushedBack || {};
      base.decided = base.decided || {};
      STAGES[STAGE].answers.forEach(function (k) {
        base.botAnswers[k] = workflowData.botAnswers[k];
        if (workflowData.pushedBack[k]) base.pushedBack[k] = true;
        else delete base.pushedBack[k];
        if (workflowData.decided[k]) base.decided[k] = true;
        else delete base.decided[k];
      });

      // These stages have no answer key, so their one flag rides on the stage name.
      if (STAGES[STAGE].owns) {
        if (workflowData.pushedBack[STAGE]) base.pushedBack[STAGE] = true;
        else delete base.pushedBack[STAGE];
      }

      /* The two capture stages share the steps array: one owns what each step
         is, the other owns where it happens. Each writes only its own half so
         re-describing the workflow can't wipe the tools, and vice versa. */
      if (ownsActions()) {
        var priorTools = base.steps || [];
        base.steps = workflowData.steps.map(function (st, i) {
          return { action: st.action, tools: (priorTools[i] || {}).tools || "" };
        });
      }
      if (ownsTools()) {
        var priorActions = base.steps || [];
        base.steps = priorActions.map(function (st, i) {
          return { action: st.action, tools: (workflowData.steps[i] || {}).tools || "" };
        });
        base.toolsAll = workflowData.toolsAll;
      }
    }

    base.progress = base.progress || defaultData().progress;
    base.progress.done = base.progress.done || {};
    base.progress.entered = base.progress.entered || {};
    ownedSteps().forEach(function (n) {
      if (workflowData.progress.entered[n]) base.progress.entered[n] = true;
      if (workflowData.progress.done[n]) base.progress.done[n] = true;
      // A chat block shares its step with the other chats in that step, so it
      // may raise the tick but must never take a sibling's back down.
      else if (!isSplitCoach) delete base.progress.done[n];
    });
    return base;
  }

  var lastSeenRaw = null;

  function currentRaw() {
    try { return window.localStorage.getItem(CONFIG.storageKey); }
    catch (e) { return null; }
  }

  /* Adopt everything this block does NOT own, so a sibling can never overwrite
     what the learner is typing here. */
  function adoptForeignFields(stored) {
    var blank = defaultData();
    Object.keys(blank).forEach(function (k) {
      if (k === "version" || k === "progress" ||
          k === "conversations" || k === "mockProgress" || k === "botAnswers") return;

      // steps is co-owned: take back only the half this block doesn't write.
      if (k === "steps" && (ownsActions() || ownsTools())) {
        var incoming = stored.steps || [];
        workflowData.steps = ownsActions()
          ? workflowData.steps.map(function (st, i) {
              return { action: st.action, tools: (incoming[i] || {}).tools || "" };
            })
          : incoming.map(function (st, i) {
              return { action: st.action, tools: (workflowData.steps[i] || {}).tools || "" };
            });
        return;
      }
      if (k === "toolsAll" && ownsTools()) return;

      if (OWNED.indexOf(k) === -1) workflowData[k] = stored[k];
    });

    // Other blocks' transcripts, and any answer key this block doesn't fill.
    Object.keys(blank.conversations).forEach(function (sk) {
      if (sk === STAGE) return;
      workflowData.conversations[sk] = stored.conversations[sk] || [];
      workflowData.mockProgress[sk] = stored.mockProgress[sk] || 0;
    });
    Object.keys(blank.botAnswers).forEach(function (ak) {
      if (!ownsAnswer(ak)) {
        workflowData.botAnswers[ak] = stored.botAnswers[ak];
        if ((stored.pushedBack || {})[ak]) workflowData.pushedBack[ak] = true;
        else delete workflowData.pushedBack[ak];
        if ((stored.decided || {})[ak]) workflowData.decided[ak] = true;
        else delete workflowData.decided[ak];
      }
    });
    var mine = workflowData.progress.done;
    var theirs = stored.progress.done || {};
    stageNumbers().forEach(function (n) {
      if (ownsStep(n)) return;
      if (theirs[n]) mine[n] = true; else delete mine[n];
    });
  }

  function syncFromStorage() {
    if (discarding) return;
    var raw = currentRaw();
    if (raw === lastSeenRaw) return;      // nothing changed since we last looked
    lastSeenRaw = raw;
    if (!raw) { resetInPlace(); return; } // a sibling pressed Start over
    var stored = readStored();
    if (!stored) return;
    adoptForeignFields(stored);
    recomputeTools();
    adoptExternal();
  }

  /* Keeping a split lesson in step.

     The storage event is the fast path, but it cannot be relied on here. Two
     separate runs on a published Review 360 lesson showed the same thing: the
     upper block recorded events (3, then 2) while the lower block recorded
     zero both times. Upward propagation works; downward is the direction in
     doubt, and downward is exactly how this activity's data flows.

     So the event is treated as a bonus. What actually keeps a split lesson in
     step is the poll, plus a sync the moment the block scrolls into view -
     which is both when the learner arrives at it and when a timer that may
     have been throttled offscreen comes back to life. */
  function wireCrossBlockSync() {
    if (CONFIG.blockRole === "all") return;   // single block: no siblings to track
    if (CONFIG.blockRole === "intro") return;  // framing only; nothing to sync
    lastSeenRaw = currentRaw();

    window.addEventListener("storage", function (e) {
      if (e.key !== CONFIG.storageKey && e.key !== null) return;
      syncFromStorage();
    });

    setInterval(syncFromStorage, CONFIG.syncPollMs);
    window.addEventListener("focus", syncFromStorage);
    window.addEventListener("pageshow", syncFromStorage);
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "visible") syncFromStorage();
    });

    // Catch up the instant the learner scrolls this block into view. Timers in
    // an offscreen frame can be throttled, and a block below the fold is both
    // where that happens and where the learner is heading next.
    if (typeof IntersectionObserver !== "undefined") {
      new IntersectionObserver(function (entries) {
        for (var i = 0; i < entries.length; i++) {
          if (entries[i].isIntersecting) { syncFromStorage(); return; }
        }
      }).observe(el.root);
    }
  }

  /* Every chat unlocks at once, so a later one can write its opening before the
     learner has answered the earlier one - and that opening would then quote
     nothing. While a chat is still untouched, keep its opening current: the
     moment the upstream answer lands, the greeting rewrites to reference it.
     Once the learner has replied, the transcript is history and stays put. */
  function refreshOpening() {
    if (!isSplitCoach) return;
    var list = convo();
    if (list.length !== 1 || list[0].role !== "bot") return;
    var fresh = activeScript().opening();
    if (fresh === list[0].text) return;
    list[0].text = fresh;
    renderChatLog(false);   // a sibling rewrote the opening; not a reason to move anyone
    save();
  }

  function adoptExternal() {
    if (ownsStep(2) && !isCaptureChat) renderCards();
    if (ownsStep(4) || isCaptureChat) { refreshOpening(); renderChatLog(false); }
    render();
    maybeStartConversation();
    if (ownsStep(lastStage())) refreshV2(false);
  }

  /* A debounced write is lost if the learner reloads, navigates, or closes the
     tab in that quarter second. Flush on the way out. */
  function wireSaveFlush() {
    window.addEventListener("pagehide", writeNow);
    window.addEventListener("beforeunload", writeNow);
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "hidden") writeNow();
    });
  }

  var savedTimer = null;
  function flashSaved() {
    var el = document.getElementById("bw-saved");
    if (!el) return;
    el.textContent = "Saved.";
    el.setAttribute("data-idle", "false");
    if (savedTimer) clearTimeout(savedTimer);
    savedTimer = setTimeout(function () {
      el.textContent = "Your work saves automatically in this browser.";
      el.setAttribute("data-idle", "true");
    }, 1600);
  }

  /* ==========================================================================
     3. DERIVED DATA + PROMPT GENERATION
     ========================================================================== */

  /* Split a free-text tools field ("Gmail, Sheets and Drive") into clean names. */
  function parseTools(raw) {
    return String(raw || "")
      .split(/[,;/|]|\band\b|\+|&/i)
      .map(function (t) { return t.trim().replace(/^[-\u2022.\s]+|[.\s]+$/g, ""); })
      .filter(Boolean);
  }

  function recomputeTools() {
    var seen = Object.create(null);
    var out = [];
    workflowData.steps.forEach(function (s) {
      parseTools(s.tools).forEach(function (t) {
        var key = t.toLowerCase();
        if (!seen[key]) { seen[key] = true; out.push(t); }
      });
    });
    workflowData.toolsAll = out;
  }

  /* A step counts once it has an action. Tools are captured separately now, so
     a workflow can be mapped before anyone has said where it happens. */
  function filledSteps() {
    return workflowData.steps.filter(function (s) { return String(s.action).trim(); });
  }

  function toolsCaptured() {
    return workflowData.steps.some(function (s) { return String(s.tools).trim(); }) ||
           workflowData.toolsAll.length > 0;
  }

  /* A row the learner has touched, and a row they have finished. Map's contract
     is "each step with the tool it happens in", so a half-filled row is started
     work rather than mapped work, and the two counts have to match before Map
     is done. Empty rows are neither - the form ships with two of them. */
  function startedSteps() {
    return workflowData.steps.filter(function (s) {
      return String(s.action).trim() || String(s.tools).trim();
    });
  }

  function completeSteps() {
    return workflowData.steps.filter(function (s) {
      return String(s.action).trim() && String(s.tools).trim();
    });
  }

  function stepsAsList() {
    var list = filledSteps();
    if (!list.length) return "(not mapped yet)";
    return list.map(function (s, i) {
      var tools = String(s.tools || "").trim();
      return (i + 1) + ". " + s.action.trim() + (tools ? " \u2014 tools: " + tools : "");
    }).join("\n");
  }

  function toolsAsList() {
    return workflowData.toolsAll.length ? workflowData.toolsAll.join(", ") : "(none listed)";
  }

  /* "a and b", or "a, b, and c" - for naming decisions to a learner without it
     reading like a machine reciting a list. The serial comma is deliberate:
     three of these four labels contain "what", and without it the last two run
     together into one clause. */
  function listPhrase(items) {
    if (items.length <= 1) return items[0] || "";
    if (items.length === 2) return items[0] + " and " + items[1];
    return items.slice(0, -1).join(", ") + ", and " + items[items.length - 1];
  }

  /* ==========================================================================
     CAPTURE BY CONVERSATION
     --------------------------------------------------------------------------
     Two of the chat blocks don't ask an opinion question - they take down the
     workflow itself. People describe a process the way they'd say it out loud:
     one run-on sentence, or a few lines, or a tidy numbered list if they're
     the sort. All three have to end up in the same steps array, because that
     array is what the master prompt is built from. So: parse what they said,
     show the numbered list back, and let them correct it by number.
     ========================================================================== */

  /* "Yes" is rarely just "yes". It's "yep that's right", "looks good to me",
     "no changes". Treat it as agreement only when the WHOLE message is made of
     agreeing words - so "yes, but step 2 is wrong" still gets read as an edit. */
  var AFFIRM_LEAD = /^(y|ye|yes|yep|yeah|yup|correct|right|exactly|perfect|great|good|looks good|sounds good|lgtm|ok|okay|done|confirmed|sure|spot on|no changes?|nothing to change|that'?s (it|right|correct|them|all))\b/i;
  var AFFIRM_REST = /^[\s,.!-]*(?:(?:that'?s?|thats|it|is|are|all|of|them|look|looks|sound|sounds|read|reads|right|correct|good|great|perfect|fine|exactly|accurate|true|to|me|for|i|think|so|yeah|yes|yep|yup|ok|okay|now|nothing|else|no|change|changes|need|needed|and|the|my|list|step|steps|order|too|as|well|spot|on)[\s,.!-]*)*$/i;
  function isConfirm(text) {
    var m = AFFIRM_LEAD.exec(String(text || "").trim());
    return !!m && AFFIRM_REST.test(String(text).trim().slice(m[0].length));
  }

  /* Filler people open a correction with. Stripped before looking for a step
     number so "yes, but step 2 should be..." reads the same as "step 2 is...". */
  var LEAD_FILLER = /^(?:\s*(?:no|nope|yes|yeah|yep|ok|okay|actually|sorry|wait|hold on|hmm|well|um|uh|oh|but|and|also|hey|please|can you|could you|i think|i mean)\b[,'\s]*)+/i;

  /* "step 2 should be draft the summary", "3 = reformat the deck", "fix 1: pull the numbers" */
  var STEP_EDIT = /^(?:change|fix|make|edit|update|replace)?\s*(?:step\s*)?#?(\d{1,2})\s*(?:should\s+(?:be|say|read)|is|to|=|:|\u2014|-)\s*(.+)$/i;

  /* The words people actually use to mean "and after that". */
  var SEQ_SPLIT = /(?:[,;.]\s*)?\b(?:and\s+then|then|after\s+that|after\s+which|afterwards|next|followed\s+by|finally|lastly|from\s+there|once\s+that'?s\s+done)\b[,:]?\s+/gi;

  var MARKER = /^(?:\d{1,2}[.)\]:-]|[-*\u2022])\s+/;

  /* One pass isn't enough: "oh and then I email it" has four of these stacked
     up before the verb the step is actually about. */
  var ACTION_PREFIX = /^(?:and|so|well|ok|okay|um|uh|oh|also|but|then|next|after that|after which|afterwards|before that|before this|beforehand|prior to that|finally|lastly|first|firstly|second|secondly|third|basically|usually|typically|normally|generally|i|i'?d|i'?ll|we|we'?d)\b[,'\s]*/i;

  /* "before that I export the numbers" belongs at the top of the list, not the
     bottom. Cheap to honour, and it's how people actually remember a step. */
  var GOES_FIRST = /^(?:\s*(?:oh|and|but|actually|wait|well)\b[,'\s]*)*(?:before (?:that|this|all that|any of that)|beforehand|prior to (?:that|this)|first(?:ly)? (?:i|though)|to start(?: with)?)\b/i;

  function tidyAction(raw) {
    var t = String(raw || "").replace(/\s+/g, " ").trim();
    var prev;
    do { prev = t; t = t.replace(ACTION_PREFIX, ""); } while (t && t !== prev);
    t = t.replace(/^(?:have to|need to|usually|always)\s+/i, "");
    t = t.replace(/[.,;:\s]+$/, "");
    if (t.length > 240) t = t.slice(0, 240);
    return t ? t.charAt(0).toUpperCase() + t.slice(1) : "";
  }

  function tidyList(list) {
    var out = [];
    list.forEach(function (item) {
      var t = tidyAction(item);
      if (t.length >= 3) out.push(t);
    });
    return out.slice(0, 12);
  }

  /* Prose in, numbered steps out. Tried in order of how sure we can be. */
  function splitIntoActions(text) {
    var raw = String(text || "").replace(/\r/g, "");
    var lines = raw.split("\n").map(function (l) { return l.trim(); }).filter(Boolean);

    // 1. Already a list, one per line - the tidy case, and unambiguous.
    var marked = lines.filter(function (l) { return MARKER.test(l); });
    if (marked.length >= 2) {
      return tidyList(marked.map(function (l) { return l.replace(MARKER, ""); }));
    }

    // 2. Numbered, but typed as one paragraph: "1. pull 2. draft 3. send".
    if (lines.length === 1 && /(?:^|\s)\d{1,2}[.)]\s+\S/.test(raw)) {
      var inline = raw.split(/(?:^|\s)\d{1,2}[.)]\s+/).slice(1);
      if (inline.length >= 2) return tidyList(inline);
    }

    // 3. Several lines, no markers - a line break is a step break.
    if (lines.length >= 2) return tidyList(lines);

    // 4. One line of speech. Split on the sequencing words, then on sentences.
    SEQ_SPLIT.lastIndex = 0;
    var seq = raw.split(SEQ_SPLIT);
    if (tidyList(seq).length >= 2) return tidyList(seq);

    var sentences = raw.split(/[.;]\s+/);
    if (tidyList(sentences).length >= 2) return tidyList(sentences);

    return tidyList([raw]);
  }

  /* "1 Asana, 2 Google Docs" - only when EVERY segment is numbered, so a plain
     list of tool names can never be misread as step numbers. */
  function parseToolPairs(text) {
    var segs = String(text || "").split(/[\n;,]+/).filter(function (s) { return s.trim(); });
    if (!segs.length) return null;
    var pairs = [];
    for (var i = 0; i < segs.length; i++) {
      var m = /^\s*(?:step\s*)?#?(\d{1,2})\s*(?:[.)\]:=\u2014-]\s*|\s+)(?:is\s+|in\s+|on\s+|uses?\s+|via\s+|through\s+)?(.+)$/i.exec(segs[i].trim());
      if (!m) return null;
      var tools = String(m[2]).replace(/[.\s]+$/, "").trim();
      if (!tools) return null;
      pairs.push({ n: parseInt(m[1], 10), tools: tools });
    }
    return pairs;
  }

  /* Indexes into steps[], so trailing blank cards can't shift the numbering. */
  function filledIndexes() {
    var out = [];
    workflowData.steps.forEach(function (s, i) {
      if (String(s.action).trim()) out.push(i);
    });
    return out;
  }

  function setActions(list) {
    var prior = workflowData.steps;
    workflowData.steps = list.map(function (action, i) {
      return { action: action, tools: (prior[i] || {}).tools || "" };
    });
    recomputeTools();
  }

  /* The numbered list as the learner sees it read back. */
  function stepsPlain(withTools) {
    var list = filledSteps();
    if (!list.length) return "(nothing yet)";
    return list.map(function (s, i) {
      var tools = String(s.tools || "").trim();
      return (i + 1) + ". " + s.action + (withTools ? " \u2014 " + (tools || "?") : "");
    }).join("\n");
  }

  function readBack(lead, withTools, tail) {
    return [lead, "", stepsPlain(withTools), "", tail].join("\n");
  }

  var lastCapture = null;

  /* Runs on the learner's message in BOTH modes - a live coach writes better
     replies than the script does, but it can't write into the steps array. */
  function captureFromUser(raw) {
    var text = String(raw || "").trim();
    lastCapture = ownsActions() ? captureActions(text) : captureToolsFrom(text);
    return lastCapture;
  }

  function captureActions(text) {
    var have = filledSteps().length;

    if (have >= CONFIG.minWorkflowSteps && isConfirm(text)) return { kind: "confirm" };

    var edit = STEP_EDIT.exec(text.replace(LEAD_FILLER, ""));
    if (edit && have) {
      var i = parseInt(edit[1], 10) - 1;
      var body = tidyAction(edit[2]);
      var idx = filledIndexes();
      if (body && i >= 0 && i <= idx.length) {
        if (i === idx.length) workflowData.steps.push({ action: body, tools: "" });
        else workflowData.steps[idx[i]].action = body;
        return { kind: "edit" };
      }
    }

    var actions = splitIntoActions(text);
    if (!actions.length) return { kind: "none" };

    // One new step on top of a list already taken down reads as "oh, and then
    // I also..." - appending is what they meant, not starting over.
    if (actions.length === 1 && have) {
      var one = { action: actions[0], tools: "" };
      workflowData.steps = GOES_FIRST.test(text)
        ? [one].concat(filledSteps())
        : filledSteps().concat([one]);
      recomputeTools();
      return { kind: "append" };
    }

    setActions(actions);
    return actions.length < CONFIG.minWorkflowSteps ? { kind: "short" } : { kind: "set" };
  }

  function captureToolsFrom(text) {
    var idx = filledIndexes();
    if (!idx.length) return { kind: "nosteps" };
    if (toolsCaptured() && isConfirm(text)) return { kind: "confirm" };

    var pairs = parseToolPairs(text);
    if (pairs) {
      var hit = 0;
      pairs.forEach(function (p) {
        var target = idx[p.n - 1];
        if (target !== undefined) { workflowData.steps[target].tools = p.tools; hit++; }
      });
      if (hit) {
        recomputeTools();
        return { kind: hit >= idx.length ? "set" : "edit" };
      }
    }

    var tokens = parseTools(text);
    if (!tokens.length) return { kind: "none" };

    if (tokens.length === 1) {
      idx.forEach(function (i) { workflowData.steps[i].tools = tokens[0]; });
      recomputeTools();
      return { kind: "set" };
    }
    if (tokens.length === idx.length) {
      idx.forEach(function (i, k) { workflowData.steps[i].tools = tokens[k]; });
      recomputeTools();
      return { kind: "set" };
    }

    // Counts don't line up, so any pairing would be a guess. Ask once.
    if (!workflowData.pushedBack[sKey()]) {
      workflowData.pushedBack[sKey()] = true;
      return { kind: "mismatch", steps: idx.length, tools: tokens.length };
    }

    // Asked already. Match in the order given, pile the remainder on the last
    // step, and read it back so it can be corrected by number.
    idx.forEach(function (i, k) {
      if (k < tokens.length) workflowData.steps[i].tools = tokens[k];
    });
    if (tokens.length > idx.length) {
      workflowData.steps[idx[idx.length - 1]].tools = tokens.slice(idx.length - 1).join(", ");
    }
    recomputeTools();
    return { kind: "guessed" };
  }

  var CHECK_IT =
    "Look right? If a step is off or missing, tell me the number and what it should say \u2014 " +
    "\"step 2 should be draft the summary\". If it's right, just say so.";

  var ACTION_REPLIES = {
    set:     function () { return readBack("Here's what I've got:", false, CHECK_IT); },
    edit:    function () { return readBack("Updated. The list now reads:", false, CHECK_IT); },
    append:  function () { return readBack("Added. That gives me:", false, CHECK_IT); },
    short:   function () {
      return readBack("So far I've got:", false,
        "That's a start, but one step isn't a workflow. **What happens right before it, and what " +
        "happens right after?** Two minimum \u2014 most tasks like this have four or five.");
    },
    confirm: function () {
      return [
        "Locked in. That numbered list is what everything below is built from.",
        "",
        "Keep reading \u2014 next you'll tell me where each of these steps actually happens."
      ].join("\n");
    },
    none: function () {
      return [
        "I didn't catch any steps in that.",
        "",
        "**Say it as a sequence \u2014 what you do first, then next, then after that.** Rough phrases " +
        "are fine: \"pull the numbers, then draft each update, then reformat the deck\". I'll number " +
        "them and read them back."
      ].join("\n");
    }
  };

  var TOOLS_CHECK =
    "Right? If one's wrong, give me the number and the tool \u2014 \"2 is Excel\". If it's all correct, " +
    "just say so.";

  var TOOL_REPLIES = {
    set:  function () { return readBack("Here's your workflow with the tools in:", true, TOOLS_CHECK); },
    edit: function () { return readBack("Updated:", true, TOOLS_CHECK); },
    guessed: function () {
      return readBack("I've matched them up in the order you gave them:", true,
        "Some of that is a guess. Fix any line by number \u2014 \"3 is Outlook\".");
    },
    mismatch: function (out) {
      return [
        "I've got " + out.steps + " steps and " + out.tools + " tools, so pairing them would be " +
        "guesswork \u2014 and a wrong tool in the prompt is worse than none.",
        "",
        stepsPlain(false),
        "",
        "**Give me one per number** \u2014 \"1 Tableau, 2 Word, 3 PowerPoint\". If it's the same place " +
        "throughout, just name it once."
      ].join("\n");
    },
    confirm: function () {
      return [
        "Good \u2014 that's your workflow and where it lives. Everything below is built on it.",
        "",
        "Keep reading."
      ].join("\n");
    },
    none: function () {
      return [
        "I didn't catch a tool name in that.",
        "",
        "**Name the app, file, or place each step happens in** \u2014 Excel, Outlook, the shared drive, " +
        "a paper form on your desk. \"Nothing, it's in my head\" is a real answer too, and worth " +
        "writing down."
      ].join("\n");
    },
    nosteps: function () {
      return "I don't have your steps yet \u2014 they come from the section above. Map those first and " +
             "I'll pick this back up.";
    }
  };


  /* ---- stage 1: the problem, captured in conversation ----
     Nothing is typed into the lesson any more, so the problem statement comes
     out of the chat. It accumulates rather than being overwritten: the coach
     asks for more detail and the learner's next answer adds to what they said,
     which is what makes the finished prompt specific. */

  function ownsProblem() { return TIMELINE && sMeta().owns === "problem"; }

  var IDENTIFY_PROMPTS = [
    "Who needs the result?",
    "What information goes into it?",
    "Where does the data come from?",
    "What is the biggest pain point right now?"
  ];

  function captureProblem(raw) {
    var text = String(raw || "").trim();
    if (!text) return { kind: "none" };
    var have = String(workflowData.problem).trim();

    if (have && CONFIRMS_OK(text)) return { kind: "confirm" };

    var thin = answerQuality(text).thin;
    if (!have && thin && !workflowData.pushedBack.identify) {
      workflowData.pushedBack.identify = true;
      workflowData.problem = text;
      return { kind: "thin" };
    }
    // Adding to it, not replacing it - the second answer is the detail. The
    // exception is a first answer we already pushed back on: that one was kept
    // only in case they stopped there, and it must not stay glued to the front
    // of the real statement.
    var keep = have && !answerQuality(have).thin;
    workflowData.problem = keep ? have + " " + text : text;
    return { kind: keep ? "more" : "first" };
  }

  function CONFIRMS_OK(t) { return isConfirm(t); }

  function identifyCoachReply() {
    var out = lastCapture || { kind: "none" };
    var problem = String(workflowData.problem).trim();
    if (out.kind === "none") {
      return "I did not catch a task in that.\n\n**Describe the thing you do over and over** " +
             "— what it is, how often, and roughly what it costs you. Rough words are fine.";
    }
    if (out.kind === "thin") {
      return "That is the feeling rather than the task, and I cannot build a prompt from a " +
             "feeling.\n\n**What is the actual thing you do?** Name it, say how often, and say " +
             "roughly how long it takes.";
    }
    if (out.kind === "confirm") {
      return "Good — that is your problem statement, and everything after this is built on " +
             "it.\n\nUse **Save and continue** when you are ready.";
    }
    if (out.kind === "first") {
      return [
        "Good starting point — that is a real, repeatable task.",
        "",
        "**To make it more useful, add a bit more detail.** Any of these:",
        IDENTIFY_PROMPTS.map(function (q) { return "- " + q; }).join("\n")
      ].join("\n");
    }
    return [
      "That is enough to work from. Here is what I have:",
      "",
      "“" + shortQuote(problem, 34) + "”",
      "",
      "If that reads right, use **Save and continue**. If something is off, just tell me and " +
      "I will fold it in."
    ].join("\n");
  }

  function captureCoachReply() {
    var out = lastCapture || { kind: "none" };
    var table = ownsActions() ? ACTION_REPLIES : TOOL_REPLIES;
    return (table[out.kind] || table.none)(out);
  }

  /* ==========================================================================
     ANSWER QUALITY
     --------------------------------------------------------------------------
     Persona testing found the activity would hand a learner who answered
     "just make it good" a prompt that looked exactly as finished as one built
     from real answers. These heuristics give the scripted coach something to
     push back on, and mark what is still thin so the artifact is honest about
     itself. A live coach does this far better - this is the floor, not the
     ceiling.
     ========================================================================== */

  var HEDGE_PREFIX = /^(honestly|probably|i guess|i think|maybe|i mean|kind of|sort of|basically|idk)\b[,\s]+/i;
  var SAYS_NOTHING = /(i don'?t know|i do not know|not really anything|just make it|make it good|make it better|something like that|sounds professional|takes forever|whatever works|not so dry)/i;
  var CONCRETE = /\d|\b(format|paragraph|paragraphs|word|words|sentence|sentences|bullet|bullets|tone|slide|slides|page|pages|email|list|table|column|heading|name|names|number|numbers|date|template|never|always|must|only|no more than|under|exactly|per)\b/i;
  var SWEEPING = /\b(all of it|all of them|everything|the whole thing|the entire|all four|all three|all five|the lot)\b/i;
  var EFFORT_ONLY = /\b(takes forever|eats (an|a|about)|on its own|so long|tedious|annoying|drives me|i hate|painful|a slog)\b/i;

  function answerQuality(text) {
    var t = String(text || "").trim();
    var words = t ? t.split(/\s+/).length : 0;
    var reasons = [];
    if (words < 8) reasons.push("too short");
    if (SAYS_NOTHING.test(t)) reasons.push("says nothing specific");
    if (!CONCRETE.test(t)) reasons.push("no concrete detail");
    return { words: words, reasons: reasons, thin: words < 5 || reasons.length >= 2 };
  }

  /* Sentence split without lookbehind - Safari on older iPads doesn't have it. */
  function sentences(t) {
    var out = [], buf = "";
    for (var i = 0; i < t.length; i++) {
      buf += t.charAt(i);
      if (/[.!?]/.test(t.charAt(i)) && (i + 1 >= t.length || /\s/.test(t.charAt(i + 1)))) {
        out.push(buf.trim()); buf = "";
      }
    }
    if (buf.trim()) out.push(buf.trim());
    return out;
  }

  /* Nudge a conversational reply toward instruction voice: drop the hedge it
     opens with, and drop sentences that only describe how much it costs them -
     true, but not something an AI can act on. */
  function cleanAnswer(text) {
    var t = String(text || "").trim().replace(HEDGE_PREFIX, "");
    var parts = sentences(t);
    var kept = parts.filter(function (x) { return !EFFORT_ONLY.test(x); });
    if (!kept.length) kept = parts;
    t = kept.join(" ").trim();
    return t ? t.charAt(0).toUpperCase() + t.slice(1) : "";
  }

  /* ---------------------- which mapped step an answer is about ----------------------

     Precision over recall. The result feeds the canonical line at the top of Deploy's
     "what I need you to do" - "Take over this step of my workflow: ..." - and that line
     may only appear when the answer points at exactly ONE mapped step. With several, or
     none, or any doubt, there is no match and the learner's own words stand alone. That
     costs nothing: their wording is kept either way. A wrong match tells the assistant to
     do something they did not ask for, in the one document the journey exists to make.

     The matcher this replaced counted raw word overlap and took the highest scorer. It
     named "Draft a four paragraph update for each client" for "Sending each update out
     to the client...", because "update" and "client" are shared by the two neighbouring
     steps and outscored two to one, while "send" - the only word that tells them apart -
     was discarded for being four letters long. It also returned one step for an answer
     about two, silently narrowing it.

     So: normalise words so that pull/pulling, send/sending, update/updates and
     client/client's compare equal; work out which of each step's words are its own (not
     shared with any other step); and accept a wording match only on evidence that points
     at one step alone. */

  var STEP_STOPWORDS = " the and for with from into onto each any all out our your their them " +
    "this that then than its was were are has had have not but you how who what when where " +
    "once also just about over under per via ";

  /* A small deterministic normaliser, applied identically to the answer and to the step,
     so what matters is that both sides agree, not that the stems are good English. */
  function stepStem(w) {
    if (w.length <= 3) return w;
    if (/ies$/.test(w) && w.length > 4) w = w.slice(0, -3) + "y";
    else if (/ing$/.test(w) && w.length > 5) {
      w = w.slice(0, -3);
      if (/([^aeiouls])\1$/.test(w)) w = w.slice(0, -1);       // running -> run, pulling stays pull
    } else if (/ed$/.test(w) && w.length > 4) {
      w = w.slice(0, -2);
      if (/([^aeiouls])\1$/.test(w)) w = w.slice(0, -1);       // preferred -> prefer
    } else if (/es$/.test(w) && w.length > 4) w = w.slice(0, -2);
    else if (/s$/.test(w) && !/ss$/.test(w)) w = w.slice(0, -1);
    if (w.length > 3 && /e$/.test(w)) w = w.slice(0, -1);        // update / updated / updates agree
    return w;
  }

  function stepWords(text) {
    var out = [];
    String(text || "").toLowerCase().replace(/['\u2019]s\b/g, "").split(/[^a-z]+/).forEach(function (w) {
      if (w.length < 3 || STEP_STOPWORDS.indexOf(" " + w + " ") !== -1) return;
      var stem = stepStem(w);
      if (stem.length >= 3 && out.indexOf(stem) === -1) out.push(stem);
    });
    return out;
  }

  function resolveStep(text) {
    var t = String(text || "");
    var list = filledSteps();

    /* An explicit number is authoritative - when there is one. Naming two steps by
       number is the clearest multi-step answer there is, and taking the first would be
       the same narrowing as before with a digit instead of a word. */
    var named = [];
    function note(d) { var n = parseInt(d, 10); if (named.indexOf(n) === -1) named.push(n); }
    var re = /\bsteps?\s*(\d+(?:\s*(?:,|and|&|\+|\/)\s*(?:steps?\s*)?\d+)*)/gi, m;
    while ((m = re.exec(t))) (m[1].match(/\d+/g) || []).forEach(note);
    var lead = t.match(/^\s*(\d+)[.)]/);
    if (lead) note(lead[1]);
    if (named.length > 1) return null;
    if (named.length === 1 && list[named[0] - 1]) return { index: named[0] - 1, step: list[named[0] - 1] };

    /* Wording. Each step's own words are the ones no other step uses. */
    var answer = stepWords(t);
    if (!answer.length) return null;
    var sets = list.map(function (st) { return stepWords(st.action); });
    var found = [];
    sets.forEach(function (set, idx) {
      var own = set.filter(function (w) {
        return sets.every(function (other, j) { return j === idx || other.indexOf(w) === -1; });
      });
      var ownHits = own.filter(function (w) { return answer.indexOf(w) !== -1; }).length;
      var allHits = set.filter(function (w) { return answer.indexOf(w) !== -1; }).length;
      if (ownHits >= 1) found.push({ index: idx, step: list[idx], allHits: allHits });
    });
    // Evidence for two steps means the answer is about two steps: no canonical line.
    if (found.length !== 1) return null;
    // One of a step's own words can be a coincidence; it needs the rest of the action behind it.
    return found[0].allHits >= 2 ? { index: found[0].index, step: found[0].step } : null;
  }

  /* The prompt's six sections, in order, with the stages each one came from.

     Deploy shows this above the artifact so the learner can see their own
     thinking in it rather than taking it on trust. `head` must be exactly what
     generateMasterPromptV2() emits - a map that has drifted from the prompt is
     worse than no map, so a test compares these against the real headings.

     The last row is the one that carries weight: the instruction to stop and
     ask about a vague section lives INSIDE the artifact, not in a reassurance
     on this screen. A learner who doubts it can go and read the sentence. */
  var PROMPT_SECTIONS = [
    { head: "CONTEXT",
      from: "From Identify, Map, and Envision" },
    { head: "WHAT I NEED YOU TO DO",
      from: "From Envision and Refine: What AI handles" },
    { head: "WHAT STAYS WITH ME",
      from: "From Refine: What stays yours" },
    { head: "OUTPUT I EXPECT",
      from: "From Refine: What good looks like" },
    { head: "THINGS YOU NEED TO KNOW",
      from: "From Refine: What AI needs to know, plus anything you added along the way" },
    { head: "HOW TO WORK WITH ME",
      from: "Builder safeguards, plus instructions to stop and ask when any part still needs detail" }
  ];

  var SECTION_LABELS = {
    handoff: "WHAT I NEED YOU TO DO",
    output: "OUTPUT I EXPECT",
    keep: "WHAT STAYS WITH ME",
    context: "THINGS YOU NEED TO KNOW"
  };

  /* Sections that were answered but not usefully. Absent answers already show a
     bracketed placeholder; these are the ones that would otherwise pass as done. */
  function weakSections() {
    var out = [];
    Object.keys(SECTION_LABELS).forEach(function (k) {
      var v = heard(k);
      if (v && answerQuality(v).thin) out.push(SECTION_LABELS[k]);
    });
    return out;
  }

  function markThin(key, text) {
    if (!text) return text;
    return answerQuality(heard(key)).thin
      ? "[NEEDS DETAIL - too vague to act on yet]\n" + text
      : text;
  }

  /* The task section, with the contradiction resolved. A learner who says "all
     of it" and then carves out the judgment call has told us two things that
     cannot both be true; the prompt has to say which wins. */
  function buildTaskLine() {
    var a = heard("handoff");
    if (!a) return "[Name the steps above you want me to take over, and what you want back from each one.]";

    var lines = [];
    var hit = resolveStep(a);
    var cleaned = cleanAnswer(a);
    if (hit) {
      lines.push("Take over this step of my workflow: " + hit.step.action.trim() +
                 " (" + hit.step.tools.trim() + ").");
      // Their own wording is worth keeping only where it says something the step
      // line doesn't. A sentence that opens with a pointer at the step ("Step 4
      // only: ...") loses the pointer but keeps what follows it: that is the
      // learner's wording, and it can carry a constraint the canonical line does
      // not ("... in order"). Dropping the whole sentence discarded it silently.
      // Short sentences that are nothing but a pointer still go.
      var extra = sentences(cleaned).map(function (x) {
        var t = x.trim();
        var lead = t.match(/^step\s*\d+\b\s*(?:only\b)?\s*(?:[:,\u2013\u2014-]\s*)?(.*)$/i);
        if (lead) {
          t = lead[1].replace(/^(?:and|but|so)\s+/i, "").trim();
          if (t) t = t.charAt(0).toUpperCase() + t.slice(1);
        }
        return t;
      }).filter(function (t) {
        return t && !(t.split(/\s+/).length <= 5 && /step\s*\d/i.test(t));
      }).join(" ").trim();
      var novel = extra.split(/\s+/).filter(function (w) {
        var bare = w.toLowerCase().replace(/[^a-z]/g, "");
        return bare.length > 3 && hit.step.action.toLowerCase().indexOf(bare) === -1;
      }).length;
      if (extra && novel >= 3) lines.push("In my words: " + extra);
    } else {
      lines.push(cleaned);
    }

    var keep = heard("keep");
    if (keep && SWEEPING.test(a)) {
      lines.push("");
      lines.push("One explicit exception to that: " + cleanAnswer(keep) +
                 " Do not produce that part at all, and do not guess at it - leave it to me.");
    }
    return lines.join("\n");
  }

  /* ---- V1: auto-generated from Steps 1-2, before the coach conversation ---- */
  function generateMasterPromptV1(data) {
    return [
      "I want to hand part of a repetitive workflow over to you. Here is the whole picture.",
      "",
      "## THE PROBLEM",
      (data.problem || "").trim() || "(not described yet)",
      "",
      "## MY CURRENT WORKFLOW",
      stepsAsList(),
      "",
      "## TOOLS I WORK IN",
      toolsAsList(),
      "",
      "## WHAT I NEED FROM YOU",
      "1. Tell me which of these steps you could take over completely, which we'd share, and which should stay with me.",
      "2. For anything you take over, tell me exactly what I'd need to give you each time \u2014 inputs, context, format.",
      "3. Draft the reusable prompt I would paste to run this workflow every time.",
      "",
      "Ask me anything you need to know before you answer."
    ].join("\n");
  }

  /* ---- V2: assembled from the coach conversation ---- */
  function generateMasterPromptV2(data) {
    var a = data.botAnswers || {};
    var notes = (a.notes || []).filter(Boolean);
    var context = [(a.context || "").trim()].concat(notes).filter(Boolean).join("\n");
    var weak = weakSections();

    /* Envision reaches the artifact transformed, not copied, and not as a
       section of its own. The outcome belongs with the context - it is what the
       work is for - and the role they want AI to play frames the task line. A
       learner should recognise their own thinking here without finding a
       worksheet field pasted into a prompt. */
    var outcome = (data.idealOutcome || "").trim();
    var role = (data.aiRole || "").trim();

    /* Built as a list rather than one expression: the two Envision lines are
       conditional, and a concat chain around them reads worse than this does. */
    var out = [
      "## CONTEXT",
      ((data.problem || "").trim() || "(describe the task here)"),
      "",
      "My current process, end to end:",
      stepsAsList(),
      "",
      "Tools involved: " + toolsAsList() + "."
    ];
    if (outcome) out.push("", "What I am trying to get to: " + outcome);
    out.push("", "## WHAT I NEED YOU TO DO");
    if (role) out.push("In broad terms: " + role, "");
    out.push(
      markThin("handoff", buildTaskLine()),
      "",
      "## WHAT STAYS WITH ME",
      markThin("keep", (a.keep || "").trim()) ||
        "[Name the steps or judgment calls you are keeping. I will leave those alone.]",
      "",
      "## OUTPUT I EXPECT",
      markThin("output", (a.output || "").trim()) ||
        "[Format, length, and tone of a good result. Be specific \u2014 \"short and professional\" is not a spec.]",
      "",
      "## THINGS YOU NEED TO KNOW",
      markThin("context", context) || "[Facts, constraints, and house rules. Say what I must never invent.]",
      "",
      "## HOW TO WORK WITH ME",
      /* One missing-information rule, with a stated order. This used to be two unconditional
         lines - "ask me before you produce anything" and "mark a gap and keep going" - that
         contradicted each other and, worse, competed with whatever the learner had already said
         about missing information (P05's "say insufficient information" rule). The learner's own
         handling for that case comes first; the ask is the fallback when they gave none; and
         "never invent" is unconditional and stands outside the conditional. The missing-information note ([MISSING: ...] is only an example of its wording, not
         required syntax; [NEEDS DETAIL] is the builder's own marker) and
         the permission to continue with unaffected parts belong to the generic fallback only: they sit
         inside the "if I gave none" case, so they never apply when the learner supplied their own
         handling. No attempt is made
         to detect the learner's rule: the prompt carries the precedence and the model applies it. */
      "If information is missing or uncertain, follow any instructions I gave above for that case. " +
        "If I gave none, ask me for the required information before completing the affected part. " +
        "You may continue with unaffected parts; if you show the affected part before I answer, " +
        "clearly say what information is missing, for example [MISSING: what you need]. " +
        "In all cases, never invent facts, names, numbers, or quotes.",
      weak.length
        ? "\nBefore you start, note that I left " + weak.join(" and ") + " too vague to act on. Ask me " +
          "the questions that would pin " + (weak.length > 1 ? "those sections" : "that section") +
          " down, and wait for my answers before producing anything."
        : ""
    );
    return out.join("\n").replace(/\n{3,}/g, "\n\n");
  }

  /* Take any fenced block out of a reply the learner is about to read.

     "No prompt before Deploy" is a product rule, and an instruction in a system
     prompt is a request, not enforcement: a live model can ignore it, and a
     learner would then read their finished prompt two stages early. Refine's
     replies are run through this, so the rule holds whoever is answering. What
     the block contained is not lost - Deploy assembles the prompt from the four
     decisions, which is where it comes from now. */
  function stripPromptBlock(text) {
    var out = String(text || "").replace(fenceRe(), function (block, tag, body) {
      return isPromptBlock(tag, body) ? "" : block;
    });
    out = out.replace(/\n{3,}/g, "\n\n").trim();
    return out || "That's noted.";
  }

  /* A fresh regex each time: it carries /g, and one shared instance would let
     a half-finished scan in one function skip the start of the next. */
  function fenceRe() { return /```[ \t]*([A-Za-z-]*)[ \t]*\r?\n([\s\S]*?)```/g; }

  var promptTag = function (tag) { return (tag || "").toLowerCase().replace(/-/g, ""); };

  /* Does this fenced block hold a master prompt? One definition, because two
     things ask: the parser that lifts a prompt out of a reply, and the filter
     that keeps one off a Refine screen. If they disagreed, a block could be
     shown to a learner and then lifted, or stripped and then missed.

     A tag says so outright. An untagged block has to look like the artifact -
     which is deliberately narrow: a fenced JSON sample, a bit of code, or a
     format example a coach writes while discussing standards is not a prompt
     and has no business disappearing. */
  function isPromptBlock(tag, body) {
    var t = promptTag(tag);
    if (t === "masterprompt" || t === "prompt") return true;
    return !t && /^(##|MASTER PROMPT|CONTEXT\b)/im.test(String(body).trim());
  }

  /* Pull a master prompt out of coach text. Tagged blocks win over untagged. */
  function parseMasterPrompt(text) {
    var re = fenceRe();
    var m, tagged = null, untagged = null;
    while ((m = re.exec(String(text || "")))) {
      var tag = promptTag(m[1]);
      var body = m[2].trim();
      if (!body || !isPromptBlock(m[1], body)) continue;
      if (tag) tagged = body;
      else untagged = body;
    }
    return tagged || untagged || null;
  }

  /* Whichever stage produced a finished block most recently wins; guardrails
     is the stage that closes with one, so it leads. */
  var PROMPT_STAGE_ORDER = ["guardrails", "all", "standards", "handoff"];

  function latestBotPrompt() {
    for (var s = 0; s < PROMPT_STAGE_ORDER.length; s++) {
      var list = workflowData.conversations[PROMPT_STAGE_ORDER[s]] || [];
      for (var i = list.length - 1; i >= 0; i--) {
        if (list[i].role !== "bot") continue;
        var found = parseMasterPrompt(list[i].text);
        if (found) return found;
      }
    }
    return null;
  }

  /* ==========================================================================
     4. BOT ADAPTERS
     --------------------------------------------------------------------------
     Every adapter exposes the same shape:
       { id, live, label, send({ system, context, messages }) -> Promise<string> }
     Swap CONFIG.botEndpoint on and the endpoint adapter takes over. Nothing
     else in the activity changes.
     ========================================================================== */

  var BotAdapters = {

    /* --- Live: your own proxy / serverless function --------------------------
       Sends: { system, context, messages: [{ role: "user"|"assistant", content }] }
       Accepts back any of: { reply } | { message } | { content } | { text }
                          | Anthropic { content: [{ type:"text", text }] }
                          | OpenAI  { choices: [{ message: { content } }] }
       ---------------------------------------------------------------------- */
    endpoint: function (cfg) {
      return {
        id: "endpoint",
        live: true,
        label: "Live coach",
        send: function (payload) {
          var controller = typeof AbortController !== "undefined" ? new AbortController() : null;
          var timer = controller ? setTimeout(function () { controller.abort(); }, cfg.botTimeoutMs) : null;

          var headers = { "Content-Type": "application/json" };
          Object.keys(cfg.botHeaders || {}).forEach(function (k) { headers[k] = cfg.botHeaders[k]; });

          return fetch(cfg.botEndpoint, {
            method: "POST",
            headers: headers,
            body: JSON.stringify({
              system: payload.system,
              context: payload.context,
              messages: payload.messages
            }),
            signal: controller ? controller.signal : undefined
          }).then(function (res) {
            if (!res.ok) {
              return res.text().catch(function () { return ""; }).then(function (body) {
                throw new Error("The coach service returned " + res.status +
                  (body ? " \u2014 " + body.slice(0, 160) : "") + ".");
              });
            }
            return res.json();
          }).then(function (data) {
            var reply = normalizeReply(data);
            if (!reply) throw new Error("The coach service replied in a format this activity doesn't recognize.");
            return reply;
          }).catch(function (err) {
            if (err && err.name === "AbortError") {
              throw new Error("The coach took too long to respond.");
            }
            if (err instanceof TypeError) {
              throw new Error("Couldn't reach the coach service. Check your connection and try again.");
            }
            throw err;
          }).then(function (reply) {
            if (timer) clearTimeout(timer);
            return reply;
          }, function (err) {
            if (timer) clearTimeout(timer);
            throw err;
          });
        }
      };
    },

    /* --- Fallback: built-in scripted coach ---------------------------------
       Walks the same four decisions a live model is asked to walk, using the
       learner's own words, and closes on the same recap. Prompt assembly
       belongs to Deploy, so neither coach shows one. No network.
       ---------------------------------------------------------------------- */
    mock: function () {
      return {
        id: "mock",
        live: false,
        label: "Guided coach",
        send: function (payload) {
          var reply = mockCoachReply(payload.lastUserText);
          var delay = 500 + Math.min(900, reply.length * 3);
          return new Promise(function (resolve) {
            setTimeout(function () { resolve(reply); }, delay);
          });
        }
      };
    }
  };

  function normalizeReply(data) {
    if (typeof data === "string") return data.trim();
    if (!data || typeof data !== "object") return null;
    var direct = data.reply || data.message || data.text || data.completion || data.output;
    if (typeof direct === "string" && direct.trim()) return direct.trim();
    if (direct && typeof direct === "object" && typeof direct.content === "string") return direct.content.trim();
    if (Array.isArray(data.content)) {
      var joined = data.content
        .filter(function (b) { return b && (b.type === "text" || typeof b.text === "string"); })
        .map(function (b) { return b.text || ""; }).join("\n").trim();
      if (joined) return joined;
    }
    if (typeof data.content === "string" && data.content.trim()) return data.content.trim();
    if (Array.isArray(data.choices) && data.choices[0]) {
      var c = data.choices[0];
      var msg = (c.message && c.message.content) || c.text;
      if (typeof msg === "string" && msg.trim()) return msg.trim();
    }
    return null;
  }

  function activeAdapter() {
    return CONFIG.botEndpoint ? BotAdapters.endpoint(CONFIG) : BotAdapters.mock();
  }
  var bot = null;

  /* ==========================================================================
     5. SCRIPTED COACH
     ========================================================================== */

  function shortQuote(text, words) {
    var w = String(text || "").trim().split(/\s+/);
    if (!w[0]) return "";
    var n = words || 12;
    var out = w.slice(0, n).join(" ");
    if (w.length > n) return out.replace(/[.,;:]+$/, "") + "\u2026";
    return out.replace(/[.,;:]+$/, "");   // it may be quoted mid-sentence
  }

  /* Stage 0 is the opening message; it is generated without user input. */
  /* Picks up from the learner's work rather than reading it back to them. The
     problem and the mapped steps are pinned in the cards directly above the
     transcript, so repeating them here made the coach open by reciting a
     worksheet. Excerpts of the vision stay, because nothing else on the screen
     carries it - and they are excerpts because both fields can run to 600
     characters, which would bury the question. The coach still receives all of
     it in full through contextInjection().

     A /role/ slice is the exception: it has no cards, so there the steps are
     read back or the first question has nothing to point at. */
  function mockOpening() {
    var outcome = String(workflowData.idealOutcome).trim();
    var role = String(workflowData.aiRole).trim();
    var out = [];

    if (!TIMELINE) {
      var list = filledSteps().map(function (s, i) {
        return "  " + (i + 1) + ". " + s.action.trim() + "  (" + s.tools.trim() + ")";
      }).join("\n");
      if (list) out.push("Here's the process you mapped:", "", list, "");
    }

    if (outcome) {
      out.push("You've already pictured the version you want: \u201c" + shortQuote(outcome, 24) + "\u201d");
      if (role) out.push("And the role you want AI to play: \u201c" + shortQuote(role, 20) + "\u201d");
      out.push("", "Now let's make that specific.");
    } else {
      out.push("Let's work out where AI fits.");
    }

    return out.concat(["", askFor(REFINE_DECISIONS[0])]).join("\n");
  }

  /* What the coach says when it takes a decision down. The question that
     follows comes from the next entry in REFINE_DECISIONS, so this is only the
     acknowledgement - the order lives in one place and this cannot reorder it. */
  var DECISION_ACK = {
    handoff: function (answer) {
      return "Got it \u2014 I'll treat \u201c" + shortQuote(answer, 16) + "\u201d as the work AI should handle.";
    },
    keep: function (answer) {
      return "Got it \u2014 \u201c" + shortQuote(answer, 14) + "\u201d stays with you. I'll keep that boundary explicit.";
    },
    output: function () {
      return "That gives us a standard the result can actually be checked against.";
    },
    context: function () {
      return "Got it \u2014 those are the rules and context AI needs to work within.";
    }
  };

  /* Said instead of the acknowledgement when an answer is accepted on the
     second pass and is still thin. Praising it would contradict the
     [NEEDS DETAIL] mark it is about to earn. */
  var THIN_ACCEPT =
    "I'll keep that answer, but I'm marking this part as needing more detail so you can spot " +
    "it in Deploy.";

  /* The recap that closes Refine. Deliberately not the prompt: Deploy is the
     first place the learner sees one, and that rule is the product's, not a
     preference of whichever coach happens to be answering. */
  /* Named with the rail's own labels, so the close lands on the four things the
     learner has been watching tick off rather than on four new words for them. */
  function refineRecap() {
    var named = REFINE_DECISIONS.map(function (d) {
      return d.label.charAt(0).toLowerCase() + d.label.slice(1);
    });
    return [
      "You've made all four decisions: " + listPhrase(named) + ".",
      "",
      "Continue to Deploy to review how those decisions come together in your prompt."
    ].join("\n");
  }

  /* The question as it is put: the decision's own wording, plus whatever its
     hint adds from the learner's work. One function, so the scripted coach and
     the live instruction cannot end up asking differently worded questions. */
  function askText(d) {
    var hint = d.hint ? d.hint() : "";
    return d.ask + (hint ? " " + hint : "");
  }

  function askFor(d) { return "**" + askText(d) + "**"; }

  /* ---- the decision state machine, shared by both coaches ----

     This runs on the learner's message, before any reply exists, so the same
     push-once/accept rule governs the scripted coach and a live one. A live
     model phrases, reflects and challenges; it never gets to decide which
     required field was satisfied, because it is not the thing writing them
     down. Without this the live path captured nothing at all, and a coverage
     gate would have trapped a live learner forever. */
  var lastDecision = null;   // what the most recent message did, for the reply

  function captureDecision(text) {
    var d = currentDecision();
    var answer = String(text || "").trim();
    if (!d) { lastDecision = { key: null, action: "extra", answer: answer }; return lastDecision; }

    var thin = answerQuality(answer).thin;
    if (thin && !workflowData.pushedBack[d.key]) {
      // Keep it in case they stop here, but do not call it settled: this is the
      // one push-back, and the decision stays open until they answer again.
      workflowData.pushedBack[d.key] = true;
      workflowData.botAnswers[d.key] = answer;
      lastDecision = { key: d.key, action: "push", thin: true };
      return lastDecision;
    }
    workflowData.botAnswers[d.key] = answer;
    workflowData.decided[d.key] = true;
    lastDecision = { key: d.key, action: "accept", thin: thin, answer: answer };
    return lastDecision;
  }

  /* The scripted coach's reply, read off what the capture just did. */
  function refineReply() {
    var r = lastDecision;
    if (!r) return refineRecap();
    if (r.action === "extra") {
      // Every decision is in. Anything further is a refinement of one of them.
      if (r.answer) workflowData.botAnswers.notes.push(r.answer);
      return "Folded that in: " + shortQuote(r.answer, 16) + "\n\n" + refineRecap();
    }
    if (r.action === "push") return PUSHBACKS[r.key] || PUSHBACKS._default;

    var ack = r.thin
      ? THIN_ACCEPT
      : (DECISION_ACK[r.key] ? DECISION_ACK[r.key](r.answer) : "Noted.");
    var next = currentDecision();
    return next ? ack + "\n\n" + askFor(next) : ack + "\n\n" + refineRecap();
  }

  /* Splitting the coach across blocks means several short conversations rather
     than one long one. Each stage opens on its own topic, captures its own
     answers, and hands off downward. Later stages quote what earlier ones
     captured, so it reads as one coach picking up a new thread rather than
     three strangers asking overlapping questions. */

  function heard(key) {
    return String((workflowData.botAnswers || {})[key] || "").trim();
  }

  /* Folds an afterthought into the context notes. It does not show the prompt:
     the learner sees one for the first time in Deploy, and a coach that printed
     it here would make that rule a suggestion. */
  function foldNote(note, tail) {
    if (note) workflowData.botAnswers.notes.push(note);
    return [
      "Folded that in: " + shortQuote(note, 16),
      "",
      tail
    ].join("\n");
  }

  var SCRIPTS = {
    /* Stage 1. Replies come from identifyCoachReply(); this only has to open. */
    identify: {
      opening: function () {
        return [
          "Let's start with the big picture.",
          "",
          "**What is the task you want to hand off?** Describe it in your own words — what it " +
          "is, how often you do it, and roughly what it costs you. It does not have to be polished.",
          "",
          "*Example: “Every Monday I spend two hours building status updates for eleven " +
          "clients — same numbers, same sentences, different names.”*"
        ].join("\n");
      },
      turns: [],
      extra: function () { return identifyCoachReply(); }
    },

    /* The two capture chats. Their replies come from captureCoachReply(), which
       reads back what the parser actually took down - so all these need is an
       opening that asks the right question. */
    workflow: {
      opening: function () {
        var problem = String(workflowData.problem).trim();
        return [
          "Let's map this out before we touch a prompt.",
          "",
          problem
            ? "You said: \"" + shortQuote(problem, 22) + "\""
            : "You haven't named the task above yet \u2014 do that first and I'll pick it up here.",
          "",
          "**Walk me through how you do it now, start to finish.** Say it however it comes out " +
          "\u2014 \"I pull the numbers, then draft each update, then reformat the deck\" is perfect. " +
          "I'll number the steps and read them back so you can check them."
        ].join("\n");
      },
      turns: [],
      extra: function () { return captureCoachReply(); }
    },

    tools: {
      opening: function () {
        var have = filledSteps().length;
        if (!have) {
          return "I don't have your steps yet \u2014 they come from the section above. Map those " +
                 "first and this picks up on its own.";
        }
        return [
          "Same workflow, one more pass. Here's what you gave me:",
          "",
          stepsPlain(false),
          "",
          "**Where does each of these actually happen?** Name the app, file, or place \u2014 " +
          "\"1 Tableau, 2 Word, 3 PowerPoint\". If it's all in one place, just name it once."
        ].join("\n");
      },
      turns: [],
      extra: function () { return captureCoachReply(); }
    },

    /* Refine. The turn list is empty on purpose: this conversation is driven by
       REFINE_DECISIONS through captureDecision()/refineReply(), so that the
       scripted coach and a live one walk the same four decisions in the same
       order and write the same state. */
    all: { opening: mockOpening, turns: [], decisions: true,
           extra: function () { return refineReply(); } },

    handoff: {
      opening: mockOpening,   // same framing: their problem, their steps, one question
      turns: [{
        capture: "handoff",
        ackParas: 1,
        reply: function (answer) {
          return [
            "Got it \u2014 I'll treat \u201c" + shortQuote(answer, 16) + "\u201d as the work AI should handle.",
            "",
            "This piece is done. Keep reading below: next we pin down what a good result actually " +
            "looks like, because \"do it well\" isn't something you can hand to anyone."
          ].join("\n");
        }
      }],
      extra: function (note) {
        if (note) workflowData.botAnswers.handoff = note;
        return "Updated \u2014 I've got: " + shortQuote(note, 18) +
          "\n\nCarry on below when you're ready.";
      }
    },

    standards: {
      opening: function () {
        var prior = heard("handoff");
        return [
          "Picking up where we left off.",
          "",
          prior
            ? "You told me you'd hand over: \"" + shortQuote(prior, 18) + "\""
            : "You haven't picked a step to hand over yet \u2014 do that in the section above when you " +
              "get a chance, or just tell me here as we go.",
          "",
          "Here's the part most people skip. **Picture the finished result you'd actually be happy " +
          "to use. What does it look like?** Format, length, tone. \"A good summary\" isn't a spec " +
          "\u2014 \"four short paragraphs, no bullets, under 200 words, direct\" is."
        ].join("\n");
      },
      turns: [
        {
          capture: "output",
          ackParas: 1,
          reply: function () {
            return [
              "That gives us a standard the result can actually be checked against.",
              "",
              "**Now draw the line around what stays yours. What should AI not take over \u2014 where " +
              "do you still need your judgment, approval, relationship context, or final say?**"
            ].join("\n");
          }
        },
        {
          capture: "keep",
          ackParas: 1,
          reply: function (answer) {
            return [
              "Got it \u2014 \u201c" + shortQuote(answer, 14) + "\u201d stays with you. I'll keep that " +
              "boundary explicit.",
              "",
              "Two pieces in place. One more below: what this thing needs to know before it can be " +
              "trusted with the job."
            ].join("\n");
          }
        }
      ],
      extra: function (note) {
        if (note) workflowData.botAnswers.notes.push(note);
        return "Noted. Keep going below whenever you're ready.";
      }
    },

    guardrails: {
      opening: function () {
        var keep = heard("keep");
        var tools = workflowData.toolsAll.length
          ? " You work in " + toolsAsList() + " \u2014 say anything about how those are set up that " +
            "a newcomer wouldn't guess."
          : "";
        return [
          "Last piece.",
          "",
          keep
            ? "You're keeping " + shortQuote(keep, 14) + ", so the prompt already knows where your " +
              "hands stay on the wheel."
            : "We haven't settled what stays yours yet \u2014 worth doing in the section above.",
          "",
          "**What would a sharp new hire need to know on day one that isn't obvious from the steps?** " +
          "House rules, naming conventions, where the real numbers live, and above all what this " +
          "thing must never invent." + tools
        ].join("\n");
      },
      turns: [{
        capture: "context",
        ackParas: 1,
        reply: function () {
          return [
            "That's everything \u2014 the job, the boundary, the standard, and the rules.",
            "",
            "Your prompt is assembled from those four in the final section below. Take it there " +
            "to read it, change anything that isn't true, and copy it out."
          ].join("\n");
        }
      }],
      extra: function (note) { return foldNote(note, "Anything else off? Otherwise it's yours, below."); }
    }
  };

  /* One sharper re-ask per question when the first answer is too thin to build
     on. Each names the specific thing that would make the answer usable, rather
     than just saying "be more specific". */
  var PUSHBACKS = {
    handoff:
      "I need one level more specific before I can pin down the handoff.\n\n" +
      "**Which mapped step or steps do you want AI to handle, and what should it hand back " +
      "to you?**",
    output:
      "I need a standard someone could actually check.\n\n" +
      "**What should the result look like \u2014 roughly how long, what format or structure " +
      "should it use, and what tone or quality bar should it meet?**",
    keep:
      "Let's make that boundary concrete.\n\n" +
      "**What part still needs your judgment, approval, or final review \u2014 even if AI " +
      "handles everything around it?**",
    context:
      "Let's turn that into something the prompt can actually enforce.\n\n" +
      "**What would a new person need to know to avoid getting this wrong \u2014 sources of " +
      "truth, naming rules, exceptions, or things AI must never invent?**",
    _default: "Give me a little more to work with \u2014 a specific, not a feeling."
  };


  function activeScript() { return SCRIPTS[sKey()] || SCRIPTS.all; }

  function mockCoachReply(userText) {
    // The capture stages have already written the answer down; the script's
    // only job is to read it back.
    if (isCaptureChat) return captureCoachReply();
    if (ownsProblem()) return identifyCoachReply();

    var script = activeScript();
    /* Refine's answer was taken down by captureDecision() before this ran, so
       the reply is read off that rather than capturing a second time. */
    if (script.decisions) return refineReply();
    var i = workflowData.mockProgress[sKey()] || 0;

    if (i < script.turns.length) {
      var def = script.turns[i];
      var text = String(userText || "").trim();

      // Too thin to build on, and we have not asked twice yet: keep what they
      // said (in case they stop here) but ask again before moving on.
      if (answerQuality(text).thin && !workflowData.pushedBack[def.capture]) {
        workflowData.pushedBack[def.capture] = true;
        workflowData.botAnswers[def.capture] = text;
        return PUSHBACKS[def.capture] || PUSHBACKS._default;
      }

      var stillThin = answerQuality(text).thin;
      workflowData.botAnswers[def.capture] = text;
      workflowData.mockProgress[sKey()] = i + 1;

      var reply = def.reply(userText);
      if (stillThin) {
        // We already asked twice. Take it, but don't pretend it was a good answer -
        // the acknowledgment would contradict the [NEEDS DETAIL] mark it earns.
        var rest = reply.split("\n\n").slice(def.ackParas || 1).join("\n\n");
        reply = "Noted \u2014 I'll write that down as it is. I'm going to mark it as needing detail " +
                "though, so the finished prompt doesn't look more settled than it really is." +
                (rest ? "\n\n" + rest : "");
      }
      return reply;
    }
    return script.extra(String(userText || "").trim());
  }

  /* ==========================================================================
     6. DOM WIRING
     ========================================================================== */

  var $ = function (id) { return document.getElementById(id); };
  var el = {};

  function cacheDom() {
    el.root = $("bw");
    el.steps = Array.prototype.slice.call(document.querySelectorAll(".bw-step"));
    el.problem = $("bw-problem");
    el.problemCount = $("bw-problem-count");
    el.cards = $("bw-cards");
    el.addStep = $("bw-add-step");
    el.promptV1 = $("bw-prompt-v1");
    el.chatLog = $("bw-chat-log");
    el.chatJump = $("bw-chat-jump");
    el.chatInput = $("bw-chat-input");
    el.chatSend = $("bw-chat-send");
    el.chatError = $("bw-chat-error");
    el.chatRestart = $("bw-chat-restart");
    el.chatNote = $("bw-chat-note");
    el.botBadge = $("bw-bot-badge");
    el.promptV2 = $("bw-prompt-v2");
    el.copyFinal = $("bw-copy-final");
    el.regenV2 = $("bw-regen-v2");
    el.copyStatus = $("bw-copy-status");
    el.editFinal = $("bw-edit-final");
    el.v2Detail = $("bw-v2-detail");
    el.v2State = $("bw-v2-state");
    el.provList = $("bw-prov-list");
    el.finish = $("bw-finish");
    el.finishRow = $("bw-finish-row");
    el.finishStatus = $("bw-finish-status");
    el.progressFill = $("bw-progress-fill");
    el.progressLabel = $("bw-progress-label");
    el.reset = $("bw-reset");
    el.prereq2 = $("bw-prereq-2");
    el.prereq3 = $("bw-prereq-3");
    el.prereqDraft = $("bw-prereq-draft");
    el.workflowWrap = $("bw-workflow-wrap");
    el.draftWrap = $("bw-draft-wrap");
    el.prereq4 = $("bw-prereq-4");
    el.prereq5 = $("bw-prereq-5");
    el.chatWrap = $("bw-chat-wrap");
    el.finalWrap = $("bw-final-wrap");
    el.handoff = $("bw-handoff");
    el.stage = $("bw-stage");
    el.landing = $("bw-landing");
    el.map = $("bw-map");
  }

  /* ---- block role ---- */

  /* Hide the steps this block doesn't own and set a sane starting position.
     A no-op in the default single-block "all" role. */
  /* Each chat block is its own topic, so it gets its own heading and framing
     rather than three identical "Sharpen it with the coach" panels. */
  var COACH_COPY = {
    workflow: {
      title: "Walk me through the workflow",
      sub: "Say it out loud; the coach writes it down",
      intro: "No form to fill in \u2014 just describe how you do this today, the way you'd explain " +
             "it to someone covering for you. The coach turns it into a numbered list and reads it " +
             "back so you can fix anything it got wrong.",
      next: "Done \u2014 keep reading below"
    },
    tools: {
      title: "Where does each step happen?",
      sub: "Name the tools, step by step",
      intro: "The coach has your steps from the section above. This pass adds where each one " +
             "happens \u2014 which is what stops the finished prompt from being generic advice.",
      next: "Next: sharpen it with the coach"
    },
    handoff: {
      title: "What should the AI take over?",
      sub: "Pick the step that costs you most",
      intro: "The coach has your problem and your workflow from the section above. One question " +
             "here: which part of this are you actually trying to hand off.",
      next: "Done \u2014 keep reading below"
    },
    standards: {
      title: "What does a good result look like?",
      sub: "Set the bar, and say what stays yours",
      intro: "This is where a generic prompt becomes yours. The coach picks up what you decided " +
             "above and pushes on the two things people leave vague: what \"good\" means, and what " +
             "you are not willing to hand over.",
      next: "Done \u2014 keep reading below"
    },
    guardrails: {
      title: "What must it never get wrong?",
      sub: "House rules, and what it can't invent",
      intro: "Last conversation. Everything you've told the coach so far comes together here, so " +
             "the final prompt has the rules and context it needs.",
      next: "Next: your final prompt"
    }
  };

  function applyRole() {
    if (CONFIG.blockRole === "all") return;

    /* Two of the chats belong to step 2 rather than step 4, so the markup moves
       to them. One chat panel serves every stage; only its home changes. */
    if (isCaptureChat) {
      var panel2 = document.getElementById("bw-panel-2");
      var warn2 = document.getElementById("bw-warn-2");
      var acts2 = document.querySelector("#bw-workflow-wrap .bw-actions");
      panel2.insertBefore(el.chatWrap, warn2);
      panel2.insertBefore(el.chatError, warn2);
      if (acts2) panel2.appendChild(acts2);
      if (el.addStep) el.addStep.hidden = true;
      if (el.workflowWrap) el.workflowWrap.hidden = true;
    }

    /* /role/artifact previews the whole Deploy experience except finishing a
       journey it is not part of. */
    if (el.finishRow) el.finishRow.hidden = true;

    var stepNo = ROLE.steps.length ? ROLE.steps[0] : 4;
    var copy = COACH_COPY[STAGE];
    if (copy) {
      var head = document.getElementById("bw-head-" + stepNo);
      var titleNode = head.querySelector(".bw-h2");
      var subNode = head.querySelector(".bw-step-sub");
      var introNode = document.querySelector("#bw-panel-" + stepNo + " .bw-step-intro");
      if (titleNode) titleNode.textContent = copy.title;
      if (subNode) subNode.textContent = copy.sub;
      if (introNode) introNode.textContent = copy.intro;
      // The middle chats hand off to the next chat, not to the final prompt.
      var nextBtn = document.querySelector('[data-next="' + stepNo + '"]');
      if (nextBtn && copy.next) nextBtn.textContent = copy.next;
    }

    /* The retired draft screen has no step to be hidden or shown with, so its
       preview reveals the container directly. Nothing else can reach it: it is
       hidden in the markup and lives outside the step list. */
    if (CONFIG.blockRole === "draft" && el.draftWrap) el.draftWrap.hidden = false;

    var hero = document.querySelector(".bw-hero");
    if (hero && !ROLE.intro) hero.hidden = true;

    // The intro block is framing only: no steps, no progress, nothing to save.
    // Tested by name, not by step count - the retired draft preview also
    // renders no steps, and it very much does hold state.
    if (CONFIG.blockRole === "intro") {
      [".bw-steps", ".bw-progress", ".bw-foot"].forEach(function (sel) {
        var node = document.querySelector(sel);
        if (node) node.hidden = true;
      });
      if (el.handoff) el.handoff.hidden = true;
      return;
    }
    el.steps.forEach(function (node, i) {
      if (!ownsStep(i + 1)) node.hidden = true;
    });

    if (CONFIG.blockRole === "capture") {
      // Return a coming-back learner to the first step they haven't finished.
      var last = ROLE.steps[ROLE.steps.length - 1];
      var u = 1;
      while (u < last && workflowData.progress.done[u]) u++;
      workflowData.progress.unlocked = u;
      workflowData.progress.current = u;
    } else {
      // Single-step blocks are never "locked"; they gate on the capture block
      // being filled in instead, which applyPrereqState handles.
      workflowData.progress.unlocked = lastStage();
      workflowData.progress.current = ROLE.steps[0] || 1;
    }
  }

  /* A coach or artifact block has nothing to work with until the capture block
     above it is filled in. This re-runs on every storage event, so the block
     unlocks itself the moment the learner finishes the section above. */
  var isSplitCoach = !!STAGE && STAGE !== "all";

  /* A block that renders one step of a split lesson has nothing to work with
     until the blocks above it are filled in. Each one waits on what it actually
     needs, and re-checks on every storage sync - so it opens itself the moment
     the section above is done. */
  var GATES = {
    workflow: { step: 2, hide: "workflowWrap", notice: "prereq2",
                needs: function () { return stepValid(1); },
                msg: "Name the task in the section above first \u2014 the workflow map builds on what " +
                     "you write there. This opens on its own once you've done that." },
    draft:    { step: 0, hide: "draftWrap", notice: "prereqDraft",
                needs: function () { return stepValid(1) && stepValid(2); },
                msg: "Your draft prompt is written from the two sections above. Fill those in and it " +
                     "appears here." },
    artifact: { step: 5, hide: "finalWrap", notice: "prereq5",
                needs: function () { return stepValid(1) && stepValid(2); },
                msg: "Your master prompt builds itself from the sections above. Finish those and it " +
                     "appears here." }
  };
  if (isCaptureChat) {
    // These two chats live in step 2, and each waits on the one before it.
    GATES[CONFIG.blockRole] = ownsActions()
      ? { step: 2, hide: "chatWrap", notice: "prereq2",
          needs: function () { return stepValid(1); },
          msg: "Name the task in the section above first \u2014 the coach maps the workflow around " +
               "it. This opens on its own once you've done that." }
      : { step: 2, hide: "chatWrap", notice: "prereq2",
          needs: function () { return filledSteps().length >= CONFIG.minWorkflowSteps; },
          msg: "Walk the coach through your steps in the section above first \u2014 this one asks " +
               "where each of them happens. It opens on its own once they're down." };
  } else if (isSplitCoach) {
    GATES[CONFIG.blockRole] = {
      step: 4, hide: "chatWrap", notice: "prereq4",
      needs: function () { return stepValid(1) && stepValid(2); },
      msg: "Map your workflow in the sections above first \u2014 the coach needs your problem and your " +
           "steps before it can ask anything useful. This opens on its own once you've done that."
    };
  }
  var GATE = GATES[CONFIG.blockRole] || null;
  var isGated = !!GATE;

  function prereqMet() {
    return GATE ? GATE.needs() : true;
  }

  function applyPrereqState() {
    if (!GATE) return;
    var ready = prereqMet();

    // A gated block must not claim things it doesn't have yet: drop the step's
    // own intro copy and stop the chip reading "In progress".
    var intro = document.querySelector("#bw-panel-" + GATE.step + " .bw-step-intro");
    if (intro) intro.hidden = !ready;
    var chip = document.querySelector('.bw-step[data-step="' + GATE.step + '"] [data-chip]');
    if (chip && !ready) chip.textContent = "Waiting";

    var notice = el[GATE.notice];
    if (notice) {
      notice.textContent = ready ? "" : GATE.msg;
      notice.hidden = ready;
    }
    var body = el[GATE.hide];
    if (body) body.hidden = !ready;

    var next = document.querySelector('[data-next="' + GATE.step + '"]');
    if (next) next.disabled = !ready;
  }

  /* ---- validation ---- */

  function userTurns() {
    return convo().filter(function (m) { return m.role === "user"; }).length;
  }

  function turnsNeeded() {
    // In the timeline the open stage decides, because one chat serves them all.
    if (TIMELINE) return sMeta().minTurns || CONFIG.minChatTurns;
    if (!STAGE || STAGE === "all") return CONFIG.minChatTurns;
    return sMeta().minTurns;
  }

  /* Envision's two answers are held to the same bar the coach holds its own
     answers to: not a length, but whether there is anything in there to act on.
     answerQuality() already decides that, so this reuses it rather than
     inventing a second standard. */
  function visionOK(field) {
    var t = String(workflowData[field] || "").trim();
    return !!t && !answerQuality(t).thin;
  }

  function stepValid(n) {
    switch (n) {
      case 1: return String(workflowData.problem).trim().length >= CONFIG.minProblemChars;
      /* Map is done when the rows say what the copy promises: at least
         minWorkflowSteps of them, each carrying both the action and the tool it
         happens in, and nothing left half-written. A looser rule let two actions
         with one tool between them pass, which contradicted the warning the
         learner is shown and disagreed with what migrateV2() counts as mapped.
         The capture-chat slice that takes down actions alone is the exception:
         its sibling slice is what asks where each one happens. */
      case 2: return ownsActions()
                     ? filledSteps().length >= CONFIG.minWorkflowSteps
                     : completeSteps().length >= CONFIG.minWorkflowSteps &&
                       completeSteps().length === startedSteps().length;
      // Envision needs both answers, and needs them to say something. The same
      // thin-answer heuristic the coach uses decides "says something", so a
      // learner is not held to an arbitrary character count.
      case 3: return visionOK("idealOutcome") && visionOK("aiRole");
      /* Refine is done when all four decisions have been accepted, not when
         enough messages have been sent. A turn count let a learner take the
         handoff with two of the four sections never asked about, and Deploy
         then opened on a prompt with whole sections in brackets. Coverage is
         the promise; the thin-answer rule is what keeps it from becoming a
         demand for perfect answers. A slice runs one of the older split
         scripts and owns only part of the set, so it keeps the turn count. */
      case 4: return refineGoverned() ? refineComplete() : userTurns() >= turnsNeeded();
      default: return true;
    }
  }

  function warningFor(n) {
    switch (n) {
      case 1:
        return String(workflowData.problem).trim()
          ? "Give it a little more \u2014 what the task is, how often, and what it costs you. About a sentence and a half."
          : "Describe the task before moving on. Rough words are fine.";
      case 2:
        if (ownsActions())
          return "Walk the coach through at least " + CONFIG.minWorkflowSteps +
            " steps first \u2014 everything below is built from that list.";
        if (ownsTools())
          return "Tell the coach where these steps happen before moving on.";
        /* Two complaints, because there are two ways to be short: not enough
           mapped steps, or a row started and left half-written. Saying "at
           least two" to someone who already has three would read as nonsense. */
        if (completeSteps().length >= CONFIG.minWorkflowSteps)
          return "One of your steps is missing its other half — give every step both " +
            "the action and the tool it happens in, or remove the row.";
        return "Fill in at least " + CONFIG.minWorkflowSteps +
          " steps, each with both the action and the tool you do it in.";
      case 3:
        if (!visionOK("idealOutcome"))
          return "Describe what would actually be better about the finished workflow \u2014 " +
                 "what changes for you when it works the way you want.";
        return "Describe the role you want AI to play in getting you there. The level of " +
               "\"draft the routine parts\" is enough; the details come next.";
      case 4:
        /* Name what is actually missing. Under a turn count "answer two more
           questions" was true; under coverage it would be nonsense to someone
           who has answered ten and still has a decision open. */
        if (refineGoverned()) {
          var left = undecidedDecisions().map(function (d) { return d.label.toLowerCase(); });
          if (!left.length) return "";
          return "Still to settle with the coach: " + listPhrase(left) + ". " +
            "Those four decisions are what make the final prompt yours rather than generic.";
        }
        return turnsNeeded() === 1
          ? "Answer the coach's question first \u2014 that answer is what makes the final prompt yours."
          : "Answer at least " + turnsNeeded() + " of the coach's questions first \u2014 that " +
            "conversation is what makes the final prompt yours.";
      default: return "";
    }
  }

  function showWarning(n, msg) {
    var box = $("bw-warn-" + n);
    if (!box) return;
    if (!msg) { box.hidden = true; box.textContent = ""; return; }
    box.textContent = msg;
    box.hidden = false;
  }

  /* ---- accordion ---- */

  /* Opening a stage lands on its lesson, unless the learner is coming back to
     something they already made.

     The first time through, a stage is its reading and then its work, and the
     reading is the instruction. Reopening is a different errand: someone returning
     to a stage they have completed wants the thing they created or decided there -
     the conversation, the workflow, the vision, the prompt - not the same lesson
     again on the way to it. So a completed stage opens on its work, in every stage:
     a coach stage on its conversation (which is what picking one back up has always
     meant), and Map, Envision and Deploy on their populated panel. The journey's
     own closing line is "Open Deploy to copy your master prompt again", and that
     used to land on Deploy's reading.

     "Completed" is the stage's own state, so a stage whose answer has since gone
     (self-correction un-ticks it) is a first run again and reads first. This is only
     about what a revisit lands on: the reading is not removed, and nothing new is
     offered for getting back to it. */
  function startPhaseFor(n) {
    if (!TIMELINE) return;
    // Entering a stage starts its reading again. The render that got us here
    // ran against the page we left on, so the workspace is repainted after the
    // reset rather than before it - otherwise a stage whose panel was showing
    // keeps showing it instead of going back to page one.
    lessonPage = 0;
    // ...unless it is completed: then the page past the last one is the panel.
    if (workflowData.progress.done[n] && !stageHasCoach(n) && stageHasWork(n)) {
      lessonPage = lessonPages(n).length;
    }
    // One chat serves every stage, so the transcript has to be repainted from
    // whichever conversation the open stage owns before it goes on screen.
    renderChatLog(true);
    var convoLen = (workflowData.conversations[STAGE_CONVO[n]] || []).length;
    setPhase(stageHasCoach(n) && convoLen > 1 ? "chat" : "lesson");
    renderStageContext();
  }

  function openStep(n, scroll) {
    if (n > workflowData.progress.unlocked) return;
    var moving = TIMELINE && view === "stage" && workflowData.progress.current !== n;
    workflowData.progress.current = n;
    // Opening a stage is what makes it "in progress" rather than merely open.
    workflowData.progress.entered[n] = true;
    render();
    // Continuing from one stage to the next happens inside the workspace: the
    // map is home, not a turnstile between every stage.
    if (moving) startPhaseFor(n);
    if (moving && !motionOff()) {
      window.gsap.fromTo(el.stage.querySelector('.bw-step[data-state="active"]'),
        { opacity: 0, y: 12 },
        { opacity: 1, y: 0, duration: .34, ease: "power2.out", clearProps: "all" });
    }
    if (scroll !== false) {
      // One stage is on screen at a time, so the top of the workspace is the
      // thing worth scrolling to, not the card itself.
      var node = TIMELINE ? el.stage : el.steps[n - 1];
      if (node && node.scrollIntoView) {
        node.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
      }
    }
    if (TIMELINE ? stageHasCoach(n) : (n === 4 || (n === 2 && isCaptureChat))) maybeStartConversation();
    if (n === lastStage()) refreshV2(false);
  }

  function prefersReducedMotion() {
    return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function goNext(n) {
    if (!stepValid(n)) { showWarning(n, warningFor(n)); return; }
    showWarning(n, "");
    workflowData.progress.done[n] = true;
    workflowData.progress.unlocked = Math.max(workflowData.progress.unlocked, Math.min(lastStage(), n + 1));
    save();
    var next = Math.min(lastStage(), n + 1);
    if (!ownsStep(next)) {   // the next step lives in a different Rise block
      el.handoff.textContent = "Saved. Keep going in the next section of this lesson.";
      el.handoff.hidden = false;
      render();
      return;
    }
    openStep(next);
  }

  /* ---- render ---- */

  function render() {
    /* The stages a learner can still edit after finishing them, and so the ones
       that can stop being true: the problem (via the coach), the workflow form,
       and Envision's two fields. Stage 4 is a transcript and stage 5 is the
       artifact; neither can be un-answered. */
    [1, 2, 3].forEach(function (n) {
      if (workflowData.progress.done[n] && !stepValid(n)) workflowData.progress.done[n] = false;
    });

    var current = workflowData.progress.current;

    el.steps.forEach(function (node, i) {
      var n = i + 1;
      var locked = n > workflowData.progress.unlocked;
      var state = locked ? "locked" : (n === current ? "active" : "idle");
      node.setAttribute("data-state", state);
      node.setAttribute("data-done", workflowData.progress.done[n] ? "true" : "false");

      var head = node.querySelector(".bw-step-head");
      var panel = node.querySelector(".bw-step-panel");
      var chip = node.querySelector("[data-chip]");
      head.disabled = locked;
      head.setAttribute("aria-expanded", state === "active" ? "true" : "false");
      panel.hidden = state !== "active";
      chip.textContent = locked ? "Locked"
        : workflowData.progress.done[n] ? "Done"
        : state === "active" ? "In progress" : "Ready";
    });

    renderAdminBar();   // no-op unless ?admin=1
    var doneCount = stageNumbers().filter(function (n) { return workflowData.progress.done[n]; }).length;
    el.progressFill.style.width = (doneCount / stageCount() * 100) + "%";
    el.progressLabel.textContent = doneCount === stageCount() ? "Complete"
      : (ROLE.label || "Step " + current + " of " + stageCount());

    applyPrereqState();
    renderMap();
    renderMiniBar();
    renderStageContext();

    renderPromptV1();
  }

  function renderPromptV1() {
    workflowData.masterPromptV1 = generateMasterPromptV1(workflowData);
    el.promptV1.textContent = workflowData.masterPromptV1;
  }

  /* ---- step 1 ---- */

  function wireStep1() {
    el.problem.value = workflowData.problem;
    updateProblemCount();
    el.problem.addEventListener("input", function () {
      workflowData.problem = el.problem.value;
      updateProblemCount();
      if (stepValid(1)) showWarning(1, "");
      renderPromptV1();
      save();
    });
    el.problem.addEventListener("blur", render);
  }

  function updateProblemCount() {
    var len = el.problem.value.trim().length;
    // "0 / 40 characters" reads as a cap. It is a floor: enough to describe the
    // task, because everything downstream is built from this sentence.
    el.problemCount.textContent = len < CONFIG.minProblemChars
      ? (CONFIG.minProblemChars - len) + " more characters before you can continue"
      : len + " characters";
  }

  /* ---- the workflow form: step 3 since the reorder ---- */

  function renderCards() {
    el.cards.textContent = "";
    workflowData.steps.forEach(function (step, i) {
      el.cards.appendChild(buildCard(step, i));
    });
  }

  function buildCard(step, index) {
    var card = document.createElement("div");
    card.className = "bw-card";

    var num = document.createElement("div");
    num.className = "bw-card-num";
    num.textContent = String(index + 1);
    card.appendChild(num);

    card.appendChild(buildCardField({
      cls: "bw-card-action",
      label: "What you do",
      placeholder: "Pull last week's delivery numbers",
      value: step.action,
      onInput: function (v) { step.action = v; onCardsChanged(); }
    }));

    card.appendChild(buildCardField({
      cls: "bw-card-tools",
      label: "Where you do it",
      placeholder: "Asana, Harvest",
      value: step.tools,
      onInput: function (v) { step.tools = v; onCardsChanged(); }
    }));

    var remove = document.createElement("button");
    remove.type = "button";
    remove.className = "bw-card-remove";
    remove.setAttribute("aria-label", "Remove step " + (index + 1));
    remove.title = "Remove this step";
    remove.textContent = "\u00d7";
    remove.disabled = workflowData.steps.length <= CONFIG.minWorkflowSteps;
    remove.addEventListener("click", function () {
      workflowData.steps.splice(index, 1);
      renderCards();
      onCardsChanged();
    });
    card.appendChild(remove);

    return card;
  }

  function buildCardField(opts) {
    var wrap = document.createElement("label");
    wrap.className = "bw-field " + opts.cls;
    var lab = document.createElement("span");
    lab.className = "bw-label";
    lab.textContent = opts.label;
    var input = document.createElement("input");
    input.type = "text";
    input.placeholder = opts.placeholder;
    input.value = opts.value || "";
    input.maxLength = 240;
    input.addEventListener("input", function () { opts.onInput(input.value); });
    wrap.appendChild(lab);
    wrap.appendChild(input);
    return wrap;
  }

  function onCardsChanged() {
    recomputeTools();
    if (stepValid(2)) showWarning(2, "");
    renderPromptV1();
    save();
  }

  /* Named for the step it used to be. The form it wires is step 3 now; the
     name is left alone because renaming it is a refactor and the journey is
     still being decided. Trust the number in the marker above, not the name. */
  /* ---- step 3: Envision ---- */

  /* The summary is the learner's own two sentences, set as text. Nothing is
     generated, nothing is asked of a model, and no prompt appears - Deploy is
     still the first time they see one. */
  function renderVision() {
    var box = document.getElementById("bw-vision-summary");
    if (!box) return;
    var outcome = String(workflowData.idealOutcome || "").trim();
    var role = String(workflowData.aiRole || "").trim();
    var ready = visionOK("idealOutcome") && visionOK("aiRole");
    box.hidden = !ready;
    if (!ready) return;
    setText("bw-vision-outcome", outcome);
    setText("bw-vision-role", role);
  }

  function wireVisionField(id, field) {
    var node = document.getElementById(id);
    if (!node) return;
    node.value = workflowData[field] || "";
    autosize(node);
    node.addEventListener("input", function () {
      workflowData[field] = node.value;
      autosize(node);
      if (stepValid(3)) showWarning(3, "");
      renderVision();
      render();
      save();
    });
  }

  function wireStep3() {
    wireVisionField("bw-ideal-outcome", "idealOutcome");
    wireVisionField("bw-ai-role", "aiRole");
    renderVision();
  }

  function wireStep2() {
    renderCards();
    recomputeTools();
    el.addStep.addEventListener("click", function () {
      workflowData.steps.push({ action: "", tools: "" });
      renderCards();
      save();
      var inputs = el.cards.querySelectorAll("input");
      if (inputs.length) inputs[inputs.length - 2].focus();
    });
  }

  /* ---- step 4: the coach conversation ---- */

  var chatPending = false;
  var lastFailedSend = null;

  function contextInjection() {
    return [
      "Here's their workflow.",
      "",
      "Problem: " + (String(workflowData.problem).trim() || "(not stated)"),
      "",
      "Current workflow:",
      stepsAsList(),
      "",
      "Tools they use: " + toolsAsList(),
      "",
      /* They have already decided what better looks like. Refine's job is to
         make that executable, not to invent a future state of its own. */
      "The outcome they want: " +
        (String(workflowData.idealOutcome).trim() || "(not stated)"),
      "The role they want AI to play: " +
        (String(workflowData.aiRole).trim() || "(not stated)"),
      "",
      "Work from their stated outcome and AI role. Do not propose a different vision - " +
      "help them turn that one into specifics: what AI actually takes over, what stays " +
      "theirs, what a good result looks like, and what it needs to know."
    ].concat(coachingState()).join("\n");
  }

  /* What the application has decided, handed to a live coach every turn.

     This is how the app stays the thing that owns the progression: the model is
     told which decision is open and whether this one has already been pushed
     back on, rather than being trusted to keep four topics and the app's state
     in step by itself. It rides inside the context payload, so the endpoint's
     wire contract is unchanged. */
  function coachingState() {
    if (!refineGoverned()) return [];
    var settled = REFINE_DECISIONS.filter(function (d) { return decided(d.key); });
    var current = currentDecision();
    var out = ["", "--- where this conversation is up to ---"];
    out.push(settled.length
      ? "Settled so far: " + settled.map(function (d) { return d.label; }).join("; ") + "."
      : "Nothing is settled yet.");
    if (!current) {
      out.push("All four decisions are settled. Do not ask another question: give a short recap and " +
        "send them on to the Deploy stage.");
      return out;
    }
    out.push("Current decision: " + current.label.toUpperCase() + ".");
    out.push("Ask about this and nothing else. The question to put to them is: " + askText(current));
    if (workflowData.pushedBack[current.key]) {
      out.push("You have already pushed back once on this one. Take their next answer as it stands, " +
        "say you are marking it as needing detail if it is still vague, and move on.");
    }
    return out;
  }

  /* Wire format includes a hidden priming turn; it is never shown in the log. */
  function wireMessages() {
    var msgs = [{
      role: "user",
      content: contextInjection() + "\n\nStart by asking me your first question."
    }];
    convo().forEach(function (m) {
      msgs.push({ role: m.role === "bot" ? "assistant" : "user", content: m.text });
    });
    return msgs;
  }

  function appendMessage(role, text, persist, follow) {
    var msg = { role: role, text: text, at: timeLabel() };
    if (persist !== false) convo().push(msg);
    /* The learner's own message always goes to the bottom - they just sent it.
       The coach's only follows if they are still there, and that is read now
       rather than when Send was pressed, because scrolling up to reread while
       the coach works is exactly the case this is for. Sampled BEFORE the node
       goes in: appending is what makes the log taller, so asked afterwards this
       would report every learner as scrolled away.

       A caller that has already mutated the log takes the decision itself and
       passes it - see appendReply(), where sampling here would be too late. */
    if (follow === undefined) follow = role === "user" || chatPinned();
    var node = buildMessage(msg);
    el.chatLog.appendChild(node);
    if (follow) {
      scrollChat();
      if (role === "bot") anchorTallReply(node);
    }
    else if (role === "bot") showNewReply(true);
    return node;
  }

  /* A reply that is followed to the bottom is meant to be read from its first line,
     and a reply can be taller than the transcript. On a 360x640 phone they are
     305-491px against a transcript of 236-338px even with every bit of chrome
     folded away, so following the bottom leaves the beginning above the fold - and
     there is no layout that fixes that, there is simply not the height.

     So this looks at what actually happened rather than at the device: if, once
     followed, the beginning of the new reply is above the visible transcript, the
     transcript goes to the beginning of it instead. A reply that fits is untouched.
     Only a learner who was following gets here, so nobody who scrolled away is moved,
     and "New reply" stays hidden: they are already being taken to the new content.

     The learner then reads as no longer at the bottom, which is true - they are at
     the top of a long reply. Nothing pretends otherwise: there is no hidden "still
     following" state, no further coach turn happens until they act, and sending
     re-pins them as it always does.

     Plain scrollTop arithmetic, not scrollIntoView with options, which older Safari
     does not take. */
  /* Arriving at a conversation: the newest turn, by the same rule. The opening is
     appended while the learner is still on the stage's work page, when the panel is
     hidden and the log has no height to measure, so it is here, once the panel is on
     screen, that "is its beginning in view?" can actually be asked. */
  function followNewest() {
    scrollChat();
    var last = el.chatLog.lastElementChild;
    if (last && last.className.indexOf("bw-msg-bot") !== -1 && !last.hasAttribute("data-typing")) {
      anchorTallReply(last);
    }
  }

  function anchorTallReply(node) {
    var log = el.chatLog;
    var viewTop = log.getBoundingClientRect().top;
    var nodeTop = node.getBoundingClientRect().top;
    if (nodeTop >= viewTop - 1) return;                       // its beginning is in view
    var pad = parseFloat(window.getComputedStyle(log).paddingTop) || 0;
    log.scrollTop += nodeTop - (viewTop + pad);               // beginning at the top edge, inside the padding
  }

  /* Static, trusted markup - no message content goes through innerHTML. */
  /* The coach's face. Embedded as a data URI so a Rise block stays a single
     self-contained file - the CSP on an embed blocks external images anyway. */
  var AVATAR_SRC = "data:image/png;base64,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";

  function botAvatar() {
    var img = document.createElement("img");
    img.className = "bw-avatar";
    img.src = AVATAR_SRC;
    img.alt = "";
    img.setAttribute("aria-hidden", "true");
    return img;
  }

  var SPARKLE_SVG =
    '<svg viewBox="0 0 12 12" fill="currentColor" aria-hidden="true" focusable="false">' +
      '<path d="M6 0l1.15 3.35L10.5 4.5 7.15 5.65 6 9 4.85 5.65 1.5 4.5l3.35-1.15z"></path></svg>';
  var SEND_SVG =
    '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2.2" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' +
      '<path d="M10 16.2V4.4"></path><path d="M4.6 9.8L10 4.4l5.4 5.4"></path></svg>';

  function timeLabel() {
    try { return new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }); }
    catch (e) { return ""; }
  }

  function buildMessage(msg) {
    var wrap = document.createElement("div");
    wrap.className = "bw-msg bw-msg-" + msg.role;

    if (msg.role === "bot") wrap.appendChild(botAvatar());

    var col = document.createElement("div");
    col.className = "bw-msg-col";

    // Kept for screen readers - the avatar and the side carry it visually.
    var who = document.createElement("span");
    who.className = "bw-msg-who bw-sr";
    who.textContent = msg.role === "bot" ? "Coach said" : "You said";
    col.appendChild(who);

    var body = document.createElement("div");
    body.className = "bw-msg-body";
    renderRich(body, msg.text);
    col.appendChild(body);

    if (msg.at) {
      var t = document.createElement("span");
      t.className = "bw-msg-time";
      t.textContent = msg.at;
      col.appendChild(t);
    }

    wrap.appendChild(col);
    return wrap;
  }

  /* Minimal renderer: ```fenced``` blocks become <pre>, **bold** becomes <strong>.
     Everything goes in via textContent, so bot output can never inject markup. */
  function renderRich(container, text) {
    container.textContent = "";
    var parts = String(text || "").split("```");
    parts.forEach(function (part, i) {
      if (i % 2 === 1) {
        var pre = document.createElement("pre");
        pre.textContent = part.replace(/^[A-Za-z-]*[ \t]*\r?\n/, "").replace(/\s+$/, "");
        container.appendChild(pre);
      } else {
        var trimmed = i === 0 ? part.replace(/\s+$/, "") : part.replace(/^\r?\n/, "").replace(/\s+$/, "");
        if (trimmed) appendInline(container, trimmed);
      }
    });
  }

  function appendInline(container, text) {
    var re = /\*\*([^*]+)\*\*/g, last = 0, m;
    while ((m = re.exec(text))) {
      if (m.index > last) container.appendChild(document.createTextNode(text.slice(last, m.index)));
      var strong = document.createElement("strong");
      strong.textContent = m[1];
      container.appendChild(strong);
      last = re.lastIndex;
    }
    if (last < text.length) container.appendChild(document.createTextNode(text.slice(last)));
  }

  /* ---------------------- following the conversation ----------------------

     The transcript used to be pinned to the bottom unconditionally, which meant
     a learner who sent an answer and then scrolled up to reread what they had
     said got yanked back down the moment the coach's reply landed - twice a
     turn, counting the typing indicator, and six screens' worth on a phone.

     Pin state is positional and nothing else: within a tolerance of the bottom
     the transcript follows, past it the learner is reading and keeps their
     place. Scrolling back down pins again on its own. There is no mode, no
     preference and no stored state, because the scroll position IS the state.

     The tolerance exists because "at the bottom" is rarely exactly zero -
     fractional layout and browser zoom both leave a pixel or two behind, and at
     a threshold of zero that silently unpins someone who never scrolled. */
  var CHAT_PIN_SLACK = 32;

  function chatPinned() {
    var l = el.chatLog;
    if (!l) return true;
    return l.scrollHeight - l.scrollTop - l.clientHeight <= CHAT_PIN_SLACK;
  }

  /* Go to the newest turn and stay there. For the things the learner did on
     purpose: sending, opening the conversation, restarting it. Being at the
     bottom is the same statement as "nothing is waiting", so this is also what
     clears the jump control - every deliberate return to the bottom clears it
     without each caller having to remember to. */
  function scrollChat() {
    el.chatLog.scrollTop = el.chatLog.scrollHeight;
    showNewReply(false);
  }

  /* A reply resolving is two changes to the log, not one: the typing indicator
     comes out and the reply goes in. The indicator plus its gap is 46px, which is
     wider than the pin tolerance, so removing it shrinks the log past a learner
     parked just outside that tolerance and scrollTop is clamped to the new bottom.
     Ask after that and they read as pinned - a position the coach created, on the
     strength of which the reply then follows the bottom. So the decision is taken
     here, before any of it, and passed in rather than re-read.

     Putting the position back has to wait until the reply is in: between the two
     changes the log is shorter than their offset, so there is nothing to restore
     it to. That is also why this cannot be solved inside showTyping().

     That last line is doing real work only where the engine does not. Chromium
     currently restores the position through its own scroll anchoring once the
     reply lands (traced: 499 -> 493 on removal, back to 499 on append), which
     makes the line unobservable in the Chromium test harness - the tests pin the
     decision instead, which is the part that moved the learner a whole screen.
     The older Safari versions this activity targets provide no scroll anchoring,
     so there the clamp stands and this is what puts the learner back. */
  function appendReply(text) {
    var follow = chatPinned();
    var keepTop = el.chatLog.scrollTop;
    setChatBusy(false);                        // takes the indicator out
    appendMessage("bot", text, true, follow);  // decision already taken, not re-read
    if (!follow) el.chatLog.scrollTop = keepTop;
  }

  function showNewReply(on) {
    if (!el.chatJump) return;
    if (on) { el.chatJump.hidden = false; return; }
    /* Hiding the control while it holds focus would drop the tab position onto
       the body. The transcript is the right place to land: it is where the reply
       is, and unlike the composer it does not raise a phone keyboard as a side
       effect of reading. */
    if (el.chatJump === document.activeElement && el.chatLog.focus) {
      try { el.chatLog.focus({ preventScroll: true }); } catch (e) { el.chatLog.focus(); }
    }
    el.chatJump.hidden = true;
  }

  function showTyping(on) {
    var existing = el.chatLog.querySelector("[data-typing]");
    if (existing) existing.remove();
    if (!on) return;
    var wrap = document.createElement("div");
    wrap.className = "bw-msg bw-msg-bot";
    wrap.setAttribute("data-typing", "true");
    var av = botAvatar();
    var col = document.createElement("div");
    col.className = "bw-msg-col";
    var body = document.createElement("div");
    body.className = "bw-msg-body bw-typing";
    body.setAttribute("aria-label", "Coach is typing");
    for (var i = 0; i < 3; i++) body.appendChild(document.createElement("i"));
    col.appendChild(body);
    wrap.appendChild(av);
    wrap.appendChild(col);
    /* The indicator follows the pin but never raises the jump control: there is
       nothing to jump to yet, and the composer goes disabled in the same breath,
       which already says the coach is working wherever the learner is reading. */
    var follow = chatPinned();
    el.chatLog.appendChild(wrap);
    if (follow) scrollChat();
  }

  function setChatBusy(busy) {
    chatPending = busy;
    el.chatSend.disabled = busy;
    el.chatInput.disabled = busy;
    showTyping(busy);
  }

  function showChatError(msg, retryFn) {
    el.chatError.textContent = "";
    if (!msg) { el.chatError.hidden = true; lastFailedSend = null; return; }
    var text = document.createElement("span");
    text.textContent = msg;
    el.chatError.appendChild(text);
    if (retryFn) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "bw-btn bw-btn-ghost";
      btn.textContent = "Try again";
      btn.addEventListener("click", function () { showChatError(""); retryFn(); });
      el.chatError.appendChild(btn);
    }
    el.chatError.hidden = false;
  }

  function askBot(lastUserText, onDone) {
    setChatBusy(true);
    showChatError("");
    bot.send({
      system: BOT_SYSTEM_PROMPT,
      context: contextInjection(),
      messages: wireMessages(),
      lastUserText: lastUserText
    }).then(function (reply) {
      /* Refine must not show a prompt, whoever wrote the reply. The scripted
         coach no longer emits one; this is what makes that true of a live one
         as well. */
      appendReply(refineGoverned() && activeScript().decisions
        ? stripPromptBlock(reply) : reply);
      if (workflowData.v2Source !== "user") refreshV2(false);
      if (phase === "chat") { renderCoachRail(); renderCoachCards(); }
      if (isCaptureChat) render();
      if (stepValid(4)) showWarning(4, "");
      save();
      if (onDone) onDone();
    }).catch(function (err) {
      setChatBusy(false);
      var msg = (err && err.message) || "Something went wrong reaching the coach.";
      if (bot.live) {
        msg += " You can retry, or keep going \u2014 Step 5 will build your prompt from what you've said so far.";
      }
      showChatError(msg, function () { askBot(lastUserText, onDone); });
    });
  }

  /* Only the block that owns step 4 opens a conversation, only once the
     capture block has given it something to work with, and in single-block
     mode only when the learner has actually reached step 4. */
  function maybeStartConversation() {
    if (!STAGE) return;
    // The timeline opens a conversation for whichever coaching stage is open;
    // a single-block slice only ever has the one its role names.
    if (TIMELINE) {
      if (!stageHasCoach(workflowData.progress.current)) return;
      startConversation();
      return;
    }
    if (!isCaptureChat && !ownsStep(4)) return;
    if (CONFIG.blockRole === "all" && workflowData.progress.current !== 4) return;
    if (!prereqMet()) return;
    startConversation();
  }

  function startConversation() {
    if (convo().length) return;   // already under way
    if (chatPending) return;
    if (!bot.live) {
      // Scripted coach opens without a round trip, but keep the same beat.
      var opened = sKey();
      setChatBusy(true);
      setTimeout(function () {
        setChatBusy(false);
        // They may have left for another stage while this was pending; the
        // opening belongs to the conversation that asked for it, not to
        // whichever one is on screen now.
        if (sKey() !== opened) return;
        appendMessage("bot", activeScript().opening());
        save();
      }, 550);
      return;
    }
    askBot(null);
  }

  function sendChat() {
    if (chatPending) return;
    var text = el.chatInput.value.trim();
    if (!text) return;
    el.chatInput.value = "";
    autosize(el.chatInput);
    if (isCaptureChat) {
      // Do this before the reply comes back: a live coach writes better words
      // than the script does, but it can't write into the steps array.
      captureFromUser(text);
      renderPromptV1();
      if (stepValid(2)) showWarning(2, "");
    }
    if (ownsProblem()) {
      lastCapture = captureProblem(text);
      if (el.problem) el.problem.value = workflowData.problem;
      updateProblemCount();
      renderPromptV1();
      render();
    }
    /* Refine's four decisions are written down here, before any coach replies,
       so a live model and the scripted one produce the same state. Do it before
       the round trip for the same reason the capture chats do: a live coach
       writes better words than the script, but it cannot be the thing that
       decides which required field was satisfied. */
    if (refineGoverned() && activeScript().decisions) {
      captureDecision(text);
      render();
      if (stepValid(4)) showWarning(4, "");
    }
    appendMessage("user", text);
    if (phase === "chat") { renderCoachRail(); renderCoachCards(); }
    /* Sending is one deliberate return to the bottom, and processing it is what
       changes the geometry: the context cards above and below the transcript can
       appear or grow, which shrinks the viewport with no scroll event. Left alone,
       that reads as the learner having scrolled away - and the coach's reply,
       which can be the very summary they are being asked to confirm, then lands
       out of sight behind a "New reply" pill. So the bottom is re-established
       once those changes have settled, before the request starts. This is the
       learner's own action finishing; the coach's later changes to the layout are
       deliberately not given the same power. */
    scrollChat();
    save();
    askBot(text);
  }

  /* A repaint has no opinion of its own about where the learner should be
     looking, so the caller says. Arriving at a conversation, or restarting one,
     means the bottom; a repaint that merely catches up with a sibling block must
     leave the learner where they were - otherwise the same yank survives in the
     split deployment, which is the one place that path is live. */
  function renderChatLog(force) {
    /* A passive repaint has nothing to add while this block has a turn in flight,
       and a good deal to lose: the typing indicator is not part of the
       conversation, so a repaint rebuilt from it deletes the indicator as
       collateral - and with it the log's height, which clamps scrollTop and hands
       appendReply() a pin position the learner never chose. The invariant is that
       a passive repaint must not destroy transient in-flight UI, so it is stated
       here, where the destruction would happen, rather than at each caller.
       Nothing is lost by skipping: the reply's own append repaints what matters,
       and the forced callers (entry, Restart, admin seed, Start over) still run. */
    if (!force && chatPending) return;
    var keep = el.chatLog.scrollTop;
    el.chatLog.textContent = "";
    convo().forEach(function (m) {
      el.chatLog.appendChild(buildMessage(m));
    });
    if (force) scrollChat();
    else el.chatLog.scrollTop = keep;   // clamped by the browser if it no longer fits
  }

  function autosize(node) {
    node.style.height = "auto";
    node.style.height = Math.min(140, node.scrollHeight) + "px";
  }

  function wireStep4() {
    bot = activeAdapter();
    el.botBadge.innerHTML = SPARKLE_SVG;
    el.botBadge.appendChild(document.createTextNode(bot.live ? "AI learning assistant" : "Guided coach"));
    el.chatSend.innerHTML = SEND_SVG;
    if (el.chatNote) {
      el.chatNote.innerHTML = SPARKLE_SVG;
      el.chatNote.appendChild(document.createTextNode("AI can make mistakes. Check important info."));
    }
    el.botBadge.className = "bw-badge " + (bot.live ? "bw-badge-live" : "bw-badge-mock");
    el.botBadge.title = bot.live
      ? "Connected to your configured coach endpoint."
      : "Running the built-in scripted coach \u2014 no network required.";

    renderChatLog(true);   // arriving at the conversation: show me the newest turn

    el.chatSend.addEventListener("click", sendChat);
    el.chatInput.addEventListener("input", function () { autosize(el.chatInput); });
    el.chatInput.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChat(); }
    });
    /* Scrolling back down is how you re-pin, so it is also how the control goes
       away. Nothing is remembered between events - the position is re-read each
       time, which is what keeps this from becoming a mode. */
    el.chatLog.addEventListener("scroll", function () {
      if (chatPinned()) showNewReply(false);
    });
    if (el.chatJump) el.chatJump.addEventListener("click", scrollChat);
    wireConfirm(el.chatRestart, "Press again to clear it", restartConversation);
  }

  /* One restart, however it is reached - the coach header has its own button. */
  function restartConversation() {
    {
      var key = sKey();
      workflowData.conversations[key] = [];
      workflowData.mockProgress[key] = 0;
      delete workflowData.pushedBack[key];
      // Only the answers this conversation is responsible for; others stay put.
      var blankAnswers = defaultData().botAnswers;
      /* Clear the decisions this conversation took down, and the record of
         having already pushed back on them - otherwise a restarted Refine would
         still read as covered, and a thin answer the second time round would be
         accepted without ever being challenged. (pushedBack is keyed by answer
         for these, which is why deleting the conversation's own key above is
         not enough.) */
      sMeta().answers.forEach(function (k) {
        workflowData.botAnswers[k] = blankAnswers[k];
        delete workflowData.pushedBack[k];
        delete workflowData.decided[k];
      });
      /* Restarting Refine is the learner throwing away the four decisions that
         made Deploy valid, so Deploy goes back behind them. Clearing `decided`
         alone was not enough: render() re-validates stages 1 to 3, so a stage 4
         that had already been ticked kept its tick and Deploy stayed unlocked -
         a way back to a finished prompt with none of the work behind it still
         standing. Scoped to this deliberate act; editing an earlier stage's
         work behaves as it did. */
      if (refineGoverned() && activeScript().decisions) {
        var n = workflowData.progress.current;
        delete workflowData.progress.done[n];
        if (workflowData.progress.unlocked > n) workflowData.progress.unlocked = n;
      }
      if (ownsProblem()) {
        // This conversation is how the problem statement got written, so
        // clearing it has to clear what it took down - otherwise the coach
        // asks for the task again while the old answer quietly survives.
        workflowData.problem = "";
        lastCapture = null;
        if (el.problem) el.problem.value = "";
        updateProblemCount();
        renderPromptV1();
        render();
      }
      if (isCaptureChat) {
        // Clear only the half this block took down; the other stage keeps its own.
        workflowData.steps = workflowData.steps.map(function (st) {
          return ownsActions() ? { action: "", tools: st.tools } : { action: st.action, tools: "" };
        });
        recomputeTools();
        delete workflowData.pushedBack[STAGE];
        lastCapture = null;
        renderPromptV1();
      }
      if (workflowData.v2Source !== "user") { workflowData.masterPromptV2 = ""; workflowData.v2Source = ""; }
      showChatError("");
      renderChatLog(true);
      if (phase === "chat") { renderCoachRail(); renderCoachCards(); }
      save();
      startConversation();
    }
  }

  /* ---- step 5: the deliverable ---- */

  function computeV2() {
    var fromBot = latestBotPrompt();
    if (fromBot) return { text: fromBot, source: "bot" };
    return { text: generateMasterPromptV2(workflowData), source: "template" };
  }

  function refreshV2(force) {
    if (!force && workflowData.v2Source === "user") { paintV2(); return; }
    var result = computeV2();
    workflowData.masterPromptV2 = result.text;
    workflowData.v2Source = result.source;
    paintV2();
    save();
  }

  /* Has the learner taken the pen? Once they have, the upstream answers are no
     longer authoritative about this text and nothing here may grade it. */
  function userOwnsPrompt() { return workflowData.v2Source === "user"; }

  var NEEDS_DETAIL_RE = /\[NEEDS DETAIL/;

  function renderProvenance() {
    if (!el.provList) return;
    el.provList.textContent = "";
    PROMPT_SECTIONS.forEach(function (sec) {
      var dt = el2("dt", "bw-prov-name", sec.head);
      var dd = el2("dd", "bw-prov-from", sec.from);
      el.provList.appendChild(dt);
      el.provList.appendChild(dd);
    });
  }

  /* Two independent notices, because they answer different questions and a
     learner needs both. This used to be one slot that returned early on the
     first, so anyone with a vague section was told what was wrong and never
     told where the thing came from. Provenance is now the map above; this is
     only "what still needs attention". */
  function paintDetailNotice() {
    if (!el.v2Detail) return;
    var lead, body;

    if (userOwnsPrompt()) {
      /* They have edited it. weakSections() reads botAnswers, which editing
         never touches, so it is stale in both directions from here on - it
         would insist a section is vague after they fixed it, and miss one they
         made vague. The only honest signal left is what the text itself still
         says. If they delete a marker without adding detail, that stands: they
         took the pen, and the application does not understand their prose well
         enough to grade it. */
      if (!NEEDS_DETAIL_RE.test(String(workflowData.masterPromptV2 || ""))) {
        el.v2Detail.hidden = true;
        return;
      }
      lead = "This edited prompt still has parts marked [NEEDS DETAIL].";
      body = "You can fill them in now or leave them in place \u2014 the assistant will be told " +
        "to ask before acting on those gaps.";
    } else {
      var weak = weakSections();
      if (!weak.length) { el.v2Detail.hidden = true; return; }
      /* Agrees in number: the locked copy was written for the plural case, and
         "One part still needs detail... you can tighten them" reads as a bug. */
      var many = weak.length > 1;
      lead = many ? "A few parts still need detail." : "One part still needs detail.";
      body = listPhrase(weak) + (many ? " are" : " is") + " still vague. You can tighten " +
        (many ? "them" : "it") + " here or use the prompt as-is \u2014 it already tells the " +
        "assistant to stop and ask you before acting on " + (many ? "those gaps" : "that gap") + ".";
    }

    /* .bw-notice is a flex row, so the lead and the body go in as one child -
       two children would sit side by side in columns. */
    el.v2Detail.textContent = "";
    var box = el2("div", "bw-notice-body");
    box.appendChild(el2("strong", "bw-notice-lead", lead));
    box.appendChild(document.createTextNode(body));
    el.v2Detail.appendChild(box);
    el.v2Detail.hidden = false;
  }

  /* Three states, and the middle one is the point of the change: entering edit
     mode is explicit and visible, and costs nothing until they actually change
     something. Rebuild only appears once there are edits to lose - before that
     there is nothing to rebuild from. */
  function paintEditState() {
    if (!el.v2State) return;
    if (userOwnsPrompt()) {
      el.v2State.textContent = "You're editing this copy directly. Rebuilding from your " +
        "decisions will replace these edits.";
      el.v2State.hidden = false;
      if (el.regenV2) el.regenV2.hidden = false;
      if (el.editFinal) el.editFinal.hidden = true;
      return;
    }
    if (editing) {
      el.v2State.textContent = "Editing is on. Your generated version is unchanged until you " +
        "make an edit.";
      el.v2State.hidden = false;
      if (el.editFinal) el.editFinal.hidden = true;
    } else {
      el.v2State.hidden = true;
      if (el.editFinal) el.editFinal.hidden = false;
    }
    if (el.regenV2) el.regenV2.hidden = true;
  }

  /* Read-only until they ask for the pen. */
  var editing = false;
  var editBaseline = null;   // the generated text they opted in against

  function paintV2() {
    if (el.promptV2.value !== workflowData.masterPromptV2) {
      el.promptV2.value = workflowData.masterPromptV2;
    }
    el.promptV2.readOnly = !(editing || userOwnsPrompt());
    renderProvenance();
    paintDetailNotice();
    paintEditState();
    paintFinish();
  }

  /* Survives a reload: a learner who finished and came back should not be
     offered the button they already pressed. */
  function paintFinish() {
    if (!el.finish) return;
    var done = !!workflowData.progress.done[lastStage()];
    el.finish.disabled = done;
    el.finish.textContent = done ? "Journey complete" : "Finish journey";
    if (el.finishStatus && !done) el.finishStatus.textContent = "";
  }

  function wireStep5() {
    el.promptV2.addEventListener("input", function () {
      workflowData.masterPromptV2 = el.promptV2.value;
      /* Ownership transfers on the first divergence from the generated text,
         not on the click that enabled the field: someone who opens edit mode to
         read more closely and changes nothing has not taken anything over, and
         Rebuild should not have become destructive for them. It is a one-way
         latch - undoing back to the generated wording does not hand the pen
         back, because Rebuild's meaning flickering as they type would be worse
         than it staying honest. */
      if (!userOwnsPrompt() && editBaseline !== null && el.promptV2.value !== editBaseline) {
        workflowData.v2Source = "user";
      }
      paintDetailNotice();
      paintEditState();
      save();
    });

    if (el.editFinal) {
      el.editFinal.addEventListener("click", function () {
        editing = true;
        editBaseline = workflowData.masterPromptV2;
        el.promptV2.readOnly = false;
        paintEditState();
        el.promptV2.focus();
      });
    }

    // Only worth confirming when there are edits of their own to lose.
    wireConfirm(el.regenV2, "Press again to replace your edits", function () {
      refreshV2(true);
      editing = false;
      editBaseline = null;
      paintV2();
    }, function () { return userOwnsPrompt(); });

    el.copyFinal.addEventListener("click", function () {
      copyText(workflowData.masterPromptV2, function (ok) {
        if (!ok) { el.promptV2.focus(); el.promptV2.select(); }   // leave it ready for Ctrl+C
        el.copyStatus.textContent = ok
          ? "Copied \u2014 now paste it into your assistant."
          : "Couldn't copy automatically \u2014 the text is selected, press Ctrl+C (Cmd+C on a Mac).";
        setTimeout(function () { el.copyStatus.textContent = ""; }, 4000);
      });
    });

    /* Finishing is a learning state, not a clipboard event. It used to be set
       by a successful copy, which meant a learner who copied with Ctrl+C - the
       fallback this very handler tells them to use - ended the activity at four
       of five stations. Ungated on purpose: Refine was the assessment, Deploy
       is review and use, and this is the learner saying they are done. */
    if (el.finish) {
      el.finish.addEventListener("click", function () {
        workflowData.progress.done[lastStage()] = true;
        save();
        render();
        el.finish.disabled = true;
        el.finish.textContent = "Journey complete";
        if (el.finishStatus) {
          el.finishStatus.textContent = "Every stage is marked complete. Your work stays saved here.";
        }
      });
    }
  }

  /* ---- confirmation without modals ---- */

  /* A sandboxed iframe can have window.confirm disabled, and a silently ignored
     "Start over" just reads as a broken button. Confirm on the button instead:
     a second press within six seconds commits, anything else reverts. */
  function wireConfirm(btn, prompt, onYes, needed) {
    var original = btn.textContent;
    var timer = null;

    function revert() {
      btn.textContent = original;
      btn.classList.remove("bw-btn-danger");
      btn.removeAttribute("data-confirming");
      if (timer) { clearTimeout(timer); timer = null; }
    }

    btn.addEventListener("click", function () {
      if (needed && !needed()) { onYes(); return; }
      if (btn.getAttribute("data-confirming") === "true") { revert(); onYes(); return; }
      btn.setAttribute("data-confirming", "true");
      btn.textContent = prompt;
      btn.classList.add("bw-btn-danger");
      timer = setTimeout(revert, 6000);
    });
  }

  /* ---- clipboard ---- */

  /* Order matters inside a Rise iframe. execCommand runs synchronously inside
     the click's user-activation window and works in frames that were never
     granted clipboard-write; the async API is often not granted there, and by
     the time its promise rejects the activation can be gone. Reliable first. */
  function copyText(text, done) {
    if (!text) { done(false); return; }
    if (legacyCopy(text)) { done(true); return; }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { done(true); }, function () { done(false); });
      return;
    }
    done(false);
  }

  function legacyCopy(text) {
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.top = "-1000px";
    document.body.appendChild(ta);
    ta.select();
    var ok = false;
    try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
    document.body.removeChild(ta);
    return ok;
  }


  /* ==========================================================================
     8. JOURNEY MAP
     --------------------------------------------------------------------------
     The home screen. Five stations on a spine; clicking an available one enters
     that stage's workspace, which is the same step panel the accordion used to
     expand. Nothing below reads or writes learner data - it renders
     workflowData.progress and calls openStep(), exactly as the accordion header
     did, so the state engine never learns that the navigation changed.

     Art direction lives in css/timeline.css and in ART below. Both can be
     replaced outright without touching the interaction system.
     ========================================================================== */

  var TIMELINE = CONFIG.blockRole === "all";

  /* Three views: the landing they read, the map that is home, and the stage
     they work in. Kept outside workflowData - where someone is looking is not
     learner data, and the state engine has no business knowing about it. */
  var view = "landing";
  var STARTED_KEY = "bw_started";

  function hasStarted() {
    try { return window.localStorage.getItem(STARTED_KEY) === "1"; }
    catch (e) { return false; }
  }
  function markStarted(on) {
    try {
      if (on) window.localStorage.setItem(STARTED_KEY, "1");
      else window.localStorage.removeItem(STARTED_KEY);
    } catch (e) { /* private mode; they just see the landing again */ }
  }

  /* Placeholder marks, one per stage. Stroked in currentColor so the stage
     identity colour and the state treatment both come from CSS. */
  var ART = {
    identify: '<circle cx="11" cy="11" r="6.5"/><path d="M15.8 15.8 21 21"/>',
    map: '<circle cx="5" cy="6" r="2"/><circle cx="19" cy="18" r="2"/><path d="M7 6h5a3 3 0 0 1 0 6h-2a3 3 0 0 0 0 6h7"/>',
    envision: '<path d="M9.5 18h5M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5.9 1.2.9 1.9v.2h5.2v-.2c0-.7.3-1.4.9-1.9A6 6 0 0 0 12 3Z"/>',
    refine: '<path d="M4 8h10M18 8h2M4 16h4M12 16h8"/><circle cx="16" cy="8" r="2.2"/><circle cx="10" cy="16" r="2.2"/>',
    deploy: '<path d="M5 13.5 19.5 4.5 15 20l-3.9-5.4L5 13.5Z"/><path d="M11.1 14.6 19.5 4.5"/>'
  };

  var LOCK_ART = '<rect x="5" y="10.5" width="14" height="10" rx="2.4"/>' +
                 '<path d="M8.2 10.5V8a3.8 3.8 0 0 1 7.6 0v2.5"/>';
  var STAR_ART = '<path d="M12 4.2l2.36 4.9 5.39.72-3.93 3.74.98 5.34L12 16.34l-4.8 2.56.98-5.34L4.25 9.82l5.39-.72z"/>';

  /* One entry per stage. Stage identity (which step this is) and state (what
     the learner can do with it) are separate: identity lives in `accent`, state
     comes from statusOf(). `done` returns the completion line, and returns it
     from structured state rather than from anything typed free-hand, so a demo
     run full of junk still reads as a finished journey. */
  var STATIONS = [
    { step: 1, name: "Identify", accent: "identify", art: "identify", place: "above",
      blurb: "Define the problem worth solving.",
      done: function () { return "Complete · Task defined"; } },
    { step: 2, name: "Map", accent: "map", art: "map", place: "below",
      blurb: "Break the process into real steps.",
      done: function () {
        var k = filledSteps().length;
        return "Complete · " + k + (k === 1 ? " step" : " steps") + " mapped";
      } },
    { step: 3, name: "Envision", accent: "envision", art: "envision", place: "above",
      blurb: "Picture the better version.",
      done: function () { return "Complete · Future state defined"; } },
    { step: 4, name: "Refine", accent: "refine", art: "refine", place: "below",
      blurb: "Sharpen ideas into specifics.",
      done: function () { return "Complete · Coach review finished"; } },
    { step: 5, name: "Deploy", accent: "deploy", art: "deploy", place: "above",
      blurb: "Turn it into action.",
      done: function () { return "Complete · Master prompt ready"; } }
  ];

  /* How long the journey is, and which numbers are in it, read off STATIONS so
     the count is one fact rather than two that have to agree. Everything whose
     meaning is "the whole journey" goes through these; rules that mean one
     particular stage still name their own number. */
  function stageNumbers() { return STATIONS.map(function (s) { return s.step; }); }
  /* The steps this block is responsible for writing back: the whole journey for
     the full activity, and the declared slice otherwise. */
  function ownedSteps() { return CONFIG.blockRole === "all" ? stageNumbers() : ROLE.steps; }
  function stageCount() { return STATIONS.length; }
  function lastStage() { return STATIONS[STATIONS.length - 1].step; }

  /* The four presentation states, derived from progress and nothing else.
     locked -> available -> current -> completed.

     "Entered" is what separates available from current: a stage the learner has
     opened and not yet finished is in progress, whichever one progress.current
     happens to point at. Without it a fresh map would show stage 1 as current
     before anyone had touched it. */
  function statusOf(n) {
    var p = workflowData.progress;
    if (p.done[n]) return "completed";
    if (n > p.unlocked) return "locked";
    if (p.entered[n] && n === p.current) return "current";
    return "available";
  }

  var stationNodes = [];

  function svgTag(inner, cls) {
    return '<svg class="' + cls + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
      'stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      inner + '</svg>';
  }

  function buildMap() {
    var host = document.getElementById("bw-stations");
    if (!host) return;
    host.textContent = "";
    // The spine's column count is the number of stations, and nothing else.
    var spine = document.getElementById("bw-spine");
    if (spine) spine.style.setProperty("--station-count", String(stageCount()));
    stationNodes = STATIONS.map(function (s, i) {
      var li = document.createElement("li");
      li.className = "bw-station";
      li.setAttribute("role", "listitem");
      li.setAttribute("data-stage", String(s.step));
      li.setAttribute("data-place", s.place);
      li.setAttribute("data-accent", s.accent);
      // Which column this station sits in. Inherited by the card and the
      // waypoint, which is what replaces a rule per position in home.css.
      li.style.setProperty("--station-col", String(i + 1));

      /* -- the card -- */
      var card = document.createElement("button");
      card.type = "button";
      card.className = "bw-station-card";

      var num = el2("span", "bw-card-num", pad2(s.step));

      var tile = el2("span", "bw-card-tile");
      tile.innerHTML = svgTag(ART[s.art], "bw-card-art") +      // static, from ART
                       svgTag(LOCK_ART, "bw-card-lock") +
                       '<span class="bw-card-check" aria-hidden="true">' +
                         svgTag('<path d="M6 12.5l4 4 8-9"/>', "bw-card-tick") +
                       '</span>';

      var body = el2("span", "bw-card-body");
      var name = el2("span", "bw-card-name", s.name);
      var status = el2("span", "bw-card-status");
      var blurb = el2("span", "bw-card-blurb", s.blurb);
      body.appendChild(name);
      body.appendChild(status);
      body.appendChild(blurb);

      var go = el2("span", "bw-card-go");
      go.setAttribute("aria-hidden", "true");
      go.innerHTML = svgTag('<path d="M9 5l7 7-7 7"/>', "bw-card-chev");

      card.appendChild(num);
      card.appendChild(tile);
      card.appendChild(body);
      card.appendChild(go);
      card.addEventListener("click", function () {
        if (statusOf(s.step) === "locked") return;
        enterStage(s.step, card);
      });

      /* -- stem and waypoint, moving together so the dot stays on the line -- */
      var node = el2("span", "bw-station-node");
      node.setAttribute("aria-hidden", "true");
      var stem = el2("span", "bw-station-stem");
      var way = el2("span", "bw-station-way");
      var wayNum = el2("span", "bw-way-num", String(s.step));
      way.appendChild(wayNum);
      way.innerHTML += svgTag(STAR_ART, "bw-way-star");
      node.appendChild(stem);
      node.appendChild(way);

      li.appendChild(card);
      li.appendChild(node);
      host.appendChild(li);
      return { def: s, li: li, card: card, status: status };
    });
    drawRail();
  }

  function el2(tag, cls, text) {
    var n = document.createElement(tag);
    n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }

  function pad2(n) { return (n < 10 ? "0" : "") + n; }

  /* One continuous glacier line, drawn once. It passes exactly through the five
     waypoints, which sit at alternating heights - the wave is the composition,
     not decoration on top of it. The line stays one neutral colour: state
     belongs to the nodes and the cards, never to the connector. */
  var RAIL_Y = { odd: 8.4, even: 3.6 };

  function drawRail() {
    var svg = document.getElementById("bw-rail");
    if (!svg) return;
    /* One waypoint per station, at the centre of that station's grid column:
       for N columns the centre of column i is (i + 0.5) x 100/N. At five that
       is exactly the 10/30/50/70/90 this was written with, and it stays true
       whatever the count becomes. */
    var n = stageCount();
    var xs = STATIONS.map(function (_, i) { return (i + 0.5) * (100 / n); });
    if (!xs.length) return;
    var y = function (i) { return i % 2 === 0 ? RAIL_Y.odd : RAIL_Y.even; };
    var d = "M 0 " + y(0) + " L " + xs[0] + " " + y(0);
    for (var i = 1; i < xs.length; i++) {
      var x0 = xs[i - 1], x1 = xs[i], span = (x1 - x0) * 0.32;
      d += " C " + (x0 + span) + " " + y(i - 1) + ", " + (x1 - span) + " " + y(i) +
           ", " + x1 + " " + y(i);
    }
    d += " L 100 " + y(xs.length - 1);
    svg.innerHTML =
      '<path class="bw-rail-glow" d="' + d + '" />' +
      '<path class="bw-rail-line" d="' + d + '" />';
  }

  function renderMap() {
    if (!TIMELINE || !stationNodes.length) return;
    var p = workflowData.progress;
    var resume = 1;
    while (resume < lastStage() && p.done[resume]) resume++;

    stationNodes.forEach(function (node) {
      var n = node.def.step;
      var state = statusOf(n);

      node.li.setAttribute("data-state", state);
      node.card.disabled = state === "locked";
      if (state === "current") node.card.setAttribute("aria-current", "step");
      else node.card.removeAttribute("aria-current");

      // The card says what the stage is for underneath, so the status line is
      // only ever the state. Why a stage is shut is in the label and the hint.
      node.status.textContent = state === "completed" ? node.def.done()
        : state === "locked" ? "Upcoming"
        : STATE_WORD[state];

      node.card.setAttribute("aria-label",
        "Stage " + n + ", " + node.def.name + ". " + node.def.blurb + " " +
        (state === "locked" ? "Locked. " + lockedBecause(n) + "."
          : state === "completed" ? node.status.textContent + ". Open this stage."
          : STATE_WORD[state] + ". Open this stage."));
    });

    var hint = document.getElementById("bw-map-hint");
    if (hint) {
      var doneCount = stageNumbers().filter(function (n) { return p.done[n]; }).length;
      hint.textContent = doneCount === stageCount()
        ? "Every stage complete. Open Deploy to copy your master prompt again."
        : "Pick up at " + STATIONS[resume - 1].name + ". Stages open as you finish the one before.";
    }
  }

  var STATE_WORD = {
    locked: "Locked", available: "Ready to start",
    current: "In progress", completed: "Completed"
  };

  /* Why a station is shut, said in terms of the stage before it. */
  function lockedBecause(n) {
    var before = STATIONS[n - 2];
    return before ? "Finish " + before.name + " first" : "Not yet available";
  }

  /* ---- moving between the map and a stage ---- */

  function setView(next) {
    view = next;
    el.root.setAttribute("data-view", next);
    el.landing.hidden = next !== "landing";
    el.map.hidden = next !== "map";
    el.stage.hidden = next !== "stage";
    // The page itself has to go dark on home, or whatever the frame does not
    // fill shows the browser's white page underneath.
    document.documentElement.setAttribute("data-bw-view", next);
    if (next === "map") { renderMap(); fitMap(); }
  }

  /* Above 720px home is one fixed 16:9 composition, scaled whole to the space it is given -
     the width of the page, and the height of the window less the footer - and
     centred in it both ways, so the map fills the window and the footer sits
     at the bottom of the screen. The same picture at every size, never a
     reflowed one.
     Measured here rather than in CSS because the frame has to know both
     dimensions at once, and a hidden map measures zero wide. */
  var MAP_W = 1280, MAP_H = 720;

  /* Which composition home is in is CSS's decision, made once: the 720px media query
     in home.css sets --map-layout to "stack", and this reads it. There is no second
     copy of the number here to drift from it. */
  function mapStacked() {
    return !!el.map &&
      window.getComputedStyle(el.map).getPropertyValue("--map-layout").trim() === "stack";
  }

  function fitMap() {
    if (!TIMELINE || view !== "map" || !el.map) return;
    if (mapStacked()) {
      /* A natural-height column: CSS owns the size. Whatever the frame wrote when it
         was a scaled picture has to go, or a phone that was once a tablet (or a
         window that was dragged narrower) keeps a fixed height and a scale the
         layout no longer uses. */
      el.map.style.height = "";
      ["--map-scale", "--map-x", "--map-y"].forEach(function (prop) {
        el.map.style.removeProperty(prop);
      });
      return;
    }
    var foot = document.querySelector(".bw-foot");
    var w = el.map.clientWidth;
    // Rounded up: offsetHeight rounds a 63.1px footer down, and that fraction
    // of a pixel is enough to give the page a scrollbar.
    var h = Math.max(200, Math.floor(window.innerHeight -
      (foot ? Math.ceil(foot.getBoundingClientRect().height) : 0)));
    if (!w) return;
    var scale = Math.min(w / MAP_W, h / MAP_H);
    el.map.style.height = h + "px";
    el.map.style.setProperty("--map-scale", String(scale));
    el.map.style.setProperty("--map-x", Math.round((w - MAP_W * scale) / 2) + "px");
    el.map.style.setProperty("--map-y", Math.round((h - MAP_H * scale) / 2) + "px");
  }

  var fitQueued = false;
  function queueFitMap() {
    if (fitQueued) return;
    fitQueued = true;
    (window.requestAnimationFrame || setTimeout)(function () {
      fitQueued = false;
      fitMap();
    });
  }

  function motionOff() {
    return prefersReducedMotion() || typeof window.gsap === "undefined";
  }

  /* Entering a stage: the chosen card takes over while the rest of the journey
     recedes, then the workspace resolves in. No camera, just scale, position
     and opacity - which is all the feeling needs. */
  function enterStage(n, card) {
    if (view === "stage") { openStep(n); return; }
    var others = stationNodes.map(function (s) { return s.card; })
      .filter(function (c) { return c !== card; });
    var rail = document.getElementById("bw-spine");

    var arrive = function () {
      setView("stage");
      openStep(n, false);
      startPhaseFor(n);
      if (el.root.scrollIntoView) {
        el.root.scrollIntoView({ behavior: motionOff() ? "auto" : "smooth", block: "start" });
      }
      if (!motionOff()) {
        window.gsap.fromTo(el.stage,
          { opacity: 0, y: 16, scale: .99 },
          { opacity: 1, y: 0, scale: 1, duration: .42, ease: "power2.out", clearProps: "all" });
      }
      // The map is hidden now, so put the cards back before it is shown again.
      if (typeof window.gsap !== "undefined") {
        window.gsap.set(others.concat([card, rail]), { clearProps: "all" });
      }
    };

    if (motionOff()) { arrive(); return; }
    window.gsap.timeline({ onComplete: arrive })
      .to(others, { opacity: 0, scale: .94, duration: .28, ease: "power2.out" }, 0)
      .to(rail, { opacity: .25, duration: .28, ease: "power2.out" }, 0)
      .to(card, { scale: 1.06, duration: .28, ease: "power2.out" }, 0);
  }

  /* Starting: the landing lifts away and the journey draws itself in, station
     by station along the spine. First impression of the map, so it gets the
     one piece of choreography in here that is not strictly functional. */
  function startActivity() {
    markStarted(true);
    var out = function () {
      setView("map");
      if (motionOff()) return;
      window.gsap.timeline()
        // Only what was animated: "all" would also wipe fitMap()'s sizing.
        .fromTo("#bw-map", { opacity: 0, y: 14 },
                { opacity: 1, y: 0, duration: .4, ease: "power2.out", clearProps: "opacity,transform" })
        .fromTo(".bw-station-card", { opacity: 0, scale: .9, y: 10 },
                { opacity: 1, scale: 1, y: 0, duration: .42, ease: "back.out(1.6)",
                  stagger: .07, clearProps: "all" }, .12);
    };
    if (motionOff()) { out(); return; }
    window.gsap.to("#bw-landing", {
      opacity: 0, y: -12, duration: .26, ease: "power2.in",
      onComplete: function () {
        window.gsap.set("#bw-landing", { clearProps: "all" });
        out();
      }
    });
  }

  function backToLanding() {
    setView("landing");
    if (!motionOff()) {
      window.gsap.fromTo("#bw-landing", { opacity: 0, y: -10 },
        { opacity: 1, y: 0, duration: .34, ease: "power2.out", clearProps: "all" });
    }
    if (el.landing.scrollIntoView) {
      el.landing.scrollIntoView({ behavior: motionOff() ? "auto" : "smooth", block: "start" });
    }
  }

  function backToMap() {
    setView("map");
    if (!motionOff()) {
      window.gsap.fromTo("#bw-map",
        { opacity: 0, y: -10 },
        { opacity: 1, y: 0, duration: .38, ease: "power2.out", clearProps: "opacity,transform" });
    }
    var map = document.getElementById("bw-map");
    if (map && map.scrollIntoView) {
      map.scrollIntoView({ behavior: motionOff() ? "auto" : "smooth", block: "start" });
    }
  }

  function wireMap() {
    // A single-stage slice has no journey to map; it renders its one panel and
    // the workspace is all there is.
    if (!TIMELINE) {
      el.stage.hidden = false;
      el.map.hidden = true;
      el.landing.hidden = !ROLE.intro;   // only the framing slice keeps the framing
      return;
    }
    buildMap();
    window.addEventListener("resize", queueFitMap);
    wireLearningStage();
    wireCoachPhase();
    // Someone who has started already gets home, not the pitch they have read.
    setView(hasStarted() ? "map" : "landing");
    var start = document.getElementById("bw-start");
    if (start) start.addEventListener("click", startActivity);
    var toLanding = document.getElementById("bw-to-landing");
    if (toLanding) toLanding.addEventListener("click", backToLanding);
    var back = document.getElementById("bw-to-map");
    if (back) back.addEventListener("click", backToMap);
    // The stage headers are titles now, not controls.
    el.steps.forEach(function (node) {
      var head = node.querySelector(".bw-step-head");
      if (head) head.disabled = true;
    });
    renderMap();
  }


  /* ==========================================================================
     9. LEARNING STAGE
     --------------------------------------------------------------------------
     The inside of a step. Dark shell, light workspace, and a compressed echo of
     the journey map across the top.

     The mini nodes call the same statusOf() the map does, so the two cannot
     drift apart: there is one state model and both screens read it. Progression
     is expressed in the mini nodes only - the shell, the workspace and the
     context panel stay the same whatever stage is open.
     ========================================================================== */

  /* Left-panel framing, one per stage. Illustrations are soft process vectors
     in the direction of the supplied boards - placeholder art, deliberately
     easy to replace, all of it in one place. */
  var STAGE_ART = {
    identify:
      '<rect x="18" y="26" width="46" height="56" rx="8" class="a-soft"/>' +
      '<rect x="34" y="18" width="46" height="56" rx="8" class="a-soft2"/>' +
      '<circle cx="52" cy="48" r="19" class="a-line"/>' +
      '<path d="M66 62 82 78" class="a-line a-thick"/>',
    map:
      '<rect x="14" y="22" width="72" height="56" rx="9" class="a-soft"/>' +
      '<circle cx="32" cy="38" r="7" class="a-fill"/>' +
      '<circle cx="66" cy="34" r="7" class="a-fill"/>' +
      '<circle cx="48" cy="64" r="7" class="a-fill"/>' +
      '<path d="M37 41 61 37M35 44 44 58M62 40 53 58" class="a-line"/>',
    envision:
      '<rect x="20" y="24" width="60" height="52" rx="9" class="a-soft"/>' +
      '<path d="M50 26a15 15 0 0 0-8.6 27.3c1.4 1 2.1 2.6 2.1 4.3v.6h13v-.6c0-1.7.7-3.3 2.1-4.3A15 15 0 0 0 50 26Z" class="a-line"/>' +
      '<path d="M44 66h12M45.5 72h9" class="a-line"/>',
    refine:
      '<rect x="16" y="24" width="68" height="52" rx="9" class="a-soft"/>' +
      '<path d="M26 38h22M60 38h14M26 62h14M52 62h22" class="a-line"/>' +
      '<circle cx="54" cy="38" r="7" class="a-fill"/>' +
      '<circle cx="46" cy="62" r="7" class="a-fill"/>',
    deploy:
      '<rect x="18" y="30" width="48" height="48" rx="8" class="a-soft"/>' +
      '<path d="M24 62 84 20 66 86l-14-19-28-5Z" class="a-line"/>' +
      '<path d="M52 67 84 20" class="a-line"/>'
  };

  /* Stage framing for the left panel. The lesson title in the workspace is read
     off the step's own heading instead, so there is no second copy of it to
     fall out of date. */
  var STAGE_CONTEXT = {
    1: { framing: "Define the problem worth solving.",
         quote: "Clarity today. Impact tomorrow." },
    2: { framing: "Understand the context and the tools involved.",
         quote: "People, process, and data create the full picture." },
    3: { framing: "Decide what better looks like, then AI's part in it.",
         quote: "Outcome first. Technology second." },
    4: { framing: "Turn the vision into clear working decisions.",
         quote: "Make the invisible decisions explicit." },
    5: { framing: "Put it into action and drive impact.",
         quote: "From plan to progress. Keep it going." }
  };

  /* NOT RENDERED ANYWHERE, and kept on purpose.

     These three starter examples were written for stage 1's textarea, which the
     journey no longer shows: Identify is a conversation, so there is no panel for
     them to sit in (checked against the real UI - every state of stage 1, at desktop
     and phone width, every /role slice and the admin harness). The panel that used
     to display them, its renderer and its styles have been removed.

     The text stays because it exists nowhere else. The three titles are in the
     learning-stage design pack's template, but the three quote sentences below were
     authored here and live in no document, so deleting them would destroy copy
     rather than dead code. Whether they move to a design doc, come back on some
     surface, or go is the author's decision - not a hygiene one. */
  var STAGE_EXAMPLES = {
    1: {
      head: "Need a starting point?",
      sub: "A few examples to get your thinking going.",
      items: [
        { title: "Reduce manual work",
          quote: "I spend hours each week updating the same report by hand." },
        { title: "Get better insights",
          quote: "We need faster visibility into what clients are telling us." },
        { title: "Eliminate repetitive tasks",
          quote: "My team spends too much time on routine formatting." }
      ]
    }
  };

  var STAGE_INFO = {
    1: "In this stage you name the task. The steps, the tools and what good looks " +
       "like come later - one thing at a time.",
    4: "The coach already has your problem, your mapped workflow, and your vision. Now " +
       "you'll define the four decisions the finished prompt needs."
  };

  var miniNodes = [];

  function buildMiniBar() {
    var host = document.getElementById("bw-mini");
    if (!host) return;
    host.textContent = "";
    miniNodes = STATIONS.map(function (s) {
      var li = document.createElement("li");
      li.className = "bw-mini-item";
      li.setAttribute("role", "listitem");
      li.setAttribute("data-stage", String(s.step));
      li.setAttribute("data-accent", s.accent);

      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "bw-mini-node";
      btn.innerHTML = svgTag(ART[s.art], "bw-mini-icon") +     // static, from ART
                      svgTag(LOCK_ART, "bw-mini-lock") +
                      svgTag(STAR_ART, "bw-mini-star");
      btn.addEventListener("click", function () {
        if (statusOf(s.step) === "locked") return;
        openStep(s.step);
        startPhaseFor(s.step);
      });

      var label = el2("span", "bw-mini-label", pad2(s.step) + " " + s.name);
      li.appendChild(btn);
      li.appendChild(label);
      host.appendChild(li);
      return { def: s, li: li, btn: btn };
    });
  }

  function renderMiniBar() {
    if (!TIMELINE || !miniNodes.length) return;
    var open = workflowData.progress.current;
    miniNodes.forEach(function (node) {
      var n = node.def.step;
      var state = statusOf(n);
      node.li.setAttribute("data-state", state);
      // Which stage is on screen is a separate fact from what state it is in.
      node.li.setAttribute("data-open", n === open ? "true" : "false");
      node.btn.disabled = state === "locked";
      if (n === open) node.btn.setAttribute("aria-current", "step");
      else node.btn.removeAttribute("aria-current");
      node.btn.setAttribute("aria-label",
        "Stage " + n + ", " + node.def.name + ". " + STATE_WORD[state] +
        (n === open ? ". Open now." : (state === "locked" ? "." : ". Go to this stage.")));
    });
  }

  /* The context panel and the lesson header, repainted for whichever stage is
     open. Neutral surface throughout: stage identity shows up in the number,
     the illustration and the progress fill, never as a wash over the page. */
  function renderStageContext() {
    if (!TIMELINE) return;
    var n = workflowData.progress.current;
    var def = STATIONS[n - 1];
    if (!def) return;
    var ctx = STAGE_CONTEXT[n] || {};

    // Set on the whole stage section: the context panel, the illustration and
    // the CTA all read the same accent from here.
    if (el.stage) el.stage.setAttribute("data-accent", def.accent);

    setText("bw-ls-eyebrow", "Stage " + n);
    setText("bw-ls-num", pad2(n));
    setText("bw-ls-name", def.name);
    setText("bw-ls-framing", ctx.framing || def.blurb);
    setText("bw-ls-step", "Step " + n + " of " + stageCount());
    setText("bw-ls-quote", ctx.quote ? "“" + ctx.quote + "”" : "");

    var art = document.getElementById("bw-ls-art");
    if (art) {
      art.setAttribute("data-accent", def.accent);
      art.innerHTML =                                  // static, from STAGE_ART
        '<svg viewBox="0 0 100 100" fill="none" aria-hidden="true">' +
        STAGE_ART[def.art] + '</svg>';
    }
    var fill = document.getElementById("bw-ls-bar-fill");
    if (fill) fill.style.width = (n / stageCount() * 100) + "%";

    // The lesson title is the step's own heading, so it can never disagree
    // with the panel underneath it.
    var panel = el.steps[n - 1];
    var head = panel && panel.querySelector(".bw-step-head");
    setText("bw-lesson-label", "Lesson " + n);
    setText("bw-lesson-title", head ? head.querySelector(".bw-h2").textContent : def.name);
    setText("bw-lesson-sub", head ? head.querySelector(".bw-step-sub").textContent : "");

    if (phase === "chat") { renderCoachRail(); renderCoachCards(); }
    renderLesson(n);
    var strip = document.getElementById("bw-info-strip");
    if (strip) {
      strip.textContent = STAGE_INFO[n] || "";
      strip.hidden = !STAGE_INFO[n];
    }
    placeWorkspaceExtras(panel);
  }

  /* A stage with a written lesson shows a heading and prose; one without still
     shows its original panel, so nothing is lost while the rest are written. */
  function renderLesson(n) {
    var pages = lessonPages(n);
    var body = document.getElementById("bw-lesson-body");
    var steps = document.querySelector(".bw-steps");
    var progress = document.querySelector(".bw-ls-work .bw-progress");
    if (!body) return;

    // Past the last page is how a stage reaches its own panel: stage 2 reads
    // twice and then maps. A stage with no lesson starts past the end already.
    var reading = onLessonPage(n);
    body.hidden = !reading;
    if (steps) steps.hidden = reading;
    if (progress) progress.hidden = reading;
    showLessonCard();
    if (!reading) return;

    var page = pages[lessonPage];
    var copy = document.getElementById("bw-lesson-copy");
    if (copy) {
      copy.textContent = "";
      lessonBlocks(page).forEach(function (b) {
        copy.appendChild(buildLessonBlock(b));
      });
    }

    // A page may retitle the workspace; most read as the stage they are in.
    if (page.title) setText("bw-lesson-title", page.title);
    if (page.sub) setText("bw-lesson-sub", page.sub);

    var count = document.getElementById("bw-lesson-count");
    if (count) {
      count.hidden = pages.length < 2;
      count.textContent = (lessonPage + 1) + " of " + pages.length;
    }
    var back = document.getElementById("bw-lesson-back");
    if (back) back.hidden = lessonPage === 0;

    // Continue always goes somewhere: the next page, the coach, or the stage's
    // own panel. There is no lesson that is the end of its stage.
    setText("bw-lesson-next", "Continue");
  }

  /* Continue, on a lesson page: turn the page, hand off to the coach, or step
     aside for the stage's own panel. */
  function advanceLesson(n) {
    var pages = lessonPages(n);
    if (lessonPage < pages.length - 1) {
      lessonPage++;
      renderStageContext();
      turnLessonPage(1);
      return;
    }
    if (stageHasCoach(n)) { continueFromLesson(n); return; }
    if (!stageHasWork(n)) { goNext(n); return; }
    lessonPage = pages.length;          // past the end: the panel takes over
    renderStageContext();
    turnLessonPage(1);
  }

  function backLesson() {
    if (lessonPage <= 0) return;
    lessonPage--;
    renderStageContext();
    turnLessonPage(-1);
  }

  function turnLessonPage(dir) {
    var work = document.querySelector(".bw-ls-work");
    if (!work || motionOff()) return;
    window.gsap.fromTo(work, { opacity: 0, x: 14 * dir },
      { opacity: 1, x: 0, duration: .28, ease: "power2.out", clearProps: "all" });
  }

  function lessonBlocks(lesson) {
    if (lesson.blocks) return lesson.blocks;
    return (lesson.paras || []).map(function (t) { return { type: "p", text: t }; });
  }

  /* One node per block type. Nothing here goes through innerHTML: lesson copy
     is ours, but it is still text, and the rest of the activity holds that line. */
  function buildLessonBlock(b) {
    if (b.type === "h") return el2("h4", "bw-lesson-h", b.text);
    if (b.type === "turn") {
      var turn = el2("p", "bw-lesson-turn");
      turn.appendChild(el2("strong", "bw-lesson-turn-label", b.label));
      turn.appendChild(document.createTextNode(" " + b.text));
      return turn;
    }
    if (b.type === "defs") {
      var dw = el2("div", "bw-lesson-listwrap");
      if (b.lead) dw.appendChild(el2("p", "bw-lesson-lead", b.lead));
      b.items.forEach(function (it) {
        var row = el2("div", "bw-lesson-def");
        row.appendChild(el2("p", "bw-lesson-def-term", it.term + ":"));
        row.appendChild(el2("p", "bw-lesson-def-text", it.text));
        if (it.note) row.appendChild(el2("p", "bw-lesson-def-note", it.note));
        dw.appendChild(row);
      });
      return dw;
    }
    if (b.type === "list") {
      var wrap = el2("div", "bw-lesson-listwrap");
      if (b.lead) wrap.appendChild(el2("p", "bw-lesson-lead", b.lead));
      var ul = el2("ul", "bw-lesson-list");
      ul.setAttribute("role", "list");
      b.items.forEach(function (t) { ul.appendChild(el2("li", "bw-lesson-item", t)); });
      wrap.appendChild(ul);
      return wrap;
    }
    return el2("p", "bw-lesson-para", b.text);
  }

  /* The card is the lesson's picture and the icon is the coach's, so which one
     shows follows the phase as well as the stage. Toggled with `hidden`
     because `.bw [hidden]` would beat any CSS that tried to show it. */
  function showLessonCard() {
    var fig = document.getElementById("bw-ls-lesson-art");
    var icon = document.getElementById("bw-ls-art");
    if (!fig || !icon || !TIMELINE) return;
    var lesson = stageLesson(workflowData.progress.current);
    var card = phase === "lesson" && lesson && EXPLAINER_CARDS[lesson.card];
    fig.hidden = !card;
    icon.hidden = !!card;
    if (!card) return;
    var img = document.getElementById("bw-ls-lesson-img");
    if (img && img.getAttribute("src") !== card.src) {
      img.setAttribute("src", card.src);
      img.setAttribute("alt", card.alt);
    }
  }

  function setText(id, text) {
    var node = document.getElementById(id);
    if (node) node.textContent = text;
  }

  /* The info strip and Save draft are single elements that follow
     whichever stage is open, because the Continue button they sit around lives
     inside the step panel. Moving a node keeps its listeners, so these stay one
     of each with one handler each - and since they are singletons, moving them
     every render leaves nothing behind. */
  function placeWorkspaceExtras(panel) {
    var save = document.getElementById("bw-save-draft");
    var info = document.getElementById("bw-info-strip");
    // On a lesson screen there is nothing to warn about - artwork and prose, and
    // the one row under them. Save draft still rides along with Continue, because
    // leaving mid-read is a thing people do and the button is how they know the
    // work is kept.
    if (onLessonPage(workflowData.progress.current)) {
      if (info) info.hidden = true;
      var lessonRow = document.querySelector(".bw-lesson-actions");
      if (save && lessonRow) {
        save.hidden = false;
        if (save.parentNode !== lessonRow) lessonRow.insertBefore(save, lessonRow.firstChild);
      }
      return;
    }
    if (!panel) return;
    /* The last action row in the panel, except Deploy's finish row - that one
       closes the journey and is not where "Save draft" belongs. */
    var rows = panel.querySelectorAll(".bw-actions:not(.bw-finish-row)");
    var row = rows[rows.length - 1];
    if (save) save.hidden = !row;
    if (!row) return;
    var host = row.parentNode;
    if (info) host.insertBefore(info, row);
    if (save && save.parentNode !== row) row.insertBefore(save, row.firstChild);
  }

  function wireLearningStage() {
    if (!TIMELINE) return;
    buildMiniBar();
    var lessonNext = document.getElementById("bw-lesson-next");
    if (lessonNext) {
      lessonNext.addEventListener("click", function () {
        advanceLesson(workflowData.progress.current);
      });
    }
    var lessonBack = document.getElementById("bw-lesson-back");
    if (lessonBack) lessonBack.addEventListener("click", backLesson);

    var save = document.createElement("button");
    save.type = "button";
    save.id = "bw-save-draft";
    save.className = "bw-btn bw-btn-quiet bw-save-draft";
    save.textContent = "Save draft";
    save.addEventListener("click", function () {
      writeNow();          // the activity autosaves anyway; this makes it visible
      flashSaved();
    });
    document.body.appendChild(save);
  }


  /* ==========================================================================
     10. COACH PHASE
     --------------------------------------------------------------------------
     A stage has two phases: the instructional content, then the coach. Continue
     moves between them, and the coach's own "Save and continue" moves on to the
     next stage.

     This is a mode inside the learning stage, not a second app: the same dark
     shell, the same mini-node strip, the same canonical step state. Nothing
     here owns a copy of progression truth - it reads statusOf() like everything
     else does.

     The chat markup itself is not rebuilt. #bw-chat-wrap moves into the coach
     panel with its listeners and the whole adapter, transcript and scripted
     coach still attached to it; only the surface around it is new.
     ========================================================================== */

  /* Which stages hand off to a coach. Stages absent from here run lesson-only,
     and Continue goes straight onward. */
  var STAGE_COACH = { 1: true, 4: true };

  /* The instructional screen for a stage: prose, and nothing to fill in -
     everything the learner types happens with the coach afterwards. Pictures
     stay on the left: a lesson's `card` is an explainer card that stands in
     for the context panel's icon while the lesson is up, so the stage still
     shows one picture at a time. Placeholder copy; a stage without an entry
     still shows its old panel. */
  /* Lesson copy is a list of typed blocks rather than a list of paragraphs,
     because the writing has shape: a question, prose, a worked list, and the
     turn that hands the learner to the coach. A lesson may still give `paras`
     instead, which is shorthand for all-paragraphs. */
  var STAGE_1_LESSON = [
    { type: "h", text: "What makes a good problem to tackle?" },
    { type: "p", text:
      "The ideal task for AI utilization is one where the outcome is already defined before " +
      "you start. These are usually the things you could describe step-by-step if someone " +
      "asked. You follow the same steps every time." },
    { type: "p", text:
      "They also shouldn't be subjective. There shouldn't be branches in the process \u2014 no " +
      "\u201cif this happens, then you do that instead.\u201d The steps stay the same every " +
      "time, regardless of the situation." },
    { type: "p", text:
      "These tasks tend to be more on the tedious side. In many cases, it's something that " +
      "takes real time but doesn't require much thought once you know the steps." },
    { type: "list", lead: "Examples:", items: [
      "Compiling client feedback into a summary document",
      "Formatting meeting notes into action items",
      "Pulling data from three different tools into one spreadsheet",
      "Drafting routine emails from templates"
    ] },
    { type: "p", text:
      "Take a moment to think about some of the work that you do regularly. What are some " +
      "things that might fit? Perhaps it's a spreadsheet task, updating a weekly report, or " +
      "maybe a timesheet." },
    { type: "turn", label: "Your turn:", text:
      "Think of one task that fits this pattern. What is it? What makes it tedious?" }
  ];

  /* The explainer cards carry their own words, so the alt text is those
     words, not a description of the drawing. */
  var EXPLAINER_CARDS = {
    plan: {
      src: "img/explainer/01_plan_beyond_the_chat.png",
      alt: "Plan beyond the chat. The best results come from intentional " +
           "planning, not just the conversation."
    }
  };

  /* Map, page two: why naming the tools is worth doing, and what having named
     them can turn up. The mapping form is what Continue reaches. */
  var MAP_PAGE_GET_SPECIFIC = [
    { type: "p", text:
      "Many programs already talk to each other, and include integration-friendly features " +
      "that are now more accessible with AI. With many organizations adapting to the AI " +
      "landscape, there's also a rapid increase in built-in AI capabilities across programs. " +
      "So sometimes everything you need is already there, in-app. They might also already be " +
      "connected to an LLM through features like plugins and extensions." },
    { type: "p", text:
      "Naming your specific tools can unearth these possibilities. Sometimes, as you list " +
      "them a connection becomes obvious. If you're brainstorming with AI in a session, the " +
      "model might pick up on one or present a workaround. The more you practice, the easier " +
      "this gets to see on your own." },
    { type: "defs", lead: "Examples:", items: [
      { term: "Spreadsheet \u2192 Email", text:
        "Automatically tracks changes, sends notifications, and delivers insights on a schedule." },
      { term: "PDF Reader \u2192 File Storage", text:
        "Automatically reads document content, then files and organizes it into the correct " +
        "folder based on what's inside.",
        note: "Human in the loop tip: To ensure accuracy and proper tracking, consider pairing " +
              "with a notification or filing system that can be reviewed by a human." },
      { term: "File Storage \u2192 Calendar/Tracking System", text:
        "Automatically flags documents that are expiring or need review, tied to a specific date." },
      { term: "Video Conferencing \u2192 Task/Reminder System", text:
        "Automatically transcribes meetings, identifies action items and loose threads, and " +
        "syncs them into a reminder or task system." },
      { term: "Claude Connector \u2192 CRM", text:
        "Pulls live customer data directly into the conversation, so you can ask questions, " +
        "locate specific records, or request status updates based on real information." }
    ] }
  ];

  var MAP_PAGE_THINK_SMALLER = [
    { type: "p", text:
      "Working with AI often happens in a chat interface, which makes it easy to treat it " +
      "like other off-the-cuff messaging, like sending a text or ping. As a result, a common " +
      "misconception is that all of the planning, thinking, and work is contained to the " +
      "chat itself." },
    { type: "p", text:
      "However, the most effective work with AI that will accurately reflect your knowledge " +
      "and skills often happens outside the LLM. Like an architect sketching blueprints " +
      "before construction begins, the more intentional you are with that upfront work, the " +
      "stronger the foundation you're building on." },
    { type: "p", text:
      "Put this into practice when planning out your AI-powered workflow. Because the steps " +
      "of the task you chose can often feel like second nature, it's easy to gloss over " +
      "specifics. However, one of the biggest strengths of an LLM is its ability to pick up " +
      "on specific patterns and potentially hidden details. The more detail you provide, the " +
      "more material there is to hang on to and work with." },
    { type: "p", text:
      "Take a moment to envision each specific step of your current workflow. What exactly " +
      "happens, and how does it happen? What are the specific actions?" },
    { type: "p", text:
      "For example, instead of \u201cdraft the email,\u201d the real steps might look like: " +
      "find the documents, pull the information needed, open the email template, then write " +
      "the email." },
    { type: "turn", label: "Your turn:", text:
      "Think about the task that you chose in these terms. Next, you'll turn what you just " +
      "pictured into explicit steps \u2014 each one with the tool it happens in." }
  ];

  /* Envision's reading. Short on purpose: the thinking belongs in the two
     answers underneath it, not in more prose. The one idea that has to survive
     any rewrite is the order - outcome first, technology second. */
  var ENVISION_LESSON = [
    { type: "h", text: "Picture the better version" },
    { type: "p", text:
      "You've mapped what happens today. Before deciding exactly what AI should do, step " +
      "out of the mechanics for a moment." },
    { type: "p", text:
      "If this workflow worked exactly the way you wanted, what would be different? Start " +
      "with the outcome \u2014 not the technology. Then think about the role you would want AI " +
      "to play in helping you get there." },
    { type: "p", text:
      "It is tempting to start from what AI can do and work backwards. That tends to produce " +
      "a workflow shaped around the tool rather than around what you actually needed. Decide " +
      "what better looks like first, and the tool's job becomes obvious." },
    { type: "turn", label: "Your turn:", text:
      "Two questions on the next screen: the outcome you want, and the part you'd want AI to " +
      "play in reaching it." }
  ];

  /* Deploy's reading: the instructional beat that was missing before the
     reveal. Short on purpose - the artifact is the lesson, and this only has to
     say how to read it. The [NEEDS DETAIL] paragraph is the one that has to
     survive any rewrite: a learner who reads a marker as a broken result will
     either stop or paper over it, and the whole point is that the prompt
     handles its own gaps. */
  var DEPLOY_LESSON = [
    { type: "p", text:
      "Your prompt is built from the decisions you made across the journey \u2014 not from a blank " +
      "page. Before you use it, read it once as a set of instructions and make sure each part " +
      "still feels true." },
    { type: "p", text:
      "If you see [NEEDS DETAIL], the prompt isn't broken. It means one decision stayed vague. " +
      "The prompt already tells the assistant to stop and ask you for what it needs before " +
      "acting on that gap." },
    { type: "p", text:
      "You may also see a note about missing information, such as [MISSING: ...], later, in what " +
      "the assistant gives back when you use the prompt on real work. The wording can vary. It is " +
      "a different thing: it means an input that run needs was not supplied. It is not permission " +
      "to guess, and the assistant should ask you for it." },
    { type: "p", text:
      "Then try it on real work. Notice what misses, improve the prompt, and keep the " +
      "correction. That editing loop is how a one-time answer becomes a reusable workflow." }
  ];

  var STAGE_LESSON = {
    1: { blocks: STAGE_1_LESSON, card: "plan" },
    /* Map is one job in two passes: stop summarising, then get specific. The
       form is where that thinking gets applied, so it follows the reading
       rather than sitting in a stage of its own. */
    2: { pages: [
      { title: "Describe the workflow in full",
        sub: "Picture the process as it really is",
        blocks: MAP_PAGE_THINK_SMALLER },
      { blocks: MAP_PAGE_GET_SPECIFIC }
    ] },
    3: { blocks: ENVISION_LESSON },
    5: { pages: [{ title: "Review before you run it",
                   sub: "See how your decisions became instructions.",
                   blocks: DEPLOY_LESSON }] }
  };

  function stageLesson(n) { return STAGE_LESSON[n]; }

  /* A lesson is one or more pages. A single-page lesson may be written as the
     page itself, which is what stage 1 does. */
  function lessonPages(n) {
    var lesson = stageLesson(n);
    if (!lesson) return [];
    return lesson.pages || [lesson];
  }

  /* Which page is on screen. Module state, not learner data: like the view and
     the phase, where someone is looking is not part of their work. A stage that is
     not completed opens at the top of its reading each time; a completed one opens
     on its work instead (see startPhaseFor). */
  var lessonPage = 0;

  /* Reading, as opposed to working. Past the last page a stage shows its own
     panel, so "has a lesson" is not the same question as "is on one". */
  function onLessonPage(n) {
    return lessonPage < lessonPages(n).length;
  }

  /* Whether anything follows the reading. A stage marked work: false is the
     reading and nothing else, so Continue on its last page leaves the stage
     instead of uncovering a panel the learner has no business seeing. */
  function stageHasWork(n) {
    var lesson = stageLesson(n);
    return !lesson || lesson.work !== false;
  }

  var COACH_FOCUS = {
    1: "Name the task you want to hand off, in your own words.",
    4: "Turn your vision into four concrete decisions: what AI handles, what stays yours, " +
       "what good looks like, and what AI needs to know."
  };

  /* The rail's within-stage checklist. Each item says how it knows it is done,
     so the list reports real progress rather than decoration. */
  var COACH_STEPS = [
    { label: "Talk it through", done: function () { return userTurns() >= 1; } },
    { label: "Answer the coach's questions",
      done: function () { return userTurns() >= turnsNeeded(); } },
    { label: "Save and continue",
      done: function () { return !!workflowData.progress.done[workflowData.progress.current]; } }
  ];

  /* Refine's rail is the four decisions themselves, named before the
     conversation reaches them. Showing the shape of the conversation up front
     is the point: the learner can see what is left, and what the gate is
     waiting for is never a mystery. Built from REFINE_DECISIONS so the rail
     and the gate cannot come to disagree. */
  function coachSteps(n) {
    if (n !== 4 || !refineGoverned()) return COACH_STEPS;
    return REFINE_DECISIONS.map(function (d) {
      return { label: d.label, done: function () { return decided(d.key); } };
    });
  }

  var phase = "lesson";

  function stageHasCoach(n) { return !!STAGE_COACH[n]; }

  function setPhase(next) {
    phase = next;
    el.root.setAttribute("data-phase", next);
    var panel = document.getElementById("bw-chat-panel");
    var work = document.querySelector(".bw-ls-work");
    var meta = document.querySelector(".bw-ls-meta");
    var focus = document.getElementById("bw-chat-focus");
    if (panel) panel.hidden = next !== "chat";
    if (work) work.hidden = next === "chat";
    if (meta) meta.hidden = next === "chat";
    if (focus) focus.hidden = next !== "chat";
    showLessonCard();
    if (next === "chat") {
      setContextOpen(false);        // the conversation first; context is one tap away
      renderCoachRail();
      maybeStartConversation();
      renderCoachCards();
      followNewest();
    }
  }

  /* The chat lives in the step panel in the markup so a single-stage slice still
     works without any of this. On the full activity it moves into the coach
     panel once, at wire time - so the lesson phase is instructional content and
     nothing else, and the conversation is not half-visible underneath it. */
  function moveChatIn() {
    var panel = document.getElementById("bw-chat-panel");
    if (!panel || !el.chatWrap) return;
    if (el.chatWrap.parentNode !== panel) panel.appendChild(el.chatWrap);
    if (el.chatError && el.chatError.parentNode !== panel) panel.appendChild(el.chatError);
    if (el.chatNote && el.chatNote.parentNode !== panel) panel.appendChild(el.chatNote);
  }

  function renderCoachRail() {
    var n = workflowData.progress.current;
    setText("bw-focus-text", COACH_FOCUS[n] || (STATIONS[n - 1] || {}).blurb || "");
    var chip = document.getElementById("bw-coach-chip");
    if (chip) {
      /* Compact on purpose. "04  Working on: Refine" was the widest fixed item
         in the header and said what the mini-node strip above it and the stage
         panel below it were both already saying - it was spending the width
         the coach's own name needed. Still read off STATIONS, so a renamed or
         reordered station follows. */
      chip.textContent = pad2(n) + " " + (STATIONS[n - 1] || {}).name;
      chip.setAttribute("data-accent", (STATIONS[n - 1] || {}).accent);
    }
    var list = document.getElementById("bw-focus-steps");
    if (!list) return;
    list.textContent = "";
    coachSteps(n).forEach(function (item, i) {
      var li = document.createElement("li");
      li.className = "bw-focus-step";
      li.setAttribute("role", "listitem");
      var done = item.done();
      // The first step that is not done is the one they are on.
      li.setAttribute("data-state", done ? "done" : "todo");
      li.appendChild(el2("span", "bw-focus-dot"));
      li.appendChild(el2("span", "bw-focus-label", item.label));
      list.appendChild(li);
    });
    var firstTodo = list.querySelector('[data-state="todo"]');
    if (firstTodo) firstTodo.setAttribute("data-state", "now");
  }

  /* ---- coaching cards ----
     Rendered from typed data, one renderer for every type, and pinned either
     above or below the transcript rather than interleaved. Three types are
     emitted, each backed by real state:

       problem-summary  (top)     "Your problem so far" - what the coach has taken down
       specificity      (top)     "What the coach already has" - the mapped steps. Despite
                                  the name it is a list card, and it is live: it is also
                                  what the narrow-screen "Context loaded" strip summarises
       next-step        (bottom)  the handoff to the next stage, once the stage is done

     buildCoachingCard() is generic - title, body, items, action - so a new type is a
     new entry here plus a tone in chat.css, not a new renderer. */

  function coachingCards() {
    var cards = [];
    var problem = String(workflowData.problem).trim();
    if (problem) {
      cards.push({
        type: "problem-summary", where: "top",
        title: "Your problem so far",
        body: shortQuote(problem, 26)
      });
    }
    /* The mapped steps belong to whichever stage is reasoning over the whole
       picture. On stage 1 they are someone else's work: the learner is naming
       a task, has not mapped anything yet, and coming back here after finishing
       the activity should not bury this conversation under stage 2's output. */
    var steps = sKey() === "identify" ? [] : filledSteps();
    if (steps.length) {
      cards.push({
        type: "specificity", where: "top",
        title: "What the coach already has",
        items: steps.map(function (s, i) {
          var tools = String(s.tools || "").trim();
          return (i + 1) + ". " + s.action + (tools ? " — " + tools : "");
        })
      });
    }
    // Enough turns AND enough to show for them: on a stage whose warning box
    // lives behind the lesson screen, this card is the only gate the learner
    // ever sees, so it must not offer a move that goNext() would refuse.
    if (userTurns() >= turnsNeeded() && stepValid(workflowData.progress.current)) {
      cards.push({
        type: "next-step", where: "bottom",
        title: "Next step",
        body: "Ready to move on?",
        action: { id: "save-and-continue", label: "Save and continue" }
      });
    }
    return cards;
  }

  function buildCoachingCard(card) {
    var box = el2("div", "bw-cc bw-cc-" + card.type);
    box.setAttribute("data-card", card.type);
    var head = el2("div", "bw-cc-head");
    head.appendChild(el2("span", "bw-cc-mark"));
    head.appendChild(el2("strong", "bw-cc-title", card.title));
    box.appendChild(head);
    if (card.body) box.appendChild(el2("p", "bw-cc-body", card.body));
    if (card.items && card.items.length) {
      var ul = document.createElement("ul");
      ul.className = "bw-cc-items";
      card.items.forEach(function (t) {
        ul.appendChild(el2("li", "bw-cc-item", t));
      });
      box.appendChild(ul);
    }
    if (card.action) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "bw-btn bw-cc-action";
      btn.textContent = card.action.label;
      btn.setAttribute("data-action", card.action.id);
      btn.addEventListener("click", function () {
        if (card.action.id === "save-and-continue") goNext(workflowData.progress.current);
      });
      box.appendChild(btn);
    }
    return box;
  }

  function renderCoachCards() {
    if (phase !== "chat") return;
    ["bw-cards-top", "bw-cards-bottom"].forEach(function (id) {
      var host = document.getElementById(id);
      if (host) host.textContent = "";
    });
    var top = document.getElementById("bw-cards-top");
    var bottom = document.getElementById("bw-cards-bottom");
    var cards = coachingCards();
    cards.forEach(function (card) {
      var host = card.where === "bottom" ? bottom : top;
      if (host) host.appendChild(buildCoachingCard(card));
    });
    paintContextStrip(cards.filter(function (c) { return c.where !== "bottom"; }));
    syncContextScroll();
  }

  /* ----------------- pinned context, on a narrow screen -----------------

     Above 900px the context cards sit over the transcript as they always have.
     Below it there is not the room: on a phone they took most of the canvas
     (a transcript 137-277px tall at 390x780, against replies 282-421px tall), and
     on a tablet the capped rail showed the second card as a title and nothing
     else. So there the cards go behind one disclosure, collapsed by default, and
     the conversation owns the screen.

     It is the SAME cards, in the same rail, from the same coachingCards() - the
     strip only says what is in them and shows or hides the rail. Nothing is
     duplicated, so nothing can disagree. */
  var ctxOpen = false;

  function contextSummary(tops) {
    var parts = [];
    tops.forEach(function (c) {
      if (c.type === "problem-summary") parts.push("Task");
      else if (c.type === "specificity") {
        var n = (c.items || []).length;
        parts.push(n + " mapped step" + (n === 1 ? "" : "s"));
      } else parts.push(c.title);
    });
    return parts.join(" + ");
  }

  function paintContextStrip(tops) {
    var toggle = document.getElementById("bw-ctx-toggle");
    if (!toggle) return;
    // With nothing pinned there is nothing to disclose, so there is no strip either.
    toggle.hidden = !tops.length;
    var sum = toggle.querySelector(".bw-ctx-sum");
    if (sum) sum.textContent = contextSummary(tops);
  }

  /* Opening or closing it changes the transcript's height with no scroll event, so
     someone who was following the conversation would read as having scrolled away.
     It is their own action finishing, so it keeps them where they were. */
  function setContextOpen(open) {
    var panel = document.getElementById("bw-chat-panel");
    var toggle = document.getElementById("bw-ctx-toggle");
    if (!panel || !toggle) return;
    var wasPinned = chatPinned();
    ctxOpen = !!open;
    panel.setAttribute("data-ctx-open", ctxOpen ? "true" : "false");
    toggle.setAttribute("aria-expanded", ctxOpen ? "true" : "false");
    syncContextScroll();
    if (wasPinned) scrollChat();
  }

  /* On a short phone the opened rail may not be able to show every card whole. It is
     then a scroll region and has to behave like one: reachable by keyboard, named,
     and carrying a visible cue (css/chat.css) while there is more below. When it all
     fits, none of that is there. Nothing here touches the transcript's scrolling. */
  function syncContextScroll() {
    var rail = document.getElementById("bw-cards-top");
    if (!rail) return;
    var narrow = !window.matchMedia || window.matchMedia("(max-width: 900px)").matches;
    var scrolls = ctxOpen && narrow && rail.scrollHeight > rail.clientHeight + 1;
    if (!scrolls) {
      ["tabindex", "role", "aria-label", "data-more"].forEach(function (a) { rail.removeAttribute(a); });
      return;
    }
    rail.setAttribute("tabindex", "0");
    rail.setAttribute("role", "region");
    rail.setAttribute("aria-label", "Context loaded - scrollable");
    rail.setAttribute("data-more",
      rail.scrollTop + rail.clientHeight < rail.scrollHeight - 1 ? "true" : "false");
  }

  /* Continue on a coaching stage hands off to the coach rather than onward. */
  function continueFromLesson(n) {
    if (!stageHasCoach(n)) { goNext(n); return; }
    if (motionOff()) { setPhase("chat"); return; }
    window.gsap.to(".bw-ls-work", {
      opacity: 0, y: -8, duration: .2, ease: "power2.in",
      onComplete: function () {
        window.gsap.set(".bw-ls-work", { clearProps: "all" });
        setPhase("chat");
        window.gsap.fromTo("#bw-chat-panel", { opacity: 0, y: 10 },
          { opacity: 1, y: 0, duration: .36, ease: "power2.out", clearProps: "all" });
      }
    });
  }

  function wireCoachPhase() {
    if (!TIMELINE) return;
    var host = document.getElementById("bw-chat-panel");
    if (!host) return;
    /* Context cards pin above the transcript, where they stay put while it
       scrolls; the handoff card sits just over the composer, which is where
       someone looks when they think they are done. */
    var toggle = el2("button", "bw-ctx-toggle");
    toggle.type = "button";
    toggle.id = "bw-ctx-toggle";
    toggle.hidden = true;                          // until there is something to disclose
    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute("aria-controls", "bw-cards-top");
    toggle.appendChild(el2("span", "bw-ctx-label", "Context loaded"));
    toggle.appendChild(el2("span", "bw-ctx-sum"));
    toggle.appendChild(el2("span", "bw-ctx-caret"));
    toggle.lastChild.setAttribute("aria-hidden", "true");
    toggle.addEventListener("click", function () { setContextOpen(!ctxOpen); });
    host.setAttribute("data-ctx-open", "false");
    host.appendChild(toggle);

    var top = el2("div", "bw-cards-rail");
    top.id = "bw-cards-top";
    top.addEventListener("scroll", syncContextScroll);
    window.addEventListener("resize", syncContextScroll);
    host.appendChild(top);

    moveChatIn();

    var bottom = el2("div", "bw-cards-rail");
    bottom.id = "bw-cards-bottom";
    var chat = el.chatWrap && el.chatWrap.querySelector(".bw-chat");
    var compose = chat && chat.querySelector(".bw-chat-compose");
    if (chat && compose) chat.insertBefore(bottom, compose);
    else host.appendChild(bottom);

    var face = document.getElementById("bw-coach-face");
    if (face) face.appendChild(botAvatar());

    var restart = document.getElementById("bw-coach-restart");
    if (restart) wireConfirm(restart, "Press again to clear it", restartConversation);

    // The badge says whether this is the live coach or the scripted one, which
    // belongs beside the coach's name rather than buried in the old meta row.
    var who = document.querySelector(".bw-coach-name");
    if (who && el.botBadge) who.appendChild(el.botBadge);
  }

  /* ==========================================================================
     11. ADMIN MODE
     --------------------------------------------------------------------------
     A review harness, not a feature, and for LOCAL DEVELOPMENT ONLY: ?admin=1
     turns it on at localhost, 127.0.0.1 and ::1, and nowhere else - on the
     published site the flag is ignored. It exists so the activity can be walked
     end to end and inspected without answering it first.

     Two rules it must obey, because they are the reason the tool is trustworthy:

       1. It writes ONLY through the same functions a learner's clicks reach -
          setActions, recomputeTools, openStep, goNext, setPhase, refreshV2.
          It never sets progress.done directly, and it never invents a state
          the real flow could not produce. A bug you can only see in admin mode
          is a bug in admin mode, which is worthless.
       2. It is additive. Every element it builds is created here, at wire time,
          and nothing in the learner's markup or CSS knows it exists.

     The hostname check keeps the public URL from handing every learner a button
     that completes the journey for them. It is not a security boundary, and must
     not grow a client-side password or key to pretend to be one: this file is
     public, so anything it checked against would be too. Nothing here is secret -
     it fills in sample answers a learner could type themselves.
     ========================================================================== */

  var ADMIN = (function () {
    try {
      if (!/(^|[?&])admin=1(&|$)/.test(window.location.search)) return false;
      /* Local development only. The published site is public to every learner, so
         there ?admin=1 builds nothing at all - no toolbar, no Fill all. Browsers
         spell the IPv6 loopback with brackets in location.hostname. */
      return /^(localhost|127\.0\.0\.1|\[::1\]|::1)$/.test(window.location.hostname);
    }
    catch (e) { return false; }   // no location in some embed sandboxes
  })();

  /* Deliberately recognisable sample answers. If one of these turns up in a
     screenshot of "learner work", the screenshot came from admin mode. */
  var ADMIN_SAMPLE = {
    problem: "Every Monday I spend two hours building status updates for eleven clients — " +
             "same numbers, same sentences, different names, and by the eleventh one the tone " +
             "has drifted.",
    steps: [
      { action: "Pull last week's delivery numbers", tools: "Asana, Harvest" },
      { action: "Check the shared inbox for anything unresolved", tools: "Gmail" },
      { action: "Write a four paragraph update per client", tools: "Google Docs" },
      { action: "Reformat into the client's preferred channel", tools: "Gmail, Slack" }
    ],
    idealOutcome:
      "Monday mornings stop being a write-up shift. The numbers are already pulled and a " +
      "first draft is waiting, so the hours go on the judgement calls instead of the typing.",
    aiRole:
      "Gather the figures from the usual places and draft the routine paragraphs, so what " +
      "reaches me is a first pass to react to rather than a blank page.",
    answers: {
      handoff: "The first draft of each client update, once I paste in the week's numbers.",
      output: "Four short paragraphs, no bullets, under 200 words, direct client-facing tone " +
              "with no hedging.",
      keep: "The last paragraph — the “what I would watch next week” call. " +
            "That judgment is mine.",
      context: "Never invent a number. If a figure is missing from what I paste, write MISSING " +
               "and keep going.",
      notes: ["Client names are case sensitive and must match the roster exactly."]
    },
    /* Learner turns per conversation. Each list is long enough to satisfy that
       stage's minTurns, read from STAGES rather than hard-coded here. */
    turns: {
      identify: ["Every Monday I spend two hours building status updates for eleven clients.",
                 "They go out before nine, and the tone drifts by the eleventh one."],
      all: ["The first draft of each client update, once I paste in the week's numbers.",
            "Four short paragraphs, no bullets, under 200 words.",
            "The last paragraph. That judgment is mine.",
            "Never invent a number — write MISSING instead."]
    }
  };

  /* Bot lines are filler; only the learner's turns count toward turnsNeeded().

     A lone opening is not a conversation - opening a coaching stage posts one
     before anyone has said anything, which is the same distinction
     startPhaseFor() draws with convoLen > 1. So the guard here is "has the
     learner spoken", not "is the log empty". */
  function adminSeedConvo(key, texts) {
    var log = workflowData.conversations[key];
    if (!log) return;
    var spoken = log.filter(function (m) { return m.role === "user"; }).length;
    if (spoken) return;                      // never stomp a real conversation
    if (!log.length) {
      log.push({ role: "bot", at: timeLabel(),
                 text: SCRIPTS[key] ? SCRIPTS[key].opening() : "Let's begin." });
    }
    texts.forEach(function (t, i) {
      log.push({ role: "user", text: t, at: timeLabel() });
      log.push({ role: "bot", text: "(admin) Noted — answer " + (i + 1) + " recorded.",
                 at: timeLabel() });
    });
    workflowData.mockProgress[key] = texts.length;
  }

  /* What each stage produces, written the way that stage writes it. */
  function adminFillStage(n) {
    if (n === 1) {
      workflowData.problem = ADMIN_SAMPLE.problem;
      if (el.problem) el.problem.value = workflowData.problem;
      updateProblemCount();
      adminSeedConvo("identify", ADMIN_SAMPLE.turns.identify);
    } else if (n === 2) {
      workflowData.steps = ADMIN_SAMPLE.steps.map(function (s) {
        return { action: s.action, tools: s.tools };
      });
      recomputeTools();
      renderCards();
    } else if (n === 3) {
      workflowData.idealOutcome = ADMIN_SAMPLE.idealOutcome;
      workflowData.aiRole = ADMIN_SAMPLE.aiRole;
      var io = document.getElementById("bw-ideal-outcome");
      var ar = document.getElementById("bw-ai-role");
      if (io) io.value = workflowData.idealOutcome;
      if (ar) ar.value = workflowData.aiRole;
      renderVision();
    } else if (n === 4) {
      var a = ADMIN_SAMPLE.answers;
      Object.keys(a).forEach(function (k) { workflowData.botAnswers[k] = a[k]; });
      /* Settle the four decisions the way answering the coach would. Filling
         botAnswers alone would leave a state the real flow cannot produce: the
         answers written down but the stage still open. */
      REFINE_DECISIONS.forEach(function (d) {
        if (String(workflowData.botAnswers[d.key] || "").trim()) workflowData.decided[d.key] = true;
      });
      adminSeedConvo("all", ADMIN_SAMPLE.turns.all);
    } else if (n === lastStage()) {
      refreshV2(true);
    }
    renderPromptV1();
    renderChatLog(true);
    save();
  }

  /* Fill the open stage and take the same step forward the learner would. */
  function adminSkip() {
    var n = workflowData.progress.current;
    adminFillStage(n);
    render();
    if (n >= lastStage()) { setPhase("lesson"); renderAdminBar(); return; }
    goNext(n);              // validates exactly as it does for a learner
    renderAdminBar();
  }

  function adminFillAll() {
    stageNumbers().forEach(adminFillStage);
    stageNumbers().slice(0, -1).forEach(function (n) { if (stepValid(n)) goNext(n); });
    render();
    renderAdminBar();
  }

  /* Jumping needs the stage unlocked first; openStep() refuses to go past
     progress.unlocked, and that guard is worth leaving alone. */
  function adminGoto(n) {
    workflowData.progress.unlocked = Math.max(workflowData.progress.unlocked, n);
    if (view !== "stage") setView("stage");
    openStep(n, false);
    startPhaseFor(n);
    save();
    renderAdminBar();
  }

  function adminTogglePhase() {
    var n = workflowData.progress.current;
    if (!stageHasCoach(n)) return;
    setPhase(phase === "chat" ? "lesson" : "chat");
    renderAdminBar();
  }

  var adminBar = null;

  function adminBtn(label, title, onClick, cls) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "bw-admin-btn" + (cls ? " " + cls : "");
    b.textContent = label;
    b.title = title;
    b.addEventListener("click", onClick);
    return b;
  }

  /* Called from render() as well as from the bar's own handlers: the app
     navigates on its own (Continue at the end of a reading), and a read-out
     that lags behind the app is worse than no read-out. */
  function renderAdminBar() {
    if (!adminBar) return;
    var n = workflowData.progress.current;
    var jumps = adminBar.querySelectorAll("[data-goto]");
    Array.prototype.forEach.call(jumps, function (b) {
      var k = parseInt(b.getAttribute("data-goto"), 10);
      b.setAttribute("data-state", statusOf(k));
      b.setAttribute("aria-current", k === n && view === "stage" ? "true" : "false");
    });
    var toggle = adminBar.querySelector("[data-phase-toggle]");
    if (toggle) {
      toggle.disabled = !(view === "stage" && stageHasCoach(n));
      toggle.textContent = phase === "chat" ? "← Lesson" : "Chat →";
    }
    var where = adminBar.querySelector("[data-admin-where]");
    if (where) where.textContent = view === "stage" ? "stage " + n + " · " + phase : view;
  }

  function buildAdminBar() {
    if (!ADMIN || !TIMELINE) return;

    var bar = document.createElement("div");
    bar.className = "bw-admin";
    bar.id = "bw-admin";
    bar.setAttribute("role", "toolbar");
    bar.setAttribute("aria-label", "Admin review controls");

    var tag = el2("span", "bw-admin-tag", "ADMIN");
    bar.appendChild(tag);

    bar.appendChild(adminBtn("Skip →", "Fill this stage with sample answers and continue",
      adminSkip, "bw-admin-primary"));
    bar.appendChild(adminBtn("Fill all", "Fill every stage and unlock the whole journey",
      adminFillAll));

    var jump = el2("span", "bw-admin-jump");
    stageNumbers().forEach(function (k) {
      var b = adminBtn(String(k), "Jump to stage " + k, function () { adminGoto(k); });
      b.setAttribute("data-goto", k);
      jump.appendChild(b);
    });
    bar.appendChild(jump);

    var toggle = adminBtn("Chat →", "Switch between the lesson and the coach",
      adminTogglePhase);
    toggle.setAttribute("data-phase-toggle", "true");
    bar.appendChild(toggle);

    bar.appendChild(adminBtn("Map", "Back to the journey map", function () {
      backToMap(); renderAdminBar();
    }));
    bar.appendChild(adminBtn("Clear", "Erase everything and return to the landing", function () {
      try { window.localStorage.removeItem(CONFIG.storageKey); } catch (e) { /* nothing to clear */ }
      resetInPlace();
      renderAdminBar();
    }, "bw-admin-warn"));

    bar.appendChild(el2("span", "bw-admin-where"));
    bar.querySelector(".bw-admin-where").setAttribute("data-admin-where", "true");

    document.body.appendChild(bar);
    adminBar = bar;
    el.root.setAttribute("data-admin", "on");
    renderAdminBar();
  }

  /* ==========================================================================
     7. INIT
     ========================================================================== */

  function wireGlobal() {
    el.steps.forEach(function (node, i) {
      var n = i + 1;
      node.querySelector(".bw-step-head").addEventListener("click", function () {
        openStep(n);
      });
    });

    Array.prototype.forEach.call(document.querySelectorAll("[data-next]"), function (btn) {
      btn.addEventListener("click", function () {
        var n = parseInt(btn.getAttribute("data-next"), 10);
        // On a coaching stage, Continue moves to the coach rather than onward.
        if (TIMELINE && stageHasCoach(n) && phase === "lesson") continueFromLesson(n);
        else goNext(n);
      });
    });

    Array.prototype.forEach.call(document.querySelectorAll("[data-copy]"), function (btn) {
      var original = btn.textContent;
      btn.addEventListener("click", function () {
        var src = $(btn.getAttribute("data-copy"));
        copyText(src ? (src.value !== undefined ? src.value : src.textContent) : "", function (ok) {
          btn.textContent = ok ? "Copied" : "Copy failed";
          setTimeout(function () { btn.textContent = original; }, 2000);
        });
      });
    });

    wireConfirm(el.reset, "Press again to erase everything", function () {
      discarding = true;
      if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
      try { window.localStorage.removeItem(CONFIG.storageKey); } catch (e) { /* nothing to clear */ }
      lastSeenRaw = null;
      discarding = false;
      resetInPlace();   // not a reload: sibling blocks clear via the storage event
    });
  }

  /* Back to a blank activity without reloading the frame - a reload would only
     reset this block, and would not tell the others. */
  function resetInPlace() {
    workflowData = defaultData();
    applyRole();
    // Starting over means starting over: back to the landing, not to home.
    if (TIMELINE) { markStarted(false); setView("landing"); }
    recomputeTools();
    el.problem.value = "";
    updateProblemCount();
    renderCards();
    ["bw-ideal-outcome", "bw-ai-role"].forEach(function (id) {
      var node = document.getElementById(id);
      if (node) node.value = "";
    });
    renderVision();
    showChatError("");
    renderChatLog(true);
    el.promptV2.value = "";
    /* Deploy goes back to read-only with nothing owned: starting over is not a
       state anyone can be mid-edit in. */
    editing = false;
    editBaseline = null;
    if (el.v2Detail) el.v2Detail.hidden = true;
    if (el.v2State) el.v2State.hidden = true;
    if (el.regenV2) el.regenV2.hidden = true;
    if (el.editFinal) el.editFinal.hidden = false;
    if (el.finishStatus) el.finishStatus.textContent = "";
    el.promptV2.readOnly = true;
    el.handoff.hidden = true;
    // Every stage, not a list that has to be re-checked after each reorder -
    // showWarning() no-ops on a stage with no warning box of its own.
    stageNumbers().forEach(function (n) { showWarning(n, ""); });
    render();
    maybeStartConversation();
  }

  /* Rise sizes custom blocks from content height; this is a courtesy ping for
     any host that listens for it. Harmless everywhere else. */
  function reportHeight() {
    if (window.parent === window) return;
    var send = function () {
      // The body's own box, not documentElement.scrollHeight: scrollHeight can
      // never report less than the frame it is in, so a host that sizes the
      // frame from it can only ever grow the frame, never shrink it back.
      var box = document.body.getBoundingClientRect();
      var h = Math.ceil(box.height + box.top * 2);
      try { window.parent.postMessage({ type: "bw:height", height: h }, "*"); } catch (e) { /* cross-origin */ }
    };
    send();
    if (typeof ResizeObserver !== "undefined") {
      new ResizeObserver(send).observe(document.body);
    } else {
      window.addEventListener("resize", send);
    }
  }

  function init() {
    cacheDom();
    if (!CONFIG.followSystemDarkMode) el.root.setAttribute("data-theme", "light");
    load();
    applyRole();
    wireMap();
    recomputeTools();
    wireStep1();
    wireStep2();
    wireStep3();
    wireStep4();
    wireStep5();
    wireGlobal();
    wireSaveFlush();
    wireCrossBlockSync();
    if (workflowData.masterPromptV2) paintV2();
    buildAdminBar();     // no-op unless ?admin=1
    render();
    maybeStartConversation();
    if (ownsStep(lastStage()) && (CONFIG.blockRole !== "all" || workflowData.progress.current === lastStage())) {
      refreshV2(false);
    }
    reportHeight();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

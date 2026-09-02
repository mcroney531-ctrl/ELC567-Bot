/*
 * Builds the test-pack page from personas/results.json, so what it shows is
 * always the last real run rather than a hand-copied version of it.
 *
 *   node personas/run.mjs && node personas/report.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PERSONAS } from './personas.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const results = JSON.parse(fs.readFileSync(path.join(HERE, 'results.json'), 'utf8'));
const before = JSON.parse(fs.readFileSync(path.join(HERE, 'before.json'), 'utf8'));

const META = {
  marcus: { verdict: 'Clean run', tone: 'good',
    tests: 'Specific at every turn. The ceiling - if the activity cannot serve Marcus it cannot serve anyone.',
    watch: ['The conversation was already fine. What changed is the prompt it produces.',
            'In Rise: does chat 2 greet him by quoting his chat 1 answer? That is the cross-block continuity.'] },
  dana: { verdict: 'Now says so', tone: 'good',
    tests: 'Answers everything vaguely - and is the most common real learner. She was the defect.',
    watch: ['Four pushbacks in one run, the most of anyone. This is where the tone would grate first.',
            'She improved two answers and could not improve two. Those two are marked in the prompt.',
            'In Rise: does the pushback read as coaching, or as being told off?'] },
  amara: { verdict: 'Reconciled', tone: 'good',
    tests: 'Offers up the judgment call in chat 1, takes it back in chat 2. Both used to land in the prompt unreconciled.',
    watch: ['The conversation was already fine here too - the fix is in how the two answers get combined.',
            'In Rise: read the exception line as Amara would. Does it sound like her?'] }
};

const CHAT_TITLES = { handoff: 'Chat 1 - what to hand over', standards: 'Chat 2 - the bar, and what stays yours', guardrails: 'Chat 3 - guardrails' };
const SECTION_OF = { task: '## WHAT I NEED YOU TO DO', keep: '## WHAT STAYS WITH ME', output: '## OUTPUT I EXPECT', context: '## THINGS YOU NEED TO KNOW' };
const PUSH_SIGNATURES = ["That's the feeling, not the task", "That's a vibe rather than a spec",
                         "Let's come at it from the other side", "Try this instead."];

const esc = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/* Same light markup the activity itself renders: **bold**, and fenced blocks -
   except the finished prompt, which is held back for the end of the section. */
function renderBody(text) {
  const parts = String(text).split('```');
  let out = '';
  parts.forEach((part, i) => {
    if (i % 2 === 1) {
      out += '<div class="promptref">the finished master prompt &mdash; shown at the end of this section</div>';
    } else {
      const trimmed = part.replace(/^\n+|\n+$/g, '');
      if (trimmed) out += '<p>' + esc(trimmed).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>') + '</p>';
    }
  });
  return out;
}

function messageClass(p, msg) {
  const retry = (PERSONAS.find(x => x.id === p.id) || {}).retry || {};
  const retries = Object.values(retry);
  if (msg.who === 'learner' && retries.some(r => msg.text.trim() === r.trim())) return 'new';
  if (msg.who === 'coach' && PUSH_SIGNATURES.some(sig => msg.text.includes(sig))) return 'new';
  if (msg.who === 'coach' && msg.text.includes('needing detail')) return 'changed';
  return '';
}

/* Did the fix touch this persona's conversation at all? For two of the three it
   didn't - saying so up front saves the reader scanning for highlights. */
function chatsChanged(p) {
  return Object.keys(p.chats).some(k => (p.chats[k] || []).some(m => messageClass(p, m)));
}

function renderChat(p, key) {
  const msgs = p.chats[key] || [];
  const rows = msgs.map(m => {
    const kind = messageClass(p, m);
    const chip = kind === 'new' ? '<span class="chip chip-new">added by the fix</span>'
      : kind === 'changed' ? '<span class="chip chip-chg">reworded</span>' : '';
    const was = (kind === 'changed' && before[p.id] && before[p.id].ackWas)
      ? '<div class="was-line">was: <s>' + esc(before[p.id].ackWas) + '</s></div>' : '';
    return `<div class="msg ${m.who} ${kind}">
        <div class="msg-who">${m.who === 'coach' ? 'Coach' : 'You'}${chip}</div>
        ${was}<div class="bubble">${renderBody(m.text)}</div>
      </div>`;
  }).join('\n');
  return `<div class="chat">
      <div class="chat-hd">${CHAT_TITLES[key]}</div>
      <div class="chat-log">${rows}</div>
    </div>`;
}

/* The prompt, section by section, with a struck "was" line above anything the
   fix changed - so the comparison is local instead of across two columns. */
function renderPrompt(p) {
  const b = before[p.id] || {};
  const changedHeadings = (b.changed || []).map(k => SECTION_OF[k]).filter(Boolean);
  const wasFor = h => {
    const key = Object.keys(SECTION_OF).find(k => SECTION_OF[k] === h);
    return key && b[key] ? b[key] : null;
  };
  const lines = p.masterPrompt.split('\n');
  const blocks = [];
  let cur = { head: null, body: [] };
  lines.forEach(l => {
    if (l.startsWith('## ')) { blocks.push(cur); cur = { head: l.trim(), body: [] }; }
    else cur.body.push(l);
  });
  blocks.push(cur);

  return blocks.filter(bl => bl.head || bl.body.join('').trim()).map(bl => {
    const body = esc(bl.body.join('\n').replace(/^\n+|\n+$/g, ''))
      .replace(/\[NEEDS DETAIL[^\]]*\]/g, '<span class="flag">$&</span>');
    if (!bl.head) return `<div class="psec"><pre>${body}</pre></div>`;
    const changed = changedHeadings.includes(bl.head);
    const wasText = changed ? wasFor(bl.head) : null;
    return `<div class="psec${changed ? ' psec-changed' : ''}">
        <div class="psec-h">${esc(bl.head)}${changed ? '<span class="chip chip-new">changed</span>' : ''}</div>
        ${wasText ? '<div class="was-line">was: <s>' + esc(wasText) + '</s></div>' : ''}
        <pre>${body}</pre>
      </div>`;
  }).join('\n');
}

function renderInputs(p) {
  const steps = p.inputs.steps.map((s, i) =>
    `<li><span>${esc(s[0])}</span><span class="tool">${esc(s[1])}</span></li>`).join('');
  const persona = PERSONAS.find(x => x.id === p.id) || {};
  const retryRows = persona.retry
    ? `<div class="fld"><span class="k">When the coach pushes back, answer these in order</span>
         <span class="v">${Object.values(persona.retry).map((r, i) => (i + 1) + '. ' + esc(r)).join('<br>')}</span></div>` : '';
  return `<div class="inputs">
      <div class="inputs-hd">Type this in</div>
      <div class="inputs-bd">
        <div class="fld"><span class="k">Block 1 &mdash; the problem</span><span class="v">${esc(p.inputs.problem)}</span></div>
        <div class="fld"><span class="k">Block 1 &mdash; the workflow</span><ol class="flow">${steps}</ol></div>
        <div class="fld"><span class="k">Chat 1</span><span class="v">${esc(p.inputs.answers.handoff)}</span></div>
        <div class="fld"><span class="k">Chat 2, first answer</span><span class="v">${esc(p.inputs.answers.output)}</span></div>
        <div class="fld"><span class="k">Chat 2, second answer</span><span class="v">${esc(p.inputs.answers.keep)}</span></div>
        <div class="fld"><span class="k">Chat 3</span><span class="v">${esc(p.inputs.answers.context)}</span></div>
        ${retryRows}
      </div>
    </div>`;
}

const personaSections = results.map((p, idx) => {
  const m = META[p.id];
  return `<section class="persona" id="${p.id}">
    <div class="p-head">
      <div class="p-title">
        <span class="p-num">Persona ${idx + 1}</span>
        <h2>${esc(p.name)}</h2>
        <span class="p-role">${esc(p.role)}</span>
      </div>
      <span class="verdict">${esc(m.verdict)}</span>
    </div>
    <p class="p-tests">${esc(m.tests)}</p>

    ${renderInputs(p)}

    <h3 class="step-h"><span>1</span> The conversation</h3>
    ${chatsChanged(p) ? '' : '<p class="unchanged-note">Nothing in this conversation changed. The fix for ' + esc(p.name.split(' ')[0]) + ' shows up in the prompt below.</p>'}
    ${renderChat(p, 'handoff')}
    ${renderChat(p, 'standards')}
    ${renderChat(p, 'guardrails')}

    <h3 class="step-h"><span>2</span> The master prompt it produces</h3>
    <div class="prompt">${renderPrompt(p)}</div>

    <h3 class="step-h"><span>3</span> What to watch</h3>
    <ul class="watch">${m.watch.map(w => '<li>' + w + '</li>').join('')}</ul>
  </section>`;
}).join('\n');

const html = `<title>Workflow Coach Test Pack</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Libre+Franklin:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>
  :root {
    --paper:#ffffff; --panel:#f6f8fc; --sunk:#eef2f9;
    --line:#dde4f0; --line-2:#c2cde1;
    --navy:#0f2757; --navy-mid:#1e4691; --navy-soft:#e9eff9;
    --ink:#0f1729; --muted:#54607a; --faint:#8590a8;
    --was:#a52a1f; --was-bg:#fdf1ef; --was-line:#f3c9c2;
    --now:#0a6b46; --now-bg:#ecf7f1; --now-line:#a9dcc4;
    --flag:#8a5000; --flag-bg:#fdf1dc;
    --sans:"Libre Franklin",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
    --mono:"IBM Plex Mono",ui-monospace,Menlo,Consolas,monospace;
  }
  *{box-sizing:border-box}
  body{margin:0;background:var(--paper);color:var(--ink);font-family:var(--sans);font-size:16px;line-height:1.6;-webkit-font-smoothing:antialiased}
  .wrap{max-width:820px;margin:0 auto;padding:36px 22px 72px}
  h1,h2,h3{margin:0;text-wrap:balance}
  h1{font-size:clamp(1.8rem,1.3rem+2vw,2.5rem);font-weight:700;letter-spacing:-.02em;line-height:1.12;color:var(--navy)}
  h2{font-size:1.3rem;font-weight:650;letter-spacing:-.01em;color:var(--navy)}
  p{margin:0}
  a{color:var(--navy-mid)}
  .eyebrow{font-family:var(--mono);font-size:.72rem;letter-spacing:.15em;text-transform:uppercase;color:var(--navy-mid)}
  .lede{font-size:1.06rem;color:var(--muted);max-width:62ch}

  header.top{border-bottom:3px solid var(--navy);padding-bottom:22px;margin-bottom:26px;display:flex;flex-direction:column;gap:14px}
  nav.jump{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:30px}
  nav.jump a{font-size:.83rem;font-weight:550;text-decoration:none;color:var(--navy);background:var(--navy-soft);border:1px solid var(--line);padding:6px 12px;border-radius:999px}
  nav.jump a:hover{background:var(--navy);color:#fff;border-color:var(--navy)}

  .legend{display:flex;flex-wrap:wrap;gap:16px;padding:12px 16px;background:var(--panel);border:1px solid var(--line);border-radius:8px;font-size:.86rem}
  .key{display:inline-flex;align-items:center;gap:7px}
  .sw{width:12px;height:12px;border-radius:3px;border:1px solid}
  .sw-new{background:var(--now-bg);border-color:var(--now)}
  .sw-chg{background:var(--was-bg);border-color:var(--was)}
  .sw-same{background:var(--paper);border-color:var(--line-2)}

  .note{border-left:3px solid var(--navy);background:var(--navy-soft);padding:13px 16px;font-size:.93rem;border-radius:0 6px 6px 0}

  section.persona{border:1px solid var(--line);border-radius:12px;padding:26px 24px;margin-bottom:34px;background:var(--paper);display:flex;flex-direction:column;gap:18px}
  .p-head{display:flex;justify-content:space-between;align-items:flex-start;gap:14px;flex-wrap:wrap}
  .p-title{display:flex;flex-direction:column;gap:2px}
  .p-num{font-family:var(--mono);font-size:.7rem;letter-spacing:.12em;text-transform:uppercase;color:var(--faint)}
  .p-role{font-size:.9rem;color:var(--muted)}
  .verdict{font-size:.72rem;font-weight:650;letter-spacing:.05em;text-transform:uppercase;color:var(--now);background:var(--now-bg);border:1px solid var(--now-line);padding:5px 11px;border-radius:4px;white-space:nowrap}
  .p-tests{font-size:.95rem;color:var(--muted);max-width:66ch}

  .step-h{display:flex;align-items:center;gap:9px;font-size:.78rem;font-weight:650;letter-spacing:.1em;text-transform:uppercase;color:var(--navy);margin-top:6px}
  .step-h span{width:20px;height:20px;border-radius:50%;background:var(--navy);color:#fff;display:grid;place-items:center;font-size:.68rem;font-family:var(--mono)}

  .inputs{border:1px solid var(--line);border-radius:8px;overflow:hidden}
  .inputs-hd{padding:8px 14px;background:var(--navy);color:#fff;font-size:.72rem;font-weight:600;letter-spacing:.09em;text-transform:uppercase}
  .inputs-bd{padding:14px;display:flex;flex-direction:column;gap:11px;background:var(--panel)}
  .fld{display:flex;flex-direction:column;gap:3px}
  .fld .k{font-size:.7rem;font-weight:650;letter-spacing:.07em;text-transform:uppercase;color:var(--navy-mid)}
  .fld .v{font-family:var(--mono);font-size:.82rem;line-height:1.55}
  ol.flow{margin:2px 0 0;padding:0;list-style:none;counter-reset:s;display:flex;flex-direction:column;gap:3px}
  ol.flow li{counter-increment:s;display:grid;grid-template-columns:20px 1fr auto;gap:8px;font-family:var(--mono);font-size:.82rem;align-items:baseline}
  ol.flow li::before{content:counter(s) ".";color:var(--faint)}
  ol.flow .tool{color:var(--muted);font-size:.76rem}

  .chat{border:1px solid var(--line);border-radius:10px;overflow:hidden}
  .chat-hd{padding:8px 14px;background:var(--sunk);border-bottom:1px solid var(--line);font-size:.72rem;font-weight:650;letter-spacing:.08em;text-transform:uppercase;color:var(--navy)}
  .chat-log{padding:14px;display:flex;flex-direction:column;gap:13px;background:var(--panel)}
  .msg{display:flex;flex-direction:column;gap:4px;max-width:86%}
  .msg.learner{align-self:flex-end;align-items:flex-end}
  .msg-who{display:flex;align-items:center;gap:7px;font-size:.66rem;font-weight:650;letter-spacing:.09em;text-transform:uppercase;color:var(--faint)}
  .bubble{padding:10px 13px;border-radius:12px;font-size:.9rem;line-height:1.55;background:var(--paper);border:1px solid var(--line-2);border-bottom-left-radius:4px}
  .msg.learner .bubble{background:var(--navy);color:#fff;border-color:var(--navy);border-bottom-left-radius:12px;border-bottom-right-radius:4px}
  .bubble p+p{margin-top:8px}
  .msg.new .bubble{border-color:var(--now);background:var(--now-bg)}
  .msg.learner.new .bubble{background:var(--now);border-color:var(--now);color:#fff}
  .msg.changed .bubble{border-color:var(--line-2);border-left:4px solid var(--was)}
  .chip{font-size:.6rem;font-weight:650;letter-spacing:.06em;text-transform:uppercase;padding:2px 6px;border-radius:3px}
  .chip-new{background:var(--now-bg);color:var(--now);border:1px solid var(--now-line)}
  .chip-chg{background:var(--was-bg);color:var(--was);border:1px solid var(--was-line)}
  .was-line{font-size:.78rem;color:var(--was);font-family:var(--mono)}
  .was-line s{opacity:.85}
  .promptref{font-size:.8rem;font-style:italic;color:var(--muted);border-left:2px solid var(--line-2);padding-left:9px}

  .prompt{border:1px solid var(--line);border-radius:10px;overflow:hidden;background:var(--panel)}
  .psec{padding:11px 14px;border-bottom:1px solid var(--line)}
  .psec:last-child{border-bottom:0}
  .psec-changed{background:var(--now-bg)}
  .psec-h{display:flex;align-items:center;gap:8px;font-family:var(--mono);font-size:.74rem;font-weight:500;color:var(--navy-mid);margin-bottom:5px}
  .psec pre{margin:0;font-family:var(--mono);font-size:.79rem;line-height:1.6;white-space:pre-wrap;word-break:break-word;overflow-x:auto}
  .flag{background:var(--flag-bg);color:var(--flag);padding:1px 4px;border-radius:3px;font-weight:500}

  .unchanged-note{font-size:.88rem;color:var(--muted);background:var(--sunk);border:1px solid var(--line);border-radius:6px;padding:9px 13px}
  ul.watch{margin:0;padding-left:20px;display:flex;flex-direction:column;gap:6px;font-size:.93rem}

  table{width:100%;border-collapse:collapse;font-size:.92rem}
  th,td{text-align:left;padding:10px 11px;border-bottom:1px solid var(--line);vertical-align:top}
  th{font-size:.7rem;text-transform:uppercase;letter-spacing:.08em;color:var(--faint);font-weight:650}
  td:first-child{white-space:nowrap}
  .fixed{font-family:var(--mono);font-size:.7rem;color:var(--now);background:var(--now-bg);padding:2px 7px;border-radius:3px}
  code{font-family:var(--mono);font-size:.87em;background:var(--sunk);padding:1px 5px;border-radius:3px}

  .report{border:1px solid var(--line-2);border-left:3px solid var(--navy);border-radius:0 8px 8px 0;padding:18px;background:var(--panel)}
  .report h4{margin:0 0 6px;font-size:.75rem;text-transform:uppercase;letter-spacing:.09em;color:var(--navy)}
  .report ul{margin:0;padding-left:20px;display:flex;flex-direction:column;gap:5px;font-size:.93rem}
  .report ul+h4{margin-top:14px}
  footer{border-top:1px solid var(--line);margin-top:40px;padding-top:18px;font-size:.84rem;color:var(--faint)}
  ::selection{background:var(--navy);color:#fff}
  @media (max-width:600px){ .msg{max-width:96%} section.persona{padding:20px 16px} }
</style>

<div class="wrap">
  <header class="top">
    <p class="eyebrow">Persona testing &middot; scripted coach</p>
    <h1>Workflow Coach Test Pack</h1>
    <p class="lede">Three people, three complete run-throughs. Read each one top to bottom: what they
      type, the conversation it produces, then the master prompt at the end.</p>
    <div class="legend">
      <span class="key"><span class="sw sw-new"></span> added or changed by the fix</span>
      <span class="key"><span class="sw sw-chg"></span> reworded &mdash; the old version is struck through</span>
      <span class="key"><span class="sw sw-same"></span> unchanged</span>
    </div>
    <div class="note"><strong>These are real runs.</strong> Every message and prompt below came from
      driving the built files, not from a mock-up. The coach is the built-in scripted one, so you are
      testing the questions and the artifact rather than the bot's judgement &mdash; re-run these three
      the day a live endpoint goes in and the difference is what the model buys you.</div>
  </header>

  <nav class="jump">
    ${results.map((p, i) => `<a href="#${p.id}">${i + 1}. ${esc(p.name.split(' ')[0])}</a>`).join('')}
    <a href="#changed">What changed</a>
    <a href="#report">Report back</a>
  </nav>

  ${personaSections}

  <section class="persona" id="changed">
    <h2>What the runs found, and what changed</h2>
    <p class="p-tests">All four were in how the prompt gets assembled, not in the plumbing &mdash; no
      page errors, no sync problems, every block behaved.</p>
    <div style="overflow-x:auto"><table>
      <thead><tr><th></th><th>What was wrong</th><th>Found by</th><th>What it does now</th></tr></thead>
      <tbody>
        <tr><td><span class="fixed">fixed</span></td>
          <td><strong>No quality floor.</strong> A prompt built from empty answers looked exactly as
            finished as one built from good answers.</td><td>Dana</td>
          <td>One concrete re-ask. Anything still thin is marked <code>[NEEDS DETAIL]</code>, flagged
            above the prompt, and named in a closing instruction to the assistant.</td></tr>
        <tr><td><span class="fixed">fixed</span></td>
          <td><strong>Contradictions passed through.</strong> Nothing read the answers against each
            other.</td><td>Amara</td>
          <td>A sweeping handoff next to a carve-out now produces an explicit exception clause with a
            do-not instruction.</td></tr>
        <tr><td><span class="fixed">fixed</span></td>
          <td><strong>Answers pasted in verbatim.</strong> The prompt read as a transcript of
            complaints.</td><td>All three</td>
          <td>The task section names the workflow step, in instruction voice. Sentences that only
            describe how long it takes are dropped.</td></tr>
        <tr><td><span class="fixed">fixed</span></td>
          <td><strong>The coach praised answers it was about to flag.</strong></td>
          <td>Found while fixing the others</td>
          <td>A thin answer accepted after a pushback gets an honest acknowledgment instead.</td></tr>
      </tbody>
    </table></div>
    <div class="note"><strong>These are heuristics, and worth being straight about.</strong>
      &ldquo;Too vague&rdquo; is judged on length, hedging phrases, and whether anything concrete
      appears &mdash; tuned against these three. It will sometimes push back on a short but good
      answer, and sometimes let a fluent but empty one through. A live coach judges it properly; the
      heuristics are the floor that holds when the endpoint is down.</div>
  </section>

  <section class="persona" id="report">
    <h2>What to send back</h2>
    <div class="report">
      <h4>Per persona</h4>
      <ul>
        <li>Did each chat unlock as you scrolled, and greet you correctly?</li>
        <li>Did chat 2 quote chat 1's answer, and chat 3 quote chat 2's?</li>
        <li>Paste the final master prompt &mdash; I'll diff it against the run above.</li>
      </ul>
      <h4>Judgement calls I'd rather you made</h4>
      <ul>
        <li>Does the pushback read as coaching or as scolding? Dana gets four in one run.</li>
        <li>Would you rather a thin section came through marked, as it does now, or stayed a
          bracketed blank the learner fills in?</li>
      </ul>
      <h4>Overall</h4>
      <ul>
        <li>Did any block get clipped by its Rise height?</li>
        <li>Did the copy button work on your machine?</li>
      </ul>
    </div>
  </section>

  <footer>Generated from <code>personas/results.json</code> by <code>personas/report.mjs</code>.
    Re-run <code>node personas/run.mjs &amp;&amp; node personas/report.mjs</code> after any change to
    the activity and this page follows.</footer>
</div>`;

fs.writeFileSync(path.join(HERE, 'report.html'), html);
console.log('wrote personas/report.html (' + (html.length / 1024).toFixed(0) + ' KB)');

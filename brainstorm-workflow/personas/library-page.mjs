/*
 * Builds the copy-and-paste persona library page from personas/library.mjs.
 *   node personas/library-page.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LIBRARY, TAGS } from './library.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const esc = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const field = (label, value) => `
  <div class="fld">
    <div class="fld-k">${label}</div>
    <div class="fld-v" data-copy>${esc(value)}</div>
    <button class="cp" type="button">Copy</button>
  </div>`;

const stepRow = (s, i) => `
  <div class="stp">
    <span class="stp-n">${i + 1}</span>
    <span class="stp-a" data-copy>${esc(s[0])}</span>
    <button class="cp cp-s" type="button">Copy</button>
    <span class="stp-t" data-copy>${esc(s[1])}</span>
    <button class="cp cp-s" type="button">Copy</button>
  </div>`;

const card = p => `
<article class="p" data-tags="${p.tags.join(' ')}" data-search="${esc((p.name + ' ' + p.role + ' ' + p.tests + ' ' + p.problem).toLowerCase())}" id="p-${p.id}">
  <button class="p-hd" type="button" aria-expanded="false">
    <span class="p-name">${esc(p.name)}${p.core ? '<span class="core">regression set</span>' : ''}</span>
    <span class="p-role">${esc(p.role)}</span>
    <span class="p-tags">${p.tags.map(t => `<span class="tg tg-${t}">${esc(TAGS[t] || t)}</span>`).join('')}</span>
    <span class="p-caret" aria-hidden="true">+</span>
  </button>
  <div class="p-body" hidden>
    <p class="p-tests">${esc(p.tests)}</p>

    <div class="grp">
      <div class="grp-h">Block 1 &mdash; the problem</div>
      ${field('Paste into the problem box', p.problem)}
    </div>

    <div class="grp">
      <div class="grp-h">Block 1 &mdash; the workflow${p.steps.length > 2 ? ` <em>(${p.steps.length} steps &mdash; add ${p.steps.length - 2} card${p.steps.length - 2 > 1 ? 's' : ''})</em>` : ''}</div>
      <div class="stp-hd"><span></span><span>What you do</span><span></span><span>Where you do it</span><span></span></div>
      ${p.steps.map(stepRow).join('')}
    </div>

    <div class="grp">
      <div class="grp-h">The three chats</div>
      ${field('Chat 1 &mdash; what to hand over', p.handoff)}
      ${field('Chat 2, first answer &mdash; what good looks like', p.output)}
      ${field('Chat 2, second answer &mdash; what stays yours', p.keep)}
      ${field('Chat 3 &mdash; guardrails', p.context)}
    </div>

    ${p.retry ? `<div class="grp grp-retry">
      <div class="grp-h">If the coach pushes back, answer with these</div>
      ${field('Chat 1 again', p.retry.handoff)}
      ${field('Chat 2 again, first', p.retry.output)}
      ${field('Chat 2 again, second', p.retry.keep)}
      ${field('Chat 3 again', p.retry.context)}
    </div>` : '<p class="no-retry">This persona answers specifically enough that the coach should never push back. If it does, that is worth telling me about.</p>'}
  </div>
</article>`;

const SHORT = { clean: 'Specific', vague: 'Vague', contradiction: 'Contradicts',
  'keeps-all': 'Keeps everything', edge: 'Edge case', subjective: 'Subjective', regulated: 'Regulated' };
const counts = Object.keys(TAGS).map(t => [t, LIBRARY.filter(p => p.tags.includes(t)).length]);

const html = `<title>Persona Library</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Libre+Franklin:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>
  :root{
    --paper:#fff;--panel:#f6f8fc;--sunk:#eef2f9;--line:#dde4f0;--line-2:#c2cde1;
    --navy:#0f2757;--navy-mid:#1e4691;--navy-soft:#e9eff9;
    --ink:#0f1729;--muted:#54607a;--faint:#8590a8;--now:#0a6b46;--now-bg:#ecf7f1;
    --sans:"Libre Franklin",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
    --mono:"IBM Plex Mono",ui-monospace,Menlo,Consolas,monospace;
  }
  *{box-sizing:border-box}
  body{margin:0;background:var(--paper);color:var(--ink);font-family:var(--sans);font-size:16px;line-height:1.55}
  .wrap{max-width:900px;margin:0 auto;padding:34px 20px 70px}
  h1{margin:0;font-size:clamp(1.7rem,1.3rem+1.8vw,2.3rem);font-weight:700;letter-spacing:-.02em;color:var(--navy)}
  .eyebrow{font-family:var(--mono);font-size:.7rem;letter-spacing:.15em;text-transform:uppercase;color:var(--navy-mid)}
  .lede{color:var(--muted);max-width:64ch;margin:10px 0 0}
  header{border-bottom:3px solid var(--navy);padding-bottom:20px;margin-bottom:18px}

  .tip{background:var(--navy-soft);border-left:3px solid var(--navy);border-radius:0 6px 6px 0;padding:11px 15px;font-size:.92rem;margin-bottom:18px}

  .controls{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:8px;position:sticky;top:0;background:var(--paper);padding:10px 0;z-index:5;border-bottom:1px solid var(--line)}
  #q{flex:1 1 200px;min-width:160px;font:inherit;font-size:.9rem;padding:8px 12px;border:1px solid var(--line-2);border-radius:7px;color:var(--ink);background:var(--paper)}
  .fbtn{font:inherit;font-size:.8rem;font-weight:550;padding:6px 11px;border-radius:999px;border:1px solid var(--line-2);background:var(--paper);color:var(--navy);cursor:pointer}
  .fbtn[aria-pressed="true"]{background:var(--navy);color:#fff;border-color:var(--navy)}
  .fbtn .n{opacity:.6;font-family:var(--mono);font-size:.9em}
  .count{font-size:.83rem;color:var(--faint);margin:10px 0 14px}

  .p{border:1px solid var(--line);border-radius:10px;margin-bottom:10px;overflow:hidden;background:var(--paper);scroll-margin-top:130px}
  .p.open{border-color:var(--navy-mid)}
  .p-hd{width:100%;display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,1fr) auto 22px;gap:12px;align-items:center;
        padding:13px 15px;background:none;border:0;text-align:left;font:inherit;cursor:pointer;color:inherit}
  .p-hd:hover{background:var(--panel)}
  .p.open .p-hd{background:var(--navy);color:#fff}
  .p-name{font-weight:650;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
  .core{font-family:var(--mono);font-size:.6rem;letter-spacing:.06em;text-transform:uppercase;background:var(--now-bg);color:var(--now);border:1px solid var(--now);padding:1px 5px;border-radius:3px}
  .p.open .core{background:transparent;color:#bfe8d4;border-color:#bfe8d4}
  .p-role{font-size:.88rem;color:var(--muted)}
  .p.open .p-role{color:#c9d6ee}
  .p-tags{display:flex;gap:5px;flex-wrap:wrap;justify-self:end}
  .tg{font-size:.66rem;font-weight:600;letter-spacing:.03em;padding:2px 7px;border-radius:3px;background:var(--sunk);color:var(--navy-mid);white-space:nowrap}
  .p.open .tg{background:rgba(255,255,255,.16);color:#fff}
  .p-caret{font-family:var(--mono);font-size:1.05rem;justify-self:end}
  .p.open .p-caret::after{content:"\\2212"}
  .p.open .p-caret{font-size:0}
  .p.open .p-caret::after{font-size:1.05rem}

  .p-body{padding:16px 15px 18px;display:flex;flex-direction:column;gap:14px;background:var(--panel);border-top:1px solid var(--line)}
  .p-tests{margin:0;font-size:.9rem;color:var(--muted)}
  .grp{border:1px solid var(--line);border-radius:8px;background:var(--paper);overflow:hidden}
  .grp-h{padding:7px 12px;background:var(--sunk);border-bottom:1px solid var(--line);font-size:.7rem;font-weight:650;letter-spacing:.08em;text-transform:uppercase;color:var(--navy)}
  .grp-h em{font-weight:500;text-transform:none;letter-spacing:0;color:var(--muted)}
  .grp-retry{border-color:var(--line-2)}

  .fld{display:grid;grid-template-columns:1fr auto;gap:6px 10px;padding:10px 12px;border-bottom:1px solid var(--line)}
  .fld:last-child{border-bottom:0}
  .fld-k{grid-column:1/3;font-size:.68rem;font-weight:650;letter-spacing:.06em;text-transform:uppercase;color:var(--navy-mid)}
  .fld-v{font-family:var(--mono);font-size:.81rem;line-height:1.55}
  .cp{align-self:start;font:inherit;font-size:.72rem;font-weight:600;padding:4px 10px;border-radius:5px;border:1px solid var(--line-2);background:var(--paper);color:var(--navy);cursor:pointer;white-space:nowrap}
  .cp:hover{background:var(--navy);color:#fff;border-color:var(--navy)}
  .cp.done{background:var(--now);border-color:var(--now);color:#fff}

  .stp-hd,.stp{display:grid;grid-template-columns:20px minmax(0,1.5fr) auto minmax(0,1fr) auto;gap:8px;align-items:center;padding:6px 12px}
  .stp-hd{font-size:.64rem;letter-spacing:.07em;text-transform:uppercase;color:var(--faint);border-bottom:1px solid var(--line);padding-top:8px;padding-bottom:8px}
  .stp{border-bottom:1px solid var(--line);font-family:var(--mono);font-size:.79rem}
  .stp:last-child{border-bottom:0}
  .stp-n{color:var(--faint)}
  .cp-s{font-size:.66rem;padding:3px 7px}
  .no-retry{margin:0;font-size:.85rem;color:var(--muted);font-style:italic}

  @media (max-width:720px){
    .p-hd{grid-template-columns:1fr 22px}
    .p-role,.p-tags{grid-column:1/2}
    .p-tags{justify-self:start}
    .stp-hd,.stp{grid-template-columns:16px 1fr auto;row-gap:4px}
    .stp-hd span:nth-child(4),.stp-hd span:nth-child(5){display:none}
    .stp-t{grid-column:2/3}
  }
  ::selection{background:var(--navy);color:#fff}
</style>

<div class="wrap">
  <header>
    <p class="eyebrow">Manual testing &middot; ${LIBRARY.length} runs</p>
    <h1>Persona Library</h1>
    <p class="lede">Open one, copy each field into the activity as you go. Every field maps to exactly
      one input, in the order you meet them.</p>
  </header>

  <div class="tip"><strong>Press Start over before each new persona.</strong> It's in the footer of any
    block, and takes two presses. Otherwise the previous run's answers are still in storage and the
    chats will greet you with someone else's workflow.</div>

  <div class="controls">
    <input id="q" type="search" placeholder="Search by name, job, or task&hellip;" autocomplete="off">
    ${counts.map(([t, n]) => `<button class="fbtn" type="button" data-tag="${t}" aria-pressed="false" title="${esc(TAGS[t])}">${esc(SHORT[t] || t)} <span class="n">${n}</span></button>`).join('')}
    <button class="fbtn" type="button" id="rand">Surprise me</button>
  </div>
  <p class="count" id="count"></p>

  ${LIBRARY.map(card).join('')}
</div>

<script>
(function () {
  var cards = [].slice.call(document.querySelectorAll('.p'));
  var q = document.getElementById('q');
  var countEl = document.getElementById('count');
  var active = [];

  function apply() {
    var term = q.value.trim().toLowerCase();
    var shown = 0;
    cards.forEach(function (c) {
      var tags = c.getAttribute('data-tags').split(' ');
      var okTag = !active.length || active.every(function (t) { return tags.indexOf(t) !== -1; });
      var okTerm = !term || c.getAttribute('data-search').indexOf(term) !== -1;
      var show = okTag && okTerm;
      c.hidden = !show;
      if (show) shown++;
    });
    countEl.textContent = shown === cards.length
      ? cards.length + ' personas'
      : shown + ' of ' + cards.length + ' personas';
  }

  [].forEach.call(document.querySelectorAll('.fbtn[data-tag]'), function (b) {
    b.addEventListener('click', function () {
      var t = b.getAttribute('data-tag');
      var i = active.indexOf(t);
      if (i === -1) { active.push(t); b.setAttribute('aria-pressed', 'true'); }
      else { active.splice(i, 1); b.setAttribute('aria-pressed', 'false'); }
      apply();
    });
  });
  q.addEventListener('input', apply);

  // Expand / collapse
  cards.forEach(function (c) {
    var hd = c.querySelector('.p-hd'), body = c.querySelector('.p-body');
    hd.addEventListener('click', function () {
      var open = c.classList.toggle('open');
      body.hidden = !open;
      hd.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  });

  document.getElementById('rand').addEventListener('click', function () {
    var vis = cards.filter(function (c) { return !c.hidden; });
    if (!vis.length) return;
    cards.forEach(function (c) {
      c.classList.remove('open');
      c.querySelector('.p-body').hidden = true;
      c.querySelector('.p-hd').setAttribute('aria-expanded', 'false');
    });
    var pick = vis[Math.floor(Math.random() * vis.length)];
    pick.classList.add('open');
    pick.querySelector('.p-body').hidden = false;
    pick.querySelector('.p-hd').setAttribute('aria-expanded', 'true');
    pick.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  /* Same order the activity uses: the synchronous path first, because it works
     in an embedded frame that was never granted clipboard-write. */
  function legacyCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', '');
    ta.style.position = 'fixed'; ta.style.top = '-1000px';
    document.body.appendChild(ta); ta.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    document.body.removeChild(ta);
    return ok;
  }

  document.addEventListener('click', function (e) {
    var btn = e.target.closest ? e.target.closest('.cp') : null;
    if (!btn) return;
    var src = btn.previousElementSibling;
    while (src && !src.hasAttribute('data-copy')) src = src.previousElementSibling;
    if (!src) return;
    var text = src.textContent;
    var done = function (ok) {
      btn.textContent = ok ? 'Copied' : 'Select it';
      btn.classList.toggle('done', ok);
      if (!ok && window.getSelection) {
        var r = document.createRange(); r.selectNodeContents(src);
        var sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r);
      }
      setTimeout(function () { btn.textContent = 'Copy'; btn.classList.remove('done'); }, 1600);
    };
    if (legacyCopy(text)) { done(true); return; }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { done(true); }, function () { done(false); });
    } else { done(false); }
  });

  apply();
})();
</script>`;

fs.writeFileSync(path.join(HERE, 'library.html'), html);
console.log('wrote personas/library.html (' + (html.length / 1024).toFixed(0) + ' KB, ' + LIBRARY.length + ' personas)');

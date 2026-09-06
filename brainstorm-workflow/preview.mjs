/*
 * Builds dist/preview.html - the whole lesson, nine blocks deep, the way it
 * will sit in Rise. It loads the built files themselves rather than a copy of
 * index.html, so what you preview is exactly what you paste.
 *
 *   npm run preview     builds, then serves it at http://127.0.0.1:8080
 *
 * A server is required: Chromium gives a file:// page no localStorage, and
 * without localStorage the blocks cannot see each other's work.
 *
 * Pass --inline to emit a single self-contained file with every block embedded,
 * for hosting somewhere that has no sibling files to link to.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LESSON } from './blocks.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, 'dist');


const esc = t => String(t)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function body(inline) {
  const frames = LESSON.map((b, i) => {
    const src = inline
      ? `srcdoc="${fs.readFileSync(path.join(OUT, b.file), 'utf8')
          .replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"`
      : `src="${b.file}"`;
    return `
  <section class="pv-block" id="b${i + 1}">
    <header class="pv-head">
      <span class="pv-tag">Block ${i + 1}</span>
      <h2>${esc(b.title)}</h2>
      <code>blockRole: "${esc(b.role)}"</code>
    </header>
    <p class="pv-rise">${esc(b.rise)}</p>
    <iframe class="pv-frame" title="Block ${i + 1} - ${esc(b.title)}" ${src}></iframe>
  </section>`;
  }).join('\n');

  return `<title>Nine-Block Lesson Preview</title>
<style>
  :root {
    color-scheme: light;
    --pv-ink: #1b1633; --pv-mute: #6b6484; --pv-line: #e4e0ef;
    --pv-bg: #f6f4fb; --pv-card: #ffffff; --pv-accent: #6d5ce7;
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--pv-bg); color: var(--pv-ink);
         font: 15px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }

  .pv-bar { position: sticky; top: 0; z-index: 10; display: flex; gap: 10px; align-items: center;
            flex-wrap: wrap; padding: 10px 16px; background: rgba(255,255,255,.92);
            backdrop-filter: blur(8px); border-bottom: 1px solid var(--pv-line); }
  .pv-bar strong { font-size: 14px; letter-spacing: -.01em; }
  .pv-bar .pv-sp { flex: 1 1 auto; }
  .pv-jump { display: flex; gap: 4px; flex-wrap: wrap; }
  .pv-jump a { display: grid; place-items: center; width: 26px; height: 26px; border-radius: 7px;
               text-decoration: none; color: var(--pv-mute); font-size: 12px; font-weight: 600;
               background: #f0edf9; }
  .pv-jump a:hover { background: var(--pv-accent); color: #fff; }
  .pv-btn { border: 1px solid var(--pv-line); background: #fff; color: var(--pv-ink); cursor: pointer;
            border-radius: 8px; padding: 6px 12px; font: inherit; font-size: 13px; font-weight: 600;
            text-decoration: none; display: inline-block; }
  .pv-btn:hover { border-color: var(--pv-accent); color: var(--pv-accent); }
  .pv-note { font-size: 12px; color: var(--pv-mute); }

  .pv-wrap { max-width: 860px; margin: 0 auto; padding: 24px 16px 80px; }
  .pv-lede { margin: 8px 0 28px; color: var(--pv-mute); font-size: 14px; }
  .pv-lede code { background: #ece8f8; border-radius: 4px; padding: 1px 5px; font-size: 12.5px; }

  .pv-block { margin: 0 0 34px; }
  .pv-head { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; margin: 0 0 6px; }
  .pv-head h2 { margin: 0; font-size: 16px; font-weight: 650; letter-spacing: -.01em; }
  .pv-tag { font-size: 11px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase;
            color: var(--pv-accent); }
  .pv-head code { font-size: 11.5px; color: var(--pv-mute); }
  .pv-rise { margin: 0 0 12px; padding: 12px 14px; border-left: 3px solid var(--pv-line);
             background: #fff; border-radius: 0 8px 8px 0; color: var(--pv-mute); font-size: 13.5px; }
  .pv-frame { display: block; width: 100%; height: 340px; border: 1px solid var(--pv-line);
              transition: height .18s ease;
              border-radius: 14px; background: var(--pv-card); }
</style>

<script>
  /* Start over has to clear storage AFTER the reload, not before: every block
     flushes its state on the way out, which would write it straight back. */
  (function () {
    try {
      if (sessionStorage.getItem("pv-reset")) {
        sessionStorage.removeItem("pv-reset");
        localStorage.removeItem("brainstorm_workflow_data");
      }
    } catch (e) { /* storage unavailable; the buttons below will say so */ }
  })();
</script>

<div class="pv-bar">
  <strong>Nine-block preview</strong>
  <span class="pv-note" id="pv-status">Checking storage&hellip;</span>
  <span class="pv-sp"></span>
  <nav class="pv-jump" aria-label="Jump to block">
    ${LESSON.map((b, i) => `<a href="#b${i + 1}" title="${esc(b.title)}">${i + 1}</a>`).join('')}
  </nav>
  <a class="pv-btn" href="builder.html">Lesson builder</a>
  <button type="button" class="pv-btn" id="pv-reset">Start over</button>
</div>

<div class="pv-wrap">
  <p class="pv-lede">
    The whole lesson, in order, using the built files from <code>dist/</code> verbatim &mdash; so what
    you see here is what you paste into Rise. The grey bands stand in for your own Rise text between
    the blocks. Each block sizes itself to its content, and they share state exactly as they will in
    a published lesson: fill in block 2, and blocks 3 onward unlock themselves.
  </p>
${frames}
</div>

<script>
  /* The activity posts its height on every resize; use it so a long chat isn't
     trapped behind an inner scrollbar the way a fixed-height frame would. */
  var FRAMES = Array.prototype.slice.call(document.querySelectorAll(".pv-frame"));
  window.addEventListener("message", function (e) {
    if (!e.data || e.data.type !== "bw:height") return;
    for (var i = 0; i < FRAMES.length; i++) {
      if (FRAMES[i].contentWindow === e.source) {
        FRAMES[i].style.height = Math.max(180, e.data.height + 4) + "px";
        return;
      }
    }
  });

  document.getElementById("pv-reset").addEventListener("click", function () {
    try { sessionStorage.setItem("pv-reset", "1"); } catch (e) { /* handled below */ }
    location.reload();
  });

  /* Say plainly whether the blocks can see each other, because a file:// preview
     silently can't and that looks like a bug in the activity. */
  (function () {
    var node = document.getElementById("pv-status");
    var ok = false;
    try { localStorage.setItem("pv-probe", "1"); localStorage.removeItem("pv-probe"); ok = true; }
    catch (e) { ok = false; }
    node.textContent = ok
      ? "Blocks are sharing state"
      : "No localStorage on this origin - serve it over http (npm run preview) or the blocks can't see each other";
    node.style.color = ok ? "#3c7a55" : "#b0304a";
  })();
</script>
`;
}

const inline = process.argv.includes('--inline');
const page = body(inline);
const out = inline
  ? path.join(OUT, 'preview-standalone.html')
  : path.join(OUT, 'preview.html');
/* The artifact host supplies its own head, so the body-only build keeps the
   title inline; a standalone file needs it lifted into a real head. */
const TITLE = /^<title>[^<]*<\/title>\n/;
fs.writeFileSync(out, inline
  ? page
  : '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
    (page.match(TITLE) || [''])[0] +
    '</head>\n<body>\n' + page.replace(TITLE, '') + '</body>\n</html>\n');
// The storage probe rides along so it can be opened from the same server.
fs.copyFileSync(path.join(HERE, 'tools', 'rise-storage-probe.html'),
                path.join(OUT, 'rise-storage-probe.html'));

console.log(out.replace(HERE + '/', '') + '  (' + (fs.statSync(out).size / 1024).toFixed(0) + ' KB)');

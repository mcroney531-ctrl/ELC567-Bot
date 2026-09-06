/*
 * Builds dist/builder.html - the lesson builder.
 *
 * Draft the Rise copy that goes between the blocks, choose which block follows
 * each piece of copy, reorder the whole thing, and export the outline. The
 * difference from preview.html is that the blocks here are yours to arrange;
 * the difference from a planning doc is that each one is the real running
 * block, not a picture of it.
 *
 *   npm run preview     builds everything, then serves it at :8080/builder.html
 *
 * Two separate pieces of state, deliberately kept apart:
 *   bw_builder_outline        your lesson - copy, order, block choices
 *   brainstorm_workflow_data  the learner's answers, shared by the blocks
 * "Clear learner data" resets the second so you can walk the lesson again
 * without losing a word of the first.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BLOCKS, LESSON } from './blocks.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, 'dist');

const json = v => JSON.stringify(v).replace(/</g, '\\u003c');

const page = `<title>Lesson Builder</title>
<style>
  :root {
    color-scheme: light;
    --ink: #1b1633; --mute: #6b6484; --faint: #948da8; --line: #e4e0ef;
    --bg: #f6f4fb; --card: #fff; --accent: #6d5ce7; --accent-soft: #f0edfb;
    --warn: #b0304a; --good: #3c7a55;
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--ink);
         font: 15px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
  button, input, textarea, select { font: inherit; color: inherit; }

  .bar { position: sticky; top: 0; z-index: 20; display: flex; gap: 8px; align-items: center;
         flex-wrap: wrap; padding: 10px 16px; background: rgba(255,255,255,.94);
         backdrop-filter: blur(8px); border-bottom: 1px solid var(--line); }
  .bar strong { font-size: 14px; letter-spacing: -.01em; }
  .sp { flex: 1 1 auto; }
  .btn { border: 1px solid var(--line); background: #fff; border-radius: 8px; padding: 6px 12px;
         font-size: 13px; font-weight: 600; cursor: pointer; text-decoration: none;
         display: inline-block; color: var(--ink); }
  .btn:hover { border-color: var(--accent); color: var(--accent); }
  .btn-primary { background: var(--accent); border-color: var(--accent); color: #fff; }
  .btn-primary:hover { background: #5b4bd6; border-color: #5b4bd6; color: #fff; }
  .note { font-size: 12px; color: var(--mute); }

  .wrap { max-width: 900px; margin: 0 auto; padding: 22px 16px 100px; }
  .lede { margin: 6px 0 24px; color: var(--mute); font-size: 14px; }
  .lede code { background: var(--accent-soft); border-radius: 4px; padding: 1px 5px; font-size: 12.5px; }

  #rows { display: flex; flex-direction: column; }

  /* Rows are ordered with CSS rather than moved in the DOM: reparenting an
     iframe reloads it, and reloading nine blocks on every nudge is horrible. */
  .row { background: var(--card); border: 1px solid var(--line); border-radius: 14px;
         margin: 0 0 22px; overflow: hidden; }
  .row.dragging { opacity: .45; }
  .row.over { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }

  .handle { display: flex; align-items: center; gap: 10px; padding: 9px 12px;
            background: #faf9fd; border-bottom: 1px solid var(--line); cursor: grab; }
  .handle:active { cursor: grabbing; }
  .grip { color: var(--faint); letter-spacing: -2px; font-size: 17px; }
  .pos { font-size: 12px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase;
         color: var(--accent); }
  .icon { width: 27px; height: 27px; border-radius: 50%; border: 1px solid var(--line);
          background: #fff; cursor: pointer; line-height: 1; }
  .icon:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }
  .icon:disabled { opacity: .35; cursor: not-allowed; }
  .icon.danger:hover { border-color: var(--warn); color: var(--warn); }
  .icon.armed { border-color: var(--warn); color: var(--warn); background: #fdf0f3; width: auto;
                border-radius: 13px; padding: 0 10px; font-size: 12px; font-weight: 600; }

  .copy { padding: 14px 16px 16px; border-bottom: 1px solid var(--line); }
  .cap { font-size: 11px; font-weight: 700; letter-spacing: .07em; text-transform: uppercase;
         color: var(--faint); margin-bottom: 8px; }
  .copy input, .copy textarea { width: 100%; border: 1px solid var(--line); border-radius: 8px;
                                padding: 8px 10px; background: #fff; }
  .copy input { font-weight: 600; margin-bottom: 6px; }
  .copy input.sub { font-weight: 400; font-size: 13.5px; color: var(--mute); }
  .copy textarea { min-height: 96px; resize: vertical; font-size: 14px; line-height: 1.5; }
  .copy input:focus, .copy textarea:focus { outline: none; border-color: var(--accent);
                                            box-shadow: 0 0 0 3px var(--accent-soft); }

  .blk { padding: 14px 16px 16px; }
  .blkhead { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 10px; }
  .blk select { border: 1px solid var(--line); border-radius: 8px; padding: 6px 8px; background: #fff; }
  .blk select:focus { outline: none; border-color: var(--accent); }
  .file { font-size: 12px; color: var(--faint); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
  .frame { display: block; width: 100%; height: 320px; border: 1px solid var(--line);
           border-radius: 12px; background: #fff; transition: height .18s ease; }

  .add { display: block; width: 100%; padding: 14px; border: 2px dashed var(--line);
         border-radius: 12px; background: #fff; color: var(--accent); font-weight: 600;
         cursor: pointer; }
  .add:hover { border-color: var(--accent); background: var(--accent-soft); }
  .empty { padding: 28px; text-align: center; color: var(--mute); background: #fff;
           border: 1px dashed var(--line); border-radius: 12px; margin-bottom: 22px; }
</style>

<div class="bar">
  <strong>Lesson builder</strong>
  <span class="note" id="status">Checking&hellip;</span>
  <span class="sp"></span>
  <a class="btn" href="preview.html">Plain preview</a>
  <button type="button" class="btn" id="clear-learner">Clear learner data</button>
  <button type="button" class="btn" id="reset-outline">Reset outline</button>
  <button type="button" class="btn" id="export-md">Export outline</button>
  <button type="button" class="btn" id="export-json">Export JSON</button>
  <button type="button" class="btn btn-primary" id="add">+ Add block</button>
</div>

<div class="wrap">
  <p class="lede">
    Draft the Rise copy that introduces each block, pick the block that follows it, and drag the
    rows into the order you want. Every block below is the real one from <code>dist/</code>, sharing
    state as it will in a published lesson &mdash; so this is your storyboard and your working
    preview at the same time. Your copy and the learner's answers are stored separately:
    <strong>Clear learner data</strong> lets you walk the lesson again without touching a word you wrote.
  </p>
  <div id="rows"></div>
  <button type="button" class="add" id="add-bottom">+ Add another block</button>
</div>

<script>
var BLOCKS = ${json(BLOCKS)};
var DEFAULT_OUTLINE = ${json(LESSON.map(b => ({ file: b.file, title: b.title, subtitle: '', body: '' })))};
var OUTLINE_KEY = "bw_builder_outline";
var LEARNER_KEY = "brainstorm_workflow_data";

function blockFor(file) {
  for (var i = 0; i < BLOCKS.length; i++) if (BLOCKS[i].file === file) return BLOCKS[i];
  return BLOCKS[0];
}

/* ---- state ---- */

var rows = [];
var nextId = 1;

function load() {
  var raw = null;
  try { raw = localStorage.getItem(OUTLINE_KEY); } catch (e) { /* reported in the bar */ }
  var saved = null;
  if (raw) { try { saved = JSON.parse(raw); } catch (e) { saved = null; } }
  var source = (saved && saved.length) ? saved : DEFAULT_OUTLINE;
  rows = source.map(function (r) {
    return {
      id: nextId++,
      file: blockFor(r.file).file,          // a renamed block falls back rather than 404ing
      title: String(r.title || ""),
      subtitle: String(r.subtitle || ""),
      body: String(r.body || "")
    };
  });
}

function save() {
  try {
    localStorage.setItem(OUTLINE_KEY, JSON.stringify(rows.map(function (r) {
      return { file: r.file, title: r.title, subtitle: r.subtitle, body: r.body };
    })));
  } catch (e) { /* reported in the bar */ }
}

/* ---- rendering ----
   Each row's DOM is built once and kept. Reordering sets a CSS order, and text
   is written with textContent and .value only - nothing the writer types is
   ever parsed as markup, which is what corrupts a template-string builder the
   first time someone drafts copy containing a "<". */

var host = document.getElementById("rows");
var nodes = {};        // row id -> element
var frames = [];       // iframes, for the height messages

function el(tag, cls, text) {
  var n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

function buildRow(row) {
  var wrap = el("div", "row");
  wrap.id = "row-" + row.id;

  /* -- handle -- */
  var handle = el("div", "handle");
  handle.draggable = true;                 // the handle drags, so dragstart fires on it
  var grip = el("span", "grip", "\\u22EE\\u22EE");
  grip.setAttribute("aria-hidden", "true");
  var pos = el("span", "pos");
  var up = el("button", "icon", "\\u2191");
  var down = el("button", "icon", "\\u2193");
  var del = el("button", "icon danger", "\\u00D7");
  [up, down, del].forEach(function (b) { b.type = "button"; });
  up.title = "Move up"; down.title = "Move down"; del.title = "Remove this block";
  up.setAttribute("aria-label", "Move up");
  down.setAttribute("aria-label", "Move down");
  del.setAttribute("aria-label", "Remove this block");
  up.addEventListener("click", function () { move(row.id, -1); });
  down.addEventListener("click", function () { move(row.id, 1); });
  armDelete(del, row.id);
  handle.appendChild(grip);
  handle.appendChild(pos);
  handle.appendChild(el("span", "sp"));
  handle.appendChild(up); handle.appendChild(down); handle.appendChild(del);
  wireDrag(wrap, handle, row);

  /* -- your Rise copy -- */
  var copy = el("div", "copy");
  copy.appendChild(el("div", "cap", "Rise content above this block"));
  var title = document.createElement("input");
  title.type = "text"; title.placeholder = "Heading"; title.value = row.title;
  title.setAttribute("aria-label", "Rise heading");
  var sub = document.createElement("input");
  sub.type = "text"; sub.className = "sub"; sub.placeholder = "Subheading (optional)";
  sub.value = row.subtitle;
  sub.setAttribute("aria-label", "Rise subheading");
  var body = document.createElement("textarea");
  body.value = row.body;
  body.setAttribute("aria-label", "Rise body copy");
  title.addEventListener("input", function () { row.title = title.value; save(); });
  sub.addEventListener("input", function () { row.subtitle = sub.value; save(); });
  body.addEventListener("input", function () { row.body = body.value; save(); });
  copy.appendChild(title); copy.appendChild(sub); copy.appendChild(body);

  /* -- the real block -- */
  var blk = el("div", "blk");
  var head = el("div", "blkhead");
  head.appendChild(el("span", "cap", "Block"));
  var pick = document.createElement("select");
  pick.setAttribute("aria-label", "Which block goes here");
  BLOCKS.forEach(function (b) {
    var o = document.createElement("option");
    o.value = b.file;
    o.textContent = b.title + (b.alt ? "  (alternative)" : "");
    pick.appendChild(o);
  });
  pick.value = row.file;
  var fileTag = el("span", "file");
  var frame = document.createElement("iframe");
  frame.className = "frame";
  var paint = function () {
    var b = blockFor(row.file);
    fileTag.textContent = "dist/" + b.file + '  -  blockRole "' + b.role + '"';
    // The placeholder is the note on what this block needs teaching around it.
    body.placeholder = b.rise;
    frame.title = b.title;
    if (frame.getAttribute("src") !== b.file) frame.setAttribute("src", b.file);
  };
  pick.addEventListener("change", function () {
    row.file = pick.value; save(); paint(); renumber();
  });
  head.appendChild(pick); head.appendChild(fileTag);
  blk.appendChild(head); blk.appendChild(frame);
  frames.push(frame);
  paint();

  wrap.appendChild(handle); wrap.appendChild(copy); wrap.appendChild(blk);
  wrap._pos = pos;
  wrap._up = up;
  wrap._down = down;
  return wrap;
}

/* Removing a block throws away writing, so it asks - inline, no modal. */
function armDelete(btn, id) {
  var armed = false, timer = null;
  btn.addEventListener("click", function () {
    if (!armed) {
      armed = true;
      btn.classList.add("armed");
      btn.textContent = "Press again to remove";
      timer = setTimeout(function () {
        armed = false; btn.classList.remove("armed"); btn.textContent = "\\u00D7";
      }, 3500);
      return;
    }
    clearTimeout(timer);
    remove(id);
  });
}

function render() {
  host.textContent = "";
  frames = [];
  nodes = {};
  if (!rows.length) {
    host.appendChild(el("div", "empty", "No blocks in the outline. Add one, or reset the outline to the shipped nine."));
    return;
  }
  rows.forEach(function (row) {
    var node = buildRow(row);
    nodes[row.id] = node;
    host.appendChild(node);
  });
  renumber();
}

/* Position, numbering and the disabled arrows, without rebuilding anything. */
function renumber() {
  rows.forEach(function (row, i) {
    var node = nodes[row.id];
    if (!node) return;
    node.style.order = i;
    node._pos.textContent = "Block " + (i + 1);
    node._up.disabled = i === 0;
    node._down.disabled = i === rows.length - 1;
  });
}

function indexOf(id) {
  for (var i = 0; i < rows.length; i++) if (rows[i].id === id) return i;
  return -1;
}

function move(id, delta) {
  var i = indexOf(id);
  var j = i + delta;
  if (i < 0 || j < 0 || j >= rows.length) return;
  rows.splice(j, 0, rows.splice(i, 1)[0]);
  save(); renumber();
}

/* Insert, not swap: dragging block 1 to slot 5 puts it at 5 and shuffles the
   rest up. Swapping - which is the tempting one-liner - trades 1 and 5 and
   leaves the middle untouched, which is never what dragging an outline means. */
function moveTo(id, target) {
  var i = indexOf(id);
  if (i < 0 || target < 0 || target >= rows.length || i === target) return;
  rows.splice(target, 0, rows.splice(i, 1)[0]);
  save(); renumber();
}

function remove(id) {
  var i = indexOf(id);
  if (i < 0) return;
  rows.splice(i, 1);
  save(); render();
}

function add() {
  var used = {};
  rows.forEach(function (r) { used[r.file] = true; });
  var next = BLOCKS.filter(function (b) { return !b.alt && !used[b.file]; })[0] || BLOCKS[0];
  rows.push({ id: nextId++, file: next.file, title: next.title, subtitle: "", body: "" });
  save(); render();
  var node = nodes[rows[rows.length - 1].id];
  if (node && node.scrollIntoView) node.scrollIntoView({ behavior: "smooth", block: "center" });
}

/* ---- drag to reorder ---- */

var draggingId = null;

function wireDrag(wrap, handle, row) {
  handle.addEventListener("dragstart", function (e) {
    draggingId = row.id;
    wrap.classList.add("dragging");
    try {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", String(row.id));   // Firefox needs a payload
      e.dataTransfer.setDragImage(wrap, 20, 20);
    } catch (err) { /* older browsers */ }
  });
  handle.addEventListener("dragend", function () {
    draggingId = null;
    wrap.classList.remove("dragging");
    Array.prototype.forEach.call(document.querySelectorAll(".row"), function (n) {
      n.classList.remove("over");
    });
  });
  // The whole row is a drop target, not just its handle strip.
  wrap.addEventListener("dragover", function (e) {
    if (draggingId === null || draggingId === row.id) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    wrap.classList.add("over");
  });
  wrap.addEventListener("dragleave", function () { wrap.classList.remove("over"); });
  wrap.addEventListener("drop", function (e) {
    e.preventDefault();
    wrap.classList.remove("over");
    if (draggingId === null) return;
    moveTo(draggingId, indexOf(row.id));
    draggingId = null;
  });
}

/* ---- export ---- */

function download(name, text, mime) {
  var blob = new Blob([text], { type: mime });
  var url = URL.createObjectURL(blob);
  var a = document.createElement("a");
  a.href = url; a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
}

function outlineMarkdown() {
  var out = ["# Lesson outline", "",
    "Paste each block file into a Rise custom code block, in this order.", ""];
  rows.forEach(function (row, i) {
    var b = blockFor(row.file);
    out.push("## " + (i + 1) + ". " + (row.title || "(untitled)"));
    if (row.subtitle) out.push("*" + row.subtitle + "*");
    out.push("");
    if (row.body) { out.push(row.body); out.push(""); }
    out.push("> **Block:** paste \`dist/" + b.file + "\` \\u2014 blockRole \`" + b.role +
             "\` \\u2014 " + b.title);
    out.push("");
  });
  return out.join("\\n");
}

document.getElementById("export-md").addEventListener("click", function () {
  download("lesson-outline.md", outlineMarkdown(), "text/markdown");
});
document.getElementById("export-json").addEventListener("click", function () {
  download("lesson-outline.json", JSON.stringify(rows.map(function (r) {
    var b = blockFor(r.file);
    return { title: r.title, subtitle: r.subtitle, body: r.body, file: b.file, blockRole: b.role };
  }), null, 2), "application/json");
});
document.getElementById("add").addEventListener("click", add);
document.getElementById("add-bottom").addEventListener("click", add);

/* ---- the two resets, kept apart ---- */

function confirmOnce(btn, prompt, run) {
  var armed = false, timer = null, original = btn.textContent;
  btn.addEventListener("click", function () {
    if (!armed) {
      armed = true; btn.textContent = prompt;
      timer = setTimeout(function () { armed = false; btn.textContent = original; }, 3500);
      return;
    }
    clearTimeout(timer);
    armed = false; btn.textContent = original;
    run();
  });
}

confirmOnce(document.getElementById("reset-outline"), "Press again \\u2014 your copy goes", function () {
  try { localStorage.removeItem(OUTLINE_KEY); } catch (e) { /* nothing to clear */ }
  rows = []; nextId = 1;
  load(); render();
});

/* Clearing the learner's answers must survive the reload it needs: every block
   flushes its state on the way out, so clearing first just writes it back. */
confirmOnce(document.getElementById("clear-learner"), "Press again to clear answers", function () {
  try { sessionStorage.setItem("bw-clear-learner", "1"); } catch (e) { /* handled on load */ }
  location.reload();
});

/* ---- iframe heights ---- */

window.addEventListener("message", function (e) {
  if (!e.data || e.data.type !== "bw:height") return;
  for (var i = 0; i < frames.length; i++) {
    if (frames[i].contentWindow === e.source) {
      frames[i].style.height = Math.max(180, e.data.height + 4) + "px";
      return;
    }
  }
});

/* ---- boot ---- */

(function () {
  var node = document.getElementById("status");
  var ok = false;
  try { localStorage.setItem("bw-probe", "1"); localStorage.removeItem("bw-probe"); ok = true; }
  catch (e) { ok = false; }
  node.textContent = ok
    ? "Saving as you type"
    : "No localStorage on this origin - serve it over http (npm run preview) or nothing saves";
  node.style.color = ok ? "var(--good)" : "var(--warn)";
})();

load();
render();
</script>
`;

/* The clear has to happen before any block frame boots, so it runs from the
   very top of the document rather than from the script above. */
const head = `<script>
  (function () {
    try {
      if (sessionStorage.getItem("bw-clear-learner")) {
        sessionStorage.removeItem("bw-clear-learner");
        localStorage.removeItem("brainstorm_workflow_data");
      }
    } catch (e) { /* nothing we can do; the bar reports it */ }
  })();
</script>
`;

fs.mkdirSync(OUT, { recursive: true });
const dest = path.join(OUT, 'builder.html');
fs.writeFileSync(dest,
  '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n' +
  '<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
  '<title>Lesson Builder</title>\n</head>\n<body>\n' +
  head + page.replace(/^<title>[^<]*<\/title>\n/, '') + '</body>\n</html>\n');
console.log('dist/builder.html  (' + (fs.statSync(dest).size / 1024).toFixed(0) + ' KB)');

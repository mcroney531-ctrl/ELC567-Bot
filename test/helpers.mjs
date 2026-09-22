import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

/* Works whether Playwright is installed locally (npm i -D playwright) or
   globally (npm i -g playwright), which is common on shared build boxes. */
export async function loadChromium() {
  try { return (await import('playwright')).chromium; } catch (e) { /* try global */ }
  try {
    const root = execSync('npm root -g', { encoding: 'utf8' }).trim();
    const url = pathToFileURL(path.join(root, 'playwright', 'index.mjs')).href;
    return (await import(url)).chromium;
  } catch (e) {
    throw new Error('Playwright not found. Install it with: npm i -D playwright');
  }
}

export const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
export const ACTIVITY = path.join(ROOT, 'js', 'activity.js');

export function readActivity() {
  return fs.readFileSync(ACTIVITY, 'utf8');
}

/* Rewrites CONFIG so a test can point the page at a local coach, change a
   threshold, or render one slice of the activity. */
export function withConfig(overrides, src = readActivity()) {
  for (const [key, value] of Object.entries(overrides)) {
    const re = new RegExp('(\\n\\s*' + key + ': )[^\\n]*', '');
    if (!re.test(src)) throw new Error('CONFIG key not found: ' + key);
    src = src.replace(re, '$1' + value + ',');
  }
  return src;
}

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml'
};

/* Serves the activity as the site it now is - real files, real paths - because
   it is no longer one string that can be handed to a browser whole.
 *
 *   /                 the activity, with `overrides` applied
 *   /role/<name>      the activity with CONFIG.blockRole set to <name>
 *   anything else     that file, straight off disk
 */
export function serveSite(port, overrides = {}) {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    const send = (body, type) => { res.writeHead(200, { 'Content-Type': type }); res.end(body); };

    const role = url.pathname.startsWith('/role/') ? url.pathname.slice(6).replace(/\/$/, '') : null;
    if (url.pathname === '/' || role) {
      let html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
      // A page served from /role/x resolves its relative css and js one level
      // deeper unless it is told otherwise.
      html = html.replace('</head>', '<base href="/">\n</head>');
      if (role) html = html.replace('src="js/activity.js"', 'src="js/activity.js?role=' + role + '"');
      return send(html, TYPES['.html']);
    }

    /* Several slices side by side, served from this same origin - a harness on
       another port would be cross-origin, and the frames could neither see
       each other's storage nor be reached from the test. */
    if (url.pathname.startsWith('/frames/')) {
      const roles = url.pathname.slice(8).split(',').filter(Boolean);
      return send('<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0">' +
        roles.map(r => '<iframe id="' + r + '" title="' + r +
          '" style="width:900px;height:820px;border:0" src="/role/' + r + '"></iframe>').join('') +
        '</body></html>', TYPES['.html']);
    }

    const file = path.join(ROOT, url.pathname.replace(/^\/+/, ''));
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('not found: ' + url.pathname);
    }

    if (url.pathname === '/js/activity.js') {
      const asked = url.searchParams.get('role');
      const config = asked ? { ...overrides, blockRole: `"${asked}"` } : overrides;
      return send(Object.keys(config).length ? withConfig(config) : readActivity(), TYPES['.js']);
    }
    send(fs.readFileSync(file), TYPES[path.extname(file)] || 'application/octet-stream');
  });
  return new Promise(r => server.listen(port, () => r(server)));
}

export function makeReporter(label) {
  const ok = [], fails = [], errors = [];
  return {
    check(name, cond, extra = '') { (cond ? ok : fails).push(name + (cond ? '' : ' :: ' + extra)); },
    watch(page) {
      page.on('pageerror', e => errors.push('pageerror: ' + e.message));
      page.on('console', m => {
        // Deliberately provoked network failures show up here; they are not app bugs.
        if (m.type() === 'error' && !/Failed to load resource|net::ERR_/.test(m.text())) {
          errors.push('console: ' + m.text());
        }
      });
    },
    fail(msg) { fails.push(msg); },
    finish() {
      console.log(label + ': passed ' + ok.length + ' / ' + (ok.length + fails.length));
      if (fails.length) console.log('\nFAILURES:\n  ' + fails.join('\n  '));
      if (errors.length) console.log('\nPAGE ERRORS:\n  ' + errors.join('\n  '));
      return fails.length === 0 && errors.length === 0;
    }
  };
}

export const waitBots = (page, n) => page.waitForFunction(
  k => document.querySelectorAll('.bw-msg-bot:not([data-typing])').length >= k, n, { timeout: 12000 });

/* Seeded state, for suites that are not testing how stage 1 gets filled in.
   Stages 1-3 are already behind the learner, so the page opens straight into
   the map with stage 4 unlocked and its conversation untouched. */
export const SEED_PROBLEM =
  'Every Monday I rebuild the same eleven client status updates by hand, and it eats two hours.';

export function seedThroughStage3(page, problem = SEED_PROBLEM) {
  return page.addInitScript(([key, text]) => {
    localStorage.setItem('bw_started', '1');
    localStorage.setItem(key, JSON.stringify({
      version: 2,
      problem: text,
      steps: [
        { action: 'Pull delivery numbers', tools: 'Asana, Harvest' },
        { action: 'Draft the update', tools: 'Google Docs' }
      ],
      toolsAll: ['Asana', 'Harvest', 'Google Docs'],
      masterPromptV1: '', masterPromptV2: '', v2Source: '',
      conversations: { all: [], identify: [], workflow: [], tools: [], envision: [],
                       deploy: [], handoff: [], standards: [], guardrails: [] },
      mockProgress: { all: 0, identify: 0, workflow: 0, tools: 0, envision: 0,
                      deploy: 0, handoff: 0, standards: 0, guardrails: 0 },
      botAnswers: { handoff: '', output: '', keep: '', context: '', notes: [] },
      pushedBack: {},
      progress: {
        current: 4, unlocked: 4,
        done: { 1: true, 2: true, 3: true },
        entered: { 1: true, 2: true, 3: true }
      }
    }));
  }, ['brainstorm_workflow_data', problem]);
}

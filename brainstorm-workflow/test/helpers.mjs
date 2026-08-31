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

export const ACTIVITY = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'index.html');

/* Serves one HTML string (or the activity itself) so the page gets a real
   origin — localStorage is unavailable on file:// in Chromium. */
export function serveHtml(html, port) {
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
  });
  return new Promise(r => server.listen(port, () => r(server)));
}

export function readActivity() {
  return fs.readFileSync(ACTIVITY, 'utf8');
}

/* Rewrites the CONFIG block so a test can point the page at a local coach. */
export function withConfig(overrides) {
  let src = readActivity();
  for (const [key, value] of Object.entries(overrides)) {
    const re = new RegExp('(\\n\\s*' + key + ': )[^\\n]*', '');
    if (!re.test(src)) throw new Error('CONFIG key not found: ' + key);
    src = src.replace(re, '$1' + value + ',');
  }
  return src;
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

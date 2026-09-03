/*
 * Emits one paste-ready file per Rise block into dist/.
 *
 *   node build.mjs
 *
 * Each output is the whole activity with CONFIG.blockRole set for that block,
 * so nothing has to be edited inside Rise's code editor. Re-run after any
 * change to index.html.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(HERE, 'index.html');
const OUT = path.join(HERE, 'dist');

const BLOCKS = [
  ['1-intro',            'intro',            'BLOCK 1 - the hook, the outcome, and the worked example'],
  ['2-problem',          'problem',          'BLOCK 2 - name the repetitive task'],
  ['3-workflow',         'workflow',         'BLOCK 3 - map the steps and the tools'],
  ['4-draft',            'draft',            'BLOCK 4 - the draft prompt, built from blocks 2 and 3'],
  ['5-coach-handoff',    'coach-handoff',    'BLOCK 5 - chat: which step should the AI take over'],
  ['6-coach-standards',  'coach-standards',  'BLOCK 6 - chat: what a good result looks like, what stays yours'],
  ['7-coach-guardrails', 'coach-guardrails', 'BLOCK 7 - chat: house rules, then hands back the prompt'],
  ['8-artifact',         'artifact',         'BLOCK 8 - the finished master prompt, editable and copyable'],
  ['alt-blocks-2-4-combined', 'capture',     'ALTERNATIVE - the intro and blocks 2, 3 and 4 in one block'],
  ['alt-single-block',   'all',              'ALTERNATIVE - the whole activity in one block']
];

const src = fs.readFileSync(SRC, 'utf8');
const ROLE_LINE = /(\n\s*blockRole: )"[^"]*"/;
if (!ROLE_LINE.test(src)) {
  console.error('Could not find the blockRole line in index.html - did CONFIG change?');
  process.exit(1);
}

fs.mkdirSync(OUT, { recursive: true });
for (const [file, role, label] of BLOCKS) {
  const banner =
    `<!-- ==========================================================\n` +
    `     ${label}\n` +
    `     Paste this ENTIRE file into one Rise custom code block.\n` +
    `     Generated from index.html - edit that, then re-run build.mjs.\n` +
    `     ========================================================== -->\n`;
  const out = banner + src.replace(ROLE_LINE, `$1"${role}"`);
  const dest = path.join(OUT, file + '.html');
  fs.writeFileSync(dest, out);

  // Prove the swap landed rather than assuming the regex matched what we meant.
  const got = (out.match(/\n\s*blockRole: "([^"]*)"/) || [])[1];
  if (got !== role) {
    console.error(`FAILED: ${file}.html has blockRole "${got}", expected "${role}"`);
    process.exit(1);
  }
  const nonAscii = [...Buffer.from(out)].filter(b => b > 127).length;
  if (nonAscii) {
    console.error(`FAILED: ${file}.html has ${nonAscii} non-ascii bytes`);
    process.exit(1);
  }
  console.log(`${dest.replace(HERE + '/', '')}  ->  blockRole "${role}"  (${(out.length / 1024).toFixed(0)} KB)`);
}
console.log('\nAll ' + BLOCKS.length + ' files verified: correct role, pure ASCII.');

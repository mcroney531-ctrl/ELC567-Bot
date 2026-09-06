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
import { BLOCKS } from './blocks.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(HERE, 'index.html');
const OUT = path.join(HERE, 'dist');


const src = fs.readFileSync(SRC, 'utf8');
const ROLE_LINE = /(\n\s*blockRole: )"[^"]*"/;
if (!ROLE_LINE.test(src)) {
  console.error('Could not find the blockRole line in index.html - did CONFIG change?');
  process.exit(1);
}

fs.mkdirSync(OUT, { recursive: true });
for (const { file, role, banner: label } of BLOCKS) {
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

/* Stand-in coach endpoint: replays each response shape the adapter claims to
   accept, plus the failure modes learners will actually hit. */
import http from 'node:http';
export const state = { mode: 'reply', requests: [], headers: [] };
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};
const FENCED = 'Here is the finished prompt.\n\n```master-prompt\n## CONTEXT\nLive-endpoint context line.\n\n## WHAT STAYS WITH ME\nThe final judgment call.\n```\n';
const SHAPES = {
  reply:     () => ({ reply: 'Live reply one. What does a good output look like?' }),
  anthropic: () => ({ content: [{ type: 'text', text: FENCED }] }),
  openai:    () => ({ choices: [{ message: { content: 'OpenAI-shaped reply.' } }] }),
  bare:      () => 'Bare string reply.',
  junk:      () => ({ nonsense: true })
};
export const server = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(204, CORS); return res.end(); }
  let body = '';
  req.on('data', c => body += c);
  req.on('end', () => {
    state.headers.push(req.headers);
    try { state.requests.push(JSON.parse(body)); } catch { state.requests.push({ unparsed: body }); }
    if (state.mode === 'error') { res.writeHead(503, { ...CORS, 'Content-Type': 'text/plain' }); return res.end('coach offline'); }
    if (state.mode === 'hang') { return; }
    res.writeHead(200, { ...CORS, 'Content-Type': 'application/json' });
    res.end(JSON.stringify(SHAPES[state.mode]()));
  });
});

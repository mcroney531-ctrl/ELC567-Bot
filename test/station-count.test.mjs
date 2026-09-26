/*
 * The journey's length is data.
 *
 * STATIONS is the only place that says how many stations there are. Everything
 * whose meaning is "the whole journey" - the progress denominator, the "all
 * stages" iterations, the rail's waypoints, the map's grid columns - derives
 * from it. Before this, five was written down in about a dozen places, and
 * removing a station produced a map with a dead column and a rail that
 * overshot the last stage.
 *
 * Two halves.
 *
 * The first pins the product as it ships: five stations, denominator five,
 * five waypoints at the positions the map was authored with. This half must
 * keep passing through any future branch that stays at five.
 *
 * The second serves the activity with one station removed and nothing else
 * changed, and checks that the count followed. That fixture is a structural
 * probe, not a product: it exists to prove the machinery is count-agnostic
 * while the real journey length is still being decided. It asserts geometry
 * and arithmetic only, and says nothing about what a four-stage journey should
 * contain - that is a product decision and not this file's business.
 */
import { serveSite, makeReporter, loadChromium, withoutStation } from './helpers.mjs';

const chromium = await loadChromium();
const report = makeReporter('station count');
const check = report.check;

const browser = await chromium.launch();

/* Reduced motion so the pulsing "current" node cannot make a measurement
   depend on which animation frame the screenshot landed on. */
async function mapPage(port, transform) {
  const server = await serveSite(port, {}, transform);
  const ctx = await browser.newContext({
    viewport: { width: 1200, height: 900 }, reducedMotion: 'reduce'
  });
  const page = await ctx.newPage();
  report.watch(page);
  await page.goto(`http://127.0.0.1:${port}/`);
  await page.waitForTimeout(350);
  await page.click('#bw-start');
  await page.waitForTimeout(900);
  return { server, ctx, page };
}

/* Everything the journey's length touches, read off the rendered page. */
const shape = page => page.evaluate(() => {
  const spine = document.querySelector('.bw-spine');
  const path = document.querySelector('#bw-rail .bw-rail-line').getAttribute('d');
  /* The rail is "M 0 y L x0 y" then one cubic per following waypoint, then a
     straight run out to the right edge. Pull the waypoint x's: the first is the
     initial L, the rest are each cubic's end point. The trailing edge run is
     dropped so it cannot be mistaken for a station. */
  const segs = path.split('C');
  const xs = [];
  const first = segs[0].match(/L\s+([\d.]+)/);
  if (first) xs.push(Number(first[1]));
  for (let i = 1; i < segs.length; i++) {
    const pairs = segs[i].split('L')[0].trim().split(',');
    xs.push(Number(pairs[pairs.length - 1].trim().split(/\s+/)[0]));
  }
  return {
    stations: document.querySelectorAll('.bw-station').length,
    mini: document.querySelectorAll('.bw-mini-item').length,
    cols: getComputedStyle(spine).gridTemplateColumns.split(' ').length,
    colVar: getComputedStyle(spine).getPropertyValue('--station-count').trim(),
    cardCols: [...document.querySelectorAll('.bw-station')]
      .map(e => getComputedStyle(e.querySelector('.bw-station-card')).gridColumnStart),
    nodeCols: [...document.querySelectorAll('.bw-station')]
      .map(e => getComputedStyle(e.querySelector('.bw-station-node')).gridColumnStart),
    // Card centres as a percentage of the spine, which is what the rail has to
    // line up with whatever the count.
    centres: [...document.querySelectorAll('.bw-station-card')].map(e => {
      const s = spine.getBoundingClientRect(), r = e.getBoundingClientRect();
      return Math.round(((r.left + r.width / 2 - s.left) / s.width) * 1000) / 10;
    }),
    railX: xs,
    waypoints: document.querySelectorAll('.bw-station-node').length,
    label: document.querySelector('#bw-progress-label').textContent
  };
});

try {
  // ==================== the product, as it ships ====================
  let { server, ctx, page } = await mapPage(9121, null);
  let s = await shape(page);

  check('five stations', s.stations === 5, JSON.stringify(s.stations));
  check('five mini nodes', s.mini === 5, String(s.mini));
  check('five grid columns', s.cols === 5, String(s.cols));
  check('driven by the station count, not a literal', s.colVar === '5', s.colVar);
  check('each card in its own column', s.cardCols.join(',') === '1,2,3,4,5', s.cardCols.join(','));
  check('each waypoint in the same column as its card',
    s.nodeCols.join(',') === s.cardCols.join(','), s.nodeCols.join(','));
  check('one waypoint per station', s.waypoints === 5, String(s.waypoints));
  check('cards sit at the authored 10/30/50/70/90',
    s.centres.join(',') === '10,30,50,70,90', s.centres.join(','));
  check('and the rail turns once per station, at those same positions',
    s.railX.join(',') === '10,30,50,70,90', s.railX.join(','));
  check('the progress denominator is still five',
    s.label === 'Step 1 of 5', s.label);
  check('as is the stage workspace cue', await page.evaluate(async () => {
    document.querySelector('.bw-station[data-stage="1"] .bw-station-card').click();
    await new Promise(r => setTimeout(r, 700));
    return document.querySelector('#bw-ls-step').textContent;
  }) === 'Step 1 of 5');
  await ctx.close(); server.close();

  // ============ the same machinery, one station shorter ============
  /* A structural probe: STATIONS loses an entry and nothing else changes. */
  ({ server, ctx, page } = await mapPage(9122, withoutStation('Deploy')));
  s = await shape(page);

  check('four stations', s.stations === 4, String(s.stations));
  check('four mini nodes', s.mini === 4, String(s.mini));
  check('four grid columns, not five with a dead one',
    s.cols === 4, String(s.cols));
  check('the count variable followed', s.colVar === '4', s.colVar);
  check('no ghost column: cards occupy 1 to 4',
    s.cardCols.join(',') === '1,2,3,4', s.cardCols.join(','));
  check('waypoints follow their cards',
    s.nodeCols.join(',') === s.cardCols.join(','), s.nodeCols.join(','));
  check('four waypoints, not five', s.waypoints === 4, String(s.waypoints));
  check('cards re-centre on quarters: 12.5/37.5/62.5/87.5',
    s.centres.join(',') === '12.5,37.5,62.5,87.5', s.centres.join(','));
  check('the rail turns four times, not five, and re-spaces with them',
    s.railX.join(',') === '12.5,37.5,62.5,87.5', s.railX.join(','));
  check('no ghost waypoint left at the old fifth position',
    !s.railX.includes(90), s.railX.join(','));
  check('the progress denominator followed the count',
    s.label === 'Step 1 of 4', s.label);
  check('as did the stage workspace cue', await page.evaluate(async () => {
    document.querySelector('.bw-station[data-stage="1"] .bw-station-card').click();
    await new Promise(r => setTimeout(r, 700));
    return document.querySelector('#bw-ls-step').textContent;
  }) === 'Step 1 of 4');

  /* "All stages" iteration: the admin jump row is built from the station set,
     so it is the cheapest honest read on whether the journey is being walked
     by data or by a literal. */
  await ctx.close(); server.close();
  ({ server, ctx, page } = await mapPage(9123, withoutStation('Deploy')));
  await page.goto('http://127.0.0.1:9123/?admin=1');
  await page.waitForTimeout(500);
  check('every-stage iteration covers four, not five',
    await page.locator('.bw-admin-jump [data-goto]').count() === 4,
    String(await page.locator('.bw-admin-jump [data-goto]').count()));
  check('and stops at the last real stage',
    (await page.locator('.bw-admin-jump [data-goto]').evaluateAll(
      els => els.map(e => e.dataset.goto).join(','))) === '1,2,3,4',
    await page.locator('.bw-admin-jump [data-goto]').evaluateAll(
      els => els.map(e => e.dataset.goto).join(',')));
  await ctx.close(); server.close();
} catch (e) {
  report.fail('THREW :: ' + String(e.message).split('\n')[0]);
}

const passed = report.finish();
await browser.close();
process.exit(passed ? 0 : 1);

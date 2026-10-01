/*
 * The Journey on a phone: the same journey, translated into portrait.
 *
 * Home is a fixed 1280x720 composition that fitMap() scales whole to fit - a Storyline
 * slide. That is right at desktop and tablet widths and wrong at 390: the frame comes out
 * about 219px tall, station names render at ~4.9px, statuses and blurbs at ~3.7px, and
 * the completed-journey message at ~4px. Tap targets survive; the screen does not. The
 * earlier "a phone gets the same map, smaller" decision was deliberate, and walking the
 * finished journey as a learner is the evidence that supersedes it.
 *
 * So at 720px and below the route becomes a natural-height vertical column. It is a
 * presentation change over the SAME stations: the same buttons, the same state engine,
 * the same stage colours, the same completed/current/available/locked treatments and the
 * same copy. Not a second journey and not a second navigation system.
 *
 * Above 720 nothing moves. 721, 768 and 1280 keep the scaled frame exactly as it was.
 */
import { serveSite, makeReporter, loadChromium, seedState } from './helpers.mjs';

const chromium = await loadChromium();
const report = makeReporter('journey on a phone');
const check = report.check;

const PORT = 8184;
const server = await serveSite(PORT);
const browser = await chromium.launch();

const FINISHED = { unlocked: 5, current: 5, done: { 1: true, 2: true, 3: true, 4: true, 5: true },
                   entered: { 1: true, 2: true, 3: true, 4: true, 5: true } };
const MID = { unlocked: 3, current: 3, done: { 1: true, 2: true }, entered: { 1: true, 2: true, 3: true } };

async function openJourney(viewport, progress) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  report.watch(page);
  await page.addInitScript(([started, seed]) => {
    localStorage.setItem('bw_started', '1');
    if (seed) localStorage.setItem('brainstorm_workflow_data', seed);
  }, [true, progress ? JSON.stringify(seedState({
    botAnswers: { handoff: 'Draft it.', output: 'Short.', keep: 'The call.', context: 'Be careful.', notes: [] },
    decided: { handoff: true, keep: true, output: true, context: true },
    progress })) : null]);
  await page.goto(`http://127.0.0.1:${PORT}/`);
  await page.waitForTimeout(500);
  return { ctx, page };
}

/* Everything measured off the page as rendered, because the claim is about what a learner
   sees: effective size means the computed size times whatever scale the element sits under. */
const measure = page => page.evaluate(() => {
  const eff = e => { const fs = parseFloat(getComputedStyle(e).fontSize), r = e.getBoundingClientRect();
    return e.offsetWidth ? fs * r.width / e.offsetWidth : fs; };
  const cards = [...document.querySelectorAll('.bw-station-card')];
  const frame = document.getElementById('bw-map-frame');
  const map = document.getElementById('bw-map');
  const first = (sel, root = document) => root.querySelector(sel);
  const rects = cards.map(c => c.getBoundingClientRect());
  const ways = [...document.querySelectorAll('.bw-station-way')].map(w => w.getBoundingClientRect());
  const stations = [...document.querySelectorAll('.bw-station')];
  const vis = e => !!e && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().height > 0;
  return {
    vw: document.documentElement.clientWidth,
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    framePosition: getComputedStyle(frame).position,
    frameTransform: getComputedStyle(frame).transform,
    frameW: Math.round(frame.getBoundingClientRect().width),
    frameH: Math.round(frame.getBoundingClientRect().height),
    inlineHeight: map.style.height, inlineScale: map.style.getPropertyValue('--map-scale'),
    inlineX: map.style.getPropertyValue('--map-x'), inlineY: map.style.getPropertyValue('--map-y'),
    layoutToken: getComputedStyle(map).getPropertyValue('--map-layout').trim(),
    cardCount: cards.length,
    cards: rects.map((r, i) => ({ left: Math.round(r.left), top: Math.round(r.top), w: Math.round(r.width),
      h: Math.round(r.height), bottom: Math.round(r.bottom), right: Math.round(r.right),
      disabled: cards[i].disabled,
      name: eff(first('.bw-card-name', cards[i])), status: eff(first('.bw-card-status', cards[i])),
      blurb: eff(first('.bw-card-blurb', cards[i])),
      statusText: first('.bw-card-status', cards[i]).textContent,
      numShown: vis(first('.bw-card-num', cards[i])),
      lockShown: vis(first('.bw-card-lock', cards[i])), checkShown: vis(first('.bw-card-check', cards[i])),
      border: getComputedStyle(cards[i]).borderTopColor })),
    ways: ways.map((r, i) => ({ top: Math.round(r.top), bottom: Math.round(r.bottom), right: Math.round(r.right),
      left: Math.round(r.left), cy: Math.round(r.top + r.height / 2),
      star: vis(first('.bw-way-star', stations[i])), num: vis(first('.bw-way-num', stations[i])) })),
    states: stations.map(s => s.getAttribute('data-state')),
    railShown: vis(document.getElementById('bw-rail')),
    link: stations.map(s => { const cs = getComputedStyle(s, '::before'); return { content: cs.content, w: parseFloat(cs.width) || 0 }; }),
    hint: (() => { const h = document.getElementById('bw-map-hint'); return { text: h.textContent, size: eff(h), shown: vis(h) }; })(),
    title: eff(first('.bw-map-title')), sub: eff(first('.bw-map-sub')), eyebrow: eff(first('.bw-map-eyebrow')),
    back: (() => { const b = document.getElementById('bw-to-landing'); const r = b.getBoundingClientRect();
      return { size: eff(b), h: Math.round(r.height), w: Math.round(r.width) }; })(),
    legendSize: eff(first('.bw-legend-item strong'))
  };
});

try {
  // ============================ the phone: 390 and 360 ============================
  for (const [vw, vh] of [[390, 780], [360, 640]]) {
    const tag = vw + 'x' + vh;
    const { ctx, page } = await openJourney({ width: vw, height: vh }, null);
    let m = await measure(page);

    check(tag + ': Journey is a natural-height column, not a scaled 1280px composition',
      m.framePosition !== 'absolute' && m.frameTransform === 'none' && m.frameW <= vw + 1,
      JSON.stringify({ pos: m.framePosition, tr: m.frameTransform, w: m.frameW }));
    check(tag + ': so the fixed-frame sizing is not left behind on the map',
      m.inlineHeight === '' && m.inlineScale === '' && m.inlineX === '' && m.inlineY === '',
      JSON.stringify({ h: m.inlineHeight, s: m.inlineScale }));
    check(tag + ': the layout is chosen in one place, and says so', m.layoutToken === 'stack', m.layoutToken);
    check(tag + ': no horizontal overflow', m.overflow <= 1, String(m.overflow));
    check(tag + ': all five stations are there', m.cardCount === 5, String(m.cardCount));

    // the route reads top to bottom, in order, in one column
    check(tag + ': stations run 1 to 5 down the page, none overlapping',
      m.cards.every((c, i) => i === 0 || c.top >= m.cards[i - 1].bottom - 1), JSON.stringify(m.cards.map(c => c.top)));
    check(tag + ': in one column - not alternating left and right',
      m.cards.every(c => Math.abs(c.left - m.cards[0].left) <= 2 && Math.abs(c.w - m.cards[0].w) <= 2),
      JSON.stringify(m.cards.map(c => [c.left, c.w])));
    check(tag + ': each card is wide enough to read, and inside the screen',
      m.cards.every(c => c.w >= vw - 90 && c.left >= 0 && c.right <= vw), JSON.stringify(m.cards.map(c => [c.left, c.w, c.right])));

    // readable text, with floors rather than "bigger than before"
    check(tag + ': station names are normal UI text (14px+)', m.cards.every(c => c.name >= 14),
      JSON.stringify(m.cards.map(c => Math.round(c.name * 10) / 10)));
    check(tag + ': statuses and blurbs are readable (11px+)',
      m.cards.every(c => c.status >= 11 && c.blurb >= 11),
      JSON.stringify(m.cards.map(c => [Math.round(c.status * 10) / 10, Math.round(c.blurb * 10) / 10])));
    check(tag + ': the header is readable', m.title >= 24 && m.sub >= 14 && m.eyebrow >= 11,
      JSON.stringify({ title: m.title, sub: m.sub, eyebrow: m.eyebrow }));
    check(tag + ': the hint is normal text, not scaled artwork', m.hint.shown && m.hint.size >= 13, JSON.stringify(m.hint));
    check(tag + ': and the legend', m.legendSize >= 11, String(m.legendSize));

    // tap targets: the whole card, and Overview
    const open = m.cards.filter(c => !c.disabled);
    check(tag + ': the card you can open is a practical tap target (44px+ on both sides)',
      open.length >= 1 && open.every(c => c.h >= 56 && c.w >= 44), JSON.stringify(open));
    check(tag + ': so is Overview', m.back.h >= 36 && m.back.size >= 12, JSON.stringify(m.back));

    // one connector, waypoints connected to cards, the number said once
    check(tag + ': the horizontal rail is gone, replaced by one vertical connector', !m.railShown &&
      m.link.slice(0, -1).every(l => l.content !== 'none' && l.w >= 2), JSON.stringify(m.link));
    check(tag + ': each waypoint sits beside its own card, level with it',
      m.ways.every((w, i) => w.right <= m.cards[i].left && w.cy >= m.cards[i].top && w.cy <= m.cards[i].bottom),
      JSON.stringify({ ways: m.ways.map(w => [w.right, w.cy]), cards: m.cards.map(c => [c.left, c.top, c.bottom]) }));
    check(tag + ': waypoints stack in order down the same line',
      m.ways.every((w, i) => Math.abs(w.left - m.ways[0].left) <= 2 && (i === 0 || w.cy > m.ways[i - 1].cy)),
      JSON.stringify(m.ways.map(w => [w.left, w.cy])));
    check(tag + ': the stage number is the waypoint\'s, not repeated on the card',
      m.cards.every(c => !c.numShown) && m.ways.every(w => w.num), JSON.stringify({ card: m.cards.map(c => c.numShown), way: m.ways.map(w => w.num) }));

    // fresh state, through the same engine
    check(tag + ': fresh: available, then locked behind it', m.states.join() === 'available,locked,locked,locked,locked', m.states.join());
    check(tag + ': locked stays visibly locked, and readable',
      m.cards.slice(1).every(c => c.lockShown && c.disabled && c.statusText === 'Upcoming'), JSON.stringify(m.cards.slice(1).map(c => [c.lockShown, c.disabled, c.statusText])));
    check(tag + ': the hint says where to pick up', /^Pick up at Identify/.test(m.hint.text), m.hint.text);

    // it is the same stage entry as desktop
    await page.locator('.bw-station[data-stage="1"] .bw-station-card').click();
    await page.waitForTimeout(700);
    check(tag + ': tapping an available station enters that stage',
      await page.evaluate(() => document.querySelector('.bw').getAttribute('data-view') === 'stage' &&
        /Identify/.test(document.getElementById('bw-ls-name').textContent)));
    await ctx.close();
  }

  // ============================ mid-progress and finished ============================
  for (const [vw, vh] of [[390, 780], [360, 640]]) {
    const tag = vw + 'x' + vh;
    let { ctx, page } = await openJourney({ width: vw, height: vh }, MID);
    let m = await measure(page);
    check(tag + ' mid: two done, one current, two locked',
      m.states.join() === 'completed,completed,current,locked,locked', m.states.join());
    check(tag + ' mid: completed keeps its native colour, a check and a star waypoint',
      m.cards.slice(0, 2).every(c => c.checkShown) && m.ways.slice(0, 2).every(w => w.star && !w.num),
      JSON.stringify({ checks: m.cards.map(c => c.checkShown), stars: m.ways.map(w => w.star) }));
    check(tag + ' mid: the current stage reads as current, in green, and says so',
      m.cards[2].statusText === 'In progress' && /rgb\(44, 255, 140\)/.test(m.cards[2].border), JSON.stringify([m.cards[2].statusText, m.cards[2].border]));
    check(tag + ' mid: each completed card keeps its own stage colour (distinct borders)',
      new Set(m.cards.slice(0, 2).map(c => c.border)).size === 2, JSON.stringify(m.cards.slice(0, 2).map(c => c.border)));
    check(tag + ' mid: the hint picks up at the current stage', /^Pick up at Envision/.test(m.hint.text), m.hint.text);
    check(tag + ' mid: no overflow', m.overflow <= 1, String(m.overflow));
    await ctx.close();

    ({ ctx, page } = await openJourney({ width: vw, height: vh }, FINISHED));
    m = await measure(page);
    check(tag + ' finished: all five completed', m.states.every(s => s === 'completed'), m.states.join());
    check(tag + ' finished: every completion line is on screen, readable, and not clipped',
      m.cards.every(c => c.statusText.length > 8 && c.status >= 11), JSON.stringify(m.cards.map(c => c.statusText)));
    check(tag + ' finished: all five carry the completed treatment',
      m.cards.every(c => c.checkShown && !c.lockShown) && m.ways.every(w => w.star), JSON.stringify(m.cards.map(c => c.checkShown)));
    check(tag + ' finished: five different stage colours',
      new Set(m.cards.map(c => c.border)).size === 5, JSON.stringify(m.cards.map(c => c.border)));
    check(tag + ' finished: the closing hint is easy to read',
      /^Every stage complete\. Open Deploy/.test(m.hint.text) && m.hint.size >= 13 && m.hint.shown, JSON.stringify(m.hint));
    check(tag + ' finished: no overflow', m.overflow <= 1, String(m.overflow));
    await page.locator('.bw-station[data-stage="5"] .bw-station-card').click();
    await page.waitForTimeout(700);
    check(tag + ' finished: Deploy can still be opened', await page.evaluate(() =>
      document.querySelector('.bw').getAttribute('data-view') === 'stage' &&
      /Deploy/.test(document.getElementById('bw-ls-name').textContent)));

    // and back: still the phone layout, and not stale
    await page.click('#bw-to-map');
    await page.waitForTimeout(700);
    m = await measure(page);
    check(tag + ' round trip: back on the phone layout, not the frame',
      m.framePosition !== 'absolute' && m.frameTransform === 'none' && m.inlineHeight === '' && m.inlineScale === '',
      JSON.stringify({ pos: m.framePosition, h: m.inlineHeight, s: m.inlineScale }));
    check(tag + ' round trip: states are fresh and complete', m.states.every(s => s === 'completed') && m.cardCount === 5, m.states.join());
    check(tag + ' round trip: still readable', m.cards.every(c => c.name >= 14 && c.status >= 11), JSON.stringify(m.cards.map(c => c.name)));
    await ctx.close();
  }

  // ============================ a state change shows up on the phone ============================
  {
    const { ctx, page } = await openJourney({ width: 390, height: 780 }, null);
    await page.locator('.bw-station[data-stage="1"] .bw-station-card').click();
    await page.waitForTimeout(700);
    await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('brainstorm_workflow_data') || '{}'); return d; });
    await page.click('#bw-to-map');
    await page.waitForTimeout(700);
    const m = await measure(page);
    check('390: after opening Identify, the journey says it is in progress, not Ready to start',
      m.states[0] === 'current' && m.cards[0].statusText === 'In progress', JSON.stringify([m.states[0], m.cards[0].statusText]));
    check('390: and the route is not stale after a round trip', m.inlineHeight === '' && m.inlineScale === '');
    await ctx.close();
  }

  // ============================ above 720, nothing moves ============================
  for (const [vw, vh] of [[721, 900], [768, 1024], [1100, 900], [1280, 900]]) {
    const tag = vw + 'x' + vh;
    const { ctx, page } = await openJourney({ width: vw, height: vh }, MID);
    const m = await measure(page);
    check(tag + ': still the fixed 16:9 frame, scaled to fit',
      m.framePosition === 'absolute' && /^matrix\(/.test(m.frameTransform) && m.layoutToken === 'frame',
      JSON.stringify({ pos: m.framePosition, tr: m.frameTransform, tok: m.layoutToken }));
    check(tag + ': the frame is sized by fitMap, as before',
      m.inlineHeight !== '' && m.inlineScale !== '', JSON.stringify({ h: m.inlineHeight, s: m.inlineScale }));
    check(tag + ': still above and below the line, left to right',
      m.cards[4].left > m.cards[0].left + 100 && m.cards[1].top > m.cards[0].top, JSON.stringify(m.cards.map(c => [c.left, c.top])));
    check(tag + ': the horizontal rail is still drawn', m.railShown);
    check(tag + ': and the stage number is still on the card', m.cards.every(c => c.numShown));
    check(tag + ': no horizontal overflow', m.overflow <= 1, String(m.overflow));
    await ctx.close();
  }

  // ============================ the boundary, and crossing it ============================
  {
    const { ctx, page } = await openJourney({ width: 720, height: 900 }, MID);
    let m = await measure(page);
    check('720 is the phone layout', m.layoutToken === 'stack' && m.framePosition !== 'absolute', m.layoutToken);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.waitForTimeout(400);
    m = await measure(page);
    check('widening to 1280 restores the frame and its sizing',
      m.layoutToken === 'frame' && m.framePosition === 'absolute' && m.inlineScale !== '' && m.inlineHeight !== '',
      JSON.stringify({ tok: m.layoutToken, s: m.inlineScale }));
    await page.setViewportSize({ width: 390, height: 780 });
    await page.waitForTimeout(400);
    m = await measure(page);
    check('narrowing again drops it - nothing stale survives the round trip',
      m.layoutToken === 'stack' && m.inlineHeight === '' && m.inlineScale === '' && m.inlineX === '' && m.inlineY === '' && m.overflow <= 1,
      JSON.stringify({ tok: m.layoutToken, h: m.inlineHeight, s: m.inlineScale }));
    await ctx.close();
  }

  // ============================ motion ============================
  /* The desktop choreography is geometry-agnostic - it fades the map and scales cards,
     and measures nothing - so it should carry over to a long column. Checked rather than
     assumed: the page must never become horizontally scrollable while it plays (a card
     scaled past a 16px gutter would do it), and nothing the animation wrote may be left
     behind on the cards afterwards. */
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 780 } });
    const page = await ctx.newPage();
    report.watch(page);
    await page.goto(`http://127.0.0.1:${PORT}/`);
    await page.waitForTimeout(400);
    await page.evaluate(() => {
      window.__ox = 0; window.__sy = [];
      const t = setInterval(() => {
        window.__ox = Math.max(window.__ox, document.documentElement.scrollWidth - document.documentElement.clientWidth);
        window.__sy.push(Math.round(window.scrollY));
      }, 30);
      window.__stop = () => clearInterval(t);
    });
    await page.click('#bw-start');
    await page.waitForTimeout(1500);
    const afterStart = await page.evaluate(() => ({
      ox: window.__ox,
      leftovers: [...document.querySelectorAll('.bw-station-card')].filter(c => c.getAttribute('style')).length,
      mapStyle: document.getElementById('bw-map').getAttribute('style') || ''
    }));
    check('Start on a phone never makes the page horizontally scrollable while it plays',
      afterStart.ox <= 1, JSON.stringify(afterStart));
    check('and leaves no animation styles on the cards or the map',
      afterStart.leftovers === 0 && !/transform|opacity/.test(afterStart.mapStyle), JSON.stringify(afterStart));
    check('and it arrives as the phone layout once settled', await page.evaluate(() =>
      getComputedStyle(document.getElementById('bw-map-frame')).transform === 'none'));
    await page.evaluate(() => { window.__ox = 0; });
    await page.locator('.bw-station[data-stage="1"] .bw-station-card').click();
    await page.waitForTimeout(1200);
    const afterEnter = await page.evaluate(() => ({ ox: window.__ox,
      view: document.querySelector('.bw').getAttribute('data-view') }));
    check('entering a stage from the phone route is clean too',
      afterEnter.view === 'stage' && afterEnter.ox <= 1, JSON.stringify(afterEnter));
    await page.click('#bw-to-map');
    await page.waitForTimeout(1200);
    const back = await page.evaluate(() => ({
      leftovers: [...document.querySelectorAll('.bw-station-card')].filter(c => c.getAttribute('style')).length,
      spineStyle: document.getElementById('bw-spine').getAttribute('style') || '' }));
    check('coming back leaves the route as it was: nothing the transition wrote survives',
      back.leftovers === 0 && back.spineStyle === '', JSON.stringify(back));
    await page.evaluate(() => window.__stop());
    await ctx.close();
  }
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 780 }, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    report.watch(page);
    await page.addInitScript(() => localStorage.setItem('bw_started', '1'));
    await page.goto(`http://127.0.0.1:${PORT}/`);
    await page.waitForTimeout(400);
    await page.locator('.bw-station[data-stage="1"] .bw-station-card').click();
    await page.waitForTimeout(300);
    check('with motion turned off, a phone tap still just goes to the stage',
      await page.evaluate(() => document.querySelector('.bw').getAttribute('data-view') === 'stage'));
    await ctx.close();
  }
} catch (e) {
  report.fail('THREW :: ' + String(e.message).split('\n')[0]);
}

const passed = report.finish();
await browser.close();
server.close();
process.exit(passed ? 0 : 1);

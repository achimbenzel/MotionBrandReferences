// The pure helpers the pages build on — days, colours, timing, ranks, a plan's
// tabs, storyboards, content and video links. No server, no browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dayKey, dateOf, addDays, fmtDay, daysFromToday } from '../src/lib/dates.js';
import { hexToRgb, rgbToHex, rgbToCmyk, cmykToRgb, contrastRatio, contrastLevels, expandColor, nearestPantone, paletteToCss, parseRgbString } from '../src/lib/color.js';
import { voEstimate, parseSeconds, briefingTarget, fmtDur, fmtClock, targetState } from '../src/lib/timing.js';
import { rankOf, xpOf, shortNum, progressOf, wouldUnlock, nextOn, seriesSteps } from '../src/lib/achievements.js';
import { blockTabs, statusTab, isEmptyBlock, blockSummary, planTab } from '../src/lib/planTabs.js';
import { timing, sectionRuns, progress, shotsOf, suggestCut, pickVariant, withFrame, ratioOf } from '../src/lib/storyboard.js';
import { segmentName } from '../src/lib/segments.js';
import { hashtagsOf, threadParts, charCount, weekdayOf, mondayOf, fmtSec } from '../src/lib/content.js';
import { parseVideoLink, firstUrl } from '../src/lib/videoLinks.js';
import { normalizeUrl, hostOf, youtubeId } from '../src/lib/types.js';

// Germany: a day starts an hour or two before UTC's does.
process.env.TZ = 'Europe/Berlin';

test('days are on the local calendar, not UTC', () => {
  const lateNight = new Date('2026-03-01T23:30:00Z'); // 00:30 on 2 March in Berlin
  assert.equal(dayKey(lateNight), '2026-03-02');
  assert.equal(dayKey(lateNight.getTime()), '2026-03-02');
  assert.match(dayKey(), /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(dayKey(dateOf('2026-07-09')), '2026-07-09');
  assert.equal(dateOf(''), null);
  assert.equal(dateOf('soon'), null);
});

test('adding days crosses months, years and the clock change', () => {
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(addDays('2028-02-28', 1), '2028-02-29');
  assert.equal(addDays('2026-03-28', 1), '2026-03-29');
  assert.equal(addDays('2026-03-29', 1), '2026-03-30'); // summer time starts on the 29th
  assert.equal(addDays('2026-10-24', 7), '2026-10-31');
  assert.equal(fmtDay(''), '');
  const today = dayKey();
  assert.equal(daysFromToday(today), 0);
  assert.equal(daysFromToday(addDays(today, 3)), 3);
  assert.equal(daysFromToday(addDays(today, -40)), -40);
  assert.ok(Number.isNaN(daysFromToday('')));
  assert.ok(fmtDay('2026-09-30').length > 0);
});

test('colours convert between hex, RGB and CMYK', () => {
  assert.deepEqual(hexToRgb('#fff'), { r: 255, g: 255, b: 255 });
  assert.deepEqual(hexToRgb('5b8cff'), { r: 91, g: 140, b: 255 });
  assert.equal(hexToRgb('#12345'), null);
  assert.equal(hexToRgb(''), null);
  assert.equal(rgbToHex({ r: 91, g: 140, b: 255 }), '#5B8CFF');
  assert.equal(rgbToHex({ r: 300, g: -4, b: 12.6 }), '#FF000D');
  assert.deepEqual(rgbToCmyk({ r: 0, g: 0, b: 0 }), { c: 0, m: 0, y: 0, k: 100 });
  assert.deepEqual(rgbToCmyk({ r: 255, g: 0, b: 0 }), { c: 0, m: 100, y: 100, k: 0 });
  assert.deepEqual(cmykToRgb({ c: 0, m: 100, y: 100, k: 0 }), { r: 255, g: 0, b: 0 });
  assert.deepEqual(parseRgbString('rgb(12, 300, 7)'), { r: 12, g: 255, b: 7 });
});

test('contrast follows WCAG', () => {
  const black = { r: 0, g: 0, b: 0 }; const white = { r: 255, g: 255, b: 255 };
  assert.equal(Math.round(contrastRatio(black, white)), 21);
  assert.equal(contrastRatio(white, white), 1);
  assert.deepEqual(contrastLevels(4.5), { normalAA: true, normalAAA: false, largeAA: true, largeAAA: true });
});

test('Pantone: an exact code stays exact, anything else is the nearest (approx.)', () => {
  const exact = expandColor('pantone', '871 C');
  assert.equal(exact.pantone, 'PANTONE 871 C');
  assert.equal(exact.pantoneApprox, false);
  assert.equal(exact.hex, '#84754E');
  const near = expandColor('hex', '#84754F');
  assert.equal(near.pantone, 'PANTONE 871 C');
  assert.equal(near.pantoneApprox, true);
  assert.equal(nearestPantone(hexToRgb('#FFFFFF')).distance, 0);
  assert.equal(expandColor('hex', 'nope'), null);
  assert.equal(paletteToCss([{ name: 'Brand', hex: '#111111' }, { name: 'Brand', hex: '#222222' }, { hex: '#333333' }]),
    ':root {\n  --brand: #111111;\n  --brand-2: #222222;\n  --color-3: #333333;\n}');
});

test('speaking time, typed durations and timecodes', () => {
  assert.deepEqual(voEstimate('Hello world [pause 1.5s] (smiles)', 2), { words: 2, pause: 1.5, seconds: 2.5 });
  assert.equal(voEstimate('').seconds, 0);
  assert.equal(parseSeconds('30 s + 15 s'), 30);
  assert.equal(parseSeconds('1:30'), 90);
  assert.equal(parseSeconds('1,5 min'), 90);
  assert.equal(parseSeconds('about a minute'), null);
  assert.equal(briefingTarget({ blocks: [{ type: 'briefing', fields: [{ label: 'Target length', value: '45 s' }] }] }), 45);
  assert.equal(briefingTarget({ blocks: [] }), null);
  assert.equal(fmtDur(7.25), '7.3 s');
  assert.equal(fmtDur(30), '30 s');
  assert.equal(fmtDur(94), '1:34');
  assert.equal(fmtClock(61.25), '1:01.3');
  assert.equal(fmtClock(0), '0:00.0');
  assert.equal(targetState(40, 30), 'over');
  assert.equal(targetState(28, 30), 'ok');
  assert.equal(targetState(10, 30), 'under');
  assert.equal(targetState(10, 0), null);
});

test('ranks: Stone 1 … Mythic 3, and what counts towards them', () => {
  assert.equal(rankOf(0).label, 'Stone 1');
  assert.equal(rankOf(50).progress, 0.5);
  assert.equal(rankOf(100).label, 'Stone 2');
  assert.equal(rankOf(600).label, 'Bronze 1');
  const top = rankOf(21000);
  assert.equal(top.label, 'Mythic 3');
  assert.equal(top.top, true);
  assert.equal(rankOf(1e9).progress, 1);
  assert.equal(xpOf({ rarity: 'gold', achievedAt: '2026-01-01' }), 100);
  assert.equal(xpOf({ rarity: 'gold' }), 0);
  assert.equal(shortNum(950), '950');
  assert.equal(shortNum(2500), '2.5K');
  assert.equal(shortNum(1000000), '1M');
  assert.deepEqual(seriesSteps('followers:tiktok').slice(0, 2), [100, 500]);
  const list = [{ id: 'a', metric: 'clients', target: 10 }, { id: 'b', metric: 'clients', target: 5 }, { id: 'c', metric: 'clients', target: 1, achievedAt: '2026-01-01' }];
  assert.equal(progressOf(list[0], { clients: 4 }), 0.4);
  assert.equal(progressOf(list[2], { clients: 4 }), null);
  assert.deepEqual(wouldUnlock(list, 'clients', 7).map((a) => a.id), ['b']);
  assert.equal(nextOn(list, 'clients').id, 'b');
});

test("a plan's tabs: own tab, else by type; headings go with the block after them", () => {
  const blocks = [
    { type: 'heading' }, { type: 'moodboard' }, { type: 'text', tab: 'delivery' }, { type: 'script' },
    { type: 'divider' }, { type: 'unknown' }, { type: 'divider' },
  ];
  assert.deepEqual(blockTabs(blocks), ['concept', 'concept', 'delivery', 'production', 'brief', 'brief', 'brief']);
  assert.deepEqual(blockTabs([]), []);
  assert.equal(statusTab('review'), 'delivery');
  assert.equal(statusTab('nope'), null);
  assert.equal(planTab('nope').key, 'overview');
  assert.equal(isEmptyBlock({ type: 'todos', items: [] }), true);
  assert.equal(isEmptyBlock({ type: 'briefing', fields: [{ value: ' ' }] }), true);
  assert.equal(isEmptyBlock({ type: 'heading' }), false);
  assert.equal(blockSummary({ type: 'todos', items: [{ done: true }, { done: false }] }), '1/2 done');
  assert.equal(blockSummary({ type: 'storyboard', shots: [{ duration: 2, status: 'approved' }, { duration: 3.5 }], aspect: '9:16' }), '2 shots · 0:05.5 · 9:16 · 1 approved');
});

test('storyboards: timing, sections, cutdowns and variants', () => {
  const shots = [
    { id: 's1', duration: 2, section: 'hook' }, { id: 's2', duration: 3, section: 'hook' },
    { id: 's3', duration: 4, section: 'cta' }, { id: 's4', duration: '1', section: '' },
  ];
  assert.deepEqual(timing(shots), { starts: [0, 2, 5, 9], total: 10 });
  assert.deepEqual(sectionRuns(shots).map((r) => [r.section, r.from, r.to, r.start, r.length]), [['hook', 0, 1, 0, 5], ['cta', 2, 2, 5, 4], ['', 3, 3, 9, 1]]);
  assert.deepEqual(progress([{ status: 'approved' }, { status: 'sketch' }, {}]), { total: 3, done: 1, counts: { approved: 1, sketch: 1 } });
  const cut = suggestCut(shots, 5, '');
  assert.equal(cut.name, '5 s cut');
  assert.equal(timing(shotsOf(shots, cut)).total, 5);
  assert.deepEqual(shotsOf(shots, { skip: ['s2'], durations: { s3: 1 } }).map((s) => [s.id, s.duration]), [['s1', 2], ['s3', 1], ['s4', '1']]);
  assert.equal(shotsOf(shots, null), shots);
  const shot = { id: 'x', image: 'a.png', alts: [{ id: 'v1', image: 'b.png' }] };
  const picked = pickVariant(shot, 'v1');
  assert.equal(picked.image, 'b.png');
  assert.deepEqual(picked.alts.map((a) => a.image), ['a.png']); // nothing is lost
  assert.deepEqual(withFrame(shot, 'c.png').alts.map((a) => a.image), ['a.png', 'b.png']);
  assert.equal(ratioOf('9:16'), 9 / 16);
  assert.equal(ratioOf('bad'), 16 / 9);
  assert.equal(segmentName({ kind: 'cta' }, 0), 'Call to action');
  assert.equal(segmentName({ label: ' ' }, 2), 'Section 3');
});

test('content: hashtags, threads, weeks and lengths', () => {
  assert.deepEqual(hashtagsOf('motion, #design  3d'), ['#motion', '#design', '#3d']);
  assert.deepEqual(threadParts('one\n---\ntwo\n  -----  \nthree'), ['one', 'two', 'three']);
  assert.equal(charCount('héllo 👋'), 7);
  assert.equal(weekdayOf('2026-09-28'), 0); // a Monday
  assert.equal(weekdayOf('2026-10-04'), 6);
  assert.equal(mondayOf('2026-10-04'), '2026-09-28');
  assert.equal(mondayOf('2027-01-01'), '2026-12-28');
  assert.equal(fmtSec(7.25), '7.3 s');
  assert.equal(fmtSec(15), '15 s');
  assert.equal(fmtSec(75), '1:15');
});

test('video links and web addresses', () => {
  assert.deepEqual(parseVideoLink('https://youtu.be/dQw4w9WgXcQ?t=10'), { provider: 'youtube', id: 'dQw4w9WgXcQ', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' });
  assert.equal(parseVideoLink('https://m.youtube.com/shorts/dQw4w9WgXcQ').id, 'dQw4w9WgXcQ');
  assert.deepEqual(parseVideoLink('https://vimeo.com/123456789/abcdef1234'), { provider: 'vimeo', id: '123456789', hash: 'abcdef1234', url: 'https://vimeo.com/123456789/abcdef1234' });
  assert.equal(parseVideoLink('https://example.com/watch?v=dQw4w9WgXcQ'), null);
  assert.equal(parseVideoLink('javascript:alert(1)'), null);
  assert.equal(firstUrl('look: https://vimeo.com/1234567 !'), 'https://vimeo.com/1234567');
  assert.equal(normalizeUrl('example.com/a'), 'https://example.com/a');
  assert.equal(normalizeUrl('http://x.io'), 'http://x.io');
  assert.equal(hostOf('www.example.com/path'), 'example.com');
  assert.equal(youtubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=1'), 'dQw4w9WgXcQ');
});

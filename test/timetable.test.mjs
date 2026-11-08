import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TimetableProvider, dayType, timeSeconds, parseSheet } from '../timetable.mjs';
import { createSubwayServer } from '../server.mjs';

const at = value => Date.parse(value + '+09:00');
const rows = [];
for (const line of ['02호선', '09호선']) for (const direction of ['1', '2']) for (const day of ['1', '2', '3']) rows.push({ SBWY_ROUT_LN: line, STTN: line === '02호선' ? '강남' : '여의도', UPLN_DNLN: direction, DOW: day, FSTT_HRM: direction === '1' ? '053000' : '054000', LSTTM_HRM: day === '1' ? '245000' : '235000', FSTT_ARVL_STTN: line === '02호선' ? '성수' : '중앙보훈병원', LSTTM_ARVL_STTN: line === '02호선' ? '성수' : direction === '1' ? '중앙보훈병원' : '개화' });
function provider(time, options = {}) {
  return new TimetableProvider({ now: () => at(time), refresh: false, data: { retrievedAt: new Date(at(time)).toISOString(), rows }, ...options });
}
test('service windows respect midnight, weekday changes, first/last boundaries and holidays', async () => {
  assert.equal(timeSeconds('245000'), 89400);
  assert.equal(timeSeconds('005000'), 89400);
  assert.equal(timeSeconds('256100'), null);
  assert.equal(dayType('2026-11-07'), '2');
  assert.equal(dayType('2026-11-08'), '3');
  assert.equal(dayType('2026-12-25'), '3');
  assert.equal(dayType('2027-02-09'), '3');
  assert.equal(dayType('2028-01-01'), null);
  const midnight = (await provider('2026-11-07T00:30:00').states('1002', '강남'))[0];
  assert.equal(midnight.status, 'scheduled');
  assert.equal(midnight.serviceDate, '2026-11-06');
  assert.equal(midnight.dayType, '1');
  assert.equal((await provider('2026-11-07T00:50:00').states('1002', '강남'))[0].status, 'scheduled');
  const closed = (await provider('2026-11-07T00:50:01').states('1002', '강남'))[0];
  assert.equal(closed.status, 'after_last');
  assert.equal(closed.nextFirstAt, new Date(at('2026-11-07T05:30:00')).toISOString());
  assert.equal((await provider('2026-11-07T05:29:59').states('1002', '강남'))[0].status, 'after_last');
  assert.equal((await provider('2026-11-07T05:30:00').states('1002', '강남'))[0].status, 'scheduled');
  const sunday = (await provider('2026-11-08T00:10:00').states('1002', '강남'))[0];
  assert.equal(sunday.status, 'after_last');
  assert.equal(sunday.serviceDate, '2026-11-07');
  assert.equal((await provider('2026-12-25T23:55:00').states('1002', '강남'))[0].status, 'after_last');
});
test('9호선 direction is mapped to the correct destination; unavailable and stale schedules stay unknown', async () => {
  const p = provider('2026-11-08T01:00:00');
  const nine = await p.states('1009', '여의도');
  assert.equal(nine[0].lastDestination, '개화');
  assert.equal(nine[1].lastDestination, '중앙보훈병원');
  assert.equal((await p.states('1002', '역삼'))[0].status, 'unknown');
  const stale = provider('2026-11-08T01:00:00', { data: { retrievedAt: '2026-10-01T00:00:00Z', rows } });
  assert.equal((await stale.states('1002', '강남'))[0].status, 'unknown');
  assert.equal((await provider('2028-02-01T01:00:00').states('1002', '강남'))[0].status, 'unknown');
  const branch = provider('2026-11-08T01:00:00', { data: { retrievedAt: '2026-11-08T00:00:00Z', rows: rows.map(r => ({ ...r, LSTTM_ARVL_STTN: '미등록차량기지' })) } });
  assert.equal((await branch.states('1002', '강남'))[0].status, 'unknown');
  const mixed = provider('2026-11-08T01:00:00', { data: { retrievedAt: '2026-11-08T00:00:00Z', rows: rows.map(r => ({ ...r, LSTTM_ARVL_STTN: '신설동' })) } });
  assert.equal((await mixed.states('1002', '강남', 0))[0].status, 'unknown');
});
test('official public sheet is parsed as data; refresh coalesces and rejects incomplete updates', async () => {
  assert.equal(parseSheet('{result:"ok",page:{totalCount:1},list:[{STTN:"강남"},]}')[0].STTN, '강남');
  assert.throws(() => parseSheet('{result:"ok",page:{totalCount:2},list:[]}'));
  assert.throws(() => parseSheet('process.exit()'));
  let calls = 0;
  const p = provider('2026-11-08T01:00:00', { refresh: true, data: { retrievedAt: '2026-11-06T00:00:00Z', rows }, fetcher: async () => { calls++; return { ok: true, text: async () => JSON.stringify({ result: 'ok', page: { totalCount: 6 }, list: rows.filter(r => r.SBWY_ROUT_LN === '02호선') }) }; } });
  await Promise.all([p.states('1002', '강남'), p.states('1002', '강남')]);
  assert.equal(calls, 1);
  await p.states('1002', '강남'); assert.equal(calls, 1);
  const bad = provider('2026-11-08T01:00:00', { refresh: true, data: { retrievedAt: '2026-10-01T00:00:00Z', rows }, fetcher: async () => ({ ok: true, text: async () => '{result:"ok",page:{totalCount:0},list:[]}' }) });
  assert.equal((await bad.states('1002', '강남'))[0].status, 'unknown');
});
test('train API distinguishes after-last service from unavailable realtime data', async t => {
  let fail = false;
  const { server } = createSubwayServer({ secure: false, timetable: provider('2026-11-08T01:00:00'), provider: { key: 'test', arrivals: async () => { if (fail) throw Error('실시간 조회 지연'); return { mode: 'live', trains: [] }; } } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const origin = `http://127.0.0.1:${server.address().port}`, base = origin + '/metro-chat/api/';
  const session = await fetch(base + 'session', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: '{}' });
  const headers = { Cookie: session.headers.get('set-cookie').split(';')[0] };
  const query = () => fetch(base + 'trains?line=1002&station=' + encodeURIComponent('강남'), { headers });
  const first = await (await query()).json();
  assert.equal(first.schedules[0].status, 'after_last'); assert.deepEqual(first.trains, []);
  fail = true;
  const outage = await (await query()).json();
  assert.equal(outage.schedules[0].status, 'after_last'); assert.equal(outage.arrivalError, '실시간 조회 지연');
  assert.equal((await fetch(base + 'trains?line=1002&station=invalid', { headers })).status, 400);
});

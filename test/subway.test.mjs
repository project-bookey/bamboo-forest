import { test } from 'node:test';
import assert from 'node:assert/strict';
import { route, serviceDay, TransitProvider } from '../transit.mjs';
import { createSubwayServer } from '../server.mjs';

test('routes respect direction, circular wrap, and invalid stations', () => {
  assert.deepEqual(route('1002', '충정로', '을지로입구', 0), ['충정로', '시청', '을지로입구']);
  assert.deepEqual(route('1002', '을지로입구', '충정로', 1), ['을지로입구', '시청', '충정로']);
  assert.equal(route('1009', '여의도', '당산', 1), null);
  assert.deepEqual(route('1009', '여의도', '국회의사당', 0), ['여의도', '국회의사당']);
  assert.equal(route('1002', '없는역', '강남', 0), null);
  assert.equal(route('1002', '강남', '강남', 0), null);
  assert.equal(serviceDay(Date.parse('2026-11-06T02:59:00+09:00')), '2026-11-05');
  assert.equal(serviceDay(Date.parse('2026-11-06T03:00:00+09:00')), '2026-11-06');
});
test('provider normalizes train numbers, rejects stale rows, coalesces and caches requests', async () => {
  let calls = 0, now = Date.parse('2026-11-06T10:00:00+09:00');
  const row = { subwayId: '1002', btrainNo: '0023', updnLine: '내선', recptnDt: '2026-11-06 09:59:30', barvlDt: '60', bstatnNm: '성수', arvlMsg2: '접근 중' };
  const provider = new TransitProvider({ key: 'test', demo: false, now: () => now, fetcher: async () => { calls++; return { ok: true, json: async () => ({ errorMessage: { code: 'INFO-000' }, realtimeArrivalList: [row, row, { ...row, btrainNo: '24', recptnDt: '2026-11-06 09:40:00' }, { ...row, subwayId: '1009' }] }) }; } });
  const [a, b] = await Promise.all([provider.arrivals('1002', '강남'), provider.arrivals('1002', '강남')]);
  assert.equal(calls, 1); assert.deepEqual(a, b); assert.equal(a.trains.length, 1); assert.equal(a.trains[0].number, '23'); assert.equal(a.trains[0].seconds, 30);
  await provider.arrivals('1002', '강남'); assert.equal(calls, 1);
  now += 21000; await provider.arrivals('1002', '강남'); assert.equal(calls, 2);
  assert.equal((await new TransitProvider({ key: '', demo: false }).arrivals('1002', '강남')).mode, 'unconfigured');
  const bad = new TransitProvider({ key: 'test', demo: false, fetcher: async () => ({ ok: true, json: async () => ({ errorMessage: { code: 'INFO-100' } }) }) });
  await assert.rejects(bad.arrivals('1002', '강남'), /인증키/);
  const empty = new TransitProvider({ key: 'test', demo: false, fetcher: async () => ({ ok: true, json: async () => ({ status: 500, code: 'INFO-200', message: '해당하는 데이터가 없습니다.', total: 0 }) }) });
  assert.deepEqual((await empty.arrivals('1002', '강남')).trains, []);
  const invalid = new TransitProvider({ key: 'test', demo: false, fetcher: async () => ({ ok: true, json: async () => ({ code: 'INFO-100' }) }) });
  await assert.rejects(invalid.arrivals('1002', '강남'), /인증키/);
});
test('real sessions share only their train room; leave, auth and SSE isolation are enforced', async t => {
  const { server } = createSubwayServer({ secure: false, provider: new TransitProvider({ demo: true }) });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`, path = base + '/metro-chat/api/';
  const abort = new AbortController();
  t.after(() => { abort.abort(); server.closeAllConnections(); server.close(); });
  for (const [oldPath, newPath] of [['/bamboo-forest', '/metro-chat/'], ['/bamboo-forest/', '/metro-chat/'], ['/bamboo-forest/api/health?check=1', '/metro-chat/api/health?check=1']]) {
    const redirect = await fetch(base + oldPath, { redirect: 'manual' });
    assert.equal(redirect.status, 301); assert.equal(redirect.headers.get('location'), newPath);
  }
  const post = (name, data, cookie, origin = base) => fetch(path + name, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify(data) });
  const a = await post('session', {}), b = await post('session', {}), c = await post('session', {});
  assert.match(a.headers.get('set-cookie'), /Path=\/metro-chat\//);
  const ac = a.headers.get('set-cookie').split(';')[0], bc = b.headers.get('set-cookie').split(';')[0], cc = c.headers.get('set-cookie').split(';')[0];
  const aid = (await a.json()).id; assert.notEqual(aid, (await b.json()).id);
  const trip = { line: '1002', from: '강남', to: '사당', direction: 0, train: 'demo-0' };
  assert.equal((await post('board', trip, ac)).status, 200);
  assert.equal((await post('board', { ...trip, from: '역삼', to: '신림' }, bc)).status, 200);
  assert.equal((await post('board', { ...trip, direction: 1, train: 'demo-1' }, cc)).status, 200);
  const stream = await fetch(path + 'events', { headers: { Cookie: bc }, signal: abort.signal });
  const reader = stream.body.getReader();
  async function readState() { const { value } = await reader.read(); return JSON.parse(new TextDecoder().decode(value).split('data: ')[1].split('\n')[0]); }
  assert.equal((await readState()).messages.length, 0);
  assert.equal((await post('say', { text: '<script>hello</script>' }, ac)).status, 200);
  const shared = await readState(); assert.equal(shared.messages[0].sender, aid); assert.equal(shared.messages[0].text, '<script>hello</script>');
  assert.equal((await (await post('session', {}, cc)).json()).messages.length, 0);
  assert.equal((await post('say', { text: 'spam' }, ac)).status, 429);
  assert.equal((await post('leave', {}, ac)).status, 200);
  assert.equal((await post('say', { text: 'after leave' }, ac)).status, 409);
  assert.equal((await post('board', trip)).status, 401);
  assert.equal((await post('board', trip, ac, 'https://other.example')).status, 403);
  assert.equal((await post('board', { ...trip, train: 'forged' }, ac)).status, 409);
  const module = await (await fetch(base + '/metro-chat/transit.mjs')).text();
  assert.ok(!module.includes('SEOUL_SUBWAY_API_KEY')); assert.ok(!module.includes('swopenapi'));
  assert.equal((await fetch(base + '/metro-chat/server.mjs')).status, 404);
});

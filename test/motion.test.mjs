import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWalk, sampleWalk, WALK_SPEED } from '../cabin-motion.mjs';
import { createSubwayServer } from '../server.mjs';
import { TransitProvider } from '../transit.mjs';

test('continuous walking respects speed, bounds and server time before, during and after travel', () => {
  const walk = createWalk({ x: 0, z: 0 }, { x: 500, z: -500 }, 10000);
  assert.equal(walk.toX, 1.15); assert.equal(walk.toZ, -9);
  assert.deepEqual(sampleWalk(walk, 9000), { x: 0, z: 0 });
  const halfway = sampleWalk(walk, 10000 + walk.duration / 2);
  assert.ok(Math.abs(Math.hypot(halfway.x, halfway.z) / (walk.duration / 2000) - WALK_SPEED) < 1e-9);
  assert.deepEqual(sampleWalk(walk, 10000 + walk.duration + 5000), { x: 1.15, z: -9 });
  assert.deepEqual(sampleWalk(createWalk({ x: 0, z: 2 }, { x: 0, z: 2 }, 1), 1), { x: 0, z: 2 });
});

test('movement uses compact room events and stale room/car commands cannot move a passenger', async t => {
  let time = Date.now();
  const { server } = createSubwayServer({ secure: false, now: () => time, provider: new TransitProvider({ demo: true }) });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`, base = origin + '/metro-chat/api/';
  const abort = new AbortController();
  t.after(() => { abort.abort(); server.closeAllConnections(); server.close(); });
  const post = (path, body, cookie) => fetch(base + path, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', Cookie: cookie || '' }, body: JSON.stringify(body) });
  const cookies = [];
  for (let i = 0; i < 3; i++) { const r = await post('session', {}); cookies.push(r.headers.get('set-cookie').split(';')[0]); }
  const trip = { line: '1002', from: '강남', to: '사당', direction: 0, train: 'demo-0' };
  for (let i = 0; i < 3; i++) await post('board', i < 2 ? trip : { ...trip, direction: 1, train: 'demo-1' }, cookies[i]);
  async function subscribe(cookie) {
    const response = await fetch(base + 'events', { headers: { Cookie: cookie }, signal: abort.signal });
    const reader = response.body.getReader(), events = [], waiters = []; let buffer = '';
    (async () => { try { while (true) { const { value, done } = await reader.read(); if (done) break; buffer += new TextDecoder().decode(value); let end; while ((end = buffer.indexOf('\n\n')) !== -1) { const frame = buffer.slice(0, end); buffer = buffer.slice(end + 2); const type = /^event: (.+)$/m.exec(frame)?.[1]; const data = /^data: (.+)$/m.exec(frame)?.[1]; if (!data) continue; const event = { type, data: JSON.parse(data) }; events.push(event); for (const fn of [...waiters]) fn(event); } } } catch (error) { if (error.name !== 'AbortError') throw error; } })();
    const wait = predicate => new Promise((resolve, reject) => { const previous = events.find(predicate); if (previous) return resolve(previous); const timeout = setTimeout(() => reject(Error('SSE event timeout')), 2000); const fn = event => { if (!predicate(event)) return; clearTimeout(timeout); waiters.splice(waiters.indexOf(fn), 1); resolve(event); }; waiters.push(fn); });
    return { events, wait };
  }
  const b = await subscribe(cookies[1]), c = await subscribe(cookies[2]);
  time += 1000;
  const response = await post('move', { x: .5, z: -3, car: 1 }, cookies[0]);
  const reply = await response.json(); assert.equal(response.status, 200); assert.ok(reply.walk.duration > 0);
  const event = await b.wait(event => event.type === 'motion');
  assert.ok(JSON.stringify(event).length < 600); assert.ok(!('messages' in event.data)); assert.equal(event.data.walk.toZ, -3);
  time += 1000; await post('emote', { kind: 'wave' }, cookies[0]);
  await c.wait(event => event.type === 'state' && event.data.serverAt === time);
  assert.ok(c.events.every(event => event.type !== 'motion'));
  time += 1000; await post('car', { car: 2 }, cookies[0]);
  assert.equal((await post('move', { x: 0, z: -8, car: 1 }, cookies[0])).status, 409);
  assert.equal((await post('move', { x: 0, z: -8, car: 2, room: 'old-room' }, cookies[0])).status, 409);
  const snapshot = await (await post('session', {}, cookies[0])).json();
  assert.equal(snapshot.players.find(p => p.id === snapshot.id).walk.toZ, 7);
});

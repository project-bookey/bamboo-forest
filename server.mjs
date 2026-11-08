import http from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { randomBytes, randomUUID, createHash, timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { LINES, route, stationName, reachesDestination, trainStops, serviceDay, TransitProvider } from './transit.mjs';
import { TimetableProvider } from './timetable.mjs';
import { PositionProvider, tripProgress } from './positions.mjs';
import { ModerationStore } from './moderation.mjs';
import { createWalk, sampleWalk } from './cabin-motion.mjs';
import { CAR_COUNT, SEATS, REACTIONS, COAT_COLORS } from './cabin-data.mjs';

const BASE = '/metro-chat';
const releaseFile = new URL('./data/release.json', import.meta.url);
const revision = existsSync(releaseFile) ? JSON.parse(readFileSync(releaseFile, 'utf8')).revision : null;
const walkingPosition = (s, time) => {
  const walk = s.walk;
  if (!walk) return { x: 0, z: 5 };
  return sampleWalk(walk, time);
};
export function createSubwayServer({ now = Date.now, provider = new TransitProvider({ now }), timetable = new TimetableProvider({ now }), positions = new PositionProvider({ key: provider.key, demo: provider.demo, now }), moderation = new ModerationStore({ now }), adminToken = process.env.METRO_ADMIN_TOKEN, secure = process.env.NODE_ENV === 'production' } = {}) {
  const sessions = new Map(), rooms = new Map(), rates = new Map();
  const send = (res, status, value) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); };
  const state = s => {
    const room = rooms.get(s.trip?.room);
    const progress = s.progress?.available && now() - Date.parse(s.progress.updatedAt) > 90000 ? { available: false, message: '열차 위치 정보가 오래됐어요. 하차역에서 직접 하차해 주세요.' } : s.progress;
    const passengers = room ? [...sessions.values()].filter(p => p.trip?.room === s.trip.room && (p.streams.size || p === s)) : [];
    const blocked = moderation.blocks(s.id);
    const car = s.trip?.car || 1;
    return { serverAt: now(), id: s.id, name: s.name, trip: s.trip, progress: s.trip ? progress : null, ended: s.ended || null, blocked, mutedUntil: moderation.mutedUntil(s.id), count: passengers.length,
      cars: Array.from({ length: CAR_COUNT }, (_, i) => ({ number: i + 1, count: passengers.filter(p => (p.trip.car || 1) === i + 1).length })),
      players: passengers.filter(p => !blocked.some(b => b.id === p.id)).map(p => ({ id: p.id, name: p.name, car: p.trip.car || 1, seat: p.seat || null, coat: p.coat ?? (parseInt(p.id.slice(0, 4), 16) % COAT_COLORS.length), emote: p.emote?.until > now() ? p.emote : null, walk: p.walk, ...walkingPosition(p, now()) })),
      messages: (room?.messages || []).filter(message => moderation.visible(s.id, message) && (message.scope !== 'car' || message.car === car)) };
  };
  const publish = s => {
    const message = `event: state\ndata: ${JSON.stringify(state(s))}\n\n`;
    for (const stream of s.streams) { if (stream.writableLength > 128 * 1024) stream.destroy(); else stream.write(message); }
  };
  const broadcast = () => { for (const s of sessions.values()) publish(s); };
  const motion = s => ({ serverAt: now(), id: s.id, car: s.trip.car, walk: s.walk, ...walkingPosition(s, now()) });
  const publishMotion = s => {
    const payload = `event: motion\ndata: ${JSON.stringify(motion(s))}\n\n`;
    for (const recipient of sessions.values()) {
      if (recipient.trip?.room !== s.trip.room || recipient.trip.car !== s.trip.car || moderation.blocks(recipient.id).some(b => b.id === s.id)) continue;
      for (const stream of recipient.streams) { if (stream.writableLength > 128 * 1024) stream.destroy(); else stream.write(payload); }
    }
  };
  const endTrip = (s, reason) => { s.ended = { reason, at: now(), from: s.trip?.from, to: s.trip?.to }; s.trip = null; s.progress = null; };
  const availableTrains = async (line, station, source) => source === 'running' && !provider.demo ? { mode: provider.key ? 'live' : 'unconfigured', fetchedAt: now(), trains: await positions.positions(line), source } : { ...await provider.arrivals(line, station), source };
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      if (req.method === 'GET' && (url.pathname === '/bamboo-forest' || url.pathname.startsWith('/bamboo-forest/'))) {
        const suffix = url.pathname.slice('/bamboo-forest'.length) || '/';
        res.writeHead(301, { Location: BASE + suffix + url.search }); return res.end();
      }
      if (req.method === 'GET' && url.pathname === BASE) { res.writeHead(301, { Location: BASE + '/' }); return res.end(); }
      const publicFiles = ['index.html', 'client.js', 'features.js', 'transit.mjs', 'journey.mjs', 'cabin.js', 'cabin.css', 'cabin-data.mjs', 'cabin-environment.js', 'cabin-controls.js', 'cabin-motion.mjs', 'vendor/three.module.min.js', 'vendor/three.LICENSE'];
      if (req.method === 'GET' && (url.pathname === BASE + '/' || publicFiles.some(file => url.pathname === BASE + '/' + file))) {
        const file = url.pathname === BASE + '/' ? 'index.html' : url.pathname.slice(BASE.length + 1);
        const body = file === 'transit.mjs' ? `export const LINES = ${JSON.stringify(LINES)}; export const route = ${route.toString()}; export const stationName = ${stationName.toString()}; export const reachesDestination = ${reachesDestination.toString()}; export const trainStops = ${trainStops.toString()};` : await readFile(new URL('./' + file, import.meta.url));
        res.writeHead(200, { 'Content-Type': file.endsWith('.html') ? 'text/html; charset=utf-8' : file.endsWith('.css') ? 'text/css; charset=utf-8' : file.endsWith('.LICENSE') ? 'text/plain; charset=utf-8' : 'text/javascript; charset=utf-8', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' }); return res.end(body);
      }
      if (req.method === 'GET' && url.pathname === BASE + '/api/health') return send(res, 200, { status: 'ok', service: 'subway-chat', revision, mode: provider.demo ? 'demo' : provider.key ? 'live' : 'unconfigured' });
      const token = /(?:^|;\s*)subway_session=([a-f0-9]{48})(?:;|$)/.exec(req.headers.cookie || '')?.[1];
      let session = sessions.get(token);
      if (req.method === 'GET' && url.pathname === BASE + '/api/events') {
        if (!session) return send(res, 401, { error: '다시 연결해 주세요.' });
        if (session.streams.size >= 4) return send(res, 429, { error: '열린 창이 너무 많아요.' });
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no', Connection: 'keep-alive' });
        session.streams.add(res); session.lastSeen = now(); broadcast();
        req.on('close', () => { session.streams.delete(res); session.lastSeen = now(); broadcast(); }); return;
      }
      if (!url.pathname.startsWith(BASE + '/api/')) return send(res, 404, { error: '찾을 수 없는 주소예요.' });
      if (req.method !== 'POST' && req.method !== 'GET') return send(res, 405, { error: '지원하지 않는 요청이에요.' });
      if (req.method === 'POST' && (!req.headers.origin || new URL(req.headers.origin).host !== req.headers.host)) return send(res, 403, { error: 'Origin rejected' });
      if (req.method === 'POST' && !req.headers['content-type']?.startsWith('application/json')) return send(res, 415, { error: 'JSON required' });
      let body = '';
      for await (const chunk of req) { body += chunk; if (Buffer.byteLength(body) > 2048) return send(res, 413, { error: '요청이 너무 길어요.' }); }
      const data = JSON.parse(body || '{}');
      if (!data || typeof data !== 'object' || Array.isArray(data)) return send(res, 400, { error: 'Invalid body' });
      if (url.pathname.startsWith(BASE + '/api/moderation/')) {
        const provided = createHash('sha256').update(req.headers.authorization || '').digest();
        const expected = createHash('sha256').update(`Bearer ${adminToken || ''}`).digest();
        if (!adminToken || adminToken.length < 32 || !timingSafeEqual(provided, expected)) return send(res, 401, { error: '운영자 인증이 필요합니다.' });
        await moderation.ready;
        if (req.method === 'GET' && url.pathname.endsWith('/reports')) return send(res, 200, { reports: moderation.reports() });
        if (req.method === 'POST' && url.pathname.endsWith('/review')) { const report = await moderation.review(data.id, data.action, data.minutes ?? 30); broadcast(); return send(res, 200, { report }); }
        return send(res, 404, { error: '찾을 수 없는 주소예요.' });
      }
      if (req.method === 'POST' && url.pathname === BASE + '/api/session') {
        await moderation.ready;
        if (!session) {
          const ip = req.socket.remoteAddress, r = rates.get(ip) || { count: 0, until: now() + 60000 };
          if (r.until < now()) { r.count = 0; r.until = now() + 60000; }
          rates.set(ip, r);
          if (++r.count > 20 || sessions.size >= 100) return send(res, 429, { error: '잠시 후 다시 접속해 주세요.' });
          const sessionToken = token || randomBytes(24).toString('hex');
          session = { id: createHash('sha256').update(sessionToken).digest('hex'), name: `승객 ${randomBytes(2).toString('hex').toUpperCase()}`, trip: null, streams: new Set(), lastSeen: now(), requests: 0, rateAt: now(), saidAt: -Infinity };
          sessions.set(sessionToken, session);
          res.setHeader('Set-Cookie', `subway_session=${sessionToken}; Path=${BASE}/; HttpOnly; SameSite=Strict; Max-Age=2592000${secure ? '; Secure' : ''}`);
        }
        session.lastSeen = now(); return send(res, 200, state(session));
      }
      if (!session) return send(res, 401, { error: '다시 연결해 주세요.' });
      session.lastSeen = now();
      if (now() - session.rateAt >= 1000) { session.requests = 0; session.rateAt = now(); }
      if (++session.requests > 10) return send(res, 429, { error: '잠시 기다려 주세요.' });
      if (req.method === 'GET' && url.pathname === BASE + '/api/trains') {
        const line = url.searchParams.get('line'), station = url.searchParams.get('station');
        if (!LINES.find(l => l.id === line)?.stations.includes(station)) return send(res, 400, { error: '지원하지 않는 역이에요.' });
        const section = url.searchParams.has('path') ? Number(url.searchParams.get('path')) : null;
        if (section !== null && (!Number.isInteger(section) || section < 0 || !LINES.find(l => l.id === line).paths[section]?.includes(station))) return send(res, 400, { error: '운행 구간과 탑승역을 확인해 주세요.' });
        const schedules = provider.demo || !provider.key ? [] : await timetable.states(line, station, section);
        const source = url.searchParams.get('source') || 'arrivals';
        if (!['arrivals', 'running'].includes(source)) return send(res, 400, { error: '열차 조회 방법을 확인해 주세요.' });
        try { return send(res, 200, { ...await availableTrains(line, station, source), schedules }); }
        catch (error) {
          if (schedules.some(s => s.status !== 'unknown')) return send(res, 200, { mode: 'live', trains: [], schedules, arrivalError: error.message });
          return send(res, 503, { error: error.message });
        }
      }
      if (req.method === 'POST' && url.pathname === BASE + '/api/board') {
        const pathStops = route(data.line, data.from, data.to, data.direction), source = data.source || 'arrivals';
        if (!pathStops || !['arrivals', 'running'].includes(source)) return send(res, 400, { error: '탑승역·하차역과 방향을 다시 확인해 주세요.' });
        let result;
        try { result = await availableTrains(data.line, data.from, source); } catch (error) { return send(res, 503, { error: error.message }); }
        const train = result.trains.find(t => t.id === data.train && t.direction === data.direction);
        if (!train) return send(res, 409, { error: '열차 목록이 바뀌었어요. 다시 조회하고 선택해 주세요.' });
        const stops = trainStops(data.line, data.from, data.to, data.direction, train);
        if (!stops) return send(res, 400, { error: '이 열차의 정차역과 종착역으로는 선택한 구간을 이용할 수 없어요.' });
        if (source === 'running' && result.mode !== 'demo' && (!pathStops.includes(train.station) || train.station === data.to && ['arrived', 'departed'].includes(train.status))) return send(res, 400, { error: '열차가 선택한 구간을 벗어났어요. 탑승역과 현재 열차를 다시 확인해 주세요.' });
        const room = `${result.mode}:${serviceDay(now())}:${data.line}:${data.direction}:${train.number}`;
        if (!rooms.has(room)) rooms.set(room, { messages: [], touched: now() });
        session.trip = { room, car: 1, line: data.line, from: data.from, to: data.to, direction: data.direction, train: train.number, destination: train.destination, stops, pathStops, kind: train.kind || '일반', source, autoLeave: false, mode: result.mode, boardedAt: now() };
        session.progress = null; session.ended = null;
        session.seat = null; session.emote = null;
        const slot = parseInt(session.id.slice(0, 4), 16);
        session.walk = { x: (slot % 3 - 1) * .7, z: 3 + slot % 5, toX: (slot % 3 - 1) * .7, toZ: 3 + slot % 5, at: now(), duration: 0 };
        broadcast(); return send(res, 200, state(session));
      }
      if (req.method === 'POST' && url.pathname === BASE + '/api/car') {
        if (!session.trip) return send(res, 409, { error: '먼저 열차에 탑승해 주세요.' });
        if (!Number.isInteger(data.car) || data.car < 1 || data.car > CAR_COUNT) return send(res, 400, { error: '이동할 칸을 확인해 주세요.' });
        if (session.trip.car === data.car) return send(res, 200, state(session));
        if (now() - (session.carAt ?? -Infinity) < 600) return send(res, 429, { error: '칸을 이동하는 중이에요. 잠시 후 다시 선택해 주세요.' });
        const forward = data.car > session.trip.car;
        session.carAt = now(); session.trip.car = data.car; session.seat = null; session.emote = null;
        session.walk = { x: 0, z: forward ? 7 : -7, toX: 0, toZ: forward ? 7 : -7, at: now(), duration: 0 };
        broadcast(); return send(res, 200, state(session));
      }
      if (req.method === 'POST' && url.pathname === BASE + '/api/seat') {
        if (!session.trip) return send(res, 409, { error: '먼저 열차에 탑승해 주세요.' });
        const chair = SEATS.find(seat => seat.id === data.seat);
        if (data.seat !== null && !chair) return send(res, 400, { error: '좌석을 확인해 주세요.' });
        if (now() - (session.seatAt ?? -Infinity) < 300) return send(res, 429, { error: '잠시 후 다시 좌석을 선택해 주세요.' });
        if (chair && [...sessions.values()].some(p => p !== session && p.trip?.room === session.trip.room && p.trip.car === session.trip.car && p.seat === chair.id)) return send(res, 409, { error: '다른 승객이 먼저 앉았어요. 다른 좌석을 골라 주세요.' });
        session.seatAt = now(); session.seat = chair?.id || null;
        const point = chair || { x: 0, z: Math.max(-9, Math.min(9, walkingPosition(session, now()).z)) };
        session.walk = { x: point.x, z: point.z, toX: point.x, toZ: point.z, at: now(), duration: 0 };
        broadcast(); return send(res, 200, state(session));
      }
      if (req.method === 'POST' && url.pathname === BASE + '/api/emote') {
        if (!session.trip) return send(res, 409, { error: '먼저 열차에 탑승해 주세요.' });
        if (!Object.hasOwn(REACTIONS, data.kind)) return send(res, 400, { error: '반응을 확인해 주세요.' });
        if (moderation.mutedUntil(session.id)) return send(res, 403, { error: '운영자 조치로 반응 전송이 제한됐어요.' });
        if (now() - (session.emoteAt ?? -Infinity) < 2500) return send(res, 429, { error: '반응을 잠시 후 다시 보내 주세요.' });
        session.emoteAt = now(); session.emote = { kind: data.kind, until: now() + 4000 };
        broadcast(); return send(res, 200, state(session));
      }
      if (req.method === 'POST' && url.pathname === BASE + '/api/appearance') {
        if (!Number.isInteger(data.coat) || data.coat < 0 || data.coat >= COAT_COLORS.length) return send(res, 400, { error: '옷 색상을 확인해 주세요.' });
        session.coat = data.coat; broadcast(); return send(res, 200, state(session));
      }
      if (req.method === 'POST' && url.pathname === BASE + '/api/move') {
        if (!session.trip) return send(res, 409, { error: '먼저 열차에 탑승해 주세요.' });
        if (data.car !== undefined && data.car !== session.trip.car || data.room !== undefined && data.room !== session.trip.room) return send(res, 409, { error: '객실이 바뀌었어요. 현재 칸에서 다시 이동해 주세요.' });
        if (!Number.isFinite(data.x) || !Number.isFinite(data.z)) return send(res, 400, { error: '이동할 위치를 확인해 주세요.' });
        if (now() - (session.movedAt ?? -Infinity) < 200) return send(res, 429, { error: '이동할 위치를 잠시 후 다시 선택해 주세요.' });
        const position = walkingPosition(session, now()), x = Math.max(-1.15, Math.min(1.15, data.x)), z = Math.max(-9, Math.min(9, data.z));
        if (session.seat) { session.stoodOnMove = true; position.x = Math.sign(position.x) * 1.1; position.z = Math.max(-9, Math.min(9, position.z)); session.seat = null; }
        session.movedAt = now();
        session.walk = createWalk(position, { x, z }, now());
        if (session.stoodOnMove) { session.stoodOnMove = false; broadcast(); } else publishMotion(session);
        return send(res, 200, motion(session));
      }
      if (req.method === 'POST' && url.pathname === BASE + '/api/leave') { endTrip(session, 'manual'); broadcast(); return send(res, 200, state(session)); }
      if (req.method === 'POST' && url.pathname === BASE + '/api/trip-options') {
        if (!session.trip || typeof data.autoLeave !== 'boolean' || session.trip.mode === 'demo' && data.autoLeave) return send(res, 400, { error: '실제 열차에 탑승한 뒤 자동 하차를 설정해 주세요.' });
        session.trip.autoLeave = data.autoLeave; publish(session); return send(res, 200, state(session));
      }
      if (req.method === 'POST' && url.pathname === BASE + '/api/trip-check') {
        const trip = session.trip;
        if (!trip) return send(res, 200, state(session));
        try {
          const records = trip.mode === 'demo' ? [] : await positions.positions(trip.line);
          if (session.trip !== trip) return send(res, 200, state(session));
          const record = records.find(record => record.number === trip.train && record.direction === trip.direction);
          session.progress = tripProgress(trip, record, session.progress, now());
          if (trip.autoLeave && session.progress.autoConfirmed) endTrip(session, 'arrival');
        } catch { if (session.trip === trip) session.progress = { available: false, message: '실시간 위치를 확인할 수 없어요. 하차역에서 직접 하차해 주세요.' }; }
        broadcast(); return send(res, 200, state(session));
      }
      if (req.method === 'POST' && ['/block', '/report'].some(path => url.pathname === BASE + '/api' + path)) {
        const message = rooms.get(session.trip?.room)?.messages.find(message => message.id === data.messageId);
        if (!message || message.sender === session.id) return send(res, 400, { error: '현재 채팅방의 다른 승객 메시지를 선택해 주세요.' });
        let reportId;
        if (url.pathname.endsWith('/report')) reportId = await moderation.report(session.id, session.trip.room, message, data.reason, data.note || '');
        if (url.pathname.endsWith('/block') || data.block === true) await moderation.block(session.id, message);
        publish(session); return send(res, 200, { ...state(session), ...(reportId ? { reportId } : {}) });
      }
      if (req.method === 'POST' && url.pathname === BASE + '/api/unblock') { await moderation.unblock(session.id, data.sender); publish(session); return send(res, 200, state(session)); }
      if (req.method === 'POST' && url.pathname === BASE + '/api/say') {
        const room = rooms.get(session.trip?.room);
        if (!room) return send(res, 409, { error: '먼저 열차를 선택해 주세요.' });
        if (moderation.mutedUntil(session.id)) return send(res, 403, { error: '운영자 조치로 메시지 전송이 일시 제한됐어요.' });
        if (typeof data.text !== 'string' || !data.text.trim() || data.text.trim().length > 300) return send(res, 400, { error: '메시지는 1~300자로 입력해 주세요.' });
        if (data.scope !== undefined && !['train', 'car'].includes(data.scope)) return send(res, 400, { error: '대화 범위를 확인해 주세요.' });
        if (now() - session.saidAt < 1200) return send(res, 429, { error: '메시지를 조금 천천히 보내 주세요.' });
        session.saidAt = now(); room.touched = now();
        room.messages.push({ id: randomUUID(), sender: session.id, name: session.name, text: data.text.trim(), car: session.trip.car || 1, scope: data.scope || 'train', at: now() });
        room.messages = room.messages.slice(-60); broadcast(); return send(res, 200, { ok: true });
      }
      return send(res, 404, { error: '찾을 수 없는 주소예요.' });
    } catch (error) { if (!res.headersSent) send(res, error.status || 400, { error: error.status ? error.message : '요청을 확인해 주세요.' }); else res.end(); }
  });
  let lastModerationCleanup = now();
  const timer = setInterval(() => {
    if (now() - lastModerationCleanup >= 3600000) { lastModerationCleanup = now(); moderation.save().catch(() => console.error('Moderation retention cleanup failed')); }
    for (const [key, s] of sessions) {
      if (s.trip && now() - s.trip.boardedAt > 90 * 60000) endTrip(s, 'timeout');
      if (!s.streams.size && now() - s.lastSeen > 60000) sessions.delete(key);
    }
    const active = new Set([...sessions.values()].map(s => s.trip?.room));
    for (const [key, room] of rooms) { room.messages = room.messages.filter(m => now() - m.at < 3600000); if (!active.has(key) && now() - room.touched > 60000) rooms.delete(key); }
    for (const [ip, r] of rates) if (r.until < now()) rates.delete(ip);
    broadcast();
  }, 15000);
  server.on('close', () => clearInterval(timer));
  return { server, sessions, rooms, moderation };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { server, sessions, moderation } = createSubwayServer();
  await moderation.ready;
  server.listen(Number(process.env.PORT || 3212), process.env.HOST || '127.0.0.1', () => console.log(`메트로챗: http://${process.env.HOST || '127.0.0.1'}:${server.address().port}/metro-chat/`));
  const stop = () => { for (const s of sessions.values()) for (const stream of s.streams) stream.end(); server.close(); server.closeAllConnections(); };
  process.on('SIGTERM', stop); process.on('SIGINT', stop);
}

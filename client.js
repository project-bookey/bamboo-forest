import { LINES, route, trainStops } from './transit.mjs';
import { installFeatures } from './features.js';
import { createCabin } from './cabin.js';
import { installCabinControls } from './cabin-controls.js';
const $ = id => document.getElementById(id);
const BASE = './api/';
let line = LINES.find(l => l.id === '1002'), section = 0, direction = 0, picking = 'from', state = null, stream = null, queryVersion = 0, lastMessages = '', retryTimer;
let busy = false, connecting = false, features, controls;
let announcedMessage = '';
let lastViewKey = '';
function setDrawer(open) {
  document.body.classList.toggle('drawer-open', open);
  $('workspace').hidden = !open;
  $('drawer-toggle').setAttribute('aria-expanded', String(open));
  $('drawer-toggle').textContent = open ? '닫기 · 객실로' : state?.trip ? '대화 기록 · 탑승 정보' : '열차 선택';
}
$('drawer-toggle').onclick = () => setDrawer($('workspace').hidden);
document.addEventListener('keydown', event => { if (event.key === 'Escape' && !document.querySelector('dialog[open]')) { setDrawer(false); $('drawer-toggle').focus(); } });
const cabin = createCabin({ canvas: $('cabin'), changeCar: number => controls?.changeCar(number), sit: seat => controls?.sit(seat), openAd: id => controls?.openAd(id), move: async position => { try { await api('move', position); } catch (error) { alert(error.message); } }, openMessage: id => { setDrawer(true); requestAnimationFrame(() => document.getElementById('message-' + id)?.scrollIntoView({ block: 'center' })); }, onError: message => { $('scene-error').textContent = message; $('scene-error').hidden = false; setDrawer(true); } });
const node = (tag, text, className) => { const el = document.createElement(tag); if (text != null) el.textContent = text; if (className) el.className = className; return el; };
let alertTimer;
function alert(message) { $('alert').textContent = message; $('alert').hidden = false; clearTimeout(alertTimer); alertTimer = setTimeout(() => $('alert').hidden = true, 5000); }
async function api(path, data) {
  const response = await fetch(BASE + path, data === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  const result = await response.json(); if (!response.ok) { const error = Error(result.error || '다시 시도해 주세요.'); error.status = response.status; throw error; } return result;
}
function invalidate() { queryVersion++; $('trains').replaceChildren(); $('train-status').hidden = true; $('service-hours').hidden = true; }
function setPicking(value) { picking = value; ['from', 'to'].forEach(key => $('pick-' + key).setAttribute('aria-pressed', String(key === picking))); $('map-hint').textContent = `노선도에서 ${picking === 'from' ? '탑승역' : '하차역'}을 눌러 주세요`; }
function selectStation(station) { if (state?.trip) return; $(picking).value = station; if (picking === 'from') setPicking('to'); invalidate(); renderRoute(); }
function renderRoute() {
  const stops = route(line.id, $('from').value, $('to').value, direction);
  $('find').disabled = !stops || busy || !state;
  $('route-summary').textContent = stops ? `${line.directions[direction]} · ${stops.length - 1}개 역 이동` : $('from').value === $('to').value && $('from').value ? '서로 다른 역을 선택해 주세요.' : '두 역과 이동 방향을 선택해 주세요.';
  renderMap(stops || []);
}
function visibleStations() { return [...new Set(line.paths[section])]; }
function renderMap(stops) {
  const svg = $('map'); svg.replaceChildren();
  const ns = 'http://www.w3.org/2000/svg', stations = visibleStations(), circular = line.loop && section === 0;
  const height = circular ? 720 : 130 * Math.ceil(stations.length / 10) + 100;
  svg.setAttribute('viewBox', `0 0 1100 ${height}`); svg.style.height = `${Math.round(height * .82)}px`;
  const make = (tag, attrs) => { const el = document.createElementNS(ns, tag); for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value); return el; };
  const points = stations.map((name, i) => {
    if (circular) {
      if (i < 12) return { x: 105 + i * 78, y: 100, anchor: 'middle', dx: 0, dy: i % 2 ? 32 : -22 };
      if (i < 21) return { x: 963, y: 145 + (i - 12) * 50, anchor: 'start', dx: 18, dy: 5 };
      if (i < 33) return { x: 963 - (i - 21) * 78, y: 595, anchor: 'middle', dx: 0, dy: i % 2 ? 32 : -22 };
      return { x: 105, y: 550 - (i - 33) * 45, anchor: 'end', dx: -18, dy: 5 };
    }
    const row = Math.floor(i / 10), col = i % 10;
    return { x: 110 + (row % 2 ? 9 - col : col) * 97, y: 90 + row * 130, anchor: 'middle', dx: 0, dy: i % 2 ? 34 : -24 };
  });
  const pathPoints = line.paths[section].map(name => points[stations.indexOf(name)]);
  const d = pathPoints.map((p, i) => `${i ? 'L' : 'M'}${p.x},${p.y}`).join(' ') + (circular ? ' Z' : '');
  svg.append(make('path', { d, stroke: line.color, 'stroke-width': 8, fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', opacity: .35 }));
  if (circular) {
    const title = make('text', { x: 540, y: 325, 'text-anchor': 'middle', fill: line.color, 'font-size': 36, 'font-weight': 800 }); title.textContent = '2'; svg.append(title);
    const caption = make('text', { x: 540, y: 365, 'text-anchor': 'middle', fill: '#667789', 'font-size': 16 }); caption.textContent = '서울을 잇는 둥근 대화'; svg.append(caption);
    const hint = make('text', { x: 540, y: 398, 'text-anchor': 'middle', fill: '#667789', 'font-size': 13 }); hint.textContent = '내선: 시청 → 을지로입구 · 외선: 반대 방향'; svg.append(hint);
  }
  stations.forEach((name, i) => {
    const p = points[i], chosen = name === $('from').value || name === $('to').value;
    const group = make('g', { class: `station${stops.includes(name) ? ' in-route' : ''}${chosen ? ' chosen' : ''}`, tabindex: state?.trip ? -1 : 0, role: 'button', 'aria-label': `${name}역 ${picking === 'from' ? '탑승역' : '하차역'}으로 선택`, 'aria-pressed': String(chosen) });
    group.append(make('circle', { cx: p.x, cy: p.y, r: 22, style: 'fill:transparent;stroke:none' }));
    group.append(make('circle', { cx: p.x, cy: p.y, r: chosen ? 11 : 7 }));
    const text = make('text', { x: p.x + p.dx, y: p.y + p.dy, 'text-anchor': p.anchor }); text.textContent = name; group.append(text);
    group.addEventListener('click', () => selectStation(name)); group.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectStation(name); } }); svg.append(group);
  });
  if (state?.trip?.line === line.id && state.progress?.available) {
    const index = stations.indexOf(state.progress.station), p = points[index];
    if (p) { const group = make('g', { class: 'train-position', 'aria-label': `선택한 열차: ${state.progress.station}` }); group.append(make('circle', { cx: p.x, cy: p.y, r: 17 })); const text = make('text', { x: p.x, y: p.y + 5 }); text.textContent = '열차'; group.append(text); svg.append(group); }
  }
}
function setLine(next, nextSection = 0) {
  line = next; section = nextSection; direction = next.loop && !section ? 0 : 1;
  invalidate(); document.documentElement.style.setProperty('--line', line.color);
  cabin.setLine(line.color);
  $('line-name').textContent = line.name + (line.loop && !section ? ' 본선' : '');
  const picker = node('select'); picker.id = 'line-selector'; picker.setAttribute('aria-label', '노선 선택'); picker.disabled = !!state?.trip;
  picker.replaceChildren(...LINES.map(l => new Option(l.name, l.id, false, l.id === line.id)));
  picker.onchange = () => setLine(LINES.find(l => l.id === picker.value));
  $('lines').replaceChildren(picker);
  const paths = node('select'); paths.id = 'path-selector'; paths.setAttribute('aria-label', '운행 구간 선택'); paths.disabled = !!state?.trip;
  paths.replaceChildren(...line.paths.map((path, i) => new Option(line.loop && !i ? '본선 순환' : `${path[0]} ↔ ${path.at(-1)}`, String(i), false, i === section)));
  paths.onchange = () => setLine(line, Number(paths.value));
  paths.hidden = line.paths.length === 1; $('lines').append(paths);
  const stations = visibleStations();
  for (const key of ['from', 'to']) $(key).replaceChildren(new Option('역 선택', ''), ...stations.map(name => new Option(name, name)));
  $('network-note').textContent = line.id === '1006' ? '응암 순환 구간은 한 방향으로 운행해요.' : line.id === '1032' ? '현재 운행하는 구간을 먼저 골라 주세요.' : line.paths.length > 1 ? '타고 있는 열차의 운행 구간을 먼저 골라 주세요.' : '탑승역·하차역과 열차를 선택해 주세요.';
  renderDirections(); setPicking('from'); renderRoute();
}
function renderDirections() {
  const path = line.paths[section];
  const names = line.loop && !section || line.id === '1006' ? line.directions : [`${path[0]} 방면`, `${path.at(-1)} 방면`];
  $('directions').replaceChildren(...names.map((name, i) => { const button = node('button', name); button.setAttribute('aria-pressed', String(direction === i)); button.onclick = () => { direction = i; invalidate(); renderDirections(); renderRoute(); }; return button; }));
}
async function findTrains(quiet = false) {
  if (!route(line.id, $('from').value, $('to').value, direction) || state?.trip || busy) return;
  const version = ++queryVersion, source = $('train-source').value;
  busy = true; renderRoute(); $('find').textContent = '열차 확인 중…';
  try {
    const result = await api(`trains?line=${line.id}&station=${encodeURIComponent($('from').value)}&path=${section}&source=${source}`);
    if (version !== queryVersion) return;
    $('trains').replaceChildren();
    const status = $('train-status'); status.hidden = false; status.className = result.mode === 'demo' ? 'notice demo' : 'notice';
    const trains = result.trains.filter(t => t.direction === direction);
    const schedule = result.schedules?.find(s => s.direction === direction);
    const clock = value => new Date(value).toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
    const nextFirst = schedule?.nextFirstAt ? `${new Date(schedule.nextFirstAt).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric' })} ${clock(schedule.nextFirstAt)}` : '';
    const hours = $('service-hours'); hours.hidden = result.mode !== 'live'; hours.replaceChildren();
    if (result.mode === 'live') {
      if (schedule && schedule.status !== 'unknown') {
        const type = { 1: '평일', 2: '토요일', 3: '휴일' }[schedule.dayType];
        const nextDay = new Date(Date.parse(schedule.lastAt) + 9 * 3600000).toISOString().slice(0, 10) !== schedule.serviceDate ? '다음날 ' : '';
        hours.append(document.createTextNode(`${schedule.serviceDate} ${type} 시간표 · 첫차 ${clock(schedule.firstAt)} · 막차 ${nextDay}${clock(schedule.lastAt)} (${schedule.lastDestination}행). `));
        if (schedule.status === 'after_last') hours.append(document.createTextNode(`다음 첫차 ${nextFirst}. `));
        hours.append(document.createTextNode('지연·임시 운행에 따라 달라질 수 있어요. '));
        const source = node('a', '시간표 출처'); source.href = schedule.source; source.target = '_blank'; source.rel = 'noreferrer'; hours.append(source);
      } else hours.textContent = '첫차·막차 시간표를 확인할 수 없어 운행 종료 여부를 안내하기 어려워요.';
    }
    status.textContent = result.message || (result.mode === 'demo' ? '체험 모드 · 가상 열차예요. 다른 브라우저에서도 같은 열차를 고르면 실제로 대화할 수 있어요.' : trains.length ? `서울시 열차 정보 · ${new Date(result.fetchedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })} 조회. 실제 탑승한 열차를 선택해 주세요.` : '현재 이 방향의 열차 정보가 없어요. 잠시 후 다시 조회해 주세요.');
    if (result.mode === 'live' && !trains.length) {
      if (schedule?.status === 'after_last') status.textContent = `시간표상 막차가 지나 현재 이 방향의 열차가 없어요. 다음 첫차는 ${nextFirst}예요.${result.arrivalError ? ' 실시간 정보는 현재 확인할 수 없어요.' : ''}`;
      else if (result.arrivalError) status.textContent = result.arrivalError;
    }
    for (const train of trains) {
      const stops = trainStops(line.id, $('from').value, $('to').value, direction, train);
      const path = route(line.id, $('from').value, $('to').value, direction);
      const inSection = source !== 'running' || result.mode === 'demo' || path.includes(train.station) && !(train.station === $('to').value && ['arrived', 'departed'].includes(train.status));
      const button = node('button', null, 'train'); button.disabled = !stops || !inSection;
      button.append(node('strong', `${train.destination}행 · ${train.kind || (train.express ? '급행' : '일반')}`), node('small', `열차 ${train.number} · ${train.message}`));
      if (train.detail) button.append(node('small', train.detail));
      if (!stops) button.append(node('small', '정차역·종착역이 맞지 않거나 정차역 정보를 확인할 수 없는 열차예요.'));
      if (!inSection) button.append(node('small', '선택한 탑승역~하차역 구간 밖에 있는 열차예요.'));
      button.onclick = async () => {
        button.disabled = true;
        try { const next = await api('board', { line: line.id, from: $('from').value, to: $('to').value, direction, train: train.id, source }); applyState(next); }
        catch (e) { alert(e.message); button.disabled = false; }
      }; $('trains').append(button);
    }
  } catch (e) { if (version === queryVersion) { $('trains').replaceChildren(); $('train-status').hidden = false; $('train-status').textContent = e.message; if (!quiet) alert(e.message); } }
  finally { busy = false; $('find').textContent = '탑승할 열차 찾기'; renderRoute(); }
}
function applyState(next) {
  const previousTrip = state?.trip; state = next;
  const viewKey = JSON.stringify([next.id, next.trip, next.progress, next.ended, next.blocked, next.mutedUntil, next.count, next.cars, next.messages]);
  if (viewKey === lastViewKey) { cabin.update(state); controls?.update(state); return; }
  lastViewKey = viewKey;
  $('spatial-composer').hidden = !state.trip;
  $('cabin-welcome').hidden = !!state.trip;
  $('cabin-trip').hidden = !state.trip;
  $('planner').hidden = !!state.trip; $('planner-note').hidden = !!state.trip; $('chat').hidden = !state.trip;
  if (state.trip) {
    const trip = state.trip, selected = LINES.find(l => l.id === trip.line);
    if (line.id !== selected.id || !previousTrip) { setLine(selected, Math.max(0, selected.paths.findIndex(path => path.includes(trip.from) && path.includes(trip.to)))); $('from').value = trip.from; $('to').value = trip.to; direction = trip.direction; renderDirections(); renderRoute(); }
    $('room-title').textContent = `${selected.name} · ${trip.kind || '일반'} · 열차 ${trip.train}`;
    $('room-subtitle').textContent = `${trip.destination}행 · 함께 연결된 승객 ${state.count}명`;
    $('trip-from').textContent = trip.from; $('trip-to').textContent = trip.to; $('room-demo').hidden = trip.mode !== 'demo';
    $('cabin-line').textContent = `${selected.name} · ${trip.kind || '일반'} · ${trip.mode === 'demo' ? '체험 열차 ' : '열차 '}${trip.train}`;
    $('cabin-destination').textContent = `${trip.destination}행`;
    $('cabin-count').textContent = `열차 ${state.count}명 · ${trip.car || 1}칸 ${state.cars?.[(trip.car || 1) - 1]?.count || 0}명`;
    $('cabin-route').textContent = `${trip.from} → ${trip.to}`;
    if (!previousTrip || previousTrip.room !== trip.room) setDrawer(!$('scene-error').hidden);
    const key = JSON.stringify(state.messages);
    if (key !== lastMessages) {
      const list = $('messages'), nearBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 70; lastMessages = key;
      list.replaceChildren();
      if (!state.messages.length) list.append(node('p', '아직 오간 이야기가 없어요.\n같은 열차의 승객에게 인사를 건네 보세요.', 'empty'));
      for (const message of state.messages) {
        const el = node('div', null, `message${message.sender === state.id ? ' mine' : ''}`);
        el.id = 'message-' + message.id;
        el.append(node('small', `${message.name} · ${message.car || 1}칸${message.scope === 'car' ? ' 안에서' : ' · 열차 전체'} · ${new Date(message.at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}`), node('p', message.text, 'bubble'));
        if (message.sender !== state.id) { const actions = node('div', null, 'message-actions'), report = node('button', '신고'), block = node('button', '차단'); report.type = block.type = 'button'; report.onclick = () => features.report(message); block.onclick = () => features.block(message); actions.append(report, block); el.append(actions); }
        list.append(el);
      }
      if (nearBottom || !previousTrip) list.scrollTop = list.scrollHeight;
    }
  } else if (previousTrip) { lastMessages = ''; setLine(line); alert(state.ended?.reason === 'arrival' ? `${previousTrip.to}역 도착 정보가 확인되어 자동 하차했어요.` : state.ended?.reason === 'timeout' ? '탑승 후 90분이 지나 채팅을 종료했어요.' : '하차했어요. 다음 열차에서 다시 만나요.'); }
  else renderRoute();
  if (state.trip) renderMap(state.trip.pathStops || state.trip.stops);
  features?.update(state, previousTrip);
  $('cabin-progress').textContent = state.trip ? $('trip-progress').textContent : '';
  if (!state.trip) {
    $('cabin-line').textContent = '메트로챗'; $('cabin-destination').textContent = '역과 역 사이'; $('cabin-count').textContent = '같은 열차에서 만나요';
    if (previousTrip) setDrawer(true);
  }
  cabin.update(state);
  controls?.update(state);
  const latest = state.messages.at(-1);
  if (latest && latest.id !== announcedMessage) { announcedMessage = latest.id; $('spatial-announcement').textContent = `${latest.name}: ${latest.text}`; }
}
async function connect() {
  if (connecting) return; connecting = true;
  try {
    applyState(await api('session', {})); stream?.close(); stream = new EventSource(BASE + 'events');
    stream.onopen = () => { $('connection').textContent = '● 연결됨'; $('send').disabled = !!state?.mutedUntil; };
    stream.addEventListener('state', e => applyState(JSON.parse(e.data)));
    stream.onerror = () => { $('connection').textContent = '재연결 중'; $('send').disabled = true; stream.close(); clearTimeout(retryTimer); retryTimer = setTimeout(connect, 3000); };
  } catch (e) { $('connection').textContent = '연결을 기다리는 중'; alert(e.message); retryTimer = setTimeout(connect, 5000); }
  finally { connecting = false; }
}
$('pick-from').onclick = () => { setPicking('from'); renderRoute(); }; $('pick-to').onclick = () => { setPicking('to'); renderRoute(); };
for (const key of ['from', 'to']) $(key).onchange = () => { invalidate(); if (key === 'from') setPicking('to'); renderRoute(); };
$('find').onclick = () => findTrains();
$('train-source').onchange = () => { invalidate(); renderRoute(); };
$('leave').onclick = async () => { try { applyState(await api('leave', {})); } catch (e) { alert(e.message); } };
$('composer').onsubmit = async e => { e.preventDefault(); const text = $('message').value.trim(); if (!text) return; $('send').disabled = true; try { await api('say', { text, scope: $('message-scope').value }); if ($('message').value.trim() === text) $('message').value = ''; } catch (e) { alert(e.message); } finally { $('send').disabled = !!state?.mutedUntil; } };
features = installFeatures({ api, node, alert, getState: () => state, applyState, selectLeg: leg => { setLine(LINES.find(l => l.id === leg.line), leg.section); $('from').value = leg.from; $('to').value = leg.to; direction = leg.direction; $('train-source').value = 'arrivals'; renderDirections(); renderRoute(); } });
controls = installCabinControls({ api, applyState, getState: () => state, cabin, alert });
setLine(line); connect();
setInterval(() => { if (!$('train-status').hidden && !state?.trip && !document.hidden) findTrains(true); }, 25000);

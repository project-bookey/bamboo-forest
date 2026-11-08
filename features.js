import { LINES, route } from './transit.mjs';
import { planJourney } from './journey.mjs';

export function installFeatures({ api, node, alert, getState, applyState, selectLeg }) {
  const $ = id => document.getElementById(id);
  const read = key => { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } };
  const save = (key, value) => { try { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, JSON.stringify(value)); } catch { /* The app also works without local storage. */ } };
  let journey = read('metro-journey'), journeyIndex = 0, checking = false, lastTrip = '', reportMessage, lastBlocks = '', notifications = read('metro-notifications') === true;
  const notified = new Set();
  if (!journey || Date.now() - journey.at > 86400000 || !Array.isArray(journey.legs) || !journey.legs.length || journey.legs.length > 20 || journey.legs.some(leg => !Number.isInteger(leg.section) || !LINES.find(l => l.id === leg.line)?.paths[leg.section]?.includes(leg.from) || !route(leg.line, leg.from, leg.to, leg.direction))) journey = null;
  else journeyIndex = Math.min(Math.max(0, journey.index || 0), journey.legs.length);

  for (const id of ['journey-from', 'journey-to']) {
    const select = $(id); select.replaceChildren();
    for (const line of LINES) { const group = node('optgroup'); group.label = line.name; group.append(...line.stations.map(station => new Option(station, `${line.id}|${station}`))); select.append(group); }
  }
  $('journey-from').value = '1002|강남'; $('journey-to').value = '1009|여의도';
  function renderJourney() {
    $('journey-result').hidden = !journey; $('journey-legs').replaceChildren();
    if (!journey) return;
    $('journey-summary').textContent = `최소 환승 ${journey.transfers}회 · ${journey.stationCount}개 역 이동${journeyIndex >= journey.legs.length ? ' · 이동 구간 완료' : ''}`;
    journey.legs.forEach((leg, index) => {
      const line = LINES.find(l => l.id === leg.line), item = node('li', null, index < journeyIndex ? 'leg done' : index === journeyIndex ? 'leg current' : 'leg');
      item.style.borderColor = line.color;
      item.append(node('strong', `${line.name} · ${leg.from} → ${leg.to}`), node('small', `${leg.stops.length - 1}개 역${index < journey.legs.length - 1 ? ' · 하차 후 다음 열차로 환승' : ' · 목적지'}`));
      const button = node('button', index < journeyIndex ? '이 구간 다시 선택' : '이 구간 열차 선택', 'secondary');
      button.type = 'button'; button.disabled = !!getState()?.trip;
      button.onclick = () => { if (getState()?.trip) return alert('현재 열차에서 먼저 하차해 주세요.'); journeyIndex = index; journey.index = index; save('metro-journey', journey); selectLeg(leg); renderJourney(); $('find').scrollIntoView({ block: 'center', behavior: 'instant' }); };
      item.append(button); $('journey-legs').append(item);
    });
  }
  $('journey-form').onsubmit = event => {
    event.preventDefault();
    const [fromLine, from] = $('journey-from').value.split('|'), [toLine, to] = $('journey-to').value.split('|');
    const result = planJourney(fromLine, from, toLine, to);
    if (!result) return alert('지원 노선 안에서 연결되는 경로를 찾지 못했어요. 출발역과 도착역을 확인해 주세요.');
    if (result.sameStation) return alert('같은 역이에요. 필요한 노선의 승강장으로 이동해 주세요.');
    journey = { ...result, at: Date.now(), index: 0 }; journeyIndex = 0; save('metro-journey', journey); renderJourney();
  };
  $('journey-clear').onclick = () => { journey = null; save('metro-journey', null); renderJourney(); };
  renderJourney();

  function notify(key, message, toast = true) {
    if (notified.has(key)) return; notified.add(key);
    if (toast) alert(message);
    if (notifications && typeof Notification !== 'undefined' && Notification.permission === 'granted') { try { new Notification('메트로챗 하차 알림', { body: message, tag: key }); } catch { /* In-app notice stays available. */ } }
  }
  function renderNotificationButton() {
    $('notifications').textContent = notifications ? '브라우저 알림 끄기' : '브라우저 알림 켜기';
    $('notifications').disabled = typeof Notification === 'undefined';
  }
  $('notifications').onclick = async () => {
    if (notifications) { notifications = false; save('metro-notifications', false); return renderNotificationButton(); }
    try { const permission = await Notification.requestPermission(); notifications = permission === 'granted'; save('metro-notifications', notifications); renderNotificationButton(); if (!notifications) alert('브라우저 알림이 허용되지 않았어요. 화면 안의 하차 안내는 계속 표시돼요.'); } catch { alert('이 브라우저에서는 알림을 켤 수 없어요. 화면 안의 안내를 확인해 주세요.'); }
  };
  renderNotificationButton();
  async function checkTrip() {
    if (!getState()?.trip || checking) return;
    checking = true;
    try { applyState(await api('trip-check', {})); } catch (error) { $('trip-progress').textContent = error.message; } finally { checking = false; }
  }
  $('check-trip').onclick = checkTrip;
  $('auto-leave').onchange = async () => { try { applyState(await api('trip-options', { autoLeave: $('auto-leave').checked })); } catch (error) { $('auto-leave').checked = !!getState()?.trip?.autoLeave; alert(error.message); } };
  setInterval(checkTrip, 20000);

  async function block(message) {
    try { applyState(await api('block', { messageId: message.id })); alert('이 승객의 메시지를 숨겼어요. 차단 관리에서 해제할 수 있어요.'); } catch (error) { alert(error.message); }
  }
  function report(message) {
    reportMessage = message;
    $('report-target').textContent = `${message.name}: ${message.text.slice(0, 100)}`;
    $('report-form').reset(); $('report-error').textContent = ''; $('report-dialog').showModal();
  }
  $('report-cancel').onclick = () => $('report-dialog').close();
  $('report-form').onsubmit = async event => {
    event.preventDefault(); if (!reportMessage) return;
    $('report-submit').disabled = true; $('report-error').textContent = '';
    try {
      applyState(await api('report', { messageId: reportMessage.id, reason: $('report-reason').value, note: $('report-note').value, block: $('report-block').checked }));
      $('report-dialog').close(); alert('신고를 접수했어요. 운영자가 내용을 확인할 수 있도록 보관됩니다.');
    } catch (error) { $('report-error').textContent = error.message; } finally { $('report-submit').disabled = false; }
  };
  function update(state, previousTrip) {
    const trip = state.trip;
    $('train-source').disabled = !!trip;
    $('auto-leave').checked = !!trip?.autoLeave; $('auto-leave').disabled = !trip || trip.mode === 'demo';
    $('trip-progress').textContent = trip?.mode === 'demo' ? '체험 열차에서는 실제 위치·자동 하차를 사용하지 않아요.' : state.progress?.message || '열차 위치를 확인하는 중이에요. 하차역에서는 안내방송도 함께 확인해 주세요.';
    const muted = !!state.mutedUntil;
    $('moderation-notice').hidden = !muted;
    if (muted) $('moderation-notice').textContent = `${new Date(state.mutedUntil).toLocaleTimeString('ko-KR')}까지 메시지 전송이 제한됐어요.`;
    $('message').disabled = muted; $('send').disabled = muted;
    const blocks = JSON.stringify(state.blocked || []);
    if (blocks !== lastBlocks) {
      lastBlocks = blocks; $('block-list').replaceChildren(); $('block-count').textContent = String(state.blocked?.length || 0);
      if (!state.blocked?.length) $('block-list').append(node('p', '차단한 승객이 없어요.', 'helper'));
      for (const person of state.blocked || []) { const row = node('div', null, 'blocked-person'), button = node('button', '차단 해제', 'secondary'); button.type = 'button'; row.append(node('span', person.name), button); button.onclick = async () => { try { applyState(await api('unblock', { sender: person.id })); } catch (error) { alert(error.message); } }; $('block-list').append(row); }
    }
    if (trip) {
      const key = `${trip.room}:${trip.boardedAt}`;
      if (key !== lastTrip) { lastTrip = key; setTimeout(checkTrip, 0); }
      if (state.progress?.available && (state.progress.near || state.progress.arrived)) notify(`${key}:${state.progress.arrived ? 'arrived' : 'near'}`, state.progress.message);
    } else {
      if (previousTrip && state.ended?.reason === 'arrival') notify(`${lastTrip}:auto`, `${previousTrip.to}역 도착 정보가 확인되어 자동 하차했어요.`, false);
      lastTrip = '';
      if (previousTrip && journey && state.ended?.reason !== 'timeout') {
        const leg = journey.legs[journeyIndex];
        if (leg && leg.line === previousTrip.line && leg.from === previousTrip.from && leg.to === previousTrip.to) { journeyIndex++; journey.index = journeyIndex; save('metro-journey', journey); }
      }
    }
    renderJourney();
  }
  return { update, report, block };
}

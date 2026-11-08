import { LINES } from './lines.mjs';
export { LINES };
export function route(lineId, from, to, direction) {
  const line = LINES.find(l => l.id === lineId);
  if (!line || ![0, 1].includes(direction) || from === to || !line.stations.includes(from) || !line.stations.includes(to)) return null;
  if (line.directedPaths) {
    const path = line.directedPaths[direction];
    const start = direction === 1 ? path.lastIndexOf(from) : path.indexOf(from), end = path.indexOf(to, start + 1);
    return start >= 0 && end > start ? path.slice(start, end + 1) : null;
  }
  const edges = new Map(line.stations.map(station => [station, new Set()]));
  const add = path => { for (let i = 1; i < path.length; i++) edges.get(path[i - 1]).add(path[i]); };
  for (const path of line.paths) {
    if (line.loopPath && path === line.paths[0]) {
      const closed = [...path, path[0]]; add(direction === 0 ? closed : closed.reverse());
    } else add(direction === 1 ? path : [...path].reverse());
  }
  const queue = [[from]], visited = new Set([from]);
  for (let i = 0; i < queue.length; i++) {
    const stops = queue[i];
    for (const next of edges.get(stops.at(-1))) {
      if (visited.has(next)) continue;
      const result = [...stops, next]; if (next === to) return result;
      visited.add(next); queue.push(result);
    }
  }
  return null;
}
export function stationName(value) {
  const name = String(value || '').replace(/\([^)]*\)/g, '').replace(/\s/g, '').replace(/역$/, '');
  return ({ 당고개: '불암산', 지제: '평택지제', 응암순환: '응암', 이수: '총신대입구' })[name] || name;
}
export function reachesDestination(lineId, from, to, direction, destination) {
  const line = LINES.find(l => l.id === lineId);
  if (!line || !route(lineId, from, to, direction)) return false;
  if (lineId === '1002' && stationName(destination) === '순환') return line.loopPath.includes(from) && line.loopPath.includes(to);
  if (lineId === '1006' && String(destination).includes('순환')) {
    const index = line.circuit.indexOf(from);
    const stops = index >= 0 ? line.circuit.slice(index) : [...(route(lineId, from, '응암', direction) || []), ...line.circuit.slice(1)];
    return stops.includes(to);
  }
  const end = line.stations.find(station => stationName(station) === stationName(destination));
  return !!end && !!route(lineId, from, end, direction)?.includes(to);
}
// Operator up/down labels differ. Prefer an unambiguous physical destination.
export function travelDirection(lineId, station, destination, fallback) {
  const line = LINES.find(l => l.id === lineId);
  if (!line || line.loop || line.directedPaths) return fallback;
  const end = line.stations.find(s => stationName(s) === stationName(destination));
  if (!end) return fallback;
  const possible = [0, 1].filter(direction => route(lineId, station, end, direction));
  if (possible.length === 1) return possible[0];
  if (line.paths.every(path => path[0] === end)) return 0;
  if (line.paths.some(path => path.at(-1) === end)) return 1;
  return fallback;
}
export function trainStops(lineId, from, to, direction, train) {
  if (!reachesDestination(lineId, from, to, direction, train.destination)) return null;
  const stops = route(lineId, from, to, direction);
  if (!train.express) return stops;
  // Verified against the operator's 16-stop express diagram, 2026-11-08.
  if (lineId !== '1009' || train.kind !== '급행') return null;
  const express = '김포공항 마곡나루 가양 염창 당산 여의도 노량진 동작 고속터미널 신논현 선정릉 봉은사 종합운동장 석촌 올림픽공원 중앙보훈병원'.split(' ');
  if (!express.includes(from) || !express.includes(to)) return null;
  return stops.filter(station => express.includes(station));
}
export const trainNumber = n => String(n ?? '').trim().toUpperCase().replace(/^0+(?=\d)/, '');
export function serviceDay(now = Date.now()) {
  // A service day runs from 03:00 until 02:59 Korean time.
  return new Date(now + 6 * 3600000).toISOString().slice(0, 10);
}
export class TransitProvider {
  constructor({ key = process.env.SEOUL_SUBWAY_API_KEY, demo = process.env.SUBWAY_DEMO === '1', fetcher = fetch, now = Date.now } = {}) {
    this.key = key; this.demo = demo; this.fetcher = fetcher; this.now = now; this.cache = new Map(); this.pending = new Map();
  }
  async arrivals(lineId, station) {
    const line = LINES.find(l => l.id === lineId);
    if (!line?.stations.includes(station)) throw Error('지원하지 않는 역이에요.');
    if (!this.key && !this.demo) return { mode: 'unconfigured', trains: [], message: '실시간 열차 연결을 준비 중이에요. 서버에 서울시 지하철 API 키를 설정해 주세요.' };
    const key = `${lineId}:${station}`, cached = this.cache.get(key);
    if (cached && this.now() - cached.at < 20000) return cached.value;
    if (this.pending.has(key)) return this.pending.get(key);
    const task = this.load(line, station).then(value => { this.cache.set(key, { at: this.now(), value }); return value; }).finally(() => this.pending.delete(key));
    this.pending.set(key, task); return task;
  }
  async load(line, station) {
    if (this.demo) {
      const trains = [];
      line.paths.forEach((path, index) => {
        if (!path.includes(station)) return;
        for (const direction of [0, 1]) {
          const id = index ? `demo-${index}-${direction}` : `demo-${direction}`;
          const destination = line.id === '1006' && direction === 0 ? '응암순환' : line.loop && !index ? '순환' : path[direction ? path.length - 1 : 0];
          trains.push({ id, number: id, direction, destination, message: '체험용 열차 · 실제 운행 정보 아님', seconds: null, updatedAt: new Date(this.now()).toISOString(), kind: '일반', express: false });
        }
      });
      return { mode: 'demo', fetchedAt: this.now(), trains };
    }
    const url = `http://swopenapi.seoul.go.kr/api/subway/${encodeURIComponent(this.key)}/json/realtimeStationArrival/0/100/${encodeURIComponent(line.queries?.[station] || station)}`;
    let data;
    try {
      const response = await this.fetcher(url, { signal: AbortSignal.timeout(8000) });
      if (!response.ok) throw Error();
      data = await response.json();
    } catch { throw Error('열차 정보를 가져오지 못했어요. 잠시 후 다시 조회해 주세요.'); }
    const code = data.errorMessage?.code ?? data.RESULT?.CODE ?? data.code;
    if (code && !['INFO-000', 'INFO-200'].includes(code)) throw Error('서울시 열차 API를 사용할 수 없어요. 인증키와 호출 한도를 확인해 주세요.');
    if (!Array.isArray(data.realtimeArrivalList) && code !== 'INFO-200') throw Error('열차 API 응답 형식을 확인해 주세요.');
    const seen = new Set(), trains = [];
    for (const row of data.realtimeArrivalList || []) {
      if (String(row.subwayId) !== line.id) continue;
      const rawDirection = ['상행', '내선'].includes(row.updnLine) ? 0 : ['하행', '외선'].includes(row.updnLine) ? 1 : -1;
      const direction = travelDirection(line.id, station, row.bstatnNm, rawDirection);
      const number = trainNumber(row.btrainNo);
      if (direction < 0 || !/^[A-Z0-9]{1,16}$/.test(number) || seen.has(`${direction}:${number}`)) continue;
      const generated = Date.parse(String(row.recptnDt).replace(' ', 'T') + (/[Z+]|-\d\d:\d\d$/.test(String(row.recptnDt).slice(10)) ? '' : '+09:00'));
      if (!Number.isFinite(generated) || this.now() - generated > 180000 || generated - this.now() > 60000) continue;
      seen.add(`${direction}:${number}`);
      trains.push({ id: number, number, direction, destination: String(row.bstatnNm || ''), message: String(row.arvlMsg2 || ''), detail: String(row.arvlMsg3 || ''), seconds: Math.max(0, (Number(row.barvlDt) || 0) - Math.floor((this.now() - generated) / 1000)), updatedAt: row.recptnDt, kind: String(row.btrainSttus || '일반'), express: ['급행', '특급', 'ITX', '직통'].some(kind => String(row.btrainSttus).includes(kind)) });
    }
    return { mode: 'live', fetchedAt: this.now(), trains };
  }
}

import { LINES, stationName, trainNumber, travelDirection } from './transit.mjs';

export function positionTime(row) {
  const value = String(row.recptnDt || '');
  if (/^\d{4}-\d{2}-\d{2}[ T]/.test(value)) return Date.parse(value.replace(' ', 'T') + (/[Z+]|-\d\d:\d\d$/.test(value.slice(10)) ? '' : '+09:00'));
  const day = String(row.lastRecptnDt || '').replace(/-/g, '').slice(0, 8);
  if (!/^\d{8}$/.test(day) || !/^\d\d:\d\d:\d\d$/.test(value)) return NaN;
  return Date.parse(`${day.slice(0, 4)}-${day.slice(4, 6)}-${day.slice(6)}T${value}+09:00`);
}
export class PositionProvider {
  constructor({ key = process.env.SEOUL_SUBWAY_API_KEY, demo = false, now = Date.now, fetcher = fetch } = {}) {
    this.key = key; this.demo = demo; this.now = now; this.fetcher = fetcher; this.cache = new Map(); this.pending = new Map();
  }
  async positions(lineId) {
    const line = LINES.find(l => l.id === lineId);
    if (!line) throw Error('지원하지 않는 노선이에요.');
    if (this.demo || !this.key) return [];
    const cached = this.cache.get(lineId);
    if (cached && this.now() - cached.at < 20000) return cached.value;
    if (this.pending.has(lineId)) return this.pending.get(lineId);
    const task = this.load(line).then(value => { this.cache.set(lineId, { at: this.now(), value }); return value; }).finally(() => this.pending.delete(lineId));
    this.pending.set(lineId, task); return task;
  }
  async load(line) {
    let data;
    try {
      const response = await this.fetcher(`http://swopenapi.seoul.go.kr/api/subway/${encodeURIComponent(this.key)}/json/realtimePosition/0/1000/${encodeURIComponent(line.name)}`, { signal: AbortSignal.timeout(8000) });
      if (!response.ok) throw Error(); data = await response.json();
    } catch { throw Error('실시간 위치를 확인할 수 없어요. 하차역에서 직접 하차해 주세요.'); }
    const code = data.errorMessage?.code ?? data.RESULT?.CODE ?? data.code;
    if (code === 'INFO-200') return [];
    if (code && code !== 'INFO-000' || !Array.isArray(data.realtimePositionList)) throw Error('실시간 위치 연결을 확인할 수 없어요. 하차역에서 직접 하차해 주세요.');
    const found = new Map();
    for (const row of data.realtimePositionList) {
      const at = positionTime(row), number = trainNumber(row.trainNo);
      const station = line.stations.find(s => stationName(s) === stationName(row.statnNm));
      if (String(row.subwayId) !== line.id || !station || !/^[A-Z0-9]{1,16}$/.test(number) || !Number.isFinite(at) || this.now() - at > 90000 || at - this.now() > 60000) continue;
      const direction = travelDirection(line.id, station, row.statnTnm, Number(row.updnLine));
      if (![0, 1].includes(direction) || !['0', '1', '2', '3'].includes(String(row.trainSttus))) continue;
      const kind = String(row.directAt) === '1' ? '급행' : String(row.directAt) === '7' ? '특급' : '일반';
      const record = { id: number, number, station, direction, destination: String(row.statnTnm || ''), status: ['approaching', 'arrived', 'departed', 'previous_departed'][Number(row.trainSttus)], updatedAt: new Date(at).toISOString(), kind, express: kind !== '일반', source: 'running', message: `${station} ${['진입', '도착', '출발', '전역 출발'][Number(row.trainSttus)]}` };
      const key = `${number}:${direction}`;
      if (!found.has(key) || Date.parse(found.get(key).updatedAt) < at) found.set(key, record);
    }
    return [...found.values()];
  }
}

export function tripProgress(trip, record, previous, now = Date.now()) {
  const path = trip.pathStops || trip.stops, at = Date.parse(record?.updatedAt);
  if (!record || record.number !== trip.train || record.direction !== trip.direction || !Number.isFinite(at) || at < trip.boardedAt || now - at > 90000 || at - now > 60000) return { available: false, message: '실시간 위치가 확인되지 않아요. 하차역에서 직접 하차해 주세요.' };
  const index = path.indexOf(record.station);
  if (index < 0 || previous?.available && index < previous.index || previous?.available && at < Date.parse(previous.updatedAt)) return { available: false, message: '선택 구간의 열차 위치를 확인할 수 없어요. 직접 하차해 주세요.' };
  const arrived = record.station === trip.to && record.status === 'arrived';
  const observedBefore = previous?.observedBefore || !!(previous?.available && previous.index < path.length - 1 && Date.parse(previous.updatedAt) < at);
  const remaining = trip.stops.filter(station => path.indexOf(station) > index).length;
  return { available: true, station: record.station, index, updatedAt: record.updatedAt, arrived, observedBefore, autoConfirmed: arrived && observedBefore && at <= now, near: !arrived && remaining <= 1, remaining, message: arrived ? `${trip.to}역 도착 정보가 있어요. 하차를 확인해 주세요.` : `${record.message || record.station} · 하차역까지 ${remaining}개 정차역` };
}

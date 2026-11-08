import { readFileSync } from 'node:fs';
import { LINES, stationName } from './transit.mjs';

const snapshot = JSON.parse(readFileSync(new URL('./data/first-last.json', import.meta.url)));
const DAY = 86400000, KST = 9 * 3600000;
const holidays = {
  2026: '01-01 02-16 02-17 02-18 03-01 03-02 05-01 05-05 05-24 05-25 06-03 06-06 07-17 08-15 08-17 09-24 09-25 09-26 10-03 10-05 10-09 12-25'.split(' '),
  2027: '01-01 02-06 02-07 02-08 02-09 03-01 05-01 05-03 05-05 05-13 06-06 07-17 07-19 08-15 08-16 09-14 09-15 09-16 10-03 10-04 10-09 10-11 12-25 12-27'.split(' '),
};
export function dayType(date) {
  const dates = holidays[date.slice(0, 4)];
  if (!dates) return null;
  const day = new Date(date + 'T00:00:00Z').getUTCDay();
  return dates.includes(date.slice(5)) || day === 0 ? '3' : day === 6 ? '2' : '1';
}
export function timeSeconds(value) {
  const match = /^(\d{2})(\d{2})(\d{2})$/.exec(String(value));
  if (!match) return null;
  let [, h, m, s] = match.map(Number);
  if (h > 26 || m > 59 || s > 59) return null;
  if (h < 3) h += 24;
  return h * 3600 + m * 60 + s;
}
// The public sheet endpoint returns object keys without quotes and trailing commas.
// Parse as data only, without evaluating JavaScript.
export function parseSheet(text) {
  const data = JSON.parse(text.replace(/([{,])\s*([A-Za-z_][A-Za-z_0-9]*)\s*:/g, '$1"$2":').replace(/,\s*([}\]])/g, '$1'));
  if (data.result !== 'ok' || !Array.isArray(data.list) || data.list.length !== Number(data.page?.totalCount)) throw Error('Incomplete timetable');
  return data.list;
}
const supported = LINES.filter(line => /^100[1-9]$/.test(line.id)).map(line => line.id);
const sourceLine = line => supported.includes(line) ? `0${line.at(-1)}호선` : null;
// This dataset labels 9호선 toward 중앙보훈병원 as 1; realtime arrivals use 하행.
const sourceDirection = (line, direction) => String(line === '1009' ? 2 - direction : direction + 1);
const rowKey = row => [row.SBWY_ROUT_LN, stationName(row.STTN), row.UPLN_DNLN, row.DOW].join(':');
const onMainLine = row => row.SBWY_ROUT_LN !== '02호선' || [row.FSTT_ARVL_STTN, row.LSTTM_ARVL_STTN].every(name => LINES.find(line => line.id === '1002').stations.some(station => stationName(station) === stationName(name)));
function indexRows(rows) {
  const indexed = new Map();
  for (const row of rows) if (!indexed.has(rowKey(row)) || onMainLine(row)) indexed.set(rowKey(row), row);
  return indexed;
}
const unknown = direction => ({ direction, status: 'unknown', message: '첫차·막차 시간표를 확인할 수 없어요.' });

export class TimetableProvider {
  constructor({ now = Date.now, fetcher = fetch, data = snapshot, refresh = true } = {}) {
    this.now = now; this.fetcher = fetcher; this.refresh = refresh;
    this.rows = indexRows(data.rows);
    this.updated = new Map(supported.map(line => [line, Date.parse(data.retrievedAt)]));
    this.pending = new Map(); this.attempted = new Map();
  }
  async update(line) {
    if (!sourceLine(line)) return;
    if (this.pending.has(line)) return this.pending.get(line);
    if (!this.refresh || this.now() - this.updated.get(line) < DAY || this.now() - (this.attempted.get(line) ?? -Infinity) < 3600000) return;
    this.attempted.set(line, this.now());
    const task = (async () => {
      try {
        const params = new URLSearchParams({ infId: 'OA-15492', srvType: 'S', serviceKind: '0', pageNo: '1', onepagerow: '1000', filterCol: 'SBWY_ROUT_LN', txtFilter: `${line.at(-1)}호선` });
        const response = await this.fetcher('https://data.seoul.go.kr/dataList/dataView.do?' + params, { signal: AbortSignal.timeout(5000) });
        if (!response.ok) throw Error();
        const rows = parseSheet(await response.text());
        const keys = new Set(rows.map(rowKey));
        if ([...this.rows.values()].some(row => row.SBWY_ROUT_LN === sourceLine(line) && !keys.has(rowKey(row)))) throw Error('Missing stations');
        if (!rows.length || rows.some(row => row.SBWY_ROUT_LN !== sourceLine(line) || !['1', '2', '3'].includes(row.DOW) || !['1', '2'].includes(row.UPLN_DNLN) || timeSeconds(row.FSTT_HRM) === null || timeSeconds(row.LSTTM_HRM) === null)) throw Error('Invalid timetable');
        for (const [key, row] of indexRows(rows)) this.rows.set(key, row);
        this.updated.set(line, this.now());
      } catch { /* Keep a recent verified snapshot during provider outages. */ }
    })().finally(() => this.pending.delete(line));
    this.pending.set(line, task); return task;
  }
  async states(line, station, section = null) {
    if (!sourceLine(line) || !LINES.find(l => l.id === line)?.stations.includes(station)) return [unknown(0), unknown(1)];
    await this.update(line);
    if (this.now() - this.updated.get(line) > 7 * DAY) return [unknown(0), unknown(1)];
    return [0, 1].map(direction => this.state(line, station, direction, section));
  }
  state(line, station, direction, section) {
    const now = this.now(), today = Math.floor((now + KST) / DAY) * DAY - KST;
    const windows = [];
    for (const offset of [-1, 0, 1]) {
      const midnight = today + offset * DAY, date = new Date(midnight + KST).toISOString().slice(0, 10), type = dayType(date);
      if (!type) return unknown(direction);
      const row = this.rows.get([sourceLine(line), stationName(station), sourceDirection(line, direction), type].join(':'));
      if (!row || !onMainLine(row)) return unknown(direction);
      if (section !== null) {
        const path = LINES.find(l => l.id === line).paths[section];
        if (!path || ![row.FSTT_ARVL_STTN, row.LSTTM_ARVL_STTN].every(name => path.some(station => stationName(station) === stationName(name)))) return unknown(direction);
      }
      const first = timeSeconds(row.FSTT_HRM), last = timeSeconds(row.LSTTM_HRM);
      if (first === null || last === null || first > last) return unknown(direction);
      windows.push({ date, dayType: type, first: midnight + first * 1000, last: midnight + last * 1000, lastDestination: row.LSTTM_ARVL_STTN });
    }
    const active = windows.find(w => now >= w.first && now <= w.last);
    const previous = windows.filter(w => w.last < now).at(-1), next = windows.find(w => w.first > now);
    const window = active || previous;
    if (!window || (!active && !next)) return unknown(direction);
    return { direction, status: active ? 'scheduled' : 'after_last', serviceDate: window.date, dayType: window.dayType, firstAt: new Date(window.first).toISOString(), lastAt: new Date(window.last).toISOString(), nextFirstAt: next ? new Date(next.first).toISOString() : null, lastDestination: window.lastDestination, updatedAt: new Date(this.updated.get(line)).toISOString(), source: snapshot.source };
  }
}

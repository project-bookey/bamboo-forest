import { readFile, writeFile } from 'node:fs/promises';
import { TimetableProvider } from '../timetable.mjs';
import { LINES } from '../lines.mjs';

const file = new URL('../data/first-last.json', import.meta.url);
const snapshot = JSON.parse(await readFile(file, 'utf8'));
const provider = new TimetableProvider({ data: { ...snapshot, retrievedAt: '1970-01-01T00:00:00Z' } });
await Promise.all(LINES.filter(line => /^100[1-9]$/.test(line.id)).map(line => provider.update(line.id)));
if ([...provider.updated.values()].some(time => time === 0)) throw Error('시간표 갱신 실패: 기존 파일을 유지합니다.');
await writeFile(file, JSON.stringify({ ...snapshot, retrievedAt: new Date().toISOString(), rows: [...provider.rows.values()] }, null, 2) + '\n');
console.log(`공식 첫차·막차 시간표 ${provider.rows.size}건을 갱신했습니다.`);

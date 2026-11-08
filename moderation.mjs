import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

const MONTH = 30 * 86400000;
export const REPORT_REASONS = ['욕설·괴롭힘', '광고·도배', '개인정보 노출', '기타'];
function fail(message, status = 400) { const error = Error(message); error.status = status; throw error; }
export class ModerationStore {
  constructor({ directory = process.env.METRO_STATE_DIR, now = Date.now } = {}) {
    this.directory = directory; this.now = now; this.data = { reports: [], blocks: {}, mutes: {}, hidden: {} }; this.queue = Promise.resolve();
    this.ready = this.load();
  }
  async load() {
    if (!this.directory) return;
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    try {
      const data = JSON.parse(await readFile(join(this.directory, 'moderation.json'), 'utf8'));
      if (!Array.isArray(data.reports) || !data.blocks || !data.mutes || !data.hidden) throw Error('Invalid moderation store');
      this.data = data; this.prune(); await this.save();
    } catch (error) { if (error.code !== 'ENOENT') throw error; await this.save(); }
  }
  prune() {
    const now = this.now(); this.data.reports = this.data.reports.filter(report => now - report.at < MONTH).slice(-1000);
    for (const [viewer, list] of Object.entries(this.data.blocks)) {
      this.data.blocks[viewer] = list.filter(block => now - block.at < MONTH).slice(-100);
      if (!this.data.blocks[viewer].length) delete this.data.blocks[viewer];
    }
    for (const key of ['mutes', 'hidden']) for (const [id, until] of Object.entries(this.data[key])) if (until <= now) delete this.data[key][id];
  }
  async save() {
    this.prune(); if (!this.directory) return;
    const text = JSON.stringify(this.data), file = join(this.directory, 'moderation.json');
    const task = this.queue.catch(() => {}).then(async () => { const temporary = file + '.tmp'; await writeFile(temporary, text, { mode: 0o600 }); await rename(temporary, file); });
    this.queue = task;
    try { await task; } catch { fail('신고·차단 정보를 저장하지 못했어요. 잠시 후 다시 시도해 주세요.', 503); }
  }
  blocks(viewer) { return (this.data.blocks[viewer] || []).filter(block => this.now() - block.at < MONTH); }
  visible(viewer, message) { return !this.blocks(viewer).some(block => block.id === message.sender) && !(this.data.hidden[message.id] > this.now()); }
  mutedUntil(sender) { return this.data.mutes[sender] > this.now() ? this.data.mutes[sender] : null; }
  async block(viewer, message) {
    if (viewer === message.sender) fail('자신은 차단할 수 없어요.');
    const list = this.blocks(viewer).filter(block => block.id !== message.sender);
    if (list.length >= 100) fail('차단 목록은 최대 100명까지 보관할 수 있어요.');
    this.data.blocks[viewer] = [...list, { id: message.sender, name: message.name, at: this.now() }]; await this.save();
  }
  async unblock(viewer, sender) {
    this.data.blocks[viewer] = this.blocks(viewer).filter(block => block.id !== sender); await this.save();
  }
  async report(viewer, room, message, reason, note = '') {
    this.prune();
    if (viewer === message.sender || !REPORT_REASONS.includes(reason) || typeof note !== 'string' || note.length > 300) fail('신고 사유와 내용을 확인해 주세요.');
    const duplicate = this.data.reports.find(report => report.reporter === viewer && report.message.id === message.id);
    if (duplicate) return duplicate.id;
    if (this.data.reports.filter(report => report.reporter === viewer && this.now() - report.at < 600000).length >= 5) fail('신고는 10분에 5건까지 접수할 수 있어요.', 429);
    if (this.data.reports.filter(report => this.now() - report.at < MONTH).length >= 1000) fail('신고 접수가 많아요. 잠시 후 다시 시도해 주세요.', 503);
    const report = { id: randomUUID(), at: this.now(), reporter: viewer, room, sender: message.sender, message: { ...message }, reason, note: note.trim(), status: 'pending' };
    this.data.reports.push(report); await this.save(); return report.id;
  }
  reports() { this.prune(); return [...this.data.reports].reverse(); }
  async review(id, action, minutes = 30) {
    this.prune();
    const report = this.data.reports.find(report => report.id === id);
    if (!report || !['dismiss', 'hide', 'mute'].includes(action)) fail('신고와 처리 방법을 확인해 주세요.');
    if (action === 'mute' && (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440)) fail('제한 시간은 1~1440분으로 입력해 주세요.');
    if (action === 'hide' || action === 'mute') this.data.hidden[report.message.id] = this.now() + MONTH;
    if (action === 'mute') this.data.mutes[report.sender] = this.now() + minutes * 60000;
    report.status = action; report.reviewedAt = this.now(); await this.save(); return report;
  }
}

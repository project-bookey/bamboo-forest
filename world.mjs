import { randomUUID } from 'node:crypto';

export const SPEED = 3.6;
export const REACH = 2.5;
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
export class World {
  constructor({ random = Math.random, now = Date.now } = {}) {
    this.random = random;
    this.now = now;
    this.players = new Map();
    this.clouds = [];
    this.axes = Array.from({ length: 16 }, (_, id) => ({ id, ...this.point(), readyAt: 0 }));
    this.trees = Array.from({ length: 180 }, (_, id) => {
      const p = this.point();
      if (Math.abs(p.x) < 2.8) p.x += p.x < 0 ? -3 : 3;
      return { id, ...p, height: 6 + random() * 7, readyAt: 0 };
    });
    this.pandas = Array.from({ length: 10 }, (_, id) => ({ id, ...this.point(), owner: null, target: this.point(), angle: 0 }));
  }
  point() { return { x: (this.random() - .5) * 48, z: (this.random() - .5) * 72 }; }
  join() {
    const player = { id: randomUUID(), x: (this.random() - .5) * 3, z: 12 + this.random() * 2,
      angle: 0, axe: false, bamboo: 0, input: { x: 0, z: 0 }, target: null,
      inputAt: 0, actionAt: -Infinity, sayAt: -Infinity, swingAt: 0 };
    this.players.set(player.id, player);
    return player;
  }
  leave(id) {
    this.players.delete(id);
    for (const panda of this.pandas) if (panda.owner === id) panda.owner = null;
  }
  input(id, data) {
    const p = this.players.get(id);
    if (!p) return;
    if (data.target && Number.isFinite(data.target.x) && Number.isFinite(data.target.z)) {
      p.target = { x: clamp(data.target.x, -28, 28), z: clamp(data.target.z, -44, 44) };
      p.input = { x: 0, z: 0 };
    } else if (Number.isFinite(data.x) && Number.isFinite(data.z)) {
      const length = Math.max(1, Math.hypot(data.x, data.z));
      p.input = { x: data.x / length, z: data.z / length };
      p.target = null;
    }
    p.inputAt = this.now();
  }
  nearest(list, p, predicate = () => true) {
    return list.filter(v => predicate(v) && distance(p, v) <= REACH).sort((a, b) => distance(p, a) - distance(p, b))[0];
  }
  action(id, data = {}) {
    const p = this.players.get(id), now = this.now();
    if (!p || now - p.actionAt < 650) return { ok: false, message: '잠깐만 기다려 주세요' };
    p.actionAt = now;
    // A requested type lets the client make the nearby action unambiguous.
    const type = data.type;
    const panda = this.nearest(this.pandas, p, v => v.owner !== id);
    if ((!type || type === 'feed') && p.bamboo > 0 && panda) {
      p.bamboo--; panda.owner = id;
      return { ok: true, kind: 'feed', message: '판다가 친구가 되었어요! 이제 당신을 따라와요' };
    }
    const axe = this.nearest(this.axes, p, v => v.readyAt <= now);
    if ((!type || type === 'pickup') && !p.axe && axe) {
      p.axe = true; axe.readyAt = now + 30000;
      return { ok: true, kind: 'pickup', message: '도끼를 주웠어요 · 대나무 근처에서 E / 행동' };
    }
    const tree = this.nearest(this.trees, p, v => v.readyAt <= now);
    if ((!type || type === 'chop') && p.axe && tree && p.bamboo < 20) {
      tree.readyAt = now + 45000; p.bamboo++; p.swingAt = now;
      return { ok: true, kind: 'chop', message: '대나무 +1 · 판다에게 가져다주세요' };
    }
    return { ok: false, message: p.bamboo >= 20 ? '대나무가 가득해요 · 판다에게 나눠주세요' : '가까이 다가가세요 · 도끼 → 대나무 → 판다' };
  }
  say(id, text) {
    const p = this.players.get(id), now = this.now();
    if (!p || typeof text !== 'string' || !text.trim() || [...text.trim()].length > 60 || now - p.sayAt < 2000) return false;
    p.sayAt = now;
    this.clouds.push({ id: randomUUID(), playerId: id, text: text.trim(), x: p.x, z: p.z, createdAt: now });
    return true;
  }
  tick(dt) {
    const now = this.now();
    dt = clamp(dt, 0, .1);
    for (const p of this.players.values()) {
      let { x, z } = p.input;
      if (now - p.inputAt > 600) x = z = 0;
      if (p.target) {
        const d = distance(p, p.target);
        if (d < .08) p.target = null;
        else { x = (p.target.x - p.x) / d; z = (p.target.z - p.z) / d; }
        const speed = Math.min(SPEED * dt, d);
        if (d > 0) { p.x += x * speed; p.z += z * speed; }
      } else { p.x += x * SPEED * dt; p.z += z * SPEED * dt; }
      p.x = clamp(p.x, -28, 28); p.z = clamp(p.z, -44, 44);
      if (x || z) p.angle = Math.atan2(-x, -z);
    }
    for (const panda of this.pandas) {
      const owner = this.players.get(panda.owner);
      let target = panda.target;
      if (owner) {
        const friends = this.pandas.filter(v => v.owner === owner.id);
        const slot = friends.indexOf(panda), angle = slot * 2.4;
        const radius = 1.4 + Math.floor(slot / 4) * .9;
        target = { x: owner.x + Math.cos(angle) * radius, z: owner.z + Math.sin(angle) * radius };
      } else if (distance(panda, target) < .3) panda.target = this.point();
      const dx = target.x - panda.x, dz = target.z - panda.z, d = Math.hypot(dx, dz);
      if (d > .15) {
        const s = Math.min(d, (owner ? 4.2 : .55) * dt);
        panda.x = clamp(panda.x + dx / d * s, -28, 28); panda.z = clamp(panda.z + dz / d * s, -44, 44);
        panda.angle = Math.atan2(-dx, -dz);
      }
    }
    this.clouds = this.clouds.filter(c => now - c.createdAt < 20000);
    for (const axe of this.axes) if (axe.readyAt && axe.readyAt <= now) { Object.assign(axe, this.point()); axe.readyAt = 0; }
  }
  snapshot() {
    return { now: this.now(), players: [...this.players.values()].map(({ id, x, z, angle, axe, bamboo, swingAt }) => ({ id, x, z, angle, axe, bamboo, swingAt })),
      axes: this.axes, trees: this.trees, pandas: this.pandas.map(({ target, ...p }) => p), clouds: this.clouds };
  }
}

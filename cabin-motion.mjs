export const WALK_SPEED = 2.2;
export function createWalk(position, destination, at) {
  const x = Math.max(-1.15, Math.min(1.15, position.x)), z = Math.max(-9, Math.min(9, position.z));
  const toX = Math.max(-1.15, Math.min(1.15, destination.x)), toZ = Math.max(-9, Math.min(9, destination.z));
  return { x, z, toX, toZ, at, duration: Math.hypot(toX - x, toZ - z) / WALK_SPEED * 1000 };
}
export function sampleWalk(walk, time, out = {}) {
  const k = walk.duration > 0 ? Math.max(0, Math.min(1, (time - walk.at) / walk.duration)) : 1;
  out.x = walk.x + (walk.toX - walk.x) * k; out.z = walk.z + (walk.toZ - walk.z) * k;
  return out;
}

import * as THREE from './vendor/three.module.min.js';
import { createEnvironment } from './cabin-environment.js';
import { CAR_COUNT, CAR_THEMES, SEATS, REACTIONS, COAT_COLORS } from './cabin-data.mjs';

// Geometry and avatars carry forward the original forest's walk-and-talk interaction.
export function createCabin({ canvas, move, changeCar, sit, openAd, openMessage, onError }) {
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false }); }
  catch { onError('이 브라우저에서 3D 화면을 열 수 없어요. 탑승 설정에서 열차 선택과 대화 기록을 이용해 주세요.'); return { update() {}, setLine() {}, configure() {} }; }
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.8));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#203749');
  scene.fog = new THREE.Fog('#849da3', 20, 48);
  const camera = new THREE.PerspectiveCamera(57, 1, .1, 80);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const ray = new THREE.Raycaster(), pointer = new THREE.Vector2();
  const people = new Map(), bubbles = new Map(), seen = new Set();
  let current = null, room = '', yaw = 0, targetYaw = 0, drag = null, lastKeyMove = 0, car = 1;
  let motion = !reduced.matches;
  let resetCamera = true, crossingAt = 0;
  reduced.addEventListener('change', e => { motion = !e.matches; });
  const environment = createEnvironment(scene);
  const floor = environment.floor;

  function textureSprite(text, { color = '#233f43', background = '#f6faf1', width = 640, size = 34 } = {}) {
    const c = document.createElement('canvas'); c.width = width; c.height = 256;
    const g = c.getContext('2d'); g.font = `${size}px "Apple SD Gothic Neo", "Malgun Gothic", sans-serif`;
    const lines = []; let row = '';
    for (const char of text) {
      if (char === '\n' || g.measureText(row + char).width > width - 72) { lines.push(row); row = char === '\n' ? '' : char; } else row += char;
      if (lines.length >= 3) { row = '…'; break; }
    }
    if (row) lines.push(row);
    const h = Math.min(220, lines.length * 43 + 34), y = (256 - h) / 2;
    g.fillStyle = background; g.beginPath(); g.roundRect(10, y, width - 20, h, 30); g.fill();
    g.beginPath(); g.moveTo(width / 2 - 15, y + h - 2); g.lineTo(width / 2, y + h + 19); g.lineTo(width / 2 + 15, y + h - 2); g.fill();
    g.fillStyle = color; g.textAlign = 'center'; g.textBaseline = 'middle';
    lines.forEach((line, i) => g.fillText(line, width / 2, y + h / 2 + (i - (lines.length - 1) / 2) * 43));
    const texture = new THREE.CanvasTexture(c); texture.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false }));
    sprite.scale.set(width === 640 ? 3.2 : 1.7, 1.28, 1); sprite.renderOrder = 4; return sprite;
  }
  const disposeSprite = sprite => { scene.remove(sprite); sprite.material.map.dispose(); sprite.material.dispose(); };
  const skin = new THREE.MeshStandardMaterial({ color: '#d5aa8b', roughness: .8 });
  const legMat = new THREE.MeshStandardMaterial({ color: '#3d5560', roughness: .9 });
  const hats = ['#f1d49e', '#8dc8bd', '#bdc2df', '#d6a4a2', '#9eb5d1'];
  const geo = { leg: new THREE.CylinderGeometry(.1, .085, .42, 8), body: new THREE.CylinderGeometry(.23, .34, .7, 12), head: new THREE.SphereGeometry(.26, 16, 12), hat: new THREE.ConeGeometry(.4, .2, 16), arm: new THREE.CylinderGeometry(.075, .065, .43, 8) };
  function person(data, mine) {
    const root = new THREE.Group(), tone = COAT_COLORS[data.coat] || hats[0];
    const coat = new THREE.MeshStandardMaterial({ color: tone, roughness: .85 });
    const add = (geometry, material, x, y, z = 0) => { const m = new THREE.Mesh(geometry, material); m.position.set(x, y, z); root.add(m); return m; };
    const legs = [-1, 1].map(side => add(geo.leg, legMat, side * .12, .24));
    add(geo.body, coat, 0, .77); add(geo.head, skin, 0, 1.36);
    add(geo.hat, coat, 0, 1.62);
    const arms = [-1, 1].map(side => add(geo.arm, coat, side * .3, .84));
    const label = textureSprite(mine ? '나' : data.name, { width: 340, size: 30, background: mine ? '#e5f3db' : '#e9f0ed' });
    scene.add(root, label); root.position.set(data.x, 0, data.z);
    return { root, legs, arms, label, coat, target: new THREE.Vector3(data.x, 0, data.z) };
  }
  function clear() {
    for (const p of people.values()) { scene.remove(p.root); disposeSprite(p.label); p.coat.dispose(); if (p.emoteSprite) disposeSprite(p.emoteSprite); }
    people.clear(); for (const b of bubbles.values()) disposeSprite(b.sprite); bubbles.clear(); seen.clear();
  }
  function update(next) {
    if (room !== (next.trip?.room || '') || car !== (next.trip?.car || 1)) { clear(); room = next.trip?.room || ''; car = next.trip?.car || 1; yaw = targetYaw = 0; resetCamera = true; }
    environment.update(next); environment.setCarColor(CAR_THEMES[car - 1].color);
    current = next;
    const inCar = (next.players || []).filter(p => (p.car || 1) === car);
    const visible = new Set(inCar.map(p => p.id));
    for (const [id, p] of people) if (!visible.has(id)) { scene.remove(p.root); disposeSprite(p.label); p.coat.dispose(); if (p.emoteSprite) disposeSprite(p.emoteSprite); people.delete(id); }
    for (const data of inCar) {
      if (!people.has(data.id)) people.set(data.id, person(data, data.id === next.id));
      const p = people.get(data.id); p.target.set(data.x, 0, data.z); p.data = data;
      p.coat.color.set(COAT_COLORS[data.coat] || hats[0]);
      if (data.emote && p.emoteUntil !== data.emote.until) {
        if (p.emoteSprite) disposeSprite(p.emoteSprite);
        p.emoteUntil = data.emote.until;
        p.emoteSprite = textureSprite(REACTIONS[data.emote.kind], { width: 340, background: '#f3dfa9', size: 33 }); scene.add(p.emoteSprite);
      }
    }
    const messages = new Set(next.messages.filter(m => (m.car || 1) === car).map(m => m.id));
    for (const id of seen) if (!messages.has(id)) seen.delete(id);
    for (const [id, b] of bubbles) if (!messages.has(id)) { disposeSprite(b.sprite); bubbles.delete(id); }
    for (const message of next.messages.filter(m => (m.car || 1) === car)) {
      if (seen.has(message.id)) continue; seen.add(message.id);
      if (Date.now() - message.at > 20000) continue;
      const p = people.get(message.sender); if (!p) continue;
      // One readable cloud per passenger; the full conversation stays in the log.
      for (const [id, b] of bubbles) if (b.sender === message.sender) { disposeSprite(b.sprite); bubbles.delete(id); }
      const sprite = textureSprite(message.text, { background: message.sender === next.id ? '#e6f5da' : '#fffef4' });
      sprite.userData.messageId = message.id; scene.add(sprite);
      bubbles.set(message.id, { sprite, sender: message.sender, at: message.at });
    }
  }
  function destination(event) {
    const rect = canvas.getBoundingClientRect(); pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1); ray.setFromCamera(pointer, camera);
    const cloud = ray.intersectObjects([...bubbles.values()].map(b => b.sprite).filter(s => s.visible))[0];
    if (cloud) return openMessage(cloud.object.userData.messageId);
    if (!current?.trip) return;
    const object = ray.intersectObjects(environment.interactables)[0]?.object;
    if (object?.userData.ad) return openAd(object.userData.ad);
    if (object?.userData.seat) return sit(object.userData.seat);
    if (object?.userData.carDelta) return changeCar(car + object.userData.carDelta);
    const hit = ray.intersectObject(floor)[0];
    if (hit) move({ x: Math.max(-1.15, Math.min(1.15, hit.point.x)), z: Math.max(-9, Math.min(9, hit.point.z)) });
  }
  canvas.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, yaw: targetYaw, moved: false }; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', e => { if (!drag) return; if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 8) drag.moved = true; if (drag.moved) targetYaw = drag.yaw - (e.clientX - drag.x) * .004; });
  canvas.addEventListener('pointerup', e => { const d = drag; drag = null; if (d && !d.moved) destination(e); });
  canvas.addEventListener('pointercancel', () => { drag = null; });
  canvas.addEventListener('keydown', e => {
    const directions = { ArrowUp: [0, -1.5], w: [0, -1.5], ArrowDown: [0, 1.5], s: [0, 1.5], ArrowLeft: [-.6, 0], a: [-.6, 0], ArrowRight: [.6, 0], d: [.6, 0] };
    if (current?.trip && ['q', 'e'].includes(e.key.toLowerCase())) { e.preventDefault(); if (!e.repeat) changeCar(car + (e.key.toLowerCase() === 'q' ? -1 : 1)); return; }
    const d = directions[e.key]; if (!d || !current?.trip) return; e.preventDefault();
    if (performance.now() - lastKeyMove < 250) return; lastKeyMove = performance.now();
    const p = people.get(current.id)?.target; if (p) move({ x: p.x + d[0], z: p.z + d[1] });
  });
  function resize() { const w = canvas.clientWidth, h = canvas.clientHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.fov = w < h ? 67 : 57; camera.updateProjectionMatrix(); }
  new ResizeObserver(resize).observe(canvas); resize();
  camera.position.set(0, 2.65, 11);
  const clock = new THREE.Clock(), cameraTarget = new THREE.Vector3(), look = new THREE.Vector3();
  let adCheck = 0;
  renderer.setAnimationLoop(() => {
    if (document.hidden) { clock.getDelta(); return; }
    const dt = Math.min(clock.getDelta(), .05), time = clock.elapsedTime;
    for (const [id, p] of people) {
      const distance = p.root.position.distanceTo(p.target), walking = distance > .04 && !p.data?.seat;
      if (walking) { const dx = p.target.x - p.root.position.x, dz = p.target.z - p.root.position.z; p.root.rotation.y = Math.atan2(dx, dz); }
      p.root.position.lerp(p.target, !motion ? 1 : Math.min(1, dt * 12));
      const swing = walking && !!motion ? Math.sin(time * 10) * .45 : 0;
      const chair = SEATS.find(s => s.id === p.data?.seat);
      if (chair) p.root.rotation.y = chair.angle;
      p.legs.forEach((leg, i) => { leg.rotation.x = chair ? Math.PI / 2 : swing * (i ? 1 : -1); leg.position.y = chair ? .48 : .24; leg.position.z = chair ? .17 : 0; });
      const reacting = p.emoteUntil > Date.now();
      p.arms.forEach((arm, i) => { arm.rotation.x = swing * (i ? -1 : 1); arm.rotation.z = reacting && i === 1 ? -.9 + (motion ? Math.sin(time * 12) * .25 : 0) : 0; });
      if (p.emoteSprite) {
        if (!reacting) { disposeSprite(p.emoteSprite); p.emoteSprite = null; }
        else { p.emoteSprite.position.copy(p.root.position); p.emoteSprite.position.y = 2.55; }
      }
      p.label.position.copy(p.root.position); p.label.position.y = 2.08;
    }
    for (const [id, b] of bubbles) {
      const age = (Date.now() - b.at) / 1000, p = people.get(b.sender);
      if (age >= 20 || !p) { disposeSprite(b.sprite); bubbles.delete(id); continue; }
      b.sprite.position.copy(p.root.position); b.sprite.position.y = 2.9 + (!motion ? 0 : age * .018);
      b.sprite.material.opacity = Math.min(1, (20 - age) / 3);
    }
    yaw += (targetYaw - yaw) * Math.min(1, dt * 7);
    const me = people.get(current?.id)?.root.position || new THREE.Vector3(0, 0, 5);
    cameraTarget.set(me.x * .35 + Math.sin(yaw) * 2, 2.65, Math.max(-12.5, Math.min(12.5, me.z + Math.cos(yaw) * 5.5)));
    camera.position.lerp(cameraTarget, resetCamera || !motion ? 1 : Math.min(1, dt * 4)); resetCamera = false;
    look.set(me.x - Math.sin(yaw) * 4, 1.65, me.z - Math.cos(yaw) * 4); camera.lookAt(look);
    camera.updateMatrixWorld();
    const self = people.get(current?.id);
    if (self && !self.data?.seat && Math.abs(me.z) > 8.6 && Math.abs(self.target.z) > 8.8 && time - crossingAt > 1.2) {
      const destination = car + (me.z < 0 ? 1 : -1);
      if (destination >= 1 && destination <= CAR_COUNT) { crossingAt = time; changeCar(destination); }
    }
    for (const p of people.values()) {
      const projected = p.label.position.clone().project(camera);
      p.label.visible = projected.z < 1 && Math.abs(projected.x) < 1.1;
    }
    // Keep clouds readable inside narrow screens and stagger overlapping speech.
    const placed = [], w = canvas.clientWidth, h = canvas.clientHeight;
    const cameraForward = new THREE.Vector3(); camera.getWorldDirection(cameraForward);
    for (const b of [...bubbles.values()].sort((a, b) => b.at - a.at)) {
      const sprite = b.sprite, relative = sprite.position.clone().sub(camera.position);
      const depth = relative.dot(cameraForward), projected = sprite.position.clone().project(camera);
      sprite.visible = depth > .2 && projected.z < 1 && placed.length < 8;
      if (!sprite.visible) continue;
      const unitsPerPixel = 2 * depth * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) / h;
      const width = Math.min(3.2 / unitsPerPixel, w * .8), height = width * .4;
      let x = (projected.x + 1) * w / 2, y = (1 - projected.y) * h / 2;
      x = Math.max(width / 2 + 8, Math.min(w - width / 2 - 8, x));
      for (const other of placed) {
        if (Math.abs(x - other.x) < (width + other.width) / 2 && Math.abs(y - other.y) < (height + other.height) / 2 + 6) y = other.y - (height + other.height) / 2 - 6;
      }
      if (y < height / 2 + 70) { sprite.visible = false; continue; }
      placed.push({ x, y, width, height });
      sprite.scale.set(width * unitsPerPixel, height * unitsPerPixel, 1);
      sprite.position.copy(new THREE.Vector3(x / w * 2 - 1, 1 - y / h * 2, projected.z).unproject(camera));
    }
    environment.tick(dt, me, motion);
    if (current && time - adCheck > 1) { adCheck = time; environment.update(current); }
    renderer.render(scene, camera);
  });
  canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); onError('3D 연결이 끊겼어요. 대화 기록은 계속 사용할 수 있어요. 화면을 새로고침하면 다시 시도합니다.'); });
  return { update, setLine() {}, configure({ scenery, animate, quality } = {}) { if (scenery) environment.setScenery(scenery); if (typeof animate === 'boolean') motion = animate; if (quality) renderer.setPixelRatio(quality === 'low' ? 1 : Math.min(devicePixelRatio || 1, 1.8)); } };
}

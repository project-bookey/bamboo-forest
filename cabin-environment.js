import * as THREE from './vendor/three.module.min.js';
import { ADS, CAR_COUNT, CAR_THEMES, SEATS } from './cabin-data.mjs';

export function createEnvironment(scene) {
  const interactables = [], seats = [], posters = [], doors = [], signs = [];
  const steel = new THREE.MeshStandardMaterial({ color: '#b4c4c7', metalness: .55, roughness: .32 });
  const shell = new THREE.MeshStandardMaterial({ color: '#e0e7e3', roughness: .85 });
  const seatMat = new THREE.MeshStandardMaterial({ color: '#398d75', roughness: .9 });
  const floorMat = new THREE.MeshStandardMaterial({ color: '#728b8d', roughness: .95 });
  const dark = new THREE.MeshStandardMaterial({ color: '#223b49', roughness: .5 });
  const light = new THREE.MeshBasicMaterial({ color: '#f8fff0' });
  const yellow = new THREE.MeshBasicMaterial({ color: '#e1c86b' });
  const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
  const box = (w, h, d, mat, x, y, z, parent = scene) => { const m = new THREE.Mesh(boxGeometry, mat); m.scale.set(w, h, d); m.position.set(x, y, z); parent.add(m); return m; };
  const poleGeo = new THREE.CylinderGeometry(.035, .035, 3.5, 8), strapGeo = new THREE.TorusGeometry(.12, .026, 5, 12);
  const pole = (x, z) => { const m = new THREE.Mesh(poleGeo, steel); m.position.set(x, 1.75, z); scene.add(m); };
  const floor = box(6.2, .12, 29, floorMat, 0, -.08, 0);
  box(6.2, .15, 29, shell, 0, 3.65, 0);
  function texture(w, h, draw) {
    const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h; draw(canvas.getContext('2d'), w, h);
    const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 2; return tex;
  }
  function adTexture(ad) {
    return texture(1024, 512, (g, w, h) => {
      g.fillStyle = ad.bg; g.fillRect(0, 0, w, h);
      g.fillStyle = ad.ink; g.font = '23px sans-serif'; g.fillText(ad.brand, 48, 55);
      g.font = 'bold 65px "Apple SD Gothic Neo", sans-serif'; ad.title.split('\n').forEach((line, i) => g.fillText(line, 48, 170 + i * 83));
      g.font = '24px sans-serif'; g.fillText(ad.subtitle, 48, 350);
      g.font = '18px sans-serif'; g.fillText('메트로챗 공간 광고 · 가상 브랜드', 48, 466);
      g.save(); g.translate(775, 260); g.fillStyle = ad.accent;
      if (ad.art === 'book') { g.rotate(-.14); g.fillRect(-105, -135, 100, 210); g.rotate(.28); g.fillRect(0, -135, 100, 210); g.strokeStyle = ad.bg; g.lineWidth = 6; for (let y = -100; y < 50; y += 26) { g.beginPath(); g.moveTo(14, y); g.lineTo(84, y); g.stroke(); } }
      else if (ad.art === 'coffee') { g.beginPath(); g.arc(80, -35, 54, 0, Math.PI * 2); g.lineWidth = 21; g.strokeStyle = ad.accent; g.stroke(); g.fillRect(-100, -95, 150, 160); g.beginPath(); g.ellipse(-25, -94, 75, 20, 0, 0, Math.PI * 2); g.fillStyle = ad.ink; g.fill(); g.fillStyle = ad.accent; g.fillRect(-128, 85, 210, 12); }
      else if (ad.art === 'river') { g.beginPath(); g.arc(45, -110, 72, 0, 7); g.fill(); g.strokeStyle = ad.ink; g.lineWidth = 8; for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(-130, 25 + i * 28); g.bezierCurveTo(-40, -30 + i * 28, 20, 90 + i * 28, 130, 25 + i * 28); g.stroke(); } }
      else if (ad.art === 'music') { g.beginPath(); g.arc(0, -25, 100, Math.PI, 0); g.lineWidth = 28; g.strokeStyle = ad.ink; g.stroke(); g.fillRect(-115, -25, 55, 105); g.fillRect(60, -25, 55, 105); }
      else { g.beginPath(); g.arc(-55, -10, 65, 0, 7); g.fill(); g.fillStyle = ad.ink; g.beginPath(); g.arc(65, 50, 65, 0, 7); g.fill(); }
      g.restore();
    });
  }
  const adTextures = ADS.map(adTexture);
  const tunnelTexture = texture(1024, 256, (g, w, h) => {
    g.fillStyle = '#152c3d'; g.fillRect(0, 0, w, h); g.fillStyle = '#29414b'; for (let x = 0; x < w; x += 128) g.fillRect(x, 0, 6, h);
    g.fillStyle = '#9cc2bc'; g.fillRect(40, 60, 160, 8); g.fillStyle = '#d7bf82'; g.fillRect(500, 72, 120, 6); g.fillStyle = '#375862'; g.fillRect(0, 180, w, 6);
  });
  const riverTexture = texture(2048, 512, (g, w, h) => {
    const sky = g.createLinearGradient(0, 0, 0, h); sky.addColorStop(0, '#96bfd1'); sky.addColorStop(.6, '#edcfbb'); sky.addColorStop(1, '#467c90'); g.fillStyle = sky; g.fillRect(0, 0, w, h);
    g.fillStyle = '#f4d29e'; g.beginPath(); g.arc(1460, 125, 53, 0, 7); g.fill();
    for (let i = 0; i < 65; i++) { const x = i * 33, bh = 25 + (i * 37 % 115); g.fillStyle = i % 2 ? '#6c91a3' : '#729da9'; g.fillRect(x, 310 - bh, 26, bh); g.fillStyle = '#d8dcb8'; for (let y = 320 - bh; y < 300; y += 15) g.fillRect(x + 7, y, 3, 5); }
    g.fillStyle = '#6299aa'; g.fillRect(0, 312, w, 200); g.fillStyle = '#b2ced0'; for (let i = 0; i < 60; i++) g.fillRect(i * 39, 330 + i * 17 % 170, 65, 2);
    g.fillStyle = '#496d7d'; g.fillRect(0, 320, w, 9); for (let x = 0; x < w; x += 190) g.fillRect(x, 325, 18, 185);
  });
  for (const tex of [tunnelTexture, riverTexture]) { tex.wrapS = THREE.RepeatWrapping; tex.repeat.x = .65; }
  const windowMat = new THREE.MeshBasicMaterial({ map: tunnelTexture, color: '#d0e7e5' });
  for (const side of [-1, 1]) {
    box(.14, 3.65, 29, shell, side * 3.05, 1.8, 0);
    box(.04, .12, 28, seatMat, side * 2.96, 2.85, 0);
    for (let row = 0; row < 5; row++) {
      const z = -11 + row * 5.5;
      box(.06, 1.28, 3.5, steel, side * 2.95, 2.05, z);
      const window = new THREE.Mesh(new THREE.PlaneGeometry(3.25, 1.07), windowMat); window.rotation.y = -side * Math.PI / 2; window.position.set(side * 2.9, 2.05, z); scene.add(window);
      for (let slot = 0; slot < 3; slot++) {
        const chair = SEATS.find(s => s.id === `${side}:${row}:${slot}`);
        const cushion = box(.74, .17, .98, seatMat, side * 2.35, .62, chair.z); cushion.userData.seat = chair.id; seats.push(cushion); interactables.push(cushion);
        const back = box(.12, .75, .98, seatMat, side * 2.72, 1.02, chair.z); back.rotation.z = side * -.08; back.userData.seat = chair.id; interactables.push(back);
      }
      pole(side * 1.8, z + 1.95);
      if (row < 4) {
        box(.09, 2.65, 1.65, steel, side * 2.94, 1.36, z + 2.75);
        box(.1, .85, 1.25, dark, side * 2.87, 1.95, z + 2.75);
        box(.12, 2.65, .025, shell, side * 2.8, 1.36, z + 2.75);
        box(.3, .015, 1.7, yellow, side * 2.8, .005, z + 2.75);
      }
      const frame = box(.08, .68, 3.35, steel, side * 2.91, 3.18, z);
      const poster = new THREE.Mesh(new THREE.PlaneGeometry(3.2, .59), new THREE.MeshBasicMaterial({ map: adTextures[row % ADS.length] })); poster.rotation.y = -side * Math.PI / 2; poster.position.set(side * 2.85, 3.18, z); scene.add(poster); posters.push(poster); interactables.push(poster);
      if (row === 1 || row === 3) {
        const large = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.3), new THREE.MeshBasicMaterial({ map: adTextures[row] })); large.rotation.y = -side * Math.PI / 2; large.position.set(side * 2.83, 2.05, z); scene.add(large); posters.push(large); interactables.push(large);
      }
    }
    const rail = new THREE.Mesh(new THREE.CylinderGeometry(.035, .035, 26, 8), steel); rail.rotation.x = Math.PI / 2; rail.position.set(side * 1.23, 2.96, 0); scene.add(rail);
    for (let z = -11; z < 12; z += 1.4) { const strap = new THREE.Mesh(strapGeo, steel); strap.position.set(side * 1.23, 2.61, z); scene.add(strap); box(.035, .23, .035, steel, side * 1.23, 2.83, z); }
    box(.17, .025, 27, light, side * 1.9, 3.54, 0);
  }
  for (let z = -13; z <= 13; z += 1.1) box(5.8, .008, .015, steel, 0, -.012, z);
  for (const end of [-1, 1]) {
    for (const side of [-1, 1]) box(2.2, 3.6, .15, shell, side * 1.95, 1.8, end * 14);
    box(1.7, .6, .2, shell, 0, 3.35, end * 14);
    box(1.68, 2.95, .1, dark, 0, 1.48, end * 14.15);
    // A short lit gangway behind the doors gives the connection real depth.
    for (let i = 0; i < 5; i++) { const z = end * (14.25 + i * .23); box(.08, 2.8, .08, steel, -.78, 1.4, z); box(.08, 2.8, .08, steel, .78, 1.4, z); box(1.6, .06, .08, steel, 0, 2.78, z); }
    for (const side of [-1, 1]) {
      const group = new THREE.Group(); group.position.set(side * .39, 0, end * 13.88); scene.add(group);
      const panel = box(.76, 2.68, .1, steel, 0, 1.34, 0, group); panel.userData.carDelta = end < 0 ? 1 : -1; interactables.push(panel);
      const glass = box(.56, 1.05, .12, dark, 0, 1.91, 0, group); glass.userData.carDelta = panel.userData.carDelta; interactables.push(glass);
      doors.push({ group, side, end });
    }
    const canvas = document.createElement('canvas'); canvas.width = 768; canvas.height = 160;
    const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace;
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.7, .56), new THREE.MeshBasicMaterial({ map: tex })); sign.position.set(0, 3.07, end * 13.72); sign.rotation.y = end > 0 ? Math.PI : 0; scene.add(sign); signs.push({ canvas, tex, end });
  }
  scene.add(new THREE.HemisphereLight('#f4fff8', '#617b80', 2.5));
  const sun = new THREE.DirectionalLight('#fff2d6', 2); sun.position.set(-2, 5, 5); scene.add(sun);
  let car = 1, lastAd = -1, lastSign = '', mode = 'tunnel';
  function update(next, time = Date.now()) {
    car = next.trip?.car || 1;
    const adCycle = Math.floor(time / 18000);
    if (lastAd !== car * 1e9 + adCycle) {
      lastAd = car * 1e9 + adCycle;
      posters.forEach((poster, i) => { const index = (i + car - 1 + adCycle) % ADS.length; poster.material.map = adTextures[index]; poster.userData.ad = ADS[index].id; });
    }
    const key = `${car}:${next.progress?.station || next.trip?.from || ''}:${next.trip?.to || ''}`;
    if (key !== lastSign) {
      lastSign = key;
      for (const { canvas, tex, end } of signs) {
        const g = canvas.getContext('2d'); g.fillStyle = '#173e37'; g.fillRect(0, 0, 768, 160); g.textAlign = 'center'; g.fillStyle = '#eddb9a'; g.font = 'bold 49px sans-serif';
        const target = car + (end < 0 ? 1 : -1);
        g.fillText(target < 1 || target > CAR_COUNT ? '열차 끝 · 돌아가 주세요' : `${target}칸으로 · ${CAR_THEMES[target - 1].name}`, 384, 70);
        g.font = '26px sans-serif'; g.fillStyle = '#c9dcc8'; g.fillText(next.progress?.available ? `현재 ${next.progress.station} · 하차역 ${next.trip?.to}` : '연결문을 누르면 옆 칸으로 이동해요', 384, 122); tex.needsUpdate = true;
      }
    }
  }
  function tick(dt, me, animate) {
    if (animate) windowMat.map.offset.x = (windowMat.map.offset.x + dt * (mode === 'river' ? .018 : .09)) % 1;
    for (const door of doors) { const open = Math.abs((me?.z || 0) - door.end * 14) < 6; const target = door.side * (open ? 1.07 : .39); door.group.position.x += (target - door.group.position.x) * Math.min(1, dt * 5); }
  }
  return { floor, interactables, update, tick, setCarColor(color) { seatMat.color.set(color); }, setScenery(value) { mode = value === 'river' ? 'river' : 'tunnel'; windowMat.map = mode === 'river' ? riverTexture : tunnelTexture; windowMat.needsUpdate = true; } };
}

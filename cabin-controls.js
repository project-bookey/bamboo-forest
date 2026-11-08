import { CAR_COUNT, CAR_THEMES, ADS, SEATS, REACTIONS, COAT_COLORS } from './cabin-data.mjs';

export function installCabinControls({ api, applyState, getState, cabin, alert }) {
  const $ = id => document.getElementById(id);
  const host = document.createElement('div'); host.id = 'cabin-controls'; host.hidden = true;
  host.innerHTML = `
    <nav class="car-dock" aria-label="가상 객실 이동">
      <div class="car-heading"><strong id="car-title">1칸 · 첫 인사</strong><span id="car-people">0명</span></div>
      <div class="car-strip" id="car-strip"></div>
      <div class="car-arrows"><button type="button" id="car-prev">‹ 이전 칸</button><span>가상 객실 6칸</span><button type="button" id="car-next">다음 칸 ›</button></div>
    </nav>
    <div class="room-actions" aria-label="객실 활동"><button type="button" id="react-wave">손 인사</button><button type="button" id="react-heart">공감</button><button type="button" id="react-clap">응원</button><button type="button" id="seat-toggle" aria-expanded="false" aria-controls="seat-panel">좌석</button></div>
    <div id="seat-panel" class="cabin-popover" hidden><strong>빈 좌석에 앉아 볼까요?</strong><p>객실의 좌석을 직접 눌러도 앉을 수 있어요.</p><label for="seat-select">좌석 선택</label><select id="seat-select"></select><button type="button" id="seat-confirm" class="primary">앉기</button><button type="button" id="seat-stand" class="secondary">일어서기</button></div>`;
  document.body.append(host);
  const settings = document.createElement('details'); settings.className = 'cabin-settings'; settings.id = 'cabin-settings';
  settings.innerHTML = `<summary>객실 설정</summary><div class="cabin-settings-body"><button type="button" id="train-sound" aria-pressed="false">열차 소리 켜기</button><label for="cabin-scenery">창밖 풍경 · 가상 배경</label><select id="cabin-scenery"><option value="tunnel">도시의 터널</option><option value="river">한강의 저녁</option></select><label class="check-label"><input type="checkbox" id="cabin-motion">창밖 움직임·캐릭터 애니메이션</label><label for="cabin-quality">화면 품질</label><select id="cabin-quality"><option value="auto">자동 조절</option><option value="high">선명하게</option><option value="low">배터리 절약</option></select><label>나의 옷 색상</label><div id="coat-colors" class="coat-colors" role="group" aria-label="옷 색상"></div><button id="browse-ads" type="button">객실 광고 둘러보기</button><p>칸과 풍경은 가상 공간이며 실제 열차 편성·위치를 나타내지 않아요.</p></div>`;
  document.body.append(settings);
  const dialog = document.createElement('dialog'); dialog.id = 'ad-dialog'; dialog.setAttribute('aria-labelledby', 'ad-brand');
  dialog.innerHTML = `<div class="ad-preview" id="ad-preview"><span id="ad-brand"></span><h2 id="ad-title"></h2><p id="ad-subtitle"></p><span class="ad-stamp">메트로챗 공간 광고 · 가상 브랜드</span></div><p id="ad-body"></p><div id="ad-tabs" class="ad-tabs" role="group" aria-label="다른 광고 보기"></div><div class="dialog-actions"><button type="button" id="ad-close" class="primary">객실로 돌아가기</button></div>`;
  document.body.append(dialog);
  const scope = document.createElement('select'); scope.id = 'message-scope'; scope.setAttribute('aria-label', '대화 범위'); scope.innerHTML = '<option value="train">열차 전체</option><option value="car">같은 칸</option>';
  $('composer').prepend(scope);
  scope.onchange = () => { $('message').placeholder = scope.value === 'car' ? '같은 칸의 승객에게 한마디' : '같은 열차의 승객에게 한마디'; };
  let preferences;
  try { preferences = JSON.parse(localStorage.getItem('metro-cabin-preferences')) || {}; } catch { preferences = {}; }
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  $('cabin-motion').checked = typeof preferences.animate === 'boolean' ? preferences.animate : !reduced.matches;
  $('cabin-scenery').value = preferences.scenery === 'river' ? 'river' : 'tunnel';
  $('cabin-quality').value = preferences.version === 2 && ['low', 'high'].includes(preferences.quality) ? preferences.quality : 'auto';
  function configure() {
    const value = { version: 2, animate: $('cabin-motion').checked, scenery: $('cabin-scenery').value, quality: $('cabin-quality').value };
    cabin.configure(value); try { localStorage.setItem('metro-cabin-preferences', JSON.stringify(value)); } catch { /* Private browsing still works. */ }
  }
  for (const id of ['cabin-motion', 'cabin-scenery', 'cabin-quality']) $(id).onchange = configure;
  configure();
  reduced.addEventListener('change', e => { $('cabin-motion').checked = !e.matches; configure(); });
  const carButtons = [];
  for (let number = 1; number <= CAR_COUNT; number++) {
    const button = document.createElement('button'); button.type = 'button'; button.dataset.car = number; button.innerHTML = `<span>${number}</span><small>0</small>`;
    button.onclick = () => changeCar(number); $('car-strip').append(button); carButtons.push(button);
  }
  let transitioning = false, car = 1, seatKey = '', audio = null, previousRoom = '';
  async function changeCar(number) {
    if (!getState()?.trip || transitioning) return;
    if (number < 1 || number > CAR_COUNT) return alert('열차의 끝이에요. 다른 방향으로 이동해 주세요.');
    if (number === car) return;
    transitioning = true; document.body.classList.add('car-transition');
    for (const button of carButtons) button.disabled = true;
    try { applyState(await api('car', { car: number })); $('cabin').focus({ preventScroll: true }); }
    catch (error) { alert(error.message); }
    finally { setTimeout(() => { transitioning = false; document.body.classList.remove('car-transition'); for (const button of carButtons) button.disabled = false; }, 650); }
  }
  $('car-prev').onclick = () => changeCar(car - 1); $('car-next').onclick = () => changeCar(car + 1);
  async function sit(seat) { try { applyState(await api('seat', { seat })); $('seat-panel').hidden = true; $('seat-toggle').setAttribute('aria-expanded', 'false'); } catch (error) { alert(error.message); } }
  $('seat-toggle').onclick = () => { $('seat-panel').hidden = !$('seat-panel').hidden; $('seat-toggle').setAttribute('aria-expanded', String(!$('seat-panel').hidden)); };
  $('seat-confirm').onclick = () => sit($('seat-select').value);
  $('seat-stand').onclick = () => sit(null);
  for (const kind of Object.keys(REACTIONS)) $(`react-${kind}`).onclick = async () => { try { applyState(await api('emote', { kind })); } catch (error) { alert(error.message); } };
  COAT_COLORS.forEach((color, index) => { const button = document.createElement('button'); button.type = 'button'; button.style.backgroundColor = color; button.setAttribute('aria-label', ['크림색', '민트색', '연보라색', '장밋빛', '하늘색'][index]); button.setAttribute('aria-pressed', 'false'); button.onclick = async () => { try { applyState(await api('appearance', { coat: index })); } catch (error) { alert(error.message); } }; $('coat-colors').append(button); });
  function openAd(id) {
    const ad = ADS.find(ad => ad.id === id) || ADS[0];
    $('ad-preview').style.backgroundColor = ad.bg; $('ad-preview').style.color = ad.ink; $('ad-preview').dataset.art = ad.art;
    $('ad-brand').textContent = ad.brand; $('ad-title').textContent = ad.title; $('ad-subtitle').textContent = ad.subtitle; $('ad-body').textContent = ad.body;
    for (const button of $('ad-tabs').children) button.setAttribute('aria-pressed', String(button.dataset.ad === ad.id));
    if (!dialog.open) dialog.showModal();
  }
  for (const ad of ADS) { const button = document.createElement('button'); button.type = 'button'; button.textContent = ad.brand; button.dataset.ad = ad.id; button.onclick = () => openAd(ad.id); $('ad-tabs').append(button); }
  $('ad-close').onclick = () => dialog.close(); $('browse-ads').onclick = () => { settings.open = false; openAd(ADS[(car - 1) % ADS.length].id); };
  $('train-sound').onclick = async () => {
    if (audio) { await audio.close(); audio = null; $('train-sound').setAttribute('aria-pressed', 'false'); $('train-sound').textContent = '열차 소리 켜기'; return; }
    try {
      const context = new (window.AudioContext || window.webkitAudioContext)(); await context.resume();
      const buffer = context.createBuffer(1, context.sampleRate * 3, context.sampleRate), values = buffer.getChannelData(0); let value = 0;
      for (let i = 0; i < values.length; i++) { value = (value + .025 * (Math.random() * 2 - 1)) / 1.025; values[i] = value * 4; }
      const noise = context.createBufferSource(); noise.buffer = buffer; noise.loop = true;
      const filter = context.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 340;
      const gain = context.createGain(); gain.gain.value = .13; noise.connect(filter).connect(gain).connect(context.destination); noise.start();
      const hum = context.createOscillator(), humGain = context.createGain(); hum.frequency.value = 54; humGain.gain.value = .018; hum.connect(humGain).connect(context.destination); hum.start();
      audio = context; $('train-sound').setAttribute('aria-pressed', 'true'); $('train-sound').textContent = '열차 소리 끄기';
    } catch { alert('이 브라우저에서 소리를 재생할 수 없어요.'); }
  };
  document.addEventListener('visibilitychange', () => { if (!audio) return; (document.hidden ? audio.suspend() : audio.resume()).catch(() => {}); });
  addEventListener('pagehide', () => audio?.close());
  function update(state) {
    host.hidden = !state.trip;
    if (!state.trip) { $('seat-panel').hidden = true; if (audio && previousRoom) { audio.close(); audio = null; $('train-sound').setAttribute('aria-pressed', 'false'); $('train-sound').textContent = '열차 소리 켜기'; } }
    previousRoom = state.trip?.room || '';
    car = state.trip?.car || 1;
    const theme = CAR_THEMES[car - 1], me = state.players?.find(p => p.id === state.id);
    $('car-title').textContent = `${car}칸 · ${theme.name}`; $('car-people').textContent = `이 칸 ${state.cars?.[car - 1]?.count || 0}명`;
    carButtons.forEach((button, i) => { const count = state.cars?.[i]?.count || 0; button.querySelector('small').textContent = count; button.setAttribute('aria-pressed', String(i + 1 === car)); button.setAttribute('aria-label', `${i + 1}칸 ${CAR_THEMES[i].name}, ${count}명, 이동`); });
    $('car-prev').disabled = car === 1; $('car-next').disabled = car === CAR_COUNT;
    $('seat-stand').hidden = !me?.seat; $('seat-toggle').textContent = me?.seat ? '앉아 있어요' : '좌석';
    for (const [i, button] of [...$('coat-colors').children].entries()) button.setAttribute('aria-pressed', String(i === me?.coat));
    const occupied = state.players?.filter(p => p.car === car && p.seat).map(p => p.seat) || [];
    const key = `${car}:${occupied.sort().join(',')}`;
    if (key !== seatKey) { seatKey = key; $('seat-select').replaceChildren(...SEATS.filter(s => !occupied.includes(s.id)).map(s => new Option(`${s.x < 0 ? '왼쪽' : '오른쪽'} ${Number(s.id.split(':')[1]) + 1}열 ${Number(s.id.split(':')[2]) + 1}번`, s.id))); $('seat-confirm').disabled = !$('seat-select').options.length; }
  }
  return { update, changeCar, sit, openAd };
}

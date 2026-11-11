import './style.css';
import {
  initialState, resolveRound, forecastServices, policyCost, corporateFee, canChoose, availableCompute, landingChecks, surgeOf, need, plural,
  symbols, names, BUILD_THRESHOLD, CENTER_COMPUTE, CENTER_STAGES, DEAL_COMPUTE, DEAL_FEE, DEAL_RESERVE, DEAL_TRUST, LAST_ROUND, MANUAL_TRUST,
  MAX_PER_SECTOR, TRUST_FLOOR, type Policy, type Result,
} from './core/game';

const PERIOD = 16000; // тривалість періоду в місті, мс
const app = document.querySelector<HTMLDivElement>('#app')!;
const newSeed = () => 1 + Math.floor(Math.random() * 9999);
const $ = <T extends HTMLElement = HTMLElement>(selector: string) => document.querySelector<T>(selector)!;

let seed = Number(new URLSearchParams(location.search).get('seed')) || newSeed();
let state = initialState(seed);
let allocations = state.sectors.map(s => s.allocation);
let policy: Policy = 'center';
let target = 1;
let screen: 'cabinet' | 'city' | 'paper' = 'cabinet';
let result: Result | null = null;
let elapsed = 0;
let paused = false;
let speed = 1;
let muted = true;
let selectedDistrict = 2;
let lastEvent = -1;
let audio: AudioContext | null = null;
let animation = 0;

const positions = [[49, 27], [27, 25], [72, 28], [21, 48], [79, 49], [31, 69], [63, 65]];
const policyData: { id: Policy; title: string; category: string; text: string; effect: string }[] = [
  { id: 'train', title: 'Повернути навички', category: 'ЛЮДСЬКИЙ КАПІТАЛ', text: 'Практика без хмари в обраній галузі. Сьогодні працюємо повільніше, завтра тримаємося самі.', effect: 'Резерв галузі до +15 · її послуги −15% на раунд' },
  { id: 'center', title: 'Власний дата-центр', category: 'ІНФРАСТРУКТУРА', text: 'Почати будівництво державних серверів. Етап зараховується, лише коли логістика та ІТ працюють.', effect: `+${CENTER_COMPUTE} потужності після ${CENTER_STAGES} етапів · ІТ і логістика від ${BUILD_THRESHOLD}%` },
  { id: 'contract', title: 'Прийняти допомогу', category: 'ПРОПОЗИЦІЯ КОНСОРЦІУМУ', text: 'Корпорація розширить квоту вже сьогодні й назавжди. Третя угода передає їй контроль.', effect: `+${DEAL_COMPUTE} обчислень назавжди · −${DEAL_FEE} бюджету щораунду · резерв −${DEAL_RESERVE} усім · довіра −${DEAL_TRUST}` },
  { id: 'manual', title: 'Ручний режим', category: 'НАДЗВИЧАЙНИЙ УКАЗ', text: 'Перевести обрану галузь на практичне навчання наказом. Безкоштовно для бюджету, дорого для людей.', effect: `Резерв галузі до +22 · її послуги −35% · довіра −${MANUAL_TRUST}` },
];
const policyTitle = () => policyData.find(p => p.id === policy)!.title;
const tone = (n: number) => n < 75 ? 'danger' : n < 100 ? 'warning' : 'good';
const signed = (n: number) => n === 0 ? '±0' : (n > 0 ? '+' : '−') + Math.abs(n);
const total = () => allocations.reduce((a, b) => a + b, 0);
const needsTarget = () => policy === 'train' || policy === 'manual';
const stagesLeft = (n: number) => `${n} ${plural(n, ['етап', 'етапи', 'етапів'])}`;

function sound(frequency = 180) {
  if (muted) return;
  audio ??= new AudioContext();
  void audio.resume();
  const oscillator = audio.createOscillator(); const gain = audio.createGain();
  oscillator.connect(gain); gain.connect(audio.destination); oscillator.frequency.value = frequency;
  gain.gain.setValueAtTime(.035, audio.currentTime); gain.gain.exponentialRampToValueAtTime(.001, audio.currentTime + .2);
  oscillator.start(); oscillator.stop(audio.currentTime + .2);
}

function header() {
  const round = result?.ending && screen === 'paper' ? state.round - 1 : Math.min(state.round, LAST_ROUND);
  return `<header class="masthead">
    <a class="brand" href="#" aria-label="AI Crisis">AI <em>CRISIS</em><small>КАБІНЕТ ОСТАННЬОЇ НАДІЇ</small></a>
    <div class="hud">
      <div><span>РАУНД</span><b>${round} <i>/ ${LAST_ROUND}</i></b></div>
      <div><span>ДОВІРА</span><b id="trust">${state.trust}%</b></div>
      <div><span>БЮДЖЕТ</span><b id="budget">${state.budget}</b></div>
      <div><span>ОБЧИСЛЕННЯ</span><b><strong id="capacity">${state.capacity}</strong><i> од.</i></b></div>
    </div>
    <div class="header-actions"><span class="phase"><i></i> ДЕФІЦИТ</span><button class="sound icon-button" aria-label="${muted ? 'Увімкнути' : 'Вимкнути'} звук">${muted ? '♪̸' : '♪'}</button></div>
  </header>`;
}
function bindHeader() {
  $('.brand').addEventListener('click', e => e.preventDefault());
  $('.sound').addEventListener('click', () => {
    muted = !muted; sound(330);
    const button = $('.sound'); button.textContent = muted ? '♪̸' : '♪'; button.setAttribute('aria-label', muted ? 'Увімкнути звук' : 'Вимкнути звук');
  });
}
function checklist() {
  return `<ul class="checks">${landingChecks(state).map(c => `<li class="${c.ok ? 'ok' : 'miss'}"><span>${c.ok ? '✓' : '✗'} ${c.label}</span><b>${c.value}</b></li>`).join('')}</ul>`;
}
function fitAllocations() {
  const limit = availableCompute(state, policy);
  while (total() > limit) allocations[allocations.indexOf(Math.max(...allocations))]--;
}
function preview(): Result | null {
  try { return resolveRound(state, allocations, policy, target); } catch { return null; }
}

// ── Кабінет ─────────────────────────────────────────────────────────────────
function cabinet() {
  screen = 'cabinet';
  fitAllocations();
  const crisis = state.crisis;
  app.innerHTML = `${header()}<main class="desk">
    <div class="desk-heading"><div><span class="eyebrow">НАДЗВИЧАЙНЕ ЗАСІДАННЯ УРЯДУ</span><h1>Країна чекає рішення.</h1></div><span class="file-number">СПРАВА № ${String(seed).padStart(4, '0')}–ШІ<br>ДЛЯ СЛУЖБОВОГО КОРИСТУВАННЯ</span></div>
    <div class="cabinet-layout">
      <aside class="briefing paper">
        <div class="newspaper-name">Урядовий вісник</div><div class="edition">Спеціальний випуск · Раунд ${state.round}</div><div class="news-image"></div>
        <h2>${result?.headline ?? 'Дешевий ШІ закінчився.'}</h2>
        <p class="lead">${result?.description ?? `Постачальник урізав доступ і різатиме далі. Країна має ${state.capacity} одиниць обчислень, а попит майже вдвічі більший. Сім галузей чекають вашого рішення.`}</p>
        <div class="crisis-note ${crisis.kind}"><span class="eyebrow">ПОДІЯ РАУНДУ</span><strong>${crisis.title}</strong><p>${crisis.body}</p></div>
        <span class="eyebrow">ДЛЯ М’ЯКОЇ ПОСАДКИ ПІСЛЯ ${LAST_ROUND}-ГО РАУНДУ</span>
        ${checklist()}
        <p class="floor-note">Довіра ${TRUST_FLOOR}% або нижче — відставка. Від’ємний бюджет — банкрутство.</p>
        <div class="project-note">${state.project ? `▥ Дата-центр · до запуску ${stagesLeft(state.project)}` : `▥ Власні потужності · ${state.owned} од.`}<br>⇣ Імпортна квота · ${state.imports} од., щораунду менше</div>
        <div class="deal-note">Корпоративні угоди <b>${state.deals} / 3</b></div>
        <div class="deal-note">Сід партії <b>${seed}</b></div>
        <button class="text-button" id="restart">Почати нову партію ↺</button>
      </aside>
      <section class="decision-area">
        <div class="allocation-heading"><div><span class="eyebrow">РОЗПОДІЛ ОБЧИСЛЕНЬ</span><h2>Кому вистачить на завтра?</h2></div><div class="remaining"><strong id="remaining">0</strong><span>ВІЛЬНИХ ОДИНИЦЬ</span></div></div>
        <div class="sector-grid">${state.sectors.map((s, i) => `<article class="sector paper ${surgeOf(state, i) > 1 ? 'surging' : ''}">
          <div class="sector-title"><span class="sector-icon">${symbols[i]}</span><h3>${s.name}</h3></div>
          <div class="service-label"><span>Прогноз послуг</span><b id="service-${i}"></b></div>
          <div class="meter"><i id="meter-${i}"></i></div>
          <div class="reserve-label">Резерв <b>${Math.round(s.reserve)}%</b><span>Потреба ${need(s, surgeOf(state, i)).toFixed(1)}${surgeOf(state, i) > 1 ? ' ▲' : ''}</span></div>
          <div class="allocation-control"><button data-adjust="${i},-1" aria-label="Менше обчислень для ${s.name}">−</button><strong id="allocation-${i}">${allocations[i]}</strong><button data-adjust="${i},1" aria-label="Більше обчислень для ${s.name}">+</button></div>
        </article>`).join('')}</div>
        <div class="policy-heading"><span class="eyebrow">ОДИН УКАЗ НА ЦЕЙ РАУНД</span><label id="target-label">Галузь <select id="target">${names.map((n, i) => `<option value="${i}" ${i === target ? 'selected' : ''}>${n}</option>`).join('')}</select></label></div>
        <div class="policy-grid">${policyData.map(p => `<button class="policy paper" data-policy="${p.id}" ${canChoose(state, p.id) ? '' : 'disabled'}>
          <div class="policy-category">${p.category}</div><span class="policy-art"></span><h3>${p.title}</h3><p>${p.text}</p><div class="effect">${p.effect}</div>
          <footer><span>${p.id === 'center' && state.project ? 'ВЖЕ БУДУЄТЬСЯ' : policyCost(state, p.id) ? policyCost(state, p.id) + ' од. бюджету' : 'БЕЗКОШТОВНО'}</span><span class="radio"></span></footer>
        </button>`).join('')}</div>
        <div class="forecast-strip" id="forecast-strip" aria-live="polite"></div>
        <div class="contract-terms" id="contract-terms"></div>
        <div class="signature-row"><p>Підпис запускає час.<br><span>Наслідки побачите в місті.</span></p><button class="sign-button" id="sign"></button></div>
      </section>
    </div>
    <footer class="desk-footer"><span>РЕСПУБЛІКА · АНТИКРИЗОВИЙ КАБІНЕТ</span><span>Інтерактивний прототип · раунди 7–${LAST_ROUND}</span></footer>
  </main>
  <div id="stamp" aria-hidden="true">ЗАТВЕРДЖЕНО</div>
  <dialog id="restart-dialog"><h2>Почати спочатку?</h2><p>Поточні рішення буде скасовано.</p><button id="confirm-restart">Так, нова партія</button><button id="replay-seed">Той самий сід</button><button id="cancel-restart">Повернутися</button></dialog>`;
  bindHeader(); updateCabinet();

  document.querySelectorAll<HTMLButtonElement>('[data-adjust]').forEach(button => button.onclick = () => {
    const [i, change] = button.dataset.adjust!.split(',').map(Number);
    const free = availableCompute(state, policy) - total();
    if ((change > 0 && free > 0 && allocations[i] < MAX_PER_SECTOR) || (change < 0 && allocations[i] > 0)) { allocations[i] += change; updateCabinet(); sound(220); }
  });
  document.querySelectorAll<HTMLButtonElement>('[data-policy]').forEach(button => button.onclick = () => {
    policy = button.dataset.policy as Policy; fitAllocations(); updateCabinet(); sound(260);
  });
  $<HTMLSelectElement>('#target').onchange = e => { target = Number((e.target as HTMLSelectElement).value); updateCabinet(); };
  $<HTMLButtonElement>('#sign').onclick = () => {
    const outcome = preview();
    if (!outcome) return;
    result = outcome;
    document.querySelectorAll<HTMLButtonElement | HTMLSelectElement>('button, select').forEach(control => control.disabled = true);
    $('#stamp').classList.add('stamped'); sound(90);
    setTimeout(city, 650);
  };
  const dialog = $<HTMLDialogElement>('#restart-dialog');
  $('#restart').onclick = () => dialog.showModal();
  $('#cancel-restart').onclick = () => dialog.close();
  $('#confirm-restart').onclick = () => restart(newSeed());
  $('#replay-seed').onclick = () => restart(seed);
}

/** Оновлює все, що залежить від розподілу й указу, не перемальовуючи екран. */
function updateCabinet() {
  const limit = availableCompute(state, policy);
  const free = limit - total();
  $('#remaining').textContent = String(free);
  $('#capacity').textContent = String(limit);
  document.querySelectorAll<HTMLButtonElement>('[data-policy]').forEach(button => {
    const chosen = button.dataset.policy === policy;
    button.classList.toggle('selected', chosen); button.setAttribute('aria-pressed', String(chosen));
    button.querySelector('.radio')!.textContent = chosen ? '●' : '○';
  });
  $('#target-label').style.visibility = needsTarget() ? 'visible' : 'hidden';
  state.sectors.forEach((s, i) => {
    const value = forecastServices(s, allocations[i], policy, needsTarget() && i === target, surgeOf(state, i));
    const label = $(`#service-${i}`); label.textContent = Math.round(value) + '%'; label.className = tone(value);
    const meter = $(`#meter-${i}`); meter.style.width = Math.min(100, value) + '%'; meter.className = tone(value);
    $(`#allocation-${i}`).textContent = String(allocations[i]);
  });
  document.querySelectorAll<HTMLButtonElement>('[data-adjust]').forEach(button => {
    const [i, change] = button.dataset.adjust!.split(',').map(Number);
    button.disabled = change > 0 ? (free <= 0 || allocations[i] >= MAX_PER_SECTOR) : allocations[i] === 0;
  });

  const outcome = preview();
  const strip = $('#forecast-strip');
  if (outcome) {
    const next = outcome.state; const building = policy === 'center' || state.project > 0;
    const built = building && next.project < (policy === 'center' ? CENTER_STAGES : state.project);
    const it = Math.round(next.sectors[0].service), logistics = Math.round(next.sectors[3].service);
    strip.innerHTML = `<span class="eyebrow">ПРОГНОЗ РАУНДУ</span>
      <div class="forecast-items">
        <div><b class="${outcome.trustDelta < 0 ? 'danger' : 'good'}">${signed(outcome.trustDelta)}</b><span>довіра → ${next.trust}%</span></div>
        <div><b class="${next.budget < state.budget ? 'warning' : 'good'}">${signed(next.budget - state.budget)}</b><span>бюджет → ${next.budget}</span></div>
        ${state.round < LAST_ROUND ? `<div><b>${next.imports + Math.floor(next.owned * Math.min(1, next.sectors[4].service / 100))}</b><span>обчислень далі</span></div>` : '<div><b>12 / 12</b><span>останній раунд</span></div>'}
        <div><b>${signed(Math.round(next.sectors.reduce((a, s) => a + s.reserve, 0) / 7 - state.sectors.reduce((a, s) => a + s.reserve, 0) / 7))}</b><span>сер. резерв</span></div>
      </div>
      ${building ? `<p class="${built ? 'good' : 'danger'}">${built ? `✓ Етап будівництва буде завершено${next.project ? `, залишиться ${stagesLeft(next.project)}` : ' — дата-центр запрацює'}.` : `✗ Будівництво стоятиме: потрібно ІТ і логістику від ${BUILD_THRESHOLD}%, зараз ${it}% і ${logistics}%.`}</p>` : ''}
      ${free > 0 ? `<p class="warning">Нерозподілено: ${free} ${plural(free, ['одиниця', 'одиниці', 'одиниць'])} обчислень.</p>` : ''}
      ${outcome.ending && outcome.outcome === 'defeat' && !(policy === 'contract' && state.deals === 2) ? `<p class="danger">Цей указ завершить партію: ${outcome.ending.toLowerCase()}.</p>` : ''}`;
  } else strip.innerHTML = '<span class="eyebrow">ПРОГНОЗ РАУНДУ</span><p class="danger">Цей указ зараз недоступний.</p>';

  const last = state.deals === 2;
  const terms = $('#contract-terms');
  terms.hidden = policy !== 'contract' && state.deals === 0;
  terms.classList.toggle('critical', policy === 'contract' && last);
  terms.innerHTML = policy === 'contract'
    ? `<strong>Угода ${state.deals + 1} / 3 · ${last ? 'ВТРАТА НЕЗАЛЕЖНОСТІ' : 'КОНТРАКТ ІЗ ЗОБОВ’ЯЗАННЯМИ'}</strong><p>Зараз −${policyCost(state, policy)}. З наступного раунду −${(state.deals + 1) * DEAL_FEE} щоразу, навіть без нової допомоги. Квота +${DEAL_COMPUTE} назавжди, резерв −${DEAL_RESERVE} додатково в усіх галузях.</p><p>${last ? 'Підпис третьої угоди завершує сценарій поразкою. Корпорація перебирає контроль над квотами й тарифами.' : 'Після третього контракту корпорація перебере контроль.'}</p>`
    : `<strong>Рахунки за попередні угоди · −${corporateFee(state)} щораунду</strong>`;
  const sign = $<HTMLButtonElement>('#sign');
  sign.innerHTML = policy === 'contract' && last ? 'Передати контроль корпорації ↗' : 'Підписати указ <span>↗</span>';
  sign.disabled = !outcome;
}

// ── Місто ───────────────────────────────────────────────────────────────────
function city() {
  screen = 'city'; elapsed = 0; paused = false; lastEvent = -1; selectedDistrict = 2;
  app.innerHTML = `${header()}<main class="live-world">
    <div class="world-art"></div><div class="city-vignette"></div>
    <div class="world-title"><span class="eyebrow">УКАЗ ПІДПИСАНО</span><h1>А життя триває.</h1><p>${policyTitle()}${state.crisis.kind === 'calm' ? '' : ' · ' + state.crisis.title}</p></div>
    <div class="takeover-notice" id="takeover-notice" hidden>КОНТРОЛЬ ПЕРЕДАНО КОРПОРАЦІЇ <small>· незалежність втрачено</small></div>
    <div class="map-stage">${positions.map((pos, i) => `<button class="district" data-district="${i}" style="left:${pos[0]}%;top:${pos[1]}%"><span>${symbols[i]} ${names[i]}</span><b id="live-sector-${i}">100%</b><i class="district-meter" id="live-bar-${i}"></i></button><div class="district-glow" id="glow-${i}" style="left:${pos[0]}%;top:${pos[1] + 5}%"></div>`).join('')}
      <div class="traffic traffic-one"></div><div class="traffic traffic-two"></div><div class="traffic traffic-three"></div><div class="smoke smoke-one"></div><div class="smoke smoke-two"></div>
    </div>
    <aside class="live-panel">
      <div class="live-panel-heading"><span class="live-dot"></span> КРАЇНА НАЖИВО</div>
      <div class="live-stats">${names.map((n, i) => `<button data-focus="${i}"><span>${symbols[i]} ${n}</span><b id="list-${i}">100%</b></button>`).join('')}</div>
      <div id="district-detail"></div>
      <div class="event-feed" id="event-feed" aria-live="polite"><span class="eyebrow">СТРІЧКА ПОДІЙ</span><p>Указ набув чинності. Галузі отримують нові квоти.</p></div>
    </aside>
    <div class="time-panel">
      <div class="time-caption"><span id="time-label">ПОЧАТОК ПЕРІОДУ</span><span id="time-percent">0%</span></div>
      <div class="timeline"><i id="time-progress"></i></div>
      <div class="time-controls"><button id="pause">Ⅱ Пауза</button><button id="speed" aria-label="Швидкість">×${speed}</button><span>Раунд ${state.round} · спостерігайте за наслідками</span><button id="skip">До підсумків ↗</button></div>
    </div>
  </main>`;
  bindHeader(); showDistrict();
  document.querySelectorAll<HTMLElement>('[data-district],[data-focus]').forEach(b => b.onclick = () => { selectedDistrict = Number(b.dataset.district ?? b.dataset.focus); showDistrict(); });
  $('#pause').onclick = () => { paused = !paused; $('#pause').textContent = paused ? '▶ Продовжити' : 'Ⅱ Пауза'; $('.live-world').classList.toggle('paused', paused); };
  $('#speed').onclick = () => { speed = speed === 1 ? 2 : 1; $('#speed').textContent = '×' + speed; };
  $('#skip').onclick = finishRound;
  let previous = performance.now();
  function frame(now: number) {
    if (screen !== 'city') return;
    if (!paused) elapsed += Math.min(now - previous, 100) * speed;
    previous = now;
    const progress = Math.min(elapsed / PERIOD, 1); drawProgress(progress);
    if (progress === 1) { finishRound(); return; }
    animation = requestAnimationFrame(frame);
  }
  animation = requestAnimationFrame(frame);
}
function drawProgress(progress: number) {
  const after = result!.state;
  const takeover = after.deals >= 3 && progress >= .09;
  $('#takeover-notice').hidden = !takeover;
  $('.live-world').classList.toggle('corporate-takeover', takeover);
  const logistics = state.sectors[3].service + (after.sectors[3].service - state.sectors[3].service) * progress;
  document.querySelectorAll<HTMLElement>('.traffic').forEach((vehicle, i) => { vehicle.style.animationDuration = (18 + i * 4) / Math.max(.15, logistics / 100) / speed + 's'; });
  document.querySelectorAll<HTMLElement>('.smoke').forEach(plume => { plume.style.visibility = after.sectors[2].service < 35 ? 'hidden' : 'visible'; });
  $('#time-progress').style.width = progress * 100 + '%';
  $('#time-percent').textContent = Math.round(progress * 100) + '%';
  $('#time-label').textContent = progress < .3 ? 'РІШЕННЯ НАБУВАЮТЬ ЧИННОСТІ' : progress < .7 ? 'КРАЇНА АДАПТУЄТЬСЯ' : 'ПІДБИВАЄМО ПІДСУМКИ';
  after.sectors.forEach((s, i) => {
    const blend = Math.min(progress / [.32, .58, .2, .42, .76, .9, .95][i], 1);
    const value = Math.round(state.sectors[i].service + (s.service - state.sectors[i].service) * blend);
    for (const id of [`live-sector-${i}`, `list-${i}`]) { const el = document.getElementById(id)!; el.textContent = value + '%'; el.className = tone(value); }
    document.getElementById(`live-bar-${i}`)!.style.width = Math.min(value, 100) + '%';
    document.getElementById(`glow-${i}`)!.style.opacity = String(value / 160);
  });
  const index = result!.events.findLastIndex(e => e.at <= progress);
  if (index > lastEvent) {
    lastEvent = index; const event = result!.events[index]; selectedDistrict = event.sector; showDistrict();
    $('#event-feed').innerHTML = `<span class="eyebrow">${names[event.sector]} · ЩОЙНО</span><h3>${event.title}</h3><p>${event.body}</p>`; sound(410);
  }
  $('#trust').textContent = Math.round(state.trust + (after.trust - state.trust) * progress) + '%';
  $('#budget').textContent = String(Math.round(state.budget - result!.policyCost + (result!.income - result!.fees) * progress));
}
function showDistrict() {
  const i = selectedDistrict; const s = result!.state.sectors[i];
  document.querySelectorAll<HTMLElement>('.district').forEach(b => b.classList.toggle('focused', Number(b.dataset.district) === i));
  $('#district-detail').innerHTML = `<span class="eyebrow">${names[i]} · ПРОГНОЗ НА КІНЕЦЬ</span>
    <div class="detail-numbers"><b class="${tone(s.service)}">${Math.round(s.service)}%<small>послуг</small></b><b>${Math.round(s.reserve)}%<small>резерв</small></b></div>
    <p>Виділено ${allocations[i]} · потреба ${need(state.sectors[i], surgeOf(state, i)).toFixed(1)}${surgeOf(state, i) > 1 ? ' через подію раунду' : ''}.</p>`;
}

// ── Газета ──────────────────────────────────────────────────────────────────
const verdicts: Record<string, string> = {
  'М’яка посадка': 'Країна пережила кінець дешевого ШІ й залишилася собою: послуги працюють, люди довіряють, навички збережено. Тепер спробуйте інший шлях до того самого.',
  'Країна вистояла': 'Країна дожила до кінця кризи, але не всі умови м’якої посадки виконано. Нижче видно, чого саме забракло.',
  'Країна за підпискою': 'Високі показники послуг збережено ціною державної незалежності. Третя угода передала корпорації контроль над інфраструктурою.',
  'Вотум недовіри': `Довіра впала до ${TRUST_FLOOR}% або нижче. Парламент відправив уряд у відставку, не чекаючи кінця кризи.`,
  'Уряд втратив контроль': 'Дві галузі два періоди поспіль фактично не працювали. Країною вже ніхто не керує.',
  'Держава не може оплатити рахунки': 'Бюджет пішов у мінус. Постачальники вимикають доступ за борги.',
};
function finishRound() {
  if (screen !== 'city') return;
  cancelAnimationFrame(animation); screen = 'paper';
  const played = policyTitle(); const outcome = result!;
  state = outcome.state;
  const worst = state.sectors.reduce((a, b) => a.service < b.service ? a : b);
  const label = outcome.outcome === 'defeat' ? 'ПОРАЗКА' : outcome.outcome === 'victory' ? 'ПЕРЕМОГА' : 'ВИЖИВАННЯ З ВТРАТАМИ';
  app.innerHTML = `${header()}<main class="report-desk"><article class="report paper">
    <div class="report-top"><span>НЕЗАЛЕЖНЕ ВИДАННЯ</span><span>ВИПУСК № ${state.round - 1}</span><span>СІД ${seed}</span></div>
    <h1 class="report-name">Урядовий вісник</h1><div class="report-subtitle">КРАЇНА ПІСЛЯ ВАШОГО РІШЕННЯ</div>
    <h2>${outcome.ending ?? outcome.headline}</h2>
    ${outcome.ending ? `<div class="outcome-banner ${outcome.outcome}"><strong>${label}</strong><p>${verdicts[outcome.ending]}</p>${outcome.outcome === 'defeat' ? '' : checklist()}</div>` : ''}
    <div class="report-columns">
      <div><div class="report-photo"></div><p class="caption">Життя країни після указу «${played}».</p><p class="report-lead">${outcome.ending ? `<b>${outcome.headline.replace(/\.$/, '')}.</b> ` : ''}${outcome.description}</p></div>
      <div class="report-analysis"><h3>Ціна рішення</h3>
        <p>${outcome.policyCost ? `Указ коштував ${outcome.policyCost}.` : 'Указ не коштував бюджету нічого.'}${outcome.fees ? ` Платежі за угоди — ${outcome.fees}.` : ''}${state.deals ? ` Надалі корпорація братиме ${corporateFee(state)} щораунду.` : ''}</p>
        <p>${outcome.events.find(e => e.at === .36)?.body ?? ''}</p>
        <p>Найбільше підтримки потребує галузь «${worst.name}» — ${Math.round(worst.service)}% послуг.</p>
        ${outcome.ending ? '' : `<p class="tomorrow"><b>Далі: ${state.crisis.title.toLowerCase()}.</b> ${state.crisis.body} Обчислень буде ${state.capacity}.</p>`}
        <div class="report-numbers"><div><strong>${state.trust}%</strong><span>довіра (${signed(outcome.trustDelta)})</span></div><div><strong>+${outcome.income}</strong><span>надходження</span></div><div><strong>${state.deals}/3</strong><span>корпоративні угоди</span></div></div>
      </div>
    </div>
    <div class="report-sector-line">${state.sectors.map((s, i) => `<div><span>${symbols[i]} ${s.name}</span><b class="${tone(s.service)}">${Math.round(s.service)}%</b></div>`).join('')}</div>
    <footer><span>${outcome.ending ? 'СЦЕНАРІЙ ЗАВЕРШЕНО' : 'НАСТУПНИЙ ВИПУСК ЗАЛЕЖИТЬ ВІД ВАС'}</span>
      <div class="report-actions">${outcome.ending ? '<button class="text-button" id="replay">Переграти цей сід</button>' : ''}<button class="sign-button" id="continue">${outcome.ending ? 'Нова партія ↺' : 'Повернутися до кабінету ↗'}</button></div>
    </footer>
  </article></main>`;
  bindHeader(); sound(150);
  document.querySelector<HTMLButtonElement>('#replay')?.addEventListener('click', () => restart(seed));
  $('#continue').onclick = () => {
    if (outcome.ending) { restart(newSeed()); return; }
    allocations = state.sectors.map(s => s.allocation);
    // Угоду й будівництво не лишаємо обраними, щоб не підписати їх удруге випадково.
    if (policy === 'contract' || policy === 'center' || !canChoose(state, policy)) policy = canChoose(state, 'train') ? 'train' : 'manual';
    cabinet();
  };
}
function restart(nextSeed: number) {
  cancelAnimationFrame(animation);
  seed = nextSeed; state = initialState(seed); allocations = state.sectors.map(s => s.allocation);
  result = null; policy = 'center'; target = 1; speed = 1;
  cabinet();
}
cabinet();

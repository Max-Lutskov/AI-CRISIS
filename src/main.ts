import './style.css';
import { audio } from './audio';
import {
  initialState, resolveRound, forecastFor, policyCost, corporateFee, canChoose, availableCompute, landingChecks, surgeOf, need, totalNeed, plural,
  phaseOf, yearOf, policiesFor, needsTarget, chronicle, averageReserve, averageAutomation, weakestReserve, centerUpkeep, prepTrust,
  symbols, names, AUTOMATE_BUDGET, AUTOMATE_GAIN, AUTOMATE_TRUST, BUILD_THRESHOLD, CENTER_COMPUTE, CENTER_STAGES, CENTER_STEP, CENTER_UPKEEP, COLLAPSE_LEVEL, DEAL_COMPUTE, DEAL_FEE, DEAL_RESERVE, DEAL_TRUST,
  ELECTION, FAILURE_LEVEL, LAST_ROUND, MANUAL_TRUST, MAX_PER_SECTOR, PREP_TRUST, REGULATE_TRUST, SHOCK_ROUND, START_YEAR, SURVIVED, TRUST_FLOOR, TRUST_WEIGHTS, VICTORY, WIN,
  type Policy, type Result, type State,
} from './core/game';

const PERIOD = 16000; // тривалість року в місті, мс
const LAST_YEAR = yearOf(LAST_ROUND);
const ELECTION_YEAR = yearOf(SHOCK_ROUND - 1);
const app = document.querySelector<HTMLDivElement>('#app')!;
const newSeed = () => 1 + Math.floor(Math.random() * 9999);
const $ = <T extends HTMLElement = HTMLElement>(selector: string) => document.querySelector<T>(selector)!;

let seed = Number(new URLSearchParams(location.search).get('seed')) || newSeed();
let state = initialState(seed);
let allocations = state.sectors.map(s => s.allocation);
let policy: Policy = 'automate';
let target = 2;
let screen: 'intro' | 'cabinet' | 'city' | 'paper' = 'intro';
/** Крок кабінету на вузьких екранах: 0 — указ, 1 — галузі, 2 — підпис. Указ перший, бо він змінює кількість обчислень. */
let step = 0;
let result: Result | null = null;
let elapsed = 0;
let paused = false;
let speed = 1;
let menuOpen = false;
/** Чи гравець уже почав партію в цьому сеансі. */
let begun = false;
let selectedDistrict = 2;
let lastEvent = -1;
let animation = 0;

const positions = [[49, 27], [27, 25], [72, 28], [21, 48], [79, 49], [31, 69], [63, 65]];
const sectorArt = ['it', 'education', 'industry', 'logistics', 'energy', 'hospitals', 'government'];
type Effect = [label: string, value: string, tone: 'good' | 'bad' | 'plain'];
const policyData: Record<Policy, { title: string; art: string; text: string; effects: Effect[] }> = {
  automate: { title: 'ШІ-прорив у галузі', art: 'contract', text: 'Передати ШІ ще чверть роботи в обраній галузі. Дешевше, швидше, і люди задоволені. Поки ШІ дешевий.',
    effects: [['ШІ робить у галузі', `+${AUTOMATE_GAIN}%`, 'plain'], ['Бюджет', `+${AUTOMATE_BUDGET}`, 'good'], ['Довіра', `+${AUTOMATE_TRUST}`, 'good'], ['Навички там', 'тануть швидше', 'bad']] },
  regulate: { title: 'Правило двох ключів', art: 'manual', text: 'Цього року кожне рішення ШІ перевіряє людина. Залежність росте вдвічі повільніше, але все довше й дорожче.',
    effects: [['Ріст ШІ цього року', 'удвічі менший', 'good'], ['Втрата навичок', 'удвічі менша', 'good'], ['Довіра', `−${REGULATE_TRUST}`, 'bad']] },
  train: { title: 'Повернути навички', art: 'train', text: 'Практика без ШІ в обраній галузі. Цього року працюємо повільніше, зате люди пам’ятатимуть, як це робиться.',
    effects: [['Навички галузі', 'до +15', 'good'], ['Послуги галузі', '−15%', 'bad']] },
  center: { title: 'Власний дата-центр', art: 'center', text: `Будівництво державних серверів. Етап зараховується, лише коли логістика та ІТ працюють. Кожен наступний дата-центр дорожчий на ${CENTER_STEP}.`,
    effects: [['Свої обчислення', `+${CENTER_COMPUTE}`, 'good'], ['Будівництво', `${CENTER_STAGES} роки`, 'plain'], ['ІТ і логістика', `від ${BUILD_THRESHOLD}%`, 'plain'], ['Утримання щороку', `−${CENTER_UPKEEP}`, 'bad']] },
  contract: { title: 'Прийняти допомогу', art: 'contract', text: 'Корпорація розширить квоту вже цього року й назавжди. З кожною угодою її голос у державі важить більше.',
    effects: [['Квота назавжди', `+${DEAL_COMPUTE}`, 'good'], ['Бюджет щороку', `−${DEAL_FEE}`, 'bad'], ['Навички всіх', `−${DEAL_RESERVE}`, 'bad'], ['Довіра', `−${DEAL_TRUST}`, 'bad']] },
  manual: { title: 'Ручний режим', art: 'manual', text: 'Перевести обрану галузь на роботу без ШІ наказом. Безкоштовно для бюджету, дорого для людей.',
    effects: [['Навички галузі', 'до +22', 'good'], ['Послуги галузі', '−35%', 'bad'], ['Довіра', `−${MANUAL_TRUST}`, 'bad']] },
};
const boom = () => phaseOf(state) === 'boom';
const policyTitle = () => policyData[policy].title;
const tone = (n: number) => n < 75 ? 'danger' : n < 100 ? 'warning' : 'good';
const trustTone = (n: number) => n < 35 ? 'danger' : n < WIN.trust ? 'warning' : 'good';
const signed = (n: number) => n === 0 ? '±0' : (n > 0 ? '+' : '−') + Math.abs(n);
const total = () => allocations.reduce((a, b) => a + b, 0);
const targeted = () => needsTarget(policy);
const stagesLeft = (n: number) => `${n} ${plural(n, ['етап', 'етапи', 'етапів'])}`;
const comma = (n: number) => n.toFixed(1).replace('.', ',');
const pct = (n: number) => Math.round(n) + '%';
const sentence = (text: string) => /[.?!]$/.test(text) ? text : text + '.';

/** Музика й атмосфера під поточний екран. Напруга росте, коли падає довіра й зупиняються галузі. */
function tune() {
  const now = screen === 'city' && result ? result.state : state;
  const stress = phaseOf(now) === 'boom' ? 0 : (WIN.trust + 15 - now.trust) / 40 + now.sectors.filter(s => s.service < WIN.service).length * .15;
  audio.scene(menuOpen || screen === 'intro' ? 'menu' : phaseOf(now), menuOpen ? 'none' : screen === 'city' ? 'city' : screen === 'cabinet' ? 'office' : 'none', stress);
}

function header() {
  const round = result?.ending && screen === 'paper' ? state.round - 1 : Math.min(state.round, LAST_ROUND);
  const compute = boom() ? '<div><span>Обчислення</span><b class="chip">без ліміту</b></div>'
    : screen === 'cabinet' ? `<div><span>Вільні обчислення</span><b class="chip" id="compute-chip"><strong id="remaining">0</strong><i>/</i><strong id="capacity">${state.capacity}</strong></b></div>`
    : `<div><span>Обчислення</span><b class="chip"><strong id="capacity">${state.capacity}</strong></b></div>`;
  return `<header class="masthead">
    <a class="brand" href="#" aria-label="AI Crisis"><img src="assets/ui/emblem.webp" alt=""><span>AI CRISIS<small>Кабінет останньої надії</small></span></a>
    <div class="hud">
      <div><span>Рік</span><b>${yearOf(round)}<i class="of"> · ${round}/${LAST_ROUND}</i></b></div>
      <div><span>Довіра</span><b class="chip ${trustTone(state.trust)}" id="trust">${state.trust}%</b></div>
      <div><span>Бюджет</span><b class="chip" id="budget">${state.budget}</b></div>
      ${compute}
    </div>
    <div class="header-actions">
      <span class="phase ${phaseOf(state)}">Фаза: ${boom() ? 'БУМ' : 'ДЕФІЦИТ'}</span>
      ${screen === 'cabinet' ? '<button class="brief-toggle" id="brief-toggle">Газета</button>' : ''}
      <button class="menu-button icon-button" aria-label="Меню">☰</button>
    </div>
  </header>`;
}
function bindHeader() {
  $('.brand').addEventListener('click', e => { e.preventDefault(); openMenu(); });
  $('.menu-button').addEventListener('click', () => openMenu());
}
function checklist() {
  return `<ul class="checks">${landingChecks(state).map(c => `<li class="${c.ok ? 'ok' : 'miss'}"><span>${c.ok ? '✓' : '✗'} ${c.label}</span><b>${c.value}</b></li>`).join('')}</ul>`;
}
const goalNote = () => boom()
  ? `У ${ELECTION_YEAR}-му вибори: з довірою нижче ${ELECTION}% вас не переоберуть.`
  : `Довіра ${TRUST_FLOOR}% або нижче — відставка. Від’ємний бюджет — банкрутство.`;
function fitAllocations() {
  if (boom()) return;
  const limit = availableCompute(state, policy);
  while (total() > limit) allocations[allocations.indexOf(Math.max(...allocations))]--;
}
function preview(): Result | null {
  try { return resolveRound(state, boom() ? [] : allocations, policy, target); } catch { return null; }
}

// ── Вступ ───────────────────────────────────────────────────────────────────
const slides = [
  { year: '2022', title: 'З’явився штучний інтелект', art: 'news-photo', text: 'Програми навчилися писати, рахувати, планувати й радити не гірше за фахівця. Доступ коштує копійки: компанії-постачальники роздають його майже задарма, аби всі звикли.' },
  { year: String(START_YEAR), title: 'Ви очолюєте уряд', art: 'sector-government', text: 'Сім галузей країни тримаються на людях, які знають свою справу. ШІ обіцяє робити те саме швидше й дешевше. Щороку ви підписуєте один указ і дивитеся, що з цього вийшло.' },
  { year: 'Правила', title: 'Два числа кожної галузі', art: 'policy-train', text: '<b>ШІ робить</b> — яку частку роботи передано машині. Що вона більша, то кращі послуги, але то більше обчислень потрібно. <b>Навички</b> — скільки галузь потягне сама, якщо ШІ вимкнуть. Що більше роботи робить ШІ, то швидше люди забувають, як робити її самим.' },
  { year: `Мета · ${LAST_YEAR}`, title: 'Довести країну до кінця', art: 'policy-center', text: `Ніхто не знає, скільки триватиме дешевий ШІ. До ${LAST_YEAR} року треба зберегти три речі: <b>люди довіряють уряду</b> (від ${WIN.trust}%), <b>кожна галузь працює</b> (від ${WIN.service}%), <b>у кожній галузі вміють без ШІ</b> (навички від ${WIN.reserve}%). У ${ELECTION_YEAR}-му вибори: з довірою нижче ${ELECTION}% вас не переоберуть.` },
];
function intro(index = 0) {
  screen = 'intro'; tune();
  const slide = slides[index]; const last = index === slides.length - 1;
  app.innerHTML = `<main class="intro"><article class="intro-card paper">
    <div class="intro-art" style="background-image:url(assets/ui/${slide.art}.webp)"></div>
    <div class="intro-text">
      <span class="intro-year">${slide.year}</span>
      <h1>${slide.title}</h1>
      <p>${slide.text}</p>
      <div class="intro-actions">
        <span class="intro-dots">${slides.map((_, i) => `<i class="${i === index ? 'on' : ''}"></i>`).join('')}</span>
        ${last ? '' : '<button class="text-button" id="intro-skip">Пропустити</button>'}
        <button class="sign-button" id="intro-next">${!last ? 'Далі →' : state.round === 1 ? `Почати ${START_YEAR} рік` : 'До кабінету'}</button>
      </div>
    </div>
  </article></main>`;
  $('#intro-next').onclick = () => { audio.play('paper'); if (last) cabinet(); else intro(index + 1); };
  document.querySelector<HTMLElement>('#intro-skip')?.addEventListener('click', cabinet);
}

// ── Кабінет ─────────────────────────────────────────────────────────────────
function cabinet() {
  screen = 'cabinet'; step = 0; tune();
  fitAllocations();
  const crisis = state.crisis; const isBoom = boom(); const year = yearOf(state.round);
  const story = chronicle[state.round];
  const cost = (id: Policy) => id === 'center' && state.project ? 'Вже будується' : policyCost(state, id) ? `Бюджет: ${policyCost(state, id)}` : 'Безкоштовно';
  const showCrisis = !isBoom && state.round > SHOCK_ROUND;
  app.innerHTML = `${header()}<main class="desk ${isBoom ? 'boom' : 'deficit'}" data-step="0">
    <footer class="dock">
      <nav class="steps" aria-label="Кроки року">
        <button data-step-to="0"><i>1</i><span>Указ</span><em id="tab-policy"></em></button>
        <button data-step-to="1"><i>2</i><span>Галузі</span><em id="tab-free"></em></button>
        <button data-step-to="2"><i>3</i><span>Підпис</span><em id="tab-trust"></em></button>
      </nav>
      <button class="dock-action" id="dock-action"></button>
    </footer>

    <section class="pane pane-sectors">
      <h2 class="pane-title">${isBoom ? 'Сім галузей країни' : 'Кому вистачить обчислень?'}</h2>
      <div class="sector-grid">${state.sectors.map((s, i) => `<article class="sector paper ${surgeOf(state, i) > 1 ? 'surging' : ''}">
          <h3>${s.name}</h3>
          <div class="sector-art" style="background-image:url(assets/ui/sector-${sectorArt[i]}.webp)"></div>
          <div class="service-label"><span>Послуги</span><b id="service-${i}"></b></div>
          <div class="meter"><i id="meter-${i}"></i></div>
          <div class="reserve-label"><span>Навички <b>${pct(s.reserve)}</b></span><span class="need">${isBoom ? `ШІ робить <b>${pct(s.automation)}</b>` : `Потреба ${comma(need(s, surgeOf(state, i)))}${surgeOf(state, i) > 1 ? ' ▲' : ''}`}</span></div>
          ${isBoom ? '' : `<div class="allocation-control"><button data-adjust="${i},-1" aria-label="Менше обчислень для ${s.name}">−</button><strong id="allocation-${i}">${allocations[i]}</strong><button data-adjust="${i},1" aria-label="Більше обчислень для ${s.name}">+</button></div>`}
        </article>`).join('')}
        <aside class="sector-side">
          <button class="crisis-chip ${showCrisis ? crisis.kind : ''}" data-open-brief><span class="eyebrow">${showCrisis ? 'Подія року' : `${year} рік`}</span><strong>${showCrisis ? crisis.title : story?.headline ?? 'Газета'}</strong></button>
          <button class="next-step" data-step-to="2">Далі: підпис →</button>
        </aside>
      </div>
    </section>

    <section class="pane pane-policy">
      <div class="policy-heading">
        <h2 class="pane-title">Один указ на рік</h2>
        <label id="target-label">Галузь для указу <select id="target">${names.map((n, i) => `<option value="${i}" ${i === target ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
        <button class="next-step" data-step-to="1">Далі: галузі →</button>
      </div>
      <div class="policy-grid">${policiesFor(phaseOf(state)).map(id => `<button class="policy paper" data-policy="${id}" ${canChoose(state, id) ? '' : 'disabled'}>
          <h3>${policyData[id].title}</h3>
          <div class="policy-art" style="background-image:url(assets/ui/policy-${policyData[id].art}.webp)"></div>
          <p>${policyData[id].text}</p>
          <ul class="effects">${[...policyData[id].effects, ...(prepTrust(state, id) ? [['Довіра', `−${prepTrust(state, id)}`, 'bad'] as Effect] : [])].map(([label, value, kind]) => `<li><span>${label}</span><b class="${kind}">${value}</b></li>`).join('')}</ul>
          <footer><span>${cost(id)}</span><span class="radio"></span></footer>
        </button>`).join('')}</div>
    </section>

    <section class="pane pane-sign">
      <div class="sign-info">
        <div class="forecast-strip paper" id="forecast-strip" aria-live="polite"></div>
        <div class="contract-terms paper" id="contract-terms"></div>
      </div>
      <div class="mini-brief paper">
        ${showCrisis ? `<p class="mini-crisis ${crisis.kind}"><span class="eyebrow">Подія року</span> <b>${crisis.title}.</b> ${crisis.body}</p>` : ''}
        <span class="eyebrow">Мета до ${LAST_YEAR} року</span>${checklist()}
        <p class="floor-note">${goalNote()}</p>
        <button class="text-button" data-open-brief>Відкрити газету</button>
      </div>
      <div class="signature"><img src="assets/ui/seal.webp" alt=""><button class="sign-button" id="sign"></button></div>
    </section>

    <aside class="briefing paper" id="briefing">
      <button class="brief-close" data-close-brief aria-label="Закрити газету">✕</button>
      <div class="newspaper-name">Урядовий вісник</div><div class="edition">${year} рік · ${isBoom ? 'дешевий ШІ' : 'дефіцит обчислень'}</div>
      <div class="news-image"></div>
      <h2>${story?.headline ?? result?.headline ?? ''}</h2>
      <p class="lead">${story?.body ?? result?.lead.body ?? ''}</p>
      ${result ? `<p class="last-year"><b>Торік.</b> ${story ? `${sentence(result.headline)} ${result.lead.body} ` : ''}${result.description}</p>` : ''}
      ${showCrisis ? `<div class="crisis-note ${crisis.kind}"><span class="eyebrow">Подія року</span><strong>${crisis.title}</strong><p>${crisis.body}</p></div>` : ''}
      <span class="eyebrow">Мета до ${LAST_YEAR} року</span>
      ${checklist()}
      <p class="floor-note">${goalNote()}</p>
      <div class="project-note">${state.project ? `Дата-центр: до запуску ${stagesLeft(state.project)}` : `Власні обчислення: ${state.owned} од.`}<br>${isBoom ? 'Імпортний ШІ: без обмежень, майже задарма' : `Імпортна квота: ${state.imports} од., щороку менше`}</div>
      ${isBoom ? '' : `<div class="deal-note">Угоди з корпорацією <b>${state.deals} / 3</b></div>`}
      <div class="deal-note">Сід партії <b>${seed}</b></div>
      <div class="brief-links"><button class="text-button" id="how-to">Як грати</button><button class="text-button" id="restart">Нова партія ↺</button></div>
    </aside>
  </main>
  <div id="stamp" aria-hidden="true">ЗАТВЕРДЖЕНО</div>
  <dialog id="restart-dialog"><h2>Почати спочатку?</h2><p>Поточні рішення буде скасовано.</p><button id="confirm-restart">Так, нова партія</button><button id="replay-seed">Той самий сід</button><button id="cancel-restart">Повернутися</button></dialog>
  <dialog id="shock-dialog" class="shock"><span class="intro-year">${yearOf(SHOCK_ROUND)}</span><h2>Дешевий ШІ закінчився</h2>
    <p>Постачальники перестали працювати у збиток. Країні потрібно <b>${Math.round(totalNeed(state))}</b> одиниць обчислень на рік, а доступно лише <b>${state.capacity}</b>. Імпортна квота меншатиме щороку.</p>
    <p>Відтепер ви щороку <b>ділите обчислення між галузями</b>. Кому не вистачило, той працює лише на навичках людей. З’явилися й нові укази: угода з корпорацією та ручний режим.</p>
    <button class="sign-button" id="shock-ok">До кабінету</button></dialog>`;
  bindHeader(); updateCabinet();

  const briefing = $('#briefing');
  const toggleBrief = (open: boolean) => { if (open !== briefing.classList.contains('open')) audio.play('paper'); briefing.classList.toggle('open', open); };
  $('#brief-toggle').onclick = () => toggleBrief(!briefing.classList.contains('open'));
  document.querySelectorAll<HTMLElement>('[data-open-brief]').forEach(b => b.onclick = () => toggleBrief(true));
  document.querySelectorAll<HTMLElement>('[data-close-brief]').forEach(b => b.onclick = () => toggleBrief(false));
  const goTo = (next: number) => { step = next; toggleBrief(false); updateCabinet(); audio.play('click'); window.scrollTo(0, 0); };
  document.querySelectorAll<HTMLButtonElement>('[data-step-to]').forEach(button => button.onclick = () => goTo(Number(button.dataset.stepTo)));
  document.querySelectorAll<HTMLButtonElement>('[data-adjust]').forEach(button => button.onclick = () => {
    const [i, change] = button.dataset.adjust!.split(',').map(Number);
    const free = availableCompute(state, policy) - total();
    if ((change > 0 && free > 0 && allocations[i] < MAX_PER_SECTOR) || (change < 0 && allocations[i] > 0)) { allocations[i] += change; updateCabinet(); audio.play(change > 0 ? 'up' : 'down'); }
  });
  document.querySelectorAll<HTMLButtonElement>('[data-policy]').forEach(button => button.onclick = () => {
    policy = button.dataset.policy as Policy; fitAllocations(); updateCabinet(); audio.play('card');
  });
  $<HTMLSelectElement>('#target').onchange = e => { target = Number((e.target as HTMLSelectElement).value); updateCabinet(); };
  const sign = () => {
    const outcome = preview();
    if (!outcome) return;
    result = outcome;
    document.querySelectorAll<HTMLButtonElement | HTMLSelectElement>('button, select').forEach(control => control.disabled = true);
    $('#stamp').classList.add('stamped'); audio.play('stamp');
    setTimeout(city, 650);
  };
  $<HTMLButtonElement>('#sign').onclick = sign;
  // Нижня панель телефона: одна головна кнопка, що веде крок за кроком до підпису.
  $<HTMLButtonElement>('#dock-action').onclick = () => { if (step < 2) goTo(step + 1); else sign(); };
  $('#forecast-strip').onclick = e => {
    const link = (e.target as HTMLElement).closest<HTMLElement>('[data-goto]');
    if (link) { step = Number(link.dataset.goto); updateCabinet(); window.scrollTo(0, 0); }
  };
  const dialog = $<HTMLDialogElement>('#restart-dialog');
  $('#restart').onclick = () => dialog.showModal();
  $('#cancel-restart').onclick = () => dialog.close();
  $('#confirm-restart').onclick = () => restart(newSeed());
  $('#replay-seed').onclick = () => restart(seed);
  $('#how-to').onclick = () => intro();
  const shock = $<HTMLDialogElement>('#shock-dialog');
  $('#shock-ok').onclick = () => shock.close();
  if (state.round === SHOCK_ROUND) { shock.showModal(); audio.play('shock'); }
}

/** Оновлює все, що залежить від розподілу, указу й кроку, не перемальовуючи екран. */
function updateCabinet() {
  const isBoom = boom();
  const limit = availableCompute(state, policy);
  const free = isBoom ? 0 : limit - total();
  $('.desk').dataset.step = String(step);
  document.querySelectorAll<HTMLButtonElement>('.steps [data-step-to]').forEach(tab => tab.setAttribute('aria-current', String(Number(tab.dataset.stepTo) === step)));
  if (!isBoom) {
    $('#remaining').textContent = String(free);
    $('#capacity').textContent = String(limit);
    $('#compute-chip').classList.toggle('warning', free > 0);
  }
  $('#tab-free').textContent = isBoom ? 'ШІ вистачає всім' : free > 0 ? `вільних ${free}` : 'розподілено';
  $('#tab-free').className = free > 0 ? 'warning' : '';
  $('#tab-policy').textContent = policyTitle() + (targeted() ? ` · ${names[target]}` : '');
  document.querySelectorAll<HTMLButtonElement>('[data-policy]').forEach(button => {
    const chosen = button.dataset.policy === policy;
    button.classList.toggle('selected', chosen); button.setAttribute('aria-pressed', String(chosen));
    button.querySelector('.radio')!.textContent = chosen ? '● обрано' : '';
  });
  $('#target-label').style.visibility = targeted() ? 'visible' : 'hidden';
  state.sectors.forEach((_, i) => {
    const value = forecastFor(state, i, allocations[i], policy, target);
    const label = $(`#service-${i}`); label.textContent = Math.round(value) + '%'; label.className = tone(value);
    const meter = $(`#meter-${i}`); meter.style.width = Math.min(100, value) + '%'; meter.className = tone(value);
    if (!isBoom) $(`#allocation-${i}`).textContent = String(allocations[i]);
  });
  document.querySelectorAll<HTMLButtonElement>('[data-adjust]').forEach(button => {
    const [i, change] = button.dataset.adjust!.split(',').map(Number);
    button.disabled = change > 0 ? (free <= 0 || allocations[i] >= MAX_PER_SECTOR) : allocations[i] === 0;
  });

  const outcome = preview();
  const strip = $('#forecast-strip');
  const tabTrust = $('#tab-trust');
  if (outcome) {
    const next = outcome.state; const building = policy === 'center' || state.project > 0;
    const built = building && next.project < (policy === 'center' ? CENTER_STAGES : state.project);
    const it = Math.round(next.sectors[0].service), logistics = Math.round(next.sectors[3].service);
    tabTrust.textContent = `довіра ${signed(outcome.trustDelta)}`; tabTrust.className = outcome.trustDelta < 0 ? 'danger' : '';
    const third = isBoom
      ? `<div><b>${pct(averageAutomation(next))}</b><span>роботи робить ШІ (${signed(Math.round(averageAutomation(next) - averageAutomation(state)))})</span></div>`
      : state.round < LAST_ROUND ? `<div><b>${next.imports + Math.floor(next.owned * Math.min(1, next.sectors[4].service / 100))}</b><span>обчислень наступного року</span></div>`
      : `<div><b>${LAST_YEAR}</b><span>останній рік</span></div>`;
    strip.innerHTML = `<span class="eyebrow">Прогноз на ${yearOf(state.round)} рік</span>
      <div class="forecast-items">
        <div><b class="${outcome.trustDelta < 0 ? 'danger' : 'good'}">${signed(outcome.trustDelta)}</b><span>довіра → ${next.trust}%</span></div>
        <div><b class="${next.budget < state.budget ? 'warning' : 'good'}">${signed(next.budget - state.budget)}</b><span>бюджет → ${next.budget}</span></div>
        ${third}
        <div><b>${pct(averageReserve(next))}</b><span>навички (${signed(Math.round(averageReserve(next) - averageReserve(state)))}), найменше ${pct(weakestReserve(next))}</span></div>
      </div>
      ${building ? `<p class="${built ? 'good' : 'danger'}">${built ? `✓ Етап будівництва буде завершено${next.project ? `, залишиться ${stagesLeft(next.project)}` : ' — дата-центр запрацює'}.` : `✗ Будівництво стоятиме: потрібно ІТ і логістику від ${BUILD_THRESHOLD}%, зараз ${it}% і ${logistics}%.`}</p>` : ''}
      ${free > 0 ? `<p class="warning">Нерозподілено: ${free} ${plural(free, ['одиниця', 'одиниці', 'одиниць'])} обчислень. <button class="text-button goto-sectors" data-goto="1">Розподілити →</button></p>` : ''}
      ${outcome.ending && outcome.outcome === 'defeat' && !(policy === 'contract' && state.deals === 2) ? `<p class="danger">Цей указ завершить партію: ${outcome.ending.toLowerCase()}.</p>` : ''}`;
  } else { tabTrust.textContent = ''; strip.innerHTML = '<span class="eyebrow">Прогноз</span><p class="danger">Цей указ зараз недоступний.</p>'; }

  const last = state.deals === 2;
  const terms = $('#contract-terms');
  terms.hidden = policy !== 'contract' && state.deals === 0;
  terms.innerHTML = policy === 'contract'
    ? `<strong>Угода ${state.deals + 1} / 3 · ${last ? 'ПОВНЕ ПАРТНЕРСТВО' : 'КОНТРАКТ ІЗ ЗОБОВ’ЯЗАННЯМИ'}</strong><p>Зараз −${policyCost(state, policy)}. З наступного року −${(state.deals + 1) * DEAL_FEE} щороку, навіть без нової допомоги. Квота +${DEAL_COMPUTE} назавжди, навички −${DEAL_RESERVE} додатково в усіх галузях.</p><p>${last ? '«Дефіцит закінчиться вже сьогодні. Керування квотами й тарифами консорціум бере на себе — вам більше не доведеться про це думати».' : state.deals === 1 ? '«Ми вже майже одна команда. Наступного разу запропонуємо повне партнерство».' : '«Жодних прихованих умов. Ми просто хочемо допомогти».'}</p>`
    : `<strong>Рахунки за попередні угоди · −${corporateFee(state)} щороку</strong>`;
  const sign = $<HTMLButtonElement>('#sign');
  sign.innerHTML = 'Підписати<br>указ';
  sign.disabled = !outcome;
  const action = $<HTMLButtonElement>('#dock-action');
  const [label, note] = step === 0 ? ['Далі: галузі →', isBoom ? 'прогноз для кожної галузі' : 'розподілити обчислення']
    : step === 1 ? ['Далі: підпис →', free > 0 ? `ще вільних ${free}` : 'прогноз року']
    : ['Підписати указ', policyTitle() + (targeted() ? ` · ${names[target]}` : '')];
  action.innerHTML = `<span>${label}</span><small class="${step === 1 && free > 0 ? 'warning' : ''}">${note}</small>`;
  action.classList.toggle('final', step === 2);
  action.disabled = step === 2 && !outcome;
}

// ── Місто ───────────────────────────────────────────────────────────────────
function city() {
  screen = 'city'; elapsed = 0; paused = false; lastEvent = -1; selectedDistrict = 2; tune();
  app.innerHTML = `${header()}<main class="live-world">
    <div class="world-art"></div><div class="city-vignette"></div>
    <div class="world-title"><span class="eyebrow">Указ підписано</span><h1>${yearOf(state.round)} рік триває.</h1><p>${policyTitle()}</p></div>
    <div class="takeover-notice" id="takeover-notice" hidden>КОНТРОЛЬ ПЕРЕДАНО КОРПОРАЦІЇ <small>· незалежність втрачено</small></div>
    <div class="map-stage">${positions.map((pos, i) => `<button class="district" data-district="${i}" style="left:${pos[0]}%;top:${pos[1]}%"><span>${symbols[i]}<em> ${names[i]}</em></span><b id="live-sector-${i}">100%</b><i class="district-meter" id="live-bar-${i}"></i></button><div class="district-glow" id="glow-${i}" style="left:${pos[0]}%;top:${pos[1] + 5}%"></div>`).join('')}
      <div class="traffic traffic-one"></div><div class="traffic traffic-two"></div><div class="traffic traffic-three"></div><div class="smoke smoke-one"></div><div class="smoke smoke-two"></div>
    </div>
    <aside class="live-panel">
      <div class="live-panel-heading"><span class="live-dot"></span> КРАЇНА НАЖИВО · ${yearOf(state.round)}</div>
      <div class="live-stats">${names.map((n, i) => `<button data-focus="${i}"><span>${symbols[i]} ${n}</span><b id="list-${i}">100%</b></button>`).join('')}</div>
      <div id="district-detail"></div>
      <div class="event-feed" id="event-feed" aria-live="polite"><span class="eyebrow">Стрічка подій</span><p>Указ набув чинності.</p></div>
    </aside>
    <div class="time-panel">
      <div class="time-caption"><span id="time-label">ПОЧАТОК РОКУ</span><span id="time-percent">0%</span></div>
      <div class="timeline"><i id="time-progress"></i></div>
      <div class="time-controls"><button id="pause">Ⅱ Пауза</button><button id="speed" aria-label="Швидкість">×${speed}</button><span>${yearOf(state.round)} рік · спостерігайте за наслідками</span><button id="skip">До підсумків ↗</button></div>
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
    if (!paused && !menuOpen) elapsed += Math.min(now - previous, 100) * speed;
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
  $('#time-label').textContent = progress < .3 ? 'РІШЕННЯ НАБУВАЮТЬ ЧИННОСТІ' : progress < .7 ? 'КРАЇНА АДАПТУЄТЬСЯ' : 'ПІДБИВАЄМО ПІДСУМКИ РОКУ';
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
    $('#event-feed').innerHTML = `<span class="eyebrow">${names[event.sector]} · щойно</span><h3>${event.title}</h3><p>${event.body}</p>`; audio.play(result!.state.sectors[event.sector].service < FAILURE_LEVEL ? 'alarm' : 'wire');
  }
  $('#trust').textContent = Math.round(state.trust + (after.trust - state.trust) * progress) + '%';
  $('#budget').textContent = String(Math.round(state.budget + (after.budget - state.budget) * progress));
}
function showDistrict() {
  const i = selectedDistrict; const s = result!.state.sectors[i];
  document.querySelectorAll<HTMLElement>('.district').forEach(b => b.classList.toggle('focused', Number(b.dataset.district) === i));
  $('#district-detail').innerHTML = `<span class="eyebrow">${names[i]} · на кінець року</span>
    <div class="detail-numbers"><b class="${tone(s.service)}">${Math.round(s.service)}%<small>послуг</small></b><b>${Math.round(s.reserve)}%<small>навички</small></b></div>
    <p>${boom() ? `ШІ робить ${pct(s.automation)} роботи галузі.` : `Виділено ${allocations[i]} · потреба ${comma(need(state.sectors[i], surgeOf(state, i)))}${surgeOf(state, i) > 1 ? ' через подію року' : ''}.`}</p>`;
}

// ── Газета ──────────────────────────────────────────────────────────────────
const verdicts: Record<string, string> = {
  [VICTORY]: 'Країна пережила кінець дешевого ШІ й залишилася собою: послуги працюють, люди довіряють уряду й досі вміють працювати самі.',
  [SURVIVED]: `Країна дожила до ${LAST_YEAR} року, але не все вдалося зберегти: виконано не всі три умови.`,
  'Країна за підпискою': 'Дефіцит закінчився, але розподіляти обчислення тепер будете не ви. Третя угода передала це право консорціуму.',
  'Програні вибори': 'Поки ШІ був дешевим, люди хотіли швидких послуг, а не обережності. На виборах вони обрали тих, хто це пообіцяв.',
  'Вотум недовіри': 'Люди перестали вірити уряду, і парламент відправив його у відставку, не чекаючи кінця кризи.',
  'Уряд втратив контроль': 'Надто багато галузей зупинилось одночасно й надовго. Країною вже ніхто не керує.',
  'Держава не може оплатити рахунки': 'У скарбниці не вистачило грошей на обов’язкові платежі. Постачальники вимикають доступ за борги.',
};
const listed = (sectors: State['sectors']) => sectors.map(v => `${v.name} ${Math.floor(v.service)}%`).join(', ');
const tenth = (n: number) => (n > 0 ? '+' : '−') + Math.abs(n).toFixed(1).replace('.', ',');

/** Пояснює фінал: що саме сталося, з яких чисел це видно і що можна було зробити інакше. */
function explain(outcome: Result, before: State): { points: string[]; tip: string } {
  const after = outcome.state; const s = after.sectors;
  switch (outcome.ending) {
    case 'Країна за підпискою': return {
      points: [
        `<b>Угода 1.</b> Консорціум додав ${DEAL_COMPUTE} обчислень до квоти. Ви погодились платити ${DEAL_FEE} щороку.`,
        `<b>Угода 2.</b> Ще ${DEAL_COMPUTE} обчислень. Плата зросла до ${DEAL_FEE * 2} щороку, навички в галузях упали вдруге.`,
        `<b>Угода 3, «повне партнерство».</b> Ще ${DEAL_COMPUTE} обчислень, але в умовах було: керування квотами й тарифами переходить до консорціуму.`,
        'Вирішувати, кому скільки обчислень дати, — це й була робота уряду. Після третього підпису її виконує консорціум, тому партія закінчилась.',
      ],
      tip: 'Одна або дві угоди лишають країну вашою. З однією ще можна дійти до кінця без втрат, якщо встигнути відновити навички.',
    };
    case 'Програні вибори': return {
      points: [
        `На виборах ${ELECTION_YEAR} року уряду довіряли ${after.trust}%. Щоб лишитися, потрібно було ${ELECTION}%.`,
        `Кожне «Правило двох ключів» забирає ${REGULATE_TRUST} довіри: людям не подобається, коли все повільніше й дорожче, ніж у сусідів.`,
        `Навчання й дата-центр у роки буму забирають по ${PREP_TRUST}: поки ШІ дешевий, підготовку вважають марнотратством.`,
        `«ШІ-прорив» навпаки додає ${AUTOMATE_TRUST} довіри й ${AUTOMATE_BUDGET} бюджету, але робить галузь залежною.`,
      ],
      tip: 'Самою обережністю вибори не виграти. Чергуйте: трохи того, що люблять люди, і трохи підготовки. Навчання й дата-центр коштують довіри вдвічі менше за «Правило двох ключів».',
    };
    case 'Вотум недовіри': {
      const line = (i: number, weight: number, verb: string) => `${s[i].name} ${verb} на ${pct(s[i].service)} — довіра ${tenth((Math.min(s[i].service, 105) - 100) * weight)}.`;
      const failed = s.filter(v => v.service < FAILURE_LEVEL);
      const points = [
        `Довіра впала з ${before.trust}% до ${after.trust}%, а поріг відставки — ${TRUST_FLOOR}%. За останній рік вона змінилась на ${signed(outcome.trustDelta)}, ось із чого це склалось:`,
        line(5, TRUST_WEIGHTS[0], 'працювали'), line(6, TRUST_WEIGHTS[1], 'працювали'), line(1, TRUST_WEIGHTS[2], 'працювала'),
      ];
      if (failed.length) points.push(`Збій галузей (нижче ${FAILURE_LEVEL}%): ${listed(failed)} — довіра −${failed.length * 2}.`);
      if (policy === 'manual') points.push(`Ручний режим — довіра −${MANUAL_TRUST}.`);
      if (policy === 'contract') points.push(`Угода з корпорацією — довіра −${DEAL_TRUST}.`);
      return { points, tip: 'Довіру тримають лікарні, держпослуги й освіта: що ближче вони до 100%, то менше втрат. Ручний режим і угоди забирають довіру одразу. А найбільше допомагає підготовка в роки буму: з навичками й власними серверами галузі не падають так глибоко.' };
    }
    case 'Держава не може оплатити рахунки': return {
      points: [
        `На початку року в бюджеті було ${before.budget}.`,
        outcome.policyCost ? `Указ «${policyTitle()}» коштував ${outcome.policyCost}.` : `Указ «${policyTitle()}» був безкоштовний.`,
        `Надходження — лише ${outcome.income}: промисловість працювала на ${pct(s[2].service)}, логістика довезла ${pct(Math.min(100, s[3].service))} продукції.`,
        `Платежі за ${before.deals} ${plural(before.deals, ['угоду', 'угоди', 'угод'])} з корпорацією — ${outcome.fees}.`,
        ...(outcome.upkeep ? [`Утримання власних дата-центрів — ${outcome.upkeep}.`] : []),
        `Підсумок: −${Math.abs(after.budget)}. Бюджет нижче нуля означає банкрутство.`,
      ],
      tip: `Гроші дає промисловість, помножена на логістику. Кожна угода забирає ${DEAL_FEE} щороку до кінця партії, тому дві угоди потребують працюючих заводів.`,
    };
    case 'Уряд втратив контроль': return {
      points: [
        `Торік нижче ${COLLAPSE_LEVEL}% працювали: ${listed(before.sectors.filter(v => v.service < COLLAPSE_LEVEL))}.`,
        `Цього року нижче ${COLLAPSE_LEVEL}%: ${listed(s.filter(v => v.service < COLLAPSE_LEVEL))}.`,
        `Дві або більше галузей нижче ${COLLAPSE_LEVEL}% два роки поспіль — це колапс.`,
      ],
      tip: 'Галузь без обчислень тримається лише на навичках людей. Не лишайте дві галузі з нулем одночасно: краще всім потроху, ніж комусь нічого.',
    };
    case SURVIVED: {
      const points: string[] = []; const low = s.filter(v => v.service < WIN.service);
      if (after.trust < WIN.trust) points.push(`Довіра ${after.trust}% — потрібно від ${WIN.trust}%. Її з’їдають слабкі лікарні, держпослуги й освіта, а також ручний режим і угоди.`);
      if (low.length) points.push(`Нижче ${WIN.service}% в останньому році: ${listed(low)}. Ця умова рахується саме за ${LAST_YEAR} роком.`);
      const rusty = s.filter(v => v.reserve < WIN.reserve);
      if (rusty.length) points.push(`Навички нижче ${WIN.reserve}%: ${rusty.map(v => `${v.name} ${Math.floor(v.reserve)}%`).join(', ')}. Потрібно, щоб без ШІ вміли в кожній галузі. Навички тануть щороку самі й найшвидше там, де був «ШІ-прорив»; відновлюють їх лише навчання й ручний режим${after.deals ? `, а кожна з ваших угод (${after.deals}) забрала ще ${DEAL_RESERVE} у кожній галузі` : ''}.`);
      return { points, tip: rusty.length ? 'Серверами навички не купити. Почніть навчання ще в роки буму, поки люди пам’ятають свою справу, і не робіть «ШІ-прорив» двічі в одній галузі.' : after.owned > 8 ? `Власний дата-центр у вас був. Спробуйте в ${LAST_YEAR} році спершу довести кожну галузь до ${WIN.service}%, а решту віддати лікарням.` : 'Найдешевше готуватися в роки буму: дата-центр, початий до 2025 року, встигає запрацювати до шоку, а навички ще не втрачені.' };
    }
    default: return {
      points: [
        `Довіра ${after.trust}%, найслабша галузь ${pct(Math.min(...s.map(v => v.service)))}, навички щонайменше ${pct(weakestReserve(after))}.`,
        `Власних обчислень — ${after.owned}, угод із корпорацією — ${after.deals} з 3, у бюджеті лишилось ${after.budget}.`,
      ],
      tip: after.deals ? 'Ви впоралися з угодою. Спробуйте дійти сюди ж без жодної.' : 'Ви впоралися без угод. Спробуйте інший сід або ризикованіший бум: більше проривів, менше підготовки.',
    };
  }
}
function finishRound() {
  if (screen !== 'city') return;
  cancelAnimationFrame(animation); screen = 'paper';
  const played = policyTitle(); const outcome = result!; const before = state;
  state = outcome.state; tune();
  const why = outcome.ending ? explain(outcome, before) : null;
  const worst = state.sectors.reduce((a, b) => a.service < b.service ? a : b);
  const label = outcome.ending === 'Країна за підпискою' ? 'НЕЗАЛЕЖНІСТЬ ВТРАЧЕНО' : outcome.outcome === 'defeat' ? 'ПОРАЗКА' : outcome.outcome === 'victory' ? 'ПЕРЕМОГА' : 'НЕПОВНА ПЕРЕМОГА';
  const next = chronicle[state.round];
  const teaser = outcome.ending ? '' : next
    ? `<p class="tomorrow"><b>${yearOf(state.round)} рік: ${next.headline.toLowerCase()}.</b> ${state.round === SHOCK_ROUND ? `Обчислень буде лише ${state.capacity}.` : 'ШІ дешевшає, галузі спираються на нього дедалі більше.'}</p>`
    : `<p class="tomorrow"><b>${yearOf(state.round)} рік: ${state.crisis.title.toLowerCase()}.</b> ${state.crisis.body} Обчислень буде ${state.capacity}.</p>`;
  app.innerHTML = `${header()}<main class="report-desk"><article class="report paper">
    <div class="report-top"><span>НЕЗАЛЕЖНЕ ВИДАННЯ</span><span>ПІДСУМКИ ${yearOf(before.round)} РОКУ</span><span>СІД ${seed}</span></div>
    <h1 class="report-name">Урядовий вісник · ${yearOf(before.round)}</h1><div class="report-subtitle">КРАЇНА ПІСЛЯ ВАШОГО РІШЕННЯ</div>
    <h2>${outcome.ending ?? outcome.headline}</h2>
    ${outcome.ending ? `<div class="outcome-banner ${outcome.outcome}"><strong>${label}</strong><p>${verdicts[outcome.ending]}</p>${outcome.outcome === 'defeat' ? '' : checklist()}<div class="why"><span class="eyebrow">${outcome.outcome === 'victory' ? 'З чим ви дійшли' : 'Чому так сталося'}</span><ol>${why!.points.map(point => `<li>${point}</li>`).join('')}</ol><p class="tip"><b>Наступного разу.</b> ${why!.tip}</p></div></div>` : ''}
    <div class="report-columns">
      <div><div class="report-photo"></div><p class="caption">Життя країни після указу «${played}».</p><p class="report-lead">${outcome.ending || outcome.lead.title !== outcome.headline ? `<b>${sentence(outcome.lead.title)}</b> ` : ''}${outcome.lead.body}</p><p class="report-facts">${outcome.description}</p></div>
      <div class="report-analysis"><h3>Ціна рішення</h3>
        <p>${outcome.policyCost ? `Указ коштував ${outcome.policyCost}.` : 'Указ не коштував бюджету нічого.'}${outcome.fees ? ` Платежі за угоди — ${outcome.fees}.` : ''}${outcome.upkeep ? ` Утримання дата-центрів — ${outcome.upkeep}.` : ''}${state.deals ? ` Надалі корпорація братиме ${corporateFee(state)} щороку.` : ''}${centerUpkeep(state) > outcome.upkeep ? ` Власні сервери відтепер коштують ${centerUpkeep(state)} щороку.` : ''}</p>
        <p>ШІ робить у середньому ${pct(averageAutomation(state))} роботи (${signed(Math.round(averageAutomation(state) - averageAutomation(before)))}), навички людей — ${pct(averageReserve(state))} (${signed(Math.round(averageReserve(state) - averageReserve(before)))}).</p>
        <p>Найбільше підтримки потребує галузь «${worst.name}» — ${Math.round(worst.service)}% послуг.</p>
        ${teaser}
        <div class="report-numbers"><div><strong>${state.trust}%</strong><span>довіра (${signed(outcome.trustDelta)})</span></div><div><strong>+${outcome.income}</strong><span>надходження</span></div><div><strong>${state.budget}</strong><span>бюджет</span></div></div>
      </div>
    </div>
    ${outcome.stories.length ? `<section class="report-stories"><span class="eyebrow">Тим часом у країні</span><div>${outcome.stories.map(story => `<article><span class="eyebrow">${symbols[story.sector]} ${names[story.sector]}</span><h3>${story.title}</h3><p>${story.body}</p></article>`).join('')}</div></section>` : ''}
    <div class="report-sector-line">${state.sectors.map((s, i) => `<div><span>${symbols[i]} ${s.name}</span><b class="${tone(s.service)}">${Math.round(s.service)}%</b></div>`).join('')}</div>
    <footer><span>${outcome.ending ? 'СЦЕНАРІЙ ЗАВЕРШЕНО' : 'НАСТУПНИЙ РІК ЗАЛЕЖИТЬ ВІД ВАС'}</span>
      <div class="report-actions">${outcome.ending ? '<button class="text-button" id="replay">Переграти цей сід</button>' : ''}<button class="sign-button" id="continue">${outcome.ending ? 'Нова партія ↺' : `До ${yearOf(state.round)} року ↗`}</button></div>
    </footer>
  </article></main>`;
  bindHeader(); audio.play('press');
  if (outcome.ending) setTimeout(() => audio.play(outcome.outcome === 'defeat' ? 'defeat' : 'victory'), 500);
  document.querySelector<HTMLButtonElement>('#replay')?.addEventListener('click', () => restart(seed));
  $('#continue').onclick = () => {
    if (outcome.ending) { restart(newSeed()); return; }
    allocations = state.sectors.map(s => s.allocation);
    // Угоду й будівництво не лишаємо обраними, щоб не підписати їх удруге випадково.
    if (policy === 'contract' || policy === 'center' || !canChoose(state, policy)) policy = policiesFor(phaseOf(state)).find(id => id !== 'contract' && id !== 'center' && canChoose(state, id)) ?? 'manual';
    cabinet();
  };
}
function restart(nextSeed: number) {
  cancelAnimationFrame(animation);
  seed = nextSeed; state = initialState(seed); allocations = state.sectors.map(s => s.allocation);
  result = null; policy = 'automate'; target = 2; speed = 1;
  cabinet();
}

// ── Головне меню ────────────────────────────────────────────────────────────
// Живе поза #app, тому переживає перемальовування екранів і відкривається поверх будь-якого.
let seen = false;
try { seen = localStorage.getItem('ai-crisis-intro') === '1'; localStorage.setItem('ai-crisis-intro', '1'); } catch { /* сховище недоступне — просто показуємо вступ */ }
const menu = document.createElement('div');
menu.id = 'menu'; menu.setAttribute('role', 'dialog'); menu.setAttribute('aria-label', 'Головне меню');
document.body.append(menu);
/** armed — який перезапуск чекає на підтвердження другим натисканням. */
function openMenu(armed: 'new' | 'same' | null = null) {
  if (!menuOpen) audio.play('paper');
  menuOpen = true; menu.hidden = false; tune();
  const over = !!result?.ending && screen === 'paper';
  const status = !begun ? 'Країна підсіла на дешевий ШІ. Дешевий ШІ не вічний.'
    : over ? `Партію завершено: ${result!.ending!.toLowerCase()}. Сід ${seed}.`
    : `${yearOf(Math.min(state.round, LAST_ROUND))} рік · довіра ${state.trust}% · бюджет ${state.budget} · сід ${seed}`;
  const restartButton = (kind: 'new' | 'same', label: string) => `<button data-restart="${kind}" class="${armed === kind ? 'armed' : ''}">${armed === kind ? 'Точно? Поточну партію буде втрачено' : label}</button>`;
  menu.innerHTML = `<div class="menu-card paper">
    <img src="assets/ui/emblem.webp" alt="">
    <h1>AI CRISIS</h1><p class="menu-tagline">Кабінет останньої надії</p>
    <p class="menu-status">${status}</p>
    <button class="sign-button" id="menu-go">${begun ? 'Продовжити' : 'Почати гру'}</button>
    ${begun ? restartButton('new', 'Нова партія') + restartButton('same', 'Почати цей сід заново') : ''}
    <button id="menu-how">Як грати</button>
    <div class="menu-volume">
      <label>Музика <input type="range" min="0" max="100" value="${Math.round(audio.volume('music') * 100)}" data-volume="music"></label>
      <label>Звуки <input type="range" min="0" max="100" value="${Math.round(audio.volume('sfx') * 100)}" data-volume="sfx"></label>
    </div>
  </div>`;
  $('#menu-go').onclick = () => { closeMenu(); if (!begun) { begun = true; if (seen) cabinet(); else intro(); } };
  $('#menu-how').onclick = () => { begun = true; closeMenu(); intro(); };
  menu.querySelectorAll<HTMLButtonElement>('[data-restart]').forEach(button => button.onclick = () => {
    const kind = button.dataset.restart as 'new' | 'same';
    if (!over && armed !== kind) { openMenu(kind); return; }
    closeMenu(); restart(kind === 'new' ? newSeed() : seed);
  });
  menu.querySelectorAll<HTMLInputElement>('[data-volume]').forEach(slider => slider.oninput = () => {
    const kind = slider.dataset.volume as 'music' | 'sfx';
    audio.setVolume(kind, Number(slider.value) / 100);
    if (kind === 'sfx') audio.play('up');
  });
  menu.querySelector<HTMLElement>(armed ? '.armed' : '#menu-go')?.focus();
}
function closeMenu() {
  menuOpen = false; menu.hidden = true; audio.play('click'); tune();
}
// Браузер дозволяє звук лише після першого дотику гравця.
for (const type of ['pointerdown', 'keydown'] as const) document.addEventListener(type, () => audio.wake(), { capture: true });
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape' || document.querySelector('dialog[open]')) return;
  if (!menuOpen) openMenu(); else if (begun) closeMenu();
});
openMenu();

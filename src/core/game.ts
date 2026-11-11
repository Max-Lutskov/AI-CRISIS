import { herald, type Story } from './herald';

export const names = ['ІТ', 'Освіта', 'Промисловість', 'Логістика', 'Енергетика', 'Лікарні', 'Держпослуги'];
export const symbols = ['⌘', '◈', '▥', '⇄', 'ϟ', '✚', '▤'];

export type Sector = { name: string; automation: number; reserve: number; allocation: number; service: number };
export type Crisis = { kind: 'calm' | 'surge' | 'quota' | 'windfall'; sector: number; title: string; body: string };
export type Phase = 'boom' | 'deficit';
export type State = {
  /** Рік гри: 1 — це 2023-й. Роки 1–4 — бум, з 5-го — дефіцит. */
  round: number; budget: number; trust: number;
  /** Імпортна квота без власних потужностей. Діє з року шоку, далі щороку скорочується. */
  imports: number;
  /** Обчислення, доступні цього року. У роки буму ліміту немає і тут 0. */
  capacity: number;
  owned: number; deals: number; project: number; collapsed: number;
  /** Скільки дата-центрів розпочато, разом із тим, що ще будується. */
  centers: number;
  seed: number; crisis: Crisis; sectors: Sector[];
};
export type Policy = 'automate' | 'regulate' | 'train' | 'center' | 'contract' | 'manual';
export type Event = { at: number; sector: number; title: string; body: string };
export type Outcome = 'ongoing' | 'victory' | 'compromise' | 'defeat';
export type Result = {
  state: State; events: Event[]; headline: string; description: string;
  /** Головна історія вісника про указ і короткі історії про інші галузі. */
  lead: Story; stories: Story[];
  income: number; fees: number; upkeep: number; policyCost: number; trustDelta: number;
  ending: string | null; outcome: Outcome;
};
export type Check = { label: string; ok: boolean; value: string };

// ── Баланс. Усі числа сценарію зібрані тут. ─────────────────────────────────
export const START_YEAR = 2023;
export const SHOCK_ROUND = 5;         // 2027: дешевий ШІ закінчується
export const LAST_ROUND = 10;         // 2032
export const MAX_PER_SECTOR = 16;
export const costs: Record<Policy, number> = { automate: 0, regulate: 15, train: 24, center: 55, contract: 15, manual: 0 };
// бум
export const DRIFT = 14;              // щороку ринок сам додає автоматизації кожній галузі
export const AUTOMATE_GAIN = 25;      // указ «ШІ-прорив» в обраній галузі
export const AUTOMATE_BUDGET = 15;    // економія від нього одразу
export const AUTOMATE_TRUST = 2;
export const REGULATE_TRUST = 6;      // «правило двох ключів» людям не подобається
export const REGULATE_FACTOR = .5;    // воно лише вдвічі сповільнює автоматизацію і втрату навичок
export const PREP_TRUST = 3;           // у бум навчання й дата-центр непопулярні: «навіщо, коли ШІ дешевий?»
export const ELECTION = 45;           // довіра, потрібна на виборах наприкінці буму
export const BOOM_DECAY = 3.6;        // у бум навички тануть на A / 3,6 за рік
// дефіцит
export const SHOCK_IMPORT = 30;       // квота, яку постачальник лишає в рік шоку
export const DEAL_STEP = 20;          // кожна наступна угода дорожча
export const DEAL_FEE = 10;           // постійна плата за кожну угоду
export const DEAL_COMPUTE = 10;       // довічна надбавка до квоти
export const DEAL_RESERVE = 3;        // втрата навичок у кожній галузі
export const DEAL_TRUST = 3;
export const MANUAL_TRUST = 3;        // ручний режим безкоштовний для бюджету, але не для людей
export const IMPORT_CUT = 2;          // постачальник ріже квоту щороку
export const MIN_IMPORT = 16;
export const CENTER_STAGES = 3;
export const CENTER_COMPUTE = 16;
export const CENTER_STEP = 10;        // кожен наступний дата-центр дорожчий
export const CENTER_UPKEEP = 4;       // щорічне утримання кожного запущеного дата-центру
export const BUILD_THRESHOLD = 75;    // ІТ і логістика для етапу будівництва
export const TRUST_FLOOR = 25;        // нижче — вотум недовіри
export const FAILURE_LEVEL = 50;      // збій галузі б'є по довірі одразу
export const COLLAPSE_LEVEL = 40;     // дві такі галузі два роки поспіль — колапс
export const TRUST_WEIGHTS = [.09, .05, .03]; // лікарні, держпослуги, освіта
export const RESERVE_DECAY = 24;      // у дефіцит навички тануть на A / 24 за рік
export const SURGE = 1.35;
export const QUOTA_DIP = 4;
export const WINDFALL = 4;
export const WIN = { trust: 45, service: 75, reserve: 18 };
export const VICTORY = 'Криза позаду';
export const SURVIVED = 'Вижили з втратами';

export const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
export const plural = (n: number, forms: [string, string, string]) => {
  const a = Math.abs(n) % 100, b = a % 10;
  return forms[a > 10 && a < 20 ? 2 : b === 1 ? 0 : b >= 2 && b <= 4 ? 1 : 2];
};
/** Одиниці величин: бюджет — у мільярдах, обчислення — у тисячах серверів. */
export const money = (n: number) => `${n} млрд`;
export const servers = (n: number) => `${n} тис. серверів`;
const stages = (n: number) => `${n} ${plural(n, ['етап', 'етапи', 'етапів'])}`;

export const yearOf = (round: number) => START_YEAR + round - 1;
export const phaseOf = (state: State): Phase => state.round < SHOCK_ROUND ? 'boom' : 'deficit';
export const policiesFor = (phase: Phase): Policy[] => phase === 'boom' ? ['automate', 'regulate', 'train', 'center'] : ['train', 'center', 'contract', 'manual'];
export const needsTarget = (policy: Policy) => policy === 'automate' || policy === 'train' || policy === 'manual';
/** Скільки довіри коштує підготовка, поки ШІ дешевий. У дефіцит її вже ніхто не висміює. */
export const prepTrust = (state: State, policy: Policy) => phaseOf(state) === 'boom' && (policy === 'train' || policy === 'center') ? PREP_TRUST : 0;
export const corporateFee = (state: State) => state.deals * DEAL_FEE;
/** Запущені дата-центри: розпочаті без того, що ще будується. */
export const launchedCenters = (state: State) => state.centers - (state.project > 0 ? 1 : 0);
export const centerUpkeep = (state: State) => launchedCenters(state) * CENTER_UPKEEP;
export const policyCost = (state: State, policy: Policy) => costs[policy] + (policy === 'contract' ? state.deals * DEAL_STEP : policy === 'center' ? state.centers * CENTER_STEP : 0);
/** Обчислення, які можна розподілити цього року з урахуванням обраного указу. */
export const availableCompute = (state: State, policy: Policy) => state.capacity + (policy === 'contract' ? DEAL_COMPUTE : 0);
export const surgeOf = (state: State, sector: number) => state.crisis.kind === 'surge' && state.crisis.sector === sector ? SURGE : 1;
export const need = (sector: Sector, surge = 1) => sector.automation / 8 * surge;
export const totalNeed = (state: State) => state.sectors.reduce((sum, s, i) => sum + need(s, surgeOf(state, i)), 0);

export function services(sector: Sector, surge = 1): number {
  const demand = need(sector, surge);
  const supply = demand === 0 ? 1 : clamp(sector.allocation / demand, 0, 1);
  return (100 + sector.automation * .3) * (sector.reserve / 100 + (1 - sector.reserve / 100) * supply);
}
export function forecastServices(sector: Sector, allocation: number, policy: Policy, targeted: boolean, surge = 1): number {
  const penalty = targeted && policy === 'train' ? .85 : targeted && policy === 'manual' ? .65 : 1;
  return services({ ...sector, allocation }, surge) * penalty;
}
/** Прогноз послуг галузі з урахуванням фази: у бум ШІ вистачає всім. */
export function forecastFor(state: State, sector: number, allocation: number, policy: Policy, target: number): number {
  const s = state.sectors[sector]; const targeted = needsTarget(policy) && sector === target;
  return phaseOf(state) === 'boom' ? forecastServices(s, MAX_PER_SECTOR * 2, policy, targeted) : forecastServices(s, allocation, policy, targeted, surgeOf(state, sector));
}

// ── Хроніка. Що відбувається у світі кожного року буму. ─────────────────────
export const chronicle: Record<number, { headline: string; body: string }> = {
  1: { headline: 'ШІ оселився в кожному телефоні', body: 'Торік з’явилися програми, що пишуть, рахують і радять не гірше за фахівця. Доступ коштує копійки: постачальники роздають його майже задарма, аби всі звикли. Міністри питають одне: чому ми досі працюємо по-старому?' },
  2: { headline: 'Перші відомства перейшли на ШІ', body: 'Довідки видаються за хвилину, черги тануть. Досвідчених працівників потроху скорочують: машина робить те саме швидше. Ті, хто лишився, дедалі рідше роблять щось без підказки.' },
  3: { headline: 'Ціни на ШІ впали ще втричі', body: 'Постачальники воюють за ринок і працюють собі у збиток. Країна звикла: без ШІ вже не складають розклад лікарень і не планують перевезення. Запасного способу ніхто не тримає.' },
  4: { headline: 'Аналітики вперше сказали «бульбашка»', body: 'Постачальники мовчки попередили клієнтів про «перегляд умов» наступного року. Інвестори нервують. Якщо дешевий доступ закінчиться, країна дізнається, скільки вона ще вміє сама.' },
  5: { headline: 'Дешевий ШІ закінчився', body: 'Постачальники припинили працювати у збиток: ціни злетіли, доступ видають за квотами, і щороку вони меншатимуть. Відтепер обчислень на всіх не вистачає, і ділити їх між галузями доведеться вам.' },
};

// ── Події року. Той самий сід дає ту саму партію. ───────────────────────────
const calm: Crisis = { kind: 'calm', sector: -1, title: 'Рік без сюрпризів', body: 'Жодних нових потрясінь. Лише ті, що вже є.' };
const surges: [string, string][] = [
  ['Хвиля кібератак', 'Службам ІТ потрібно на третину більше обчислень, щоб утримати мережі.'],
  ['Рекордний набір до вишів', 'Освіті потрібно на третину більше обчислень: заяви, іспити, розклади.'],
  ['Велике експортне замовлення', 'Промисловості потрібно на третину більше обчислень, щоб встигнути в строк.'],
  ['Затор на кордоні', 'Логістиці потрібно на третину більше обчислень, щоб перепланувати маршрути.'],
  ['Аномальна спека', 'Енергетиці потрібно на третину більше обчислень, щоб балансувати мережу.'],
  ['Важкий сезон грипу', 'Лікарням потрібно на третину більше обчислень: черги ростуть щогодини.'],
  ['Податкова реформа', 'Держпослугам потрібно на третину більше обчислень: декларації подають усі одразу.'],
];
function random(seed: number, round: number): () => number {
  let t = (seed * 2654435761 + round * 40503) >>> 0;
  return () => { t = (t + 0x6D2B79F5) >>> 0; let x = Math.imul(t ^ (t >>> 15), 1 | t); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
}
/** Сід 0 означає сценарій без подій. Роки буму й рік шоку завжди без подій. */
export function crisisFor(seed: number, round: number): Crisis {
  if (!seed || round <= SHOCK_ROUND) return calm;
  const next = random(seed, round); const roll = next();
  if (roll < .6) { const sector = Math.floor(next() * 7); return { kind: 'surge', sector, title: surges[sector][0], body: surges[sector][1] }; }
  if (roll < .78) return { kind: 'quota', sector: -1, title: 'Постачальник «оптимізує» тарифи', body: `Цього року квота менша ще на ${servers(QUOTA_DIP)}.` };
  if (roll < .9) return { kind: 'windfall', sector: -1, title: 'Сусіди продали надлишок', body: `Разова поставка: цього року обчислень більше на ${servers(WINDFALL)}.` };
  return calm;
}
const crisisCompute = (crisis: Crisis) => crisis.kind === 'quota' ? -QUOTA_DIP : crisis.kind === 'windfall' ? WINDFALL : 0;

export function initialState(seed = 0): State {
  return {
    round: 1, budget: 30, trust: 54, imports: SHOCK_IMPORT, capacity: 0, owned: 8, deals: 0, project: 0, collapsed: 0, centers: 0, seed, crisis: calm,
    sectors: names.map((name, i) => ({ name, automation: [35, 20, 30, 25, 25, 18, 18][i], reserve: [80, 92, 80, 84, 88, 90, 90][i], allocation: 0, service: 100 })),
  };
}
/** Стартовий розподіл: кожній галузі пропорційно до її потреби. */
export function proportional(state: State, capacity = state.capacity): number[] {
  const all = totalNeed(state);
  const result = state.sectors.map((s, i) => Math.min(MAX_PER_SECTOR, Math.floor(need(s, surgeOf(state, i)) * Math.min(1, capacity / all))));
  for (let i = 0, guard = 0; result.reduce((a, b) => a + b, 0) < Math.min(capacity, Math.ceil(all)) && guard < 99; i = (i + 1) % 7, guard++)
    if (result[i] < MAX_PER_SECTOR && result[i] < Math.ceil(need(state.sectors[i], surgeOf(state, i)))) result[i]++;
  return result;
}

export const averageReserve = (state: State) => state.sectors.reduce((sum, v) => sum + v.reserve, 0) / state.sectors.length;
export const weakestReserve = (state: State) => Math.min(...state.sectors.map(v => v.reserve));
export const averageAutomation = (state: State) => state.sectors.reduce((sum, v) => sum + v.automation, 0) / state.sectors.length;
/** Три умови виходу з кризи без втрат. Показуються гравцеві під час партії. */
export function landingChecks(state: State): Check[] {
  const worst = Math.min(...state.sectors.map(v => v.service));
  return [
    { label: `Люди довіряють уряду: від ${WIN.trust}%`, ok: state.trust >= WIN.trust, value: `${state.trust}%` },
    { label: `Кожна галузь працює: від ${WIN.service}%`, ok: worst >= WIN.service, value: `${Math.round(worst)}%` },
    { label: `У кожній галузі вміють без ШІ: від ${WIN.reserve}%`, ok: weakestReserve(state) >= WIN.reserve, value: `${Math.round(weakestReserve(state))}%` },
  ];
}

export function canChoose(state: State, policy: Policy): boolean {
  return state.round <= LAST_ROUND && policiesFor(phaseOf(state)).includes(policy) && state.deals < 3 && state.trust > TRUST_FLOOR && state.collapsed < 2 && state.budget >= 0
    && state.budget >= policyCost(state, policy) && (policy !== 'center' || state.project === 0);
}

export function resolveRound(before: State, allocations: number[], policy: Policy, target: number): Result {
  const boom = phaseOf(before) === 'boom';
  if (before.round > LAST_ROUND || !canChoose(before, policy)) throw new Error('Указ недоступний');
  if (!boom && (allocations.length !== 7 || allocations.some(n => !Number.isInteger(n) || n < 0 || n > MAX_PER_SECTOR)
    || allocations.reduce((a, b) => a + b, 0) > availableCompute(before, policy))) throw new Error('Некоректний розподіл');
  if (!Number.isInteger(target) || target < 0 || target >= 7) throw new Error('Невідома галузь');

  const state: State = structuredClone(before);
  const s = state.sectors;
  const price = policyCost(before, policy);
  const fees = corporateFee(before);
  const upkeep = centerUpkeep(before);
  const hands = policy === 'train' || policy === 'manual';
  state.budget -= price;
  if (policy === 'contract') { state.deals++; state.imports += DEAL_COMPUTE; }
  if (policy === 'automate') state.budget += AUTOMATE_BUDGET;
  s.forEach((sector, i) => { sector.allocation = boom ? 0 : allocations[i]; sector.service = forecastFor(before, i, boom ? 0 : allocations[i], policy, target); });

  const events: Event[] = [];
  if (policy === 'contract') events.push({ at: .09, sector: 0, title: `Корпоративна угода ${state.deals} / 3`, body: state.deals === 3
    ? 'Повне партнерство набуло чинності. Квоти й тарифи відтепер визначає консорціум.'
    : `Оплата зараз — ${money(price)}. Квота зросла на ${servers(DEAL_COMPUTE)} назавжди, платежі з наступного року — ${money(corporateFee(state))} щороку. Навички в кожній галузі додатково впадуть на ${DEAL_RESERVE}.` });
  if (policy === 'automate') events.push({ at: .09, sector: target, title: 'ШІ-прорив', body: `Галузь «${names[target]}» передає ШІ ще чверть роботи. Бюджет заощадив ${money(AUTOMATE_BUDGET)}, черги коротшають. Навички тут танутимуть швидше.` });
  if (policy === 'regulate') events.push({ at: .09, sector: 6, title: 'Правило двох ключів', body: 'Цього року кожне рішення ШІ перевіряє людина. Автоматизація росте вдвічі повільніше, навички тануть удвічі повільніше, але послуги дорожчають, і людям це не подобається.' });
  events.push({ at: .16, sector: 2, title: s[2].service >= 85 ? 'Заводи набирають обертів' : 'Виробничі лінії сповільнюються', body: `Випуск продукції — ${Math.round(s[2].service)}% базового рівня. Це визначить надходження до бюджету.` });

  const transportReady = s[3].service >= BUILD_THRESHOLD && s[0].service >= BUILD_THRESHOLD;
  if (policy === 'center') { state.project = CENTER_STAGES; state.centers++; }
  if (state.project > 0) {
    if (transportReady) state.project--;
    events.push({ at: .36, sector: 3, title: transportReady ? 'Обладнання доставлено' : 'Дата-центр чекає на обладнання', body: transportReady
      ? (state.project ? `Логістика та ІТ підтримують будівництво. До запуску — ${stages(state.project)}.` : 'Останній етап будівництва завершено.')
      : `Для будівництва логістика та ІТ мають працювати щонайменше на ${BUILD_THRESHOLD}%. Цього року етап не завершено.` });
    if (state.project === 0) { state.owned += CENTER_COMPUTE; events.push({ at: .72, sector: 0, title: 'Власний дата-центр у мережі', body: `Додано ${servers(CENTER_COMPUTE)} власної потужності. Її доступність залежатиме від енергетики, а утримання коштуватиме ${money(CENTER_UPKEEP)} щороку.` }); }
  } else {
    const missed = Math.max(0, Math.round(100 - s[3].service));
    events.push({ at: .36, sector: 3, title: missed ? 'Частина вантажів затримується' : 'Вантажі прибувають вчасно', body: `Логістика працює на ${Math.round(s[3].service)}%. ${missed ? `${missed}% перевезень не виконано, а бюджет отримує дохід лише від доставленої продукції.` : 'Уся продукція доїхала до покупців.'}` });
  }
  if (hands) events.push({ at: .52, sector: target, title: policy === 'train' ? 'Працівники повертаються до практики' : 'Ручний режим запроваджено', body: `Навички в галузі «${names[target]}» зростають. Цього року частина послуг призупинена заради навчання.${policy === 'manual' ? ' Людям це не подобається.' : ''}` });
  else events.push({ at: .52, sector: 1, title: s[1].service >= 80 ? 'Навчання триває' : 'Заняття скорочено', body: `Освіта — ${Math.round(s[1].service)}%. Її стан впливає на ефективність перепідготовки наступного року.` });
  events.push({ at: .68, sector: 4, title: s[4].service >= 80 ? 'Мережа тримає навантаження' : 'Енергетики обмежують потужність', body: boom ? `Енергетика працює на ${Math.round(s[4].service)}%.` : `Доступність власних серверів наступного року — ${Math.round(clamp(s[4].service / 100, 0, 1) * 100)}%.` });

  const failed = s.filter(v => v.service < FAILURE_LEVEL);
  events.push({ at: .85, sector: s[5].service < s[6].service ? 5 : 6, title: s[5].service < 75 ? 'Черги на допомогу зростають' : 'Країна підбиває підсумки року', body: `Лікарні — ${Math.round(s[5].service)}%, держпослуги — ${Math.round(s[6].service)}%. Люди оцінюють роботу уряду.${failed.length ? ` Збій: ${failed.map(v => v.name).join(', ')}.` : ''}` });
  if (fees > 0) events.push({ at: .93, sector: 6, title: 'Рахунок за попередні угоди', body: `Списано ${money(fees)} з бюджету. Ці платежі зберігаються навіть без нової допомоги.` });

  const delivered = s[2].service * clamp(s[3].service / 100, 0, 1);
  const income = Math.max(0, Math.round(delivered * .3 - 4 - Math.max(0, 75 - s[0].service) * .12));
  if (upkeep > 0) events.push({ at: .95, sector: 4, title: 'Рахунок за власні сервери', body: `Утримання дата-центрів коштувало ${money(upkeep)}: електрика, охолодження, заміна обладнання.` });
  state.budget += income - fees - upkeep;

  const felt = (v: Sector) => Math.min(v.service, 105) - 100;
  const trustDelta = Math.round(felt(s[5]) * TRUST_WEIGHTS[0] + felt(s[6]) * TRUST_WEIGHTS[1] + felt(s[1]) * TRUST_WEIGHTS[2] - failed.length * 2
    - (policy === 'manual' ? MANUAL_TRUST : 0) - (policy === 'contract' ? DEAL_TRUST : 0)
    + (policy === 'automate' ? AUTOMATE_TRUST : 0) - (policy === 'regulate' ? REGULATE_TRUST : 0) - prepTrust(before, policy));
  state.trust = clamp(state.trust + trustDelta, 0, 100);

  const teaching = .5 + clamp(before.sectors[1].service / 100, 0, 1) * .5;
  const frozen = policy === 'regulate';
  s.forEach((sector, i) => {
    const gain = hands && i === target ? (policy === 'train' ? 15 : 22) * teaching : 0;
    const slow = frozen ? REGULATE_FACTOR : 1;
    const decay = sector.automation / (boom ? BOOM_DECAY : RESERVE_DECAY) * slow;
    sector.reserve = clamp(sector.reserve - decay + gain - (policy === 'contract' ? DEAL_RESERVE : 0), 0, 100);
    if (boom) sector.automation = clamp(sector.automation + DRIFT * slow + (policy === 'automate' && i === target ? AUTOMATE_GAIN : 0), 0, 100);
  });

  state.collapsed = s.filter(v => v.service < COLLAPSE_LEVEL).length >= 2 ? state.collapsed + 1 : 0;
  state.round++;
  const shock = state.round === SHOCK_ROUND;
  if (state.round > SHOCK_ROUND) state.imports = Math.max(MIN_IMPORT, state.imports - IMPORT_CUT);
  state.crisis = crisisFor(state.seed, state.round);
  state.capacity = state.round < SHOCK_ROUND ? 0 : Math.max(0, state.imports + Math.floor(state.owned * clamp(s[4].service / 100, 0, 1)) + crisisCompute(state.crisis));
  if (shock) proportional(state).forEach((n, i) => s[i].allocation = n);

  let ending: string | null = null;
  if (state.budget < 0) ending = 'Держава не може оплатити рахунки';
  else if (shock && state.trust < ELECTION) ending = 'Програні вибори';
  else if (state.trust <= TRUST_FLOOR) ending = 'Вотум недовіри';
  else if (state.collapsed >= 2) ending = 'Уряд втратив контроль';
  else if (state.deals >= 3) ending = 'Країна за підпискою';
  else if (state.round > LAST_ROUND) ending = landingChecks(state).every(c => c.ok) ? VICTORY : SURVIVED;
  const outcome: Outcome = ending === null ? 'ongoing' : ending === VICTORY ? 'victory' : ending === SURVIVED ? 'compromise' : 'defeat';

  const news = herald(before, state, policy, target);
  news.stories.forEach((story, i) => events.push({ at: [.26, .44, .6][i], ...story }));

  const change = state.budget - before.budget;
  const tail = ending === 'Країна за підпискою' ? 'Три підписані угоди передали корпорації право визначати квоти та тарифи. Уряд залишився, рішення — ні.'
    : ending === 'Програні вибори' ? `На виборах ${yearOf(before.round)} року уряду довіряли ${state.trust}% — менше потрібних ${ELECTION}%. Кризу зустрічатиме вже інша команда.`
    : ending === 'Вотум недовіри' ? `Довіра впала до ${state.trust}%. Парламент відправив уряд у відставку.`
    : ending === 'Уряд втратив контроль' ? 'Дві галузі два роки поспіль не працюють. Країною вже ніхто не керує.'
    : ending === 'Держава не може оплатити рахунки' ? 'Скарбниця порожня. Постачальники вимикають доступ за борги.'
    : ending ? 'Сценарій завершено.'
    : state.project ? `До запуску дата-центру — ${stages(state.project)}.` : 'Уряд готує наступне рішення.';
  const description = `Доставлена продукція принесла ${money(income)} надходжень. ${price ? `Указ коштував ${money(price)}` : 'Указ безкоштовний'}${policy === 'automate' ? ` і заощадив ${money(AUTOMATE_BUDGET)}` : ''}${fees ? `, платежі за угоди — ${money(fees)}` : ''}${upkeep ? `, утримання дата-центрів — ${money(upkeep)}` : ''}. Бюджет ${change ? (change > 0 ? '+' : '−') + money(Math.abs(change)) : 'без змін'}, довіра ${trustDelta ? (trustDelta > 0 ? '+' : '−') + Math.abs(trustDelta) : 'без змін'}. ${tail}`;
  return { state, events: events.sort((a, b) => a.at - b.at), ...news, description, income, fees, upkeep, policyCost: price, trustDelta, ending, outcome };
}

export const names = ['ІТ', 'Освіта', 'Промисловість', 'Логістика', 'Енергетика', 'Лікарні', 'Держпослуги'];
export const symbols = ['⌘', '◈', '▥', '⇄', 'ϟ', '✚', '▤'];

export type Sector = { name: string; automation: number; reserve: number; allocation: number; service: number };
export type Crisis = { kind: 'calm' | 'surge' | 'quota' | 'windfall'; sector: number; title: string; body: string };
export type State = {
  round: number; budget: number; trust: number;
  /** Імпортна квота без власних потужностей. Щораунду скорочується. */
  imports: number;
  /** Усі обчислення, доступні цього раунду. */
  capacity: number;
  owned: number; deals: number; project: number; collapsed: number;
  seed: number; crisis: Crisis; sectors: Sector[];
};
export type Policy = 'train' | 'center' | 'contract' | 'manual';
export type Event = { at: number; sector: number; title: string; body: string };
export type Outcome = 'ongoing' | 'victory' | 'compromise' | 'defeat';
export type Result = {
  state: State; events: Event[]; headline: string; description: string;
  income: number; fees: number; policyCost: number; trustDelta: number;
  ending: string | null; outcome: Outcome;
};
export type Check = { label: string; ok: boolean; value: string };

// ── Баланс. Усі числа сценарію зібрані тут. ─────────────────────────────────
export const LAST_ROUND = 12;
export const MAX_PER_SECTOR = 16;
export const costs: Record<Policy, number> = { train: 24, center: 55, contract: 15, manual: 0 };
export const DEAL_STEP = 20;          // кожна наступна угода дорожча
export const DEAL_FEE = 10;           // постійна плата за кожну угоду
export const DEAL_COMPUTE = 10;       // довічна надбавка до квоти
export const DEAL_RESERVE = 4;        // втрата резерву в кожній галузі
export const DEAL_TRUST = 3;
export const MANUAL_TRUST = 3;        // ручний режим безкоштовний для бюджету, але не для людей
export const IMPORT_CUT = 2;          // постачальник ріже квоту щораунду
export const MIN_IMPORT = 16;
export const CENTER_STAGES = 3;
export const CENTER_COMPUTE = 16;
export const BUILD_THRESHOLD = 75;    // ІТ і логістика для етапу будівництва
export const TRUST_FLOOR = 25;        // нижче — вотум недовіри
export const FAILURE_LEVEL = 50;      // збій галузі б'є по довірі одразу
export const COLLAPSE_LEVEL = 40;     // дві такі галузі два раунди поспіль — колапс
export const TRUST_WEIGHTS = [.09, .05, .03]; // лікарні, держпослуги, освіта
export const RESERVE_DECAY = 24;      // резерв тане на A / 24 за раунд
export const SURGE = 1.35;
export const QUOTA_DIP = 4;
export const WINDFALL = 4;
export const WIN = { trust: 45, service: 75, reserve: 20 };

export const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
export const plural = (n: number, forms: [string, string, string]) => {
  const a = Math.abs(n) % 100, b = a % 10;
  return forms[a > 10 && a < 20 ? 2 : b === 1 ? 0 : b >= 2 && b <= 4 ? 1 : 2];
};
const units = (n: number) => `${n} ${plural(n, ['одиницю', 'одиниці', 'одиниць'])}`;
const stages = (n: number) => `${n} ${plural(n, ['етап', 'етапи', 'етапів'])}`;

export const corporateFee = (state: State) => state.deals * DEAL_FEE;
export const policyCost = (state: State, policy: Policy) => costs[policy] + (policy === 'contract' ? state.deals * DEAL_STEP : 0);
/** Обчислення, які можна розподілити цього раунду з урахуванням обраного указу. */
export const availableCompute = (state: State, policy: Policy) => state.capacity + (policy === 'contract' ? DEAL_COMPUTE : 0);
export const surgeOf = (state: State, sector: number) => state.crisis.kind === 'surge' && state.crisis.sector === sector ? SURGE : 1;
export const need = (sector: Sector, surge = 1) => sector.automation / 8 * surge;

export function services(sector: Sector, surge = 1): number {
  const demand = need(sector, surge);
  const supply = demand === 0 ? 1 : clamp(sector.allocation / demand, 0, 1);
  return (100 + sector.automation * .3) * (sector.reserve / 100 + (1 - sector.reserve / 100) * supply);
}
export function forecastServices(sector: Sector, allocation: number, policy: Policy, targeted: boolean, surge = 1): number {
  const penalty = targeted && policy === 'train' ? .85 : targeted && policy === 'manual' ? .65 : 1;
  return services({ ...sector, allocation }, surge) * penalty;
}

// ── Події раунду. Той самий сід дає ту саму партію. ─────────────────────────
const calm: Crisis = { kind: 'calm', sector: -1, title: 'Тиждень без сюрпризів', body: 'Жодних нових потрясінь. Лише ті, що вже є.' };
const surges: [string, string][] = [
  ['Хвиля кібератак', 'Службам ІТ потрібно на третину більше обчислень, щоб утримати мережі.'],
  ['Вступна кампанія', 'Освіті потрібно на третину більше обчислень: заяви, іспити, розклади.'],
  ['Велике експортне замовлення', 'Промисловості потрібно на третину більше обчислень, щоб встигнути в строк.'],
  ['Затор на кордоні', 'Логістиці потрібно на третину більше обчислень, щоб перепланувати маршрути.'],
  ['Аномальна спека', 'Енергетиці потрібно на третину більше обчислень, щоб балансувати мережу.'],
  ['Сезон грипу', 'Лікарням потрібно на третину більше обчислень: черги ростуть щогодини.'],
  ['Податковий сезон', 'Держпослугам потрібно на третину більше обчислень: декларації подають усі одразу.'],
];
function random(seed: number, round: number): () => number {
  let t = (seed * 2654435761 + round * 40503) >>> 0;
  return () => { t = (t + 0x6D2B79F5) >>> 0; let x = Math.imul(t ^ (t >>> 15), 1 | t); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
}
/** Сід 0 означає спокійний сценарій без подій. Перший раунд завжди спокійний. */
export function crisisFor(seed: number, round: number): Crisis {
  if (!seed || round <= 7) return calm;
  const next = random(seed, round); const roll = next();
  if (roll < .6) { const sector = Math.floor(next() * 7); return { kind: 'surge', sector, title: surges[sector][0], body: surges[sector][1] }; }
  if (roll < .78) return { kind: 'quota', sector: -1, title: 'Постачальник «оптимізує» тарифи', body: `Цього раунду квота менша ще на ${QUOTA_DIP} одиниці.` };
  if (roll < .9) return { kind: 'windfall', sector: -1, title: 'Сусіди продали надлишок', body: `Разова поставка: цього раунду на ${WINDFALL} одиниці обчислень більше.` };
  return calm;
}
const crisisCompute = (crisis: Crisis) => crisis.kind === 'quota' ? -QUOTA_DIP : crisis.kind === 'windfall' ? WINDFALL : 0;

export function initialState(seed = 0): State {
  const crisis = crisisFor(seed, 7);
  return {
    round: 7, budget: 120, trust: 58, imports: 32, capacity: 40 + crisisCompute(crisis), owned: 8, deals: 0, project: 0, collapsed: 0, seed, crisis,
    sectors: names.map((name, i) => ({ name, automation: [88, 64, 88, 80, 80, 72, 72][i], reserve: [26, 44, 25, 32, 38, 40, 42][i], allocation: [6, 4, 7, 5, 6, 7, 5][i], service: 100 })),
  };
}

export const averageReserve = (state: State) => state.sectors.reduce((sum, v) => sum + v.reserve, 0) / state.sectors.length;
/** Умови м’якої посадки. Показуються гравцеві під час партії. */
export function landingChecks(state: State): Check[] {
  const worst = Math.min(...state.sectors.map(v => v.service));
  return [
    { label: `Довіра від ${WIN.trust}%`, ok: state.trust >= WIN.trust, value: `${state.trust}%` },
    { label: `Кожна галузь від ${WIN.service}%`, ok: worst >= WIN.service, value: `${Math.round(worst)}%` },
    { label: `Середній резерв від ${WIN.reserve}%`, ok: averageReserve(state) >= WIN.reserve, value: `${Math.round(averageReserve(state))}%` },
  ];
}

export function canChoose(state: State, policy: Policy): boolean {
  return state.round <= LAST_ROUND && state.deals < 3 && state.trust > TRUST_FLOOR && state.collapsed < 2 && state.budget >= 0
    && state.budget >= policyCost(state, policy) && (policy !== 'center' || state.project === 0);
}

export function resolveRound(before: State, allocations: number[], policy: Policy, target: number): Result {
  if (before.round > LAST_ROUND || !canChoose(before, policy)) throw new Error('Указ недоступний');
  if (allocations.length !== 7 || allocations.some(n => !Number.isInteger(n) || n < 0 || n > MAX_PER_SECTOR)
    || allocations.reduce((a, b) => a + b, 0) > availableCompute(before, policy)) throw new Error('Некоректний розподіл');
  if (!Number.isInteger(target) || target < 0 || target >= 7) throw new Error('Невідома галузь');

  const state: State = structuredClone(before);
  const s = state.sectors;
  const price = policyCost(before, policy);
  const fees = corporateFee(before);
  const hands = policy === 'train' || policy === 'manual';
  state.budget -= price;
  if (policy === 'contract') { state.deals++; state.imports += DEAL_COMPUTE; }
  s.forEach((sector, i) => { sector.allocation = allocations[i]; sector.service = forecastServices(sector, allocations[i], policy, i === target, surgeOf(before, i)); });

  const events: Event[] = [];
  if (policy === 'contract') events.push({ at: .09, sector: 0, title: `Корпоративна угода ${state.deals} / 3`, body: state.deals === 3
    ? 'Повне партнерство набуло чинності. Квоти й тарифи відтепер визначає консорціум.'
    : `Оплата зараз — ${price}. Квота зросла на ${DEAL_COMPUTE} назавжди, платежі з наступного раунду — ${corporateFee(state)} щоразу. Резерв кожної галузі додатково впаде на ${DEAL_RESERVE}.` });
  events.push({ at: .16, sector: 2, title: s[2].service >= 85 ? 'Заводи набирають обертів' : 'Виробничі лінії сповільнюються', body: `Випуск продукції — ${Math.round(s[2].service)}% базового рівня. Це визначить надходження до бюджету.` });

  const transportReady = s[3].service >= BUILD_THRESHOLD && s[0].service >= BUILD_THRESHOLD;
  if (policy === 'center') state.project = CENTER_STAGES;
  if (state.project > 0) {
    if (transportReady) state.project--;
    events.push({ at: .36, sector: 3, title: transportReady ? 'Обладнання доставлено' : 'Дата-центр чекає на обладнання', body: transportReady
      ? (state.project ? `Логістика та ІТ підтримують будівництво. До запуску — ${stages(state.project)}.` : 'Останній етап будівництва завершено.')
      : `Для будівництва логістика та ІТ мають працювати щонайменше на ${BUILD_THRESHOLD}%. Цього періоду етап не завершено.` });
    if (state.project === 0) { state.owned += CENTER_COMPUTE; events.push({ at: .72, sector: 0, title: 'Власний дата-центр у мережі', body: `Додано ${CENTER_COMPUTE} одиниць власної потужності. Її доступність залежатиме від енергетики.` }); }
  } else {
    const missed = Math.max(0, Math.round(100 - s[3].service));
    events.push({ at: .36, sector: 3, title: missed ? 'Частина вантажів затримується' : 'Вантажі прибувають вчасно', body: `Логістика працює на ${Math.round(s[3].service)}%. ${missed ? `${missed}% перевезень не виконано, а бюджет отримує дохід лише від доставленої продукції.` : 'Уся продукція доїхала до покупців.'}` });
  }
  if (hands) events.push({ at: .52, sector: target, title: policy === 'train' ? 'Працівники повертаються до практики' : 'Ручний режим запроваджено', body: `Резерв галузі «${names[target]}» зростає. Сьогодні частина послуг призупинена заради навчання.${policy === 'manual' ? ' Людям це не подобається.' : ''}` });
  else events.push({ at: .52, sector: 1, title: s[1].service >= 80 ? 'Навчання триває' : 'Заняття скорочено', body: `Освіта — ${Math.round(s[1].service)}%. Її стан впливає на ефективність перепідготовки наступного раунду.` });
  events.push({ at: .68, sector: 4, title: s[4].service >= 80 ? 'Мережа тримає навантаження' : 'Енергетики обмежують потужність', body: `Доступність власних серверів наступного раунду — ${Math.round(clamp(s[4].service / 100, 0, 1) * 100)}%.` });

  const failed = s.filter(v => v.service < FAILURE_LEVEL);
  events.push({ at: .85, sector: s[5].service < s[6].service ? 5 : 6, title: s[5].service < 75 ? 'Черги на допомогу зростають' : 'Країна підбиває підсумки', body: `Лікарні — ${Math.round(s[5].service)}%, держпослуги — ${Math.round(s[6].service)}%. Люди оцінюють роботу уряду.${failed.length ? ` Збій: ${failed.map(v => v.name).join(', ')}.` : ''}` });
  if (fees > 0) events.push({ at: .93, sector: 6, title: 'Рахунок за попередні угоди', body: `Списано ${fees} з бюджету. Ці платежі зберігаються навіть без нової допомоги.` });

  const delivered = s[2].service * clamp(s[3].service / 100, 0, 1);
  const income = Math.max(0, Math.round(delivered * .3 - 4 - Math.max(0, 75 - s[0].service) * .12));
  state.budget += income - fees;

  const felt = (v: Sector) => Math.min(v.service, 105) - 100;
  const trustDelta = Math.round(felt(s[5]) * TRUST_WEIGHTS[0] + felt(s[6]) * TRUST_WEIGHTS[1] + felt(s[1]) * TRUST_WEIGHTS[2] - failed.length * 2
    - (policy === 'manual' ? MANUAL_TRUST : 0) - (policy === 'contract' ? DEAL_TRUST : 0));
  state.trust = clamp(state.trust + trustDelta, 0, 100);

  const teaching = .5 + clamp(before.sectors[1].service / 100, 0, 1) * .5;
  s.forEach((sector, i) => {
    const gain = hands && i === target ? (policy === 'train' ? 15 : 22) * teaching : 0;
    sector.reserve = clamp(sector.reserve - sector.automation / RESERVE_DECAY + gain - (policy === 'contract' ? DEAL_RESERVE : 0), 0, 100);
  });

  state.collapsed = s.filter(v => v.service < COLLAPSE_LEVEL).length >= 2 ? state.collapsed + 1 : 0;
  state.round++;
  state.imports = Math.max(MIN_IMPORT, state.imports - IMPORT_CUT);
  state.crisis = crisisFor(state.seed, state.round);
  state.capacity = Math.max(0, state.imports + Math.floor(state.owned * clamp(s[4].service / 100, 0, 1)) + crisisCompute(state.crisis));

  let ending: string | null = null;
  if (state.budget < 0) ending = 'Держава не може оплатити рахунки';
  else if (state.trust <= TRUST_FLOOR) ending = 'Вотум недовіри';
  else if (state.collapsed >= 2) ending = 'Уряд втратив контроль';
  else if (state.deals >= 3) ending = 'Країна за підпискою';
  else if (state.round > LAST_ROUND) ending = landingChecks(state).every(c => c.ok) ? 'М’яка посадка' : 'Країна вистояла';
  const outcome: Outcome = ending === null ? 'ongoing' : ending === 'М’яка посадка' ? 'victory' : ending === 'Країна вистояла' ? 'compromise' : 'defeat';

  const headline = policy === 'contract' ? 'Уряд орендував ще трохи майбутнього'
    : state.owned > before.owned ? 'Власні сервери. Власна відповідальність.'
    : failed.length >= 2 ? 'Уряд просить не панікувати. Паніка не погоджується.'
    : s[5].service < 75 ? 'Міністр запевнив, що лікарі пам’ятають, як вимірювати тиск'
    : state.project && !transportReady ? 'Гроші є. Сервери їдуть. Дуже повільно.'
    : policy === 'manual' ? 'Країна згадує, де лежать паперові бланки'
    : s[2].service >= 85 && s[3].service < 75 ? 'Рекордне виробництво залишилося на складах'
    : s[6].service < 75 ? 'Черга до віконця № 3 отримала власний поштовий індекс'
    : policy === 'train' ? 'Люди згадали, як працювати без підказок'
    : trustDelta >= 0 ? 'День без катастроф. Уряд святкує стримано.'
    : 'Країна прожила ще один непростий період';

  const change = state.budget - before.budget;
  const tail = ending === 'Країна за підпискою' ? 'Три підписані угоди передали корпорації право визначати квоти та тарифи. Уряд залишився, рішення — ні.'
    : ending === 'Вотум недовіри' ? `Довіра впала до ${state.trust}%. Парламент відправив уряд у відставку.`
    : ending === 'Уряд втратив контроль' ? 'Дві галузі два періоди поспіль не працюють. Країною вже ніхто не керує.'
    : ending === 'Держава не може оплатити рахунки' ? 'Скарбниця порожня. Постачальники вимикають доступ за борги.'
    : ending ? 'Сценарій завершено.'
    : state.project ? `До запуску дата-центру — ${stages(state.project)}.` : 'Уряд готує наступне рішення.';
  const description = `Доставлена продукція принесла ${units(income)} надходжень. ${price ? `Указ коштував ${price}` : 'Указ безкоштовний'}${fees ? `, платежі за угоди — ${fees}` : ''}. Бюджет ${change ? (change > 0 ? '+' : '−') + Math.abs(change) : 'без змін'}, довіра ${trustDelta ? (trustDelta > 0 ? '+' : '−') + Math.abs(trustDelta) : 'без змін'}. ${tail}`;
  return { state, events: events.sort((a, b) => a.at - b.at), headline, description, income, fees, policyCost: price, trustDelta, ending, outcome };
}

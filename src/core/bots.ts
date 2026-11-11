// Боти для перевірки балансу. Не використовуються в інтерфейсі.
import { availableCompute, canChoose, forecastServices, initialState, phaseOf, policiesFor, resolveRound, surgeOf, LAST_ROUND, MAX_PER_SECTOR, SHOCK_ROUND, type Outcome, type Policy, type State } from './game';

export type Step = { policy: Policy; target: number };
export type Profile = 'even' | 'people' | 'money' | 'steady' | 'default';
export type Picker = (state: State, index: number) => Step & { profile?: Profile };
export type Playthrough = { outcome: Outcome; ending: string; state: State; steps: (Step & { profile: Profile })[] };

const weights: Record<Exclude<Profile, 'default'>, number[]> = {
  even: [1, 1, 1, 1, 1, 1, 1],
  people: [.9, 1, .9, .9, .9, 1.2, 1.1],   // лікарні й держпослуги насамперед
  money: [1, .85, 1.15, 1.15, 1, .95, .9], // заводи, логістика, будівництво
  steady: [.9, 1, .9, .9, .9, 1.2, 1.1],   // спершу всім по 75%, решту людям
};
const FLOOR = 75;

/** Зважене вирівнювання: наступна одиниця йде галузі з найнижчим прогнозом. */
export function allocate(state: State, policy: Policy, target: number, profile: Profile): number[] {
  let free = availableCompute(state, policy);
  if (profile === 'default') {
    const kept = state.sectors.map(s => s.allocation);
    while (kept.reduce((a, b) => a + b, 0) > free) kept[kept.indexOf(Math.max(...kept))]--;
    return kept;
  }
  const result = [0, 0, 0, 0, 0, 0, 0];
  const at = (i: number, n: number) => forecastServices(state.sectors[i], n, policy, i === target, surgeOf(state, i));
  while (free > 0) {
    let best = -1, low = Infinity;
    for (let i = 0; i < 7; i++) {
      if (result[i] >= MAX_PER_SECTOR || at(i, result[i] + 1) - at(i, result[i]) < 1e-9) continue;
      const now = at(i, result[i]);
      const level = profile === 'steady' && now < FLOOR ? now - 1000 : now / weights[profile][i];
      if (level < low) { low = level; best = i; }
    }
    if (best < 0) break;
    result[best]++; free--;
  }
  return result;
}

export function play(seed: number, pick: Picker, fallback: Profile = 'even'): Playthrough {
  let state = initialState(seed);
  const steps: Playthrough['steps'] = [];
  for (let index = 0; ; index++) {
    const choice = pick(state, index);
    const profile = choice.profile ?? fallback;
    const boom = phaseOf(state) === 'boom';
    const policy: Policy = canChoose(state, choice.policy) ? choice.policy : boom ? 'automate' : 'manual';
    const result = resolveRound(state, boom ? [] : allocate(state, policy, choice.target, profile), policy, choice.target);
    steps.push({ policy, target: choice.target, profile });
    state = result.state;
    if (result.ending) return { outcome: result.outcome, ending: result.ending, state, steps };
  }
}

export const weakest = (state: State) => state.sectors.indexOf(state.sectors.reduce((a, b) => a.reserve < b.reserve ? a : b));
export function generator(seed: number): () => number {
  let t = seed >>> 0;
  return () => (t = (t * 1664525 + 1013904223) >>> 0) / 4294967296;
}
const profiles: Profile[] = ['even', 'people', 'money', 'steady'];
const pick = <T>(list: T[], next: () => number) => list[Math.floor(next() * list.length)];
/** Випадковий план на всю партію: укази буму, потім укази дефіциту. */
export const randomPlan = (next: () => number) => Array.from({ length: LAST_ROUND }, (_, i) => ({
  policy: pick(policiesFor(i + 1 < SHOCK_ROUND ? 'boom' : 'deficit'), next), target: Math.floor(next() * 7), profile: pick(profiles, next),
}));

/** Чи існує переможна лінія серед випадкових планів. */
export function search(seed: number, attempts: number, allow: (plan: ReturnType<typeof randomPlan>) => boolean = () => true): Playthrough | null {
  const next = generator(seed * 7919 + 17);
  for (let n = 0; n < attempts; n++) {
    const plan = randomPlan(next);
    if (!allow(plan)) continue;
    const run = play(seed, (_s, i) => plan[i]);
    if (run.outcome === 'victory') return run;
  }
  return null;
}

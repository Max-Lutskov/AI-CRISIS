import { describe, it, expect } from 'vitest';
import {
  initialState, resolveRound, services, forecastServices, forecastFor, policyCost, availableCompute, canChoose, crisisFor, landingChecks, plural, surgeOf, phaseOf, yearOf,
  proportional, averageReserve, averageAutomation, policiesFor, chronicle,
  AUTOMATE_BUDGET, AUTOMATE_GAIN, CENTER_COMPUTE, DEAL_COMPUTE, DEAL_FEE, DEAL_RESERVE, DRIFT, ELECTION, IMPORT_CUT, LAST_ROUND, MANUAL_TRUST, SHOCK_IMPORT, SHOCK_ROUND, SURGE,
  TRUST_FLOOR, VICTORY, SURVIVED, type State,
} from './game';

const kept = (state: State) => state.sectors.map(s => s.allocation);
/** Типовий стан на початок дефіциту, зібраний вручну, щоб тести не залежали від балансу буму. */
function crisis(seed = 0): State {
  const state = initialState(seed);
  state.round = SHOCK_ROUND; state.budget = 120; state.trust = 58; state.imports = 32; state.capacity = 40;
  [88, 64, 88, 80, 80, 72, 72].forEach((a, i) => state.sectors[i].automation = a);
  [26, 44, 25, 32, 38, 40, 42].forEach((r, i) => state.sectors[i].reserve = r);
  [6, 4, 7, 5, 6, 7, 5].forEach((n, i) => state.sectors[i].allocation = n);
  return state;
}

describe('роки буму', () => {
  it('починає у 2023 році без ліміту обчислень', () => {
    const state = initialState();
    expect([yearOf(state.round), phaseOf(state), state.capacity]).toEqual([2023, 'boom', 0]);
    expect(policiesFor('boom')).toEqual(['automate', 'regulate', 'train', 'center']);
    expect(canChoose(state, 'contract')).toBe(false);
    expect(canChoose(state, 'manual')).toBe(false);
    state.sectors.forEach((_, i) => expect(forecastFor(state, i, 0, 'regulate', 0)).toBeGreaterThan(100));
  });

  it('щороку сама додає автоматизації й забирає навички', () => {
    const state = initialState(); const original = structuredClone(state);
    const next = resolveRound(state, [], 'train', 1).state;
    expect(state).toEqual(original);
    expect(next.sectors[0].automation).toBe(state.sectors[0].automation + DRIFT);
    expect(next.sectors[0].reserve).toBeLessThan(state.sectors[0].reserve);
    expect(next.sectors[1].reserve).toBeGreaterThan(resolveRound(state, [], 'automate', 0).state.sectors[1].reserve);
    expect(next.round).toBe(2);
  });

  it('робить ШІ-прорив вигідним зараз і дорогим потім', () => {
    const state = initialState();
    const greedy = resolveRound(state, [], 'automate', 2);
    const plain = resolveRound(state, [], 'train', 1);
    expect(greedy.state.sectors[2].automation).toBe(state.sectors[2].automation + DRIFT + AUTOMATE_GAIN);
    expect(greedy.state.budget).toBe(state.budget + AUTOMATE_BUDGET + greedy.income);
    expect(greedy.trustDelta).toBeGreaterThan(plain.trustDelta);
    const later = resolveRound(greedy.state, [], 'train', 1).state;
    const laterPlain = resolveRound(plain.state, [], 'train', 1).state;
    expect(later.sectors[2].reserve).toBeLessThan(laterPlain.sectors[2].reserve);
  });

  it('сповільнює залежність правилом двох ключів ціною довіри', () => {
    const state = initialState();
    const slow = resolveRound(state, [], 'regulate', 0);
    const fast = resolveRound(state, [], 'automate', 0);
    expect(averageAutomation(slow.state)).toBeLessThan(averageAutomation(fast.state));
    expect(averageReserve(slow.state)).toBeGreaterThan(averageReserve(fast.state));
    expect(slow.trustDelta).toBeLessThan(0);
  });

  it('знімає уряд на виборах наприкінці буму за низької довіри', () => {
    let state = initialState(); let last = resolveRound(state, [], 'regulate', 0);
    for (let i = 1; i < 4; i++) { state = last.state; last = resolveRound(state, [], 'regulate', 0); }
    expect(last.state.trust).toBeLessThan(ELECTION);
    expect(last.ending).toBe('Програні вибори');
    expect(last.outcome).toBe('defeat');
  });

  it('вмикає шок у 2027 році з квотою та стартовим розподілом', () => {
    let state = initialState(3);
    for (let i = 0; i < 4; i++) state = resolveRound(state, [], 'automate', i).state;
    expect([yearOf(state.round), phaseOf(state)]).toEqual([2027, 'deficit']);
    expect(state.imports).toBe(SHOCK_IMPORT);
    expect(state.capacity).toBeGreaterThan(SHOCK_IMPORT);
    expect(kept(state).reduce((a, b) => a + b, 0)).toBe(state.capacity);
    expect(canChoose(state, 'automate')).toBe(false);
    expect(canChoose(state, 'manual')).toBe(true);
    expect(() => resolveRound(state, kept(state), 'train', 0)).not.toThrow();
  });

  it('дає дата-центру, збудованому в бум, запрацювати до шоку', () => {
    let state = initialState(); state.budget = 60;
    state = resolveRound(state, [], 'center', 0).state;
    for (let i = 0; i < 3; i++) state = resolveRound(state, [], 'train', i).state;
    expect(state.owned).toBe(8 + CENTER_COMPUTE);
    expect(state.capacity).toBeGreaterThan(SHOCK_IMPORT + 8);
  });

  it('має хроніку для кожного року буму та шоку', () => {
    for (let round = 1; round <= SHOCK_ROUND; round++) expect(chronicle[round].headline.length).toBeGreaterThan(5);
  });
});

describe('роки дефіциту', () => {
  it('не змінює вхідний стан і зводить бюджет', () => {
    const state = crisis(); const original = structuredClone(state);
    const result = resolveRound(state, kept(state), 'train', 1);
    expect(state).toEqual(original);
    expect(result.state.budget).toBe(120 - 24 + result.income);
    expect(result.state.round).toBe(SHOCK_ROUND + 1);
    expect(result.state.trust).toBe(state.trust + result.trustDelta);
  });

  it('витримує крайні значення формули послуг', () => {
    const sector = crisis().sectors[0];
    expect(services({ ...sector, automation: 0, allocation: 0 })).toBe(100);
    expect(services({ ...sector, reserve: 0, allocation: 0 })).toBe(0);
    expect(services({ ...sector, reserve: 100, allocation: 0 })).toBeCloseTo(126.4);
    expect(services({ ...sector, allocation: 11 }, SURGE)).toBeLessThan(services({ ...sector, allocation: 11 }));
  });

  it('відхиляє зайвий розподіл, чужі укази й повторне будівництво', () => {
    const state = crisis();
    expect(() => resolveRound(state, [16, 16, 16, 16, 16, 16, 16], 'manual', 0)).toThrow();
    expect(() => resolveRound(state, [6, 4, 7, 5, 6, 7, 6], 'manual', 0)).toThrow();
    expect(() => resolveRound(state, kept(state), 'manual', 7)).toThrow();
    expect(() => resolveRound(state, kept(state), 'automate', 0)).toThrow();
    state.project = 2;
    expect(() => resolveRound(state, kept(state), 'center', 0)).toThrow();
  });

  it('будує дата-центр лише за працюючих ІТ і логістики', () => {
    const state = crisis(); state.project = 2;
    expect(resolveRound(state, [0, 5, 10, 0, 10, 10, 5], 'train', 1).state.project).toBe(2);
    expect(resolveRound(state, [9, 2, 5, 9, 5, 5, 5], 'train', 1).state.project).toBe(1);
    state.project = 1;
    const done = resolveRound(state, [9, 2, 5, 9, 5, 5, 5], 'train', 1);
    expect(done.state.owned).toBe(8 + CENTER_COMPUTE);
    expect(done.state.capacity).toBeGreaterThan(state.capacity);
  });

  it('щороку скорочує імпортну квоту', () => {
    const state = crisis();
    const next = resolveRound(state, kept(state), 'train', 1).state;
    expect(next.imports).toBe(state.imports - IMPORT_CUT);
    expect(next.capacity).toBeLessThan(state.capacity);
  });

  it('дає за угоду обчислення назавжди і постійний рахунок', () => {
    const state = crisis();
    expect(availableCompute(state, 'contract')).toBe(state.capacity + DEAL_COMPUTE);
    const allocation = [8, 5, 8, 7, 7, 8, 7];
    expect(() => resolveRound(state, allocation, 'train', 1)).toThrow();
    const deal = resolveRound(state, allocation, 'contract', 0);
    const plain = resolveRound(state, kept(state), 'train', 1);
    expect(deal.state.imports).toBe(plain.state.imports + DEAL_COMPUTE);
    expect(deal.state.sectors[2].reserve).toBeCloseTo(plain.state.sectors[2].reserve - DEAL_RESERVE);
    const after = resolveRound(deal.state, [8, 5, 8, 7, 6, 7, 7], 'train', 1);
    expect(after.fees).toBe(DEAL_FEE);
    expect(after.state.budget).toBe(deal.state.budget - 24 + after.income - DEAL_FEE);
  });

  it('робить кожну наступну угоду дорожчою, а третю — кінцем незалежності', () => {
    let state = crisis();
    for (let i = 0; i < 3; i++) {
      expect(policyCost(state, 'contract')).toBe(15 + i * 20);
      const result = resolveRound(state, kept(state), 'contract', 0);
      expect(result.fees).toBe(i * DEAL_FEE);
      state = result.state;
      if (i < 2) expect(result.outcome).toBe('ongoing');
      else { expect(result.ending).toBe('Країна за підпискою'); expect(result.outcome).toBe('defeat'); }
    }
    expect(canChoose(state, 'manual')).toBe(false);
  });

  it('бере за ручний режим довірою, а не грошима', () => {
    const state = crisis();
    const manual = resolveRound(state, kept(state), 'manual', 0);
    const train = resolveRound(state, kept(state), 'train', 0);
    expect(manual.policyCost).toBe(0);
    expect(manual.state.sectors[0].reserve).toBeGreaterThan(train.state.sectors[0].reserve);
    expect(manual.trustDelta).toBeLessThanOrEqual(train.trustDelta - MANUAL_TRUST + 1);
  });

  it('показує в прогнозі те саме, що станеться', () => {
    for (const policy of ['contract', 'train', 'manual', 'center'] as const) for (const seed of [0, 3, 8]) {
      let state = crisis(seed);
      state = resolveRound(state, kept(state), 'train', 2).state;
      const allocation = proportional(state);
      const result = resolveRound(state, allocation, policy, 1);
      state.sectors.forEach((s, i) => {
        expect(result.state.sectors[i].service).toBeCloseTo(forecastFor(state, i, allocation[i], policy, 1));
        expect(result.state.sectors[i].service).toBeCloseTo(forecastServices(s, allocation[i], policy, (policy === 'train' || policy === 'manual') && i === 1, surgeOf(state, i)));
      });
    }
  });

  it('втрачає дохід, коли логістика не довозить продукцію', () => {
    const state = crisis();
    const normal = resolveRound(state, [6, 4, 8, 6, 6, 5, 5], 'train', 1);
    const disrupted = resolveRound(state, [6, 4, 8, 0, 6, 8, 8], 'train', 1);
    expect(disrupted.income).toBeLessThan(normal.income);
  });

  it('відправляє уряд у відставку за провал довіри', () => {
    const state = crisis(); state.trust = TRUST_FLOOR + 2;
    const result = resolveRound(state, [16, 0, 12, 12, 0, 0, 0], 'manual', 5);
    expect(result.ending).toBe('Вотум недовіри');
    expect(result.outcome).toBe('defeat');
  });

  it('оголошує банкрутство та колапс', () => {
    const broke = crisis(); broke.deals = 2; broke.budget = 5;
    expect(resolveRound(broke, [0, 5, 0, 0, 10, 14, 11], 'manual', 1).ending).toBe('Держава не може оплатити рахунки');
    let state = crisis(); state.trust = 100; let ending: string | null = null;
    for (let i = 0; i < 2; i++) { state.sectors.forEach(s => s.reserve = 5); const result = resolveRound(state, [0, 0, 0, 0, 0, 15, 15], 'train', 1); state = result.state; ending = result.ending; }
    expect(ending).toBe('Уряд втратив контроль');
  });

  it('завершує сценарій після 2032 року', () => {
    const final = crisis(); final.round = LAST_ROUND;
    const result = resolveRound(final, kept(final), 'train', 0);
    expect([VICTORY, SURVIVED]).toContain(result.ending);
    expect(yearOf(LAST_ROUND)).toBe(2032);
    expect(() => resolveRound(result.state, kept(final), 'train', 0)).toThrow();
  });

  it('пояснює три умови виходу з кризи', () => {
    const state = crisis();
    expect(landingChecks(state).map(c => c.ok)).toEqual([true, true, true]);
    state.trust = 30; state.sectors[3].service = 60; state.sectors.forEach(s => s.reserve = 10);
    expect(landingChecks(state).map(c => c.ok)).toEqual([false, false, false]);
  });

  it('повторює події за сідом і мовчить у роки буму', () => {
    for (let round = 1; round <= LAST_ROUND; round++) {
      expect(crisisFor(0, round).kind).toBe('calm');
      expect(crisisFor(42, round)).toEqual(crisisFor(42, round));
      if (round <= SHOCK_ROUND) expect(crisisFor(42, round).kind).toBe('calm');
    }
    const kinds = new Set<string>();
    for (let seed = 1; seed <= 40; seed++) for (let round = SHOCK_ROUND + 1; round <= LAST_ROUND; round++) kinds.add(crisisFor(seed, round).kind);
    expect([...kinds].sort()).toEqual(['calm', 'quota', 'surge', 'windfall']);
  });

  it('відмінює числівники', () => {
    const forms: [string, string, string] = ['етап', 'етапи', 'етапів'];
    expect([1, 2, 5, 11, 21, 24, 112].map(n => plural(n, forms))).toEqual(['етап', 'етапи', 'етапів', 'етапів', 'етап', 'етапи', 'етапів']);
  });
});

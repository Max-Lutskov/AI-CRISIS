import { describe, it, expect } from 'vitest';
import {
  initialState, resolveRound, services, forecastServices, policyCost, availableCompute, canChoose, crisisFor, landingChecks, plural, surgeOf,
  CENTER_COMPUTE, DEAL_COMPUTE, DEAL_FEE, DEAL_RESERVE, IMPORT_CUT, MANUAL_TRUST, SURGE, TRUST_FLOOR, type State,
} from './game';

const kept = (state: State) => state.sectors.map(s => s.allocation);

describe('симуляція кризи', () => {
  it('не змінює вхідний стан і зводить бюджет', () => {
    const state = initialState(); const original = structuredClone(state);
    const result = resolveRound(state, kept(state), 'train', 1);
    expect(state).toEqual(original);
    expect(result.state.budget).toBe(120 - 24 + result.income);
    expect(result.state.round).toBe(8);
    expect(result.state.trust).toBe(state.trust + result.trustDelta);
  });

  it('витримує крайні значення формули послуг', () => {
    const sector = initialState().sectors[0];
    expect(services({ ...sector, automation: 0, allocation: 0 })).toBe(100);
    expect(services({ ...sector, reserve: 0, allocation: 0 })).toBe(0);
    expect(services({ ...sector, reserve: 100, allocation: 0 })).toBeCloseTo(126.4);
    expect(services({ ...sector, allocation: 11 }, SURGE)).toBeLessThan(services({ ...sector, allocation: 11 }));
  });

  it('відхиляє зайвий розподіл і повторне будівництво', () => {
    const state = initialState();
    expect(() => resolveRound(state, [16, 16, 16, 16, 16, 16, 16], 'manual', 0)).toThrow();
    expect(() => resolveRound(state, [6, 4, 7, 5, 6, 7, 6], 'manual', 0)).toThrow();
    expect(() => resolveRound(state, kept(state), 'manual', 7)).toThrow();
    state.project = 2;
    expect(() => resolveRound(state, kept(state), 'center', 0)).toThrow();
  });

  it('будує дата-центр лише за працюючих ІТ і логістики', () => {
    const state = initialState(); state.project = 2;
    expect(resolveRound(state, [0, 5, 10, 0, 10, 10, 5], 'train', 1).state.project).toBe(2);
    expect(resolveRound(state, [9, 2, 5, 9, 5, 5, 5], 'train', 1).state.project).toBe(1);
    state.project = 1;
    const done = resolveRound(state, [9, 2, 5, 9, 5, 5, 5], 'train', 1);
    expect(done.state.owned).toBe(8 + CENTER_COMPUTE);
    expect(done.state.capacity).toBeGreaterThan(state.capacity);
  });

  it('щораунду скорочує імпортну квоту', () => {
    const state = initialState();
    const next = resolveRound(state, kept(state), 'train', 1).state;
    expect(next.imports).toBe(state.imports - IMPORT_CUT);
    expect(next.capacity).toBeLessThan(state.capacity);
  });

  it('дає за угоду обчислення назавжди і постійний рахунок', () => {
    const state = initialState();
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

  it('робить кожну наступну угоду дорожчою, а третю — поразкою', () => {
    let state = initialState();
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
    const state = initialState();
    const manual = resolveRound(state, kept(state), 'manual', 0);
    const train = resolveRound(state, kept(state), 'train', 0);
    expect(manual.policyCost).toBe(0);
    expect(manual.state.sectors[0].reserve).toBeGreaterThan(train.state.sectors[0].reserve);
    expect(manual.trustDelta).toBeLessThanOrEqual(train.trustDelta - MANUAL_TRUST + 1);
  });

  it('показує в прогнозі те саме, що станеться', () => {
    for (const policy of ['contract', 'train', 'manual', 'center'] as const) for (const seed of [0, 3, 8]) {
      let state = initialState(seed);
      state = resolveRound(state, kept(state), 'train', 2).state;
      const allocation = kept(state);
      while (allocation.reduce((a, b) => a + b, 0) > state.capacity) allocation[allocation.indexOf(Math.max(...allocation))]--;
      const result = resolveRound(state, allocation, policy, 1);
      state.sectors.forEach((s, i) => expect(result.state.sectors[i].service).toBeCloseTo(forecastServices(s, allocation[i], policy, i === 1, surgeOf(state, i))));
    }
  });

  it('втрачає дохід, коли логістика не довозить продукцію', () => {
    const state = initialState();
    const normal = resolveRound(state, [6, 4, 8, 6, 6, 5, 5], 'train', 1);
    const disrupted = resolveRound(state, [6, 4, 8, 0, 6, 8, 8], 'train', 1);
    expect(disrupted.income).toBeLessThan(normal.income);
  });

  it('відправляє уряд у відставку за провал довіри', () => {
    const state = initialState(); state.trust = TRUST_FLOOR + 2;
    const result = resolveRound(state, [16, 0, 12, 12, 0, 0, 0], 'manual', 5);
    expect(result.ending).toBe('Вотум недовіри');
    expect(result.outcome).toBe('defeat');
  });

  it('оголошує банкрутство та колапс', () => {
    const broke = initialState(); broke.deals = 2; broke.budget = 5;
    expect(resolveRound(broke, [0, 5, 0, 0, 10, 14, 11], 'manual', 1).ending).toBe('Держава не може оплатити рахунки');
    let state = initialState(); state.trust = 100; let ending: string | null = null;
    for (let i = 0; i < 2; i++) { state.sectors.forEach(s => s.reserve = 5); const result = resolveRound(state, [0, 0, 0, 0, 0, 15, 15], 'train', 1); state = result.state; ending = result.ending; }
    expect(ending).toBe('Уряд втратив контроль');
  });

  it('завершує сценарій після дванадцятого раунду', () => {
    const final = initialState(); final.round = 12;
    const result = resolveRound(final, kept(final), 'train', 0);
    expect(result.ending).not.toBeNull();
    expect(() => resolveRound(result.state, kept(final), 'train', 0)).toThrow();
  });

  it('пояснює умови м’якої посадки', () => {
    const state = initialState();
    expect(landingChecks(state).map(c => c.ok)).toEqual([true, true, true]);
    state.trust = 30; state.sectors[3].service = 60; state.sectors.forEach(s => s.reserve = 10);
    expect(landingChecks(state).map(c => c.ok)).toEqual([false, false, false]);
  });

  it('повторює події за сідом і мовчить без сіда', () => {
    for (let round = 7; round <= 12; round++) {
      expect(crisisFor(0, round).kind).toBe('calm');
      expect(crisisFor(42, round)).toEqual(crisisFor(42, round));
    }
    expect(crisisFor(42, 7).kind).toBe('calm');
    const kinds = new Set<string>();
    for (let seed = 1; seed <= 40; seed++) for (let round = 8; round <= 12; round++) kinds.add(crisisFor(seed, round).kind);
    expect([...kinds].sort()).toEqual(['calm', 'quota', 'surge', 'windfall']);
  });

  it('відмінює числівники', () => {
    const forms: [string, string, string] = ['етап', 'етапи', 'етапів'];
    expect([1, 2, 5, 11, 21, 24, 112].map(n => plural(n, forms))).toEqual(['етап', 'етапи', 'етапів', 'етапів', 'етап', 'етапи', 'етапів']);
  });
});

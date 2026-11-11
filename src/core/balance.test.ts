// Перевірка балансу ботами. Якщо тест падає після зміни чисел у game.ts —
// це сигнал, що якась стратегія стала домінувати або перемога зникла.
import { describe, it, expect } from 'vitest';
import { play, search, weakest, type Picker, type Profile } from './bots';

const seeds = Array.from({ length: 20 }, (_, i) => i + 1);
const wins = (pick: Picker, profile: Profile) => seeds.filter(seed => play(seed, pick, profile).outcome === 'victory').length;
const defeats = (pick: Picker, profile: Profile) => seeds.filter(seed => play(seed, pick, profile).outcome === 'defeat').length;

const manualSpam: Picker = s => ({ policy: 'manual', target: weakest(s) });
const trainOnly: Picker = s => ({ policy: 'train', target: weakest(s) });
const centerThenTrain: Picker = (s, i) => i === 0 ? { policy: 'center', target: 0 } : { policy: 'train', target: weakest(s) };
const dealThenTrain: Picker = (s, i) => i === 0 ? { policy: 'contract', target: 0 } : { policy: 'train', target: weakest(s) };
const dealCenterTrain: Picker = (s, i) => i === 0 ? { policy: 'contract', target: 0 } : i === 1 ? { policy: 'center', target: 0 } : { policy: 'train', target: weakest(s) };
const twoDeals: Picker = (s, i) => i < 2 ? { policy: 'contract', target: 0 } : { policy: 'train', target: weakest(s) };
const threeDeals: Picker = () => ({ policy: 'contract', target: 0 });

describe('баланс сценарію', () => {
  it('не дає виграти, не чіпаючи розподіл', () => {
    for (const pick of [manualSpam, trainOnly, centerThenTrain, dealThenTrain, dealCenterTrain, twoDeals]) expect(wins(pick, 'default')).toBe(0);
  });

  it('карає за безкоштовний ручний режим щораунду', () => {
    for (const profile of ['even', 'steady', 'people', 'default'] as const) expect(wins(manualSpam, profile)).toBe(0);
    expect(defeats(manualSpam, 'even')).toBeGreaterThanOrEqual(15);
  });

  it('не дає виграти без інвестицій у потужність', () => {
    for (const profile of ['even', 'steady', 'people'] as const) expect(wins(trainOnly, profile)).toBe(0);
  });

  it('винагороджує підготовку: дата-центр і перепідготовка', () => {
    expect(wins(centerThenTrain, 'steady')).toBeGreaterThanOrEqual(12);
  });

  it('робить першу угоду справжньою спокусою, а не пасткою', () => {
    expect(wins(dealCenterTrain, 'even')).toBeGreaterThanOrEqual(8);
    expect(wins(dealThenTrain, 'even') + wins(dealThenTrain, 'steady')).toBeGreaterThanOrEqual(3);
  });

  it('не робить жоден простий рецепт гарантованим', () => {
    for (const pick of [centerThenTrain, dealThenTrain, dealCenterTrain]) for (const profile of ['even', 'steady'] as const) expect(wins(pick, profile)).toBeLessThan(seeds.length);
  });

  it('залишає другу угоду виживанням, а третю — поразкою', () => {
    for (const profile of ['even', 'steady'] as const) expect(wins(twoDeals, profile)).toBe(0);
    expect(defeats(twoDeals, 'default')).toBeGreaterThanOrEqual(15);
    expect(defeats(threeDeals, 'steady')).toBe(seeds.length);
  });

  it('має переможну лінію на кожному сіді', () => {
    for (const seed of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) expect(search(seed, 1500), `сід ${seed}`).not.toBeNull();
  });
});

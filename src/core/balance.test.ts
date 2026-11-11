// Перевірка балансу ботами на повній партії 2023–2032.
// Якщо тест падає після зміни чисел у game.ts — якась стратегія стала домінувати або перемога зникла.
import { describe, it, expect } from 'vitest';
import { play, search, weakest, type Picker, type Profile } from './bots';
import { canChoose, phaseOf, staffNeed, STAFF_STEP, WIN } from './game';

const seeds = Array.from({ length: 20 }, (_, i) => i + 1);
const BOOM = 4;
type Half = (state: Parameters<Picker>[0], index: number) => ReturnType<Picker>;
const game = (boom: Half, deficit: Half): Picker => (s, i) => i < BOOM ? boom(s, i) : deficit(s, i - BOOM);
const count = (pick: Picker, profile: Profile, outcome: string) => seeds.filter(seed => play(seed, pick, profile).outcome === outcome).length;
const wins = (pick: Picker, profile: Profile) => count(pick, profile, 'victory');
const defeats = (pick: Picker, profile: Profile) => count(pick, profile, 'defeat');
const endings = (pick: Picker, profile: Profile) => new Set(seeds.map(seed => play(seed, pick, profile).ending));

// бум
const greedy: Half = (_s, i) => ({ policy: 'automate', target: [2, 3, 0, 5][i] });
const cautious: Half = () => ({ policy: 'regulate', target: 0 });
const schooling: Half = s => ({ policy: 'train', target: weakest(s) });
const prepared: Half = (s, i) => i === 0 ? { policy: 'automate', target: 2 } : i === 1 ? { policy: 'center', target: 0 } : { policy: 'train', target: weakest(s) };
/** «Нічого, що забирає довіру»: дата-центр щойно можна, решту років буму — прориви. */
const lazy: Half = (s, i) => canChoose(s, 'center') ? { policy: 'center', target: 0 } : { policy: 'automate', target: [2, 3, 0, 5][i] };
const balanced: Half = (_s, i) => i < 2 ? { policy: 'automate', target: [2, 3][i] } : { policy: 'regulate', target: 0 };
// дефіцит
const train: Half = s => ({ policy: 'train', target: weakest(s) });
const manual: Half = s => ({ policy: 'manual', target: weakest(s) });
const centerThenTrain: Half = (s, i) => i === 0 ? { policy: 'center', target: 0 } : { policy: 'train', target: weakest(s) };
const dealThenTrain: Half = (s, i) => i === 0 ? { policy: 'contract', target: 0 } : { policy: 'train', target: weakest(s) };
const centersThenTrain: Half = s => canChoose(s, 'center') ? { policy: 'center', target: 0 } : { policy: 'train', target: weakest(s) };
/** Досвідчений гравець: один прорив, дата-центри й угоди за планом, ІТ вчить до планки інженерів, далі — найслабшу галузь. */
const expert = (centers: number, deals: number): Picker => s => {
  const low = weakest(s);
  if (s.round === 1) return { policy: 'automate', target: 2 };
  if (s.centers < centers && canChoose(s, 'center')) return { policy: 'center', target: 0 };
  if (phaseOf(s) === 'deficit' && s.deals < deals && canChoose(s, 'contract')) return { policy: 'contract', target: 0 };
  const engineers = staffNeed(s) + (s.project > 0 ? STAFF_STEP : 0);
  return { policy: 'train', target: s.sectors[low].reserve > WIN.reserve + 6 && s.sectors[0].reserve < engineers ? 0 : low };
};
const threeDeals: Half = () => ({ policy: 'contract', target: 0 });

describe('баланс повної партії', () => {
  it('не дає виграти після жадібного буму', () => {
    for (const deficit of [train, centerThenTrain, dealThenTrain, manual]) for (const profile of ['steady', 'even', 'default'] as const) expect(wins(game(greedy, deficit), profile)).toBe(0);
  });

  it('не дає виграти самими серверами без навичок', () => {
    for (const deficit of [train, centersThenTrain]) for (const profile of ['steady', 'even', 'people', 'money'] as const) expect(wins(game(lazy, deficit), profile)).toBe(0);
  });

  it('знімає на виборах уряд, який лише гальмував ШІ', () => {
    expect(endings(game(cautious, train), 'steady')).toEqual(new Set(['Програні вибори']));
  });

  it('винагороджує підготовку в роки буму', () => {
    for (const line of [game(prepared, centerThenTrain), game(prepared, dealThenTrain), game(balanced, centerThenTrain)]) expect(wins(line, 'steady') + count(line, 'steady', 'compromise')).toBeGreaterThanOrEqual(14);
  });

  it('не має рецепта, який виграє на кожному сіді', () => {
    for (const [centers, deals] of [[2, 0], [1, 1], [1, 0], [3, 0]]) for (const profile of ['steady', 'even', 'people', 'money'] as const)
      expect(wins(expert(centers, deals), profile), `${centers} дата-центри, ${deals} угоди, ${profile}`).toBeLessThanOrEqual(15);
    expect(wins(expert(2, 0), 'steady')).toBeGreaterThanOrEqual(6);
    expect(wins(expert(1, 1), 'steady')).toBeGreaterThanOrEqual(4);
  });

  it('не рятує самим навчанням без власних потужностей', () => {
    expect(wins(game(schooling, train), 'steady')).toBe(0);
    expect(wins(game(schooling, centerThenTrain), 'steady')).toBeLessThanOrEqual(6);
  });

  it('карає за ручний режим щороку навіть після доброї підготовки', () => {
    for (const boom of [greedy, schooling, balanced, prepared]) expect(wins(game(boom, manual), 'steady')).toBe(0);
    expect(defeats(game(greedy, manual), 'steady')).toBeGreaterThanOrEqual(15);
  });

  it('не дає виграти після слабкого буму, не чіпаючи розподіл', () => {
    for (const boom of [greedy, schooling]) for (const deficit of [train, centerThenTrain, dealThenTrain]) expect(wins(game(boom, deficit), 'default')).toBe(0);
  });

  it('залишає третю угоду кінцем незалежності', () => {
    expect(endings(game(prepared, threeDeals), 'steady')).toEqual(new Set(['Країна за підпискою']));
  });

  it('має переможну лінію на кожному сіді', () => {
    const plans = [[2, 0], [1, 1], [1, 0]].flatMap(([centers, deals]) => (['steady', 'even', 'people', 'money'] as const).map(profile => [expert(centers, deals), profile] as const));
    for (const seed of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
      expect(plans.some(([pick, profile]) => play(seed, pick, profile).outcome === 'victory') || search(seed, 4000) !== null, `сід ${seed}`).toBe(true);
  });
});

import { describe, it, expect } from 'vitest';
import { initialState, resolveRound, names, SHOCK_ROUND, type Policy, type State } from './game';
import { allocate } from './bots';
import { moodOf, RUSTY } from './herald';

const sign = (state: State, policy: Policy, target: number) => resolveRound(state, state.round < SHOCK_ROUND ? [] : allocate(state, policy, target, 'even'), policy, target);

describe('вісник', () => {
  it('той самий указ у різних галузях дає різні історії', () => {
    for (const policy of ['automate', 'train'] as Policy[]) {
      const leads = names.map((_, target) => sign(initialState(7), policy, target).lead);
      expect(new Set(leads.map(lead => lead.title)).size).toBe(7);
      leads.forEach((lead, target) => expect(lead.sector).toBe(target));
    }
  });

  it('той самий сід і ті самі рішення дають ту саму газету', () => {
    const a = sign(initialState(42), 'automate', 3), b = sign(initialState(42), 'automate', 3);
    expect([a.headline, a.lead, a.stories]).toEqual([b.headline, b.lead, b.stories]);
  });

  it('пише про інші галузі й не повторює історії два роки поспіль', () => {
    let state = initialState(42); let last: string[] = [];
    for (let year = 1; year < SHOCK_ROUND; year++) {
      const result = sign(state, 'automate', year);
      const titles = result.stories.map(story => story.title);
      expect(titles.length).toBe(3);
      expect(result.stories.every(story => story.sector !== year)).toBe(true);
      expect(titles.some(title => last.includes(title))).toBe(false);
      last = titles; state = result.state;
    }
  });

  it('втрачені навички стають новиною', () => {
    const before = initialState(1); const after = structuredClone(before);
    after.sectors[0].reserve = RUSTY - 1; after.sectors[0].automation = 40;
    expect(moodOf(before, after, 0)).toBe('rusty');
    expect(moodOf(before, after, 1)).toBe('perk');
  });
});

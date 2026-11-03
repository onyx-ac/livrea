import { describe, expect, it, vi } from 'vitest';
import { computed, effect } from '../src/reactive.js';
import { applyPatches, diffState, Store } from '../src/store.js';

const initial = () => ({
  site: { name: 'Grand', address: { city: 'Udine' } },
  menu: [{ id: 1, title: 'Risotto' }]
});

describe('the store', () => {
  it('re-runs only what read a changed path', () => {
    const store = new Store(initial());
    const nameRuns = vi.fn(() => store.view.site.name);
    const menuRuns = vi.fn(() => store.view.menu.length);
    const name = computed(nameRuns);
    const menu = computed(menuRuns);
    effect(() => {
      name.get();
      menu.get();
    });
    store.patch([{ path: ['site', 'name'], value: 'Grand View' }]);
    expect(name.peek()).toBe('Grand View');
    expect(nameRuns).toHaveBeenCalledTimes(2);
    expect(menuRuns).toHaveBeenCalledTimes(1);
  });

  it("doesn't notify a value whose path kept its identity", () => {
    const store = new Store(initial());
    const runs = vi.fn(() => store.view.site.address.city);
    effect(() => void runs());
    store.patch([{ path: ['site', 'name'], value: 'Other' }]);
    expect(runs).toHaveBeenCalledTimes(1);
    store.patch([{ path: ['site', 'address', 'city'], value: 'Trieste' }]);
    expect(runs).toHaveBeenCalledTimes(2);
  });

  it('tracks arrays as a whole, and returns them frozen', () => {
    const store = new Store(initial());
    const titles = computed(() => store.view.menu.map((dish) => dish.title));
    expect(titles.get()).toEqual(['Risotto']);
    expect(Object.isFrozen(store.view.menu[0])).toBe(true);
    store.patch([{ path: ['menu'], value: [...store.snapshot.menu, { id: 2, title: 'Frico' }] }]);
    expect(titles.get()).toEqual(['Risotto', 'Frico']);
  });

  it('is read-only for themes', () => {
    const store = new Store(initial());
    expect(() => {
      (store.view.site as { name: string }).name = 'Hacked';
    }).toThrow('Themes read the store');
    expect(store.view.site.name).toBe('Grand');
  });

  it('gives live views of objects, which serialise as plain data', () => {
    const store = new Store(initial());
    const site = store.view.site;
    store.patch([{ path: ['site', 'name'], value: 'Grand View' }]);
    expect(site.name).toBe('Grand View');
    expect(JSON.parse(JSON.stringify(site))).toEqual({ name: 'Grand View', address: { city: 'Udine' } });
    expect(Object.keys(site)).toEqual(['name', 'address']);
  });

  it('tracks the keys of an object when they are listed', () => {
    const store = new Store({ rooms: { a: 1 } as Record<string, number> });
    const keys = computed(() => Object.keys(store.view.rooms));
    expect(keys.get()).toEqual(['a']);
    store.patch([{ path: ['rooms', 'b'], value: 2 }]);
    expect(keys.get()).toEqual(['a', 'b']);
  });

  it('puts helpers next to the state, with their reads tracked', () => {
    const store = new Store(initial(), (view) => ({
      dish: (id: number) => view.menu.find((d) => d.id === id)?.title
    }));
    const view = store.view as ReturnType<typeof initial> & { dish(id: number): string | undefined };
    const title = computed(() => view.dish(1));
    expect(title.get()).toBe('Risotto');
    store.patch([{ path: ['menu', 0, 'title'], value: 'Risotto ai funghi' }]);
    expect(title.get()).toBe('Risotto ai funghi');
  });
});

describe('state diffs', () => {
  const before = () => ({
    site: { name: 'Grand', address: { city: 'Udine' } },
    menu: [{ id: 1, title: 'Risotto' }, { id: 2, title: 'Tiramisù' }],
    tags: { spa: true, pool: true } as Record<string, boolean>
  });

  it('finds the paths that changed, as deep as both sides keep their shape', () => {
    const after = before();
    after.site.name = 'Grand View';
    after.menu[1]!.title = 'Panna cotta';
    expect(diffState(before(), after)).toEqual([
      { path: ['site', 'name'], value: 'Grand View' },
      { path: ['menu', 1, 'title'], value: 'Panna cotta' }
    ]);
    expect(diffState(before(), before())).toEqual([]);
  });

  it('replaces an object that lost keys, and an array whose length changed', () => {
    const after = before();
    delete after.tags.pool;
    after.menu.push({ id: 3, title: 'Gelato' });
    expect(diffState(before(), after)).toEqual([
      { path: ['menu'], value: after.menu },
      { path: ['tags'], value: { spa: true } }
    ]);
  });

  it('adds new keys one by one', () => {
    const after = { ...before(), weather: { sky: 'clear' } };
    expect(diffState(before(), after)).toEqual([{ path: ['weather'], value: { sky: 'clear' } }]);
  });

  it('gives back the new state when applied, sharing what didn’t change', () => {
    const old = before();
    const next = before();
    next.site.address.city = 'Trieste';
    next.menu[0]!.title = 'Risotto ai funghi';
    next.tags.gym = true;
    const result = applyPatches(old, diffState(old, next));
    expect(result).toEqual(next);
    expect(result.menu[1]).toBe(old.menu[1]);
    expect(old.site.address.city).toBe('Udine');
  });

  it('copies an object once, however many patches go through it', () => {
    const texts = Object.fromEntries(Array.from({ length: 200 }, (_, i) => [`t${i}`, `it ${i}`]));
    const patches = Object.keys(texts).map((key) => ({ path: ['texts', key], value: key.replace('t', 'en ') }));
    const result = applyPatches({ texts }, patches);
    expect(result.texts.t199).toBe('en 199');
    expect(texts.t199).toBe('it 199');
  });
});


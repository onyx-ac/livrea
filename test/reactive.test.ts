import { describe, expect, it, vi } from 'vitest';
import { batch, computed, effect, signal, untrack, watch } from '../src/reactive.js';

describe('computed values', () => {
  it('compute when first read, then keep their result until a source changes', () => {
    const count = signal(1);
    const fn = vi.fn(() => count.get() * 2);
    const double = computed(fn);
    expect(fn).not.toHaveBeenCalled();
    expect(double.get()).toBe(2);
    expect(double.get()).toBe(2);
    expect(fn).toHaveBeenCalledTimes(1);
    count.set(2);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(double.get()).toBe(4);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('stop a change when their result comes out equal', () => {
    const n = signal(1);
    const parity = computed(() => n.get() % 2);
    const downstream = vi.fn(() => parity.get());
    const label = computed(downstream);
    label.get();
    n.set(3);
    expect(label.get()).toBe(1);
    expect(downstream).toHaveBeenCalledTimes(1);
  });

  it('keep the previous result, identity included, when the new one is equal by their comparison', () => {
    const list = signal([1, 2]);
    const copy = computed(() => [...list.get()], (a, b) => a.length === b.length && a.every((x, i) => x === b[i]));
    const first = copy.get();
    list.set([1, 2]);
    expect(copy.get()).toBe(first);
  });

  it('report a computed value that depends on itself', () => {
    const a = computed((): number => b.get());
    const b = computed((): number => a.get());
    expect(() => a.get()).toThrow('A computed value depends on itself.');
  });

  it('rethrow what their function threw, and recover when it stops', () => {
    const n = signal(0);
    const inverse = computed(() => {
      if (n.get() === 0) throw new Error('zero');
      return 1 / n.get();
    });
    expect(() => inverse.get()).toThrow('zero');
    n.set(2);
    expect(inverse.get()).toBe(0.5);
  });
});

describe('effects', () => {
  it('run once for a diamond of dependencies, with consistent values', () => {
    const a = signal(1);
    const b = computed(() => a.get() + 1);
    const c = computed(() => a.get() * 10);
    const seen: number[] = [];
    effect(() => {
      seen.push(b.get() + c.get());
    });
    a.set(2);
    expect(seen).toEqual([12, 23]);
  });

  it('follow the dependencies of their last run only', () => {
    const useA = signal(true);
    const a = signal('a');
    const b = signal('b');
    const runs = vi.fn(() => (useA.get() ? a.get() : b.get()));
    effect(() => void runs());
    b.set('B');
    expect(runs).toHaveBeenCalledTimes(1);
    useA.set(false);
    expect(runs).toHaveBeenCalledTimes(2);
    a.set('A');
    expect(runs).toHaveBeenCalledTimes(2);
    b.set('BB');
    expect(runs).toHaveBeenCalledTimes(3);
  });

  it('clean up before running again, and when stopped', () => {
    const n = signal(1);
    const log: string[] = [];
    const stop = effect(() => {
      const value = n.get();
      log.push(`run ${value}`);
      return () => log.push(`cleanup ${value}`);
    });
    n.set(2);
    stop();
    n.set(3);
    expect(log).toEqual(['run 1', 'cleanup 1', 'run 2', 'cleanup 2']);
  });

  it('wait for the end of a batch', () => {
    const a = signal(1);
    const b = signal(1);
    const runs = vi.fn(() => a.get() + b.get());
    effect(() => void runs());
    batch(() => {
      a.set(2);
      b.set(2);
    });
    expect(runs).toHaveBeenCalledTimes(2);
  });

  it('run render effects before user effects', () => {
    const n = signal(0);
    const order: string[] = [];
    batch(() => {
      effect(() => {
        n.get();
        order.push('user');
      });
      effect(
        () => {
          n.get();
          order.push('render');
        },
        { priority: 'render' }
      );
    });
    order.length = 0;
    n.set(1);
    expect(order).toEqual(['render', 'user']);
  });

  it("don't depend on what they read untracked", () => {
    const tracked = signal(1);
    const ignored = signal(1);
    const runs = vi.fn(() => tracked.get() + untrack(() => ignored.get()));
    effect(() => void runs());
    ignored.set(2);
    expect(runs).toHaveBeenCalledTimes(1);
  });
});

describe('watch', () => {
  it('calls the handler with the new and previous value, only on changes', () => {
    const n = signal(1);
    const calls: [number, number | undefined][] = [];
    watch(
      () => n.get() * 10,
      (value, previous) => {
        calls.push([value, previous]);
      }
    );
    n.set(1);
    n.set(2);
    expect(calls).toEqual([[20, 10]]);
  });

  it('can start with the first value, and cleans up', () => {
    const n = signal(1);
    const log: string[] = [];
    const stop = watch(
      () => n.get(),
      (value) => {
        log.push(`on ${value}`);
        return () => log.push(`off ${value}`);
      },
      { immediate: true }
    );
    n.set(2);
    stop();
    expect(log).toEqual(['on 1', 'off 1', 'on 2', 'off 2']);
  });
});

---
title: Running Themes in a Sandbox
---

# Running Themes in a Sandbox

Themes from other authors run in a dedicated Web Worker. There they have no DOM, nothing of the app's to call, and a theme stuck in a loop can't freeze the app. Everything a theme sends back is checked by the app before it renders, so no hardening library is needed inside the worker.

Two small files connect them.

The worker, which loads the theme after taking away what the app doesn't want themes to have:

```ts
// theme.worker.ts
import { serveRuntime } from 'livrea/worker';

serveRuntime({
  theme: async () => (await import('./themes/lacquer')).LACQUER,
  block: { storage: true }
});
```

The app's side, in `createThemeApp`'s config:

```ts
import { connectWorker } from 'livrea/host';

connect: connectWorker(() => new Worker(new URL('./theme.worker.ts', import.meta.url), { type: 'module' })),
```

## What Themes Can Reach

`block` takes away groups of the worker's globals. Nothing is blocked by default: it's the app's policy.

| Group | Globals | Why an app blocks it |
|---|---|---|
| `network` | `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `WebTransport`, `importScripts` | Data a theme sends out goes past the app's analytics and privacy rules |
| `storage` | `indexedDB`, `caches` | What a theme keeps would outlast the person who caused it, on a shared screen |
| `workers` | `Worker`, `SharedWorker`, `BroadcastChannel` | Other threads, and talking to them |

A blocked global is removed from the global object and from every prototype it's inherited from, so neither `delete` nor `Object.getPrototypeOf(self).fetch` brings it back. A theme given as a function is loaded after the blocking, so not even its top-level code sees what was blocked. `import()` can't be taken away from inside the worker: the app's Content Security Policy decides where code may load from.

## Starting

`connectWorker` starts the worker as soon as it's called, while the app is still rendering, so the theme loads in parallel. Until its first tree arrives, `<ThemeRoot pending={<Splash />}>` shows `pending`. A theme that doesn't start within `startTimeoutMs` (5 s) has failed, and the fallbacks show.

## Restarts

A watchdog asks the worker every second whether it still answers. One that doesn't for 3 s, or that crashes while starting, is restarted with the state and page as they are then:

- The screen keeps the old tree until the new one replaces it in one step. The layout comes back with the same unit ids, so the app's components in it, such as an avatar, keep their state.
- Taps meanwhile go nowhere, and so does any callback from the old run: the same id is another function in the new one.
- After `restarts.max` (3 a minute), the theme has failed and the fallbacks show.

What a theme keeps in its components is lost on a restart. What must survive belongs in the store.

## Only What Changed Crosses

The React provider diffs the store it builds against the last one it sent and sends patches. The theme keeps every value a patch doesn't touch, so nothing that reads it renders again.

## Themes From the App's Server

A theme installed in the app's admin reaches the worker as a package's module. `importTheme(url, modules)` loads it and provides the modules it was built without: see [Packaging](./packaging.md#loading-a-package).

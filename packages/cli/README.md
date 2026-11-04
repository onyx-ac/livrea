# @livrea/cli

Livrea's command-line tool. `livrea pack` builds a theme's folder into `<id>-<version>.livrea`, the package an app's admin installs:

```bash
npm install --save-dev @livrea/cli
npx livrea pack [folder] [--out <folder>] [--no-check]
```

It type-checks the theme, bundles it without Livrea and the app's shared modules (the app provides them when it loads the theme with `importTheme` from `livrea/worker`), writes its settings' definitions to `settings.json`, and zips it with its sources and a manifest of SHA-256 hashes.

See [Packaging](https://github.com/onyx-ac/livrea/blob/main/packages/docs/docs/packaging.md) in the documentation.

## Licence

Licensed under [Creative Commons Attribution-ShareAlike 4.0 International (CC BY-SA 4.0)](LICENSE).

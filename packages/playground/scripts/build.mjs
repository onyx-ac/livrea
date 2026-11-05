import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, context } from 'esbuild';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const distDir = join(root, 'dist');
const docsStaticDemoDir = resolve(root, '../docs/static/demo');

const HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Livrea — Interactive Theme Builder Playground (@livrea/ui)</title>
    <link rel="stylesheet" href="./demo.css" />
    <style>
      *, *::before, *::after { box-sizing: border-box; }
      html, body, #root { margin: 0; padding: 0; min-height: 100vh; background: #0d0f14; color: #f3f4f6; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    </style>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./demo.js"></script>
  </body>
</html>
`;

const options = {
  absWorkingDir: root,
  entryPoints: ['src/main.tsx'],
  outfile: join(distDir, 'demo.js'),
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  jsx: 'automatic',
  alias: {
    '@livrea/ui': resolve(root, '../ui/dist/index.js')
  },
  sourcemap: true,
  minify: !process.argv.includes('--serve'),
  logLevel: 'info'
};

mkdirSync(distDir, { recursive: true });
writeFileSync(join(distDir, 'index.html'), HTML);

if (process.argv.includes('--serve')) {
  const ctx = await context(options);
  await ctx.watch();
  const { port } = await ctx.serve({ servedir: distDir, port: 3001 });
  console.log(`Livrea interactive demo running at http://localhost:${port}`);
} else {
  await build(options);
  mkdirSync(docsStaticDemoDir, { recursive: true });
  writeFileSync(join(docsStaticDemoDir, 'index.html'), HTML);
  copyFileSync(join(distDir, 'demo.js'), join(docsStaticDemoDir, 'demo.js'));
  if (existsSync(join(distDir, 'demo.css'))) {
    copyFileSync(join(distDir, 'demo.css'), join(docsStaticDemoDir, 'demo.css'));
  }
  console.log('Built @livrea/playground to dist/ and packages/docs/static/demo/');
}


#!/usr/bin/env node
/**
 * livrea pack [folder] [--out <folder>] [--no-check]
 *   Builds the theme in `folder` (the current one by default) into <id>-<version>.livrea.
 */
import { relative } from 'node:path';
import { pack, PackError } from './pack.js';

const USAGE = `Usage: livrea pack [folder] [--out <folder>] [--no-check]

  Builds a theme into <id>-<version>.livrea, the package an app's admin installs.
  --out <folder>  where to write it (default: the theme's folder)
  --no-check      skip type-checking`;

async function main(args: string[]): Promise<number> {
  const [command, ...rest] = args;
  if (command !== 'pack') {
    console.log(USAGE);
    return command === undefined || command === '--help' || command === '-h' ? 0 : 1;
  }
  let folder = '.';
  let outDir: string | undefined;
  let check = true;
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i]!;
    if (arg === '--out') outDir = rest[++i];
    else if (arg === '--no-check') check = false;
    else if (arg.startsWith('-')) {
      console.error(`Unknown option ${arg}.\n\n${USAGE}`);
      return 1;
    } else folder = arg;
  }
  try {
    const result = await pack(folder, { outDir, check });
    console.log(`${result.theme.name} ${result.theme.version}: ${relative(process.cwd(), result.file)} (${Math.ceil(result.bytes / 1024)} KB)`);
    return 0;
  } catch (error) {
    console.error(error instanceof PackError ? error.message : error);
    return 1;
  }
}

process.exitCode = await main(process.argv.slice(2));

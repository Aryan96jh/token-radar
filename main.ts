// token-radar-01 entrypoint (radar-2).
// Reads the sealed snapshot, ranks the pre-token protocols by implied value,
// writes the board and the dashboard's data, copies the dashboard and the
// screenshots into the output directory, and writes the dossier from them.
// Node 22, standard library only. Deterministic: two runs write identical
// bytes — no clock, no randomness anywhere in the outputs.

import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { rankBoard, topLive } from './lib/model.ts';
import type { Snapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const MODEL_VERSION = 'radar-2';
const LIVE_COUNT = 24;

function parseArgs(argv: string[]): { input: string } {
  let input = '/input/snapshot.json';
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--input' && i + 1 < argv.length) input = argv[i + 1] as string;
  }
  return { input };
}

function main(): void {
  const { input } = parseArgs(process.argv.slice(2));
  const outDir = resolve(process.env.MAKEFUN_OUTPUT_DIR ?? '/output');
  const rootDir = resolve(import.meta.dirname);

  const snapshot = JSON.parse(readFileSync(resolve(input), 'utf8')) as Snapshot;
  const rows = rankBoard(snapshot);
  const live = topLive(snapshot, LIVE_COUNT);
  const watchlist = new Set(snapshot.watchlist);

  // The watchlist is the floor: every one of its slugs must be on the board.
  const missing = snapshot.watchlist.filter((slug) => !rows.some((r) => r.slug === slug));
  if (missing.length > 0) {
    throw new Error(`watchlist slugs missing from board: ${missing.join(', ')}`);
  }

  // Fresh output directory every run, so a second run writes identical bytes.
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(join(outDir, 'dashboard'), { recursive: true });
  mkdirSync(join(outDir, 'screenshots'), { recursive: true });

  const board = {
    as_of: snapshot.as_of,
    model: MODEL_VERSION,
    rows,
  };
  writeFileSync(join(outDir, 'board.json'), `${JSON.stringify(board, null, 2)}\n`, 'utf8');

  const data = {
    as_of: snapshot.as_of,
    model: MODEL_VERSION,
    floor_usd: snapshot.floor_usd,
    counts: {
      protocols: snapshot.protocols.length,
      watchlist: snapshot.watchlist.length,
      board: rows.length,
      live: live.length,
    },
    rows,
    live,
  };
  writeFileSync(join(outDir, 'data.js'), `window.RADAR = ${JSON.stringify(data, null, 2)};\n`, 'utf8');

  const dashboardDir = join(rootDir, 'dashboard');
  const screenshotsDir = join(rootDir, 'screenshots');
  if (!existsSync(join(dashboardDir, 'index.html'))) {
    throw new Error('dashboard/index.html is missing');
  }
  if (!existsSync(screenshotsDir)) {
    throw new Error('screenshots/ is missing');
  }
  cpSync(dashboardDir, join(outDir, 'dashboard'), { recursive: true });
  cpSync(screenshotsDir, join(outDir, 'screenshots'), { recursive: true });

  const dossier = buildDossier(outDir, { text_max_bytes: 65536 });
  writeFileSync(join(outDir, 'dossier.json'), dossier);

  const watchlistOnBoard = rows.filter((r) => watchlist.has(r.slug)).length;
  console.log(`radar-2: ${snapshot.protocols.length} protocols scanned, ${rows.length} board rows, ${watchlistOnBoard}/${snapshot.watchlist.length} watchlist covered, ${live.length} live rows`);
  console.log(`wrote ${outDir}/board.json, ${outDir}/data.js, ${outDir}/dashboard/, ${outDir}/screenshots/, ${outDir}/dossier.json`);
}

main();

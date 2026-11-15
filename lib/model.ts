// radar-2 value model for token-radar-01.
// Everything derives from the snapshot's own fields. No protocol name is
// hardcoded anywhere in this file: categories, chains, TVL, growth and age
// are read off each protocol's record, and the same formulas rank them all.

export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

export interface ModelBreakdown {
  base_multiple: number;
  growth_mult: number;
  maturity_mult: number;
  breadth_mult: number;
}

export interface BoardRow {
  slug: string;
  name: string;
  rank: number;
  implied_value_usd: number;
  farm_steps: string[];
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  age_days: number;
  base_multiple: number;
  growth_mult: number;
  maturity_mult: number;
  breadth_mult: number;
  watchlist: boolean;
}

export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number;
  change_7d: number | null;
  age_days: number;
}

// ------------------------------------------------------------------ model

// What a dollar of TVL is worth as an implied token value, by what the
// protocol does. Lending and derivatives monetise every dollar directly
// (interest, fees on leveraged flow); a DEX takes a thin cut of volume, not
// of TVL; a bridge moves value through without keeping it; RWA and staking
// products are balance-sheet businesses with regulated, slower upside.
// The table is a claim about categories, never about named protocols.
const BASE_MULTIPLES: Record<string, number> = {
  dexs: 0.3,
  lending: 0.35,
  yield: 0.25,
  'yield aggregator': 0.25,
  derivatives: 0.4,
  perpetuals: 0.4,
  'interest rate derivatives': 0.4,
  options: 0.4,
  'options vault': 0.4,
  rwa: 0.2,
  bridge: 0.15,
  'canonical bridge': 0.15,
  'cross chain bridge': 0.15,
  'liquid staking': 0.2,
  'liquid restaking': 0.2,
  'restaked btc': 0.2,
  restaking: 0.2,
  'staking pool': 0.2,
};

const DEFAULT_BASE_MULTIPLE = 0.25;

export function baseMultiple(category: string | null): number {
  if (category === null) return DEFAULT_BASE_MULTIPLE;
  const key = category.trim().toLowerCase();
  return BASE_MULTIPLES[key] ?? DEFAULT_BASE_MULTIPLE;
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

// Recent growth lifts the multiple, collapse cuts it. Clamped so one wild
// week (the snapshot holds a +4448% and a -73%) cannot dominate the board.
export function growthMultiplier(change7d: number | null): number {
  const change = change7d === null ? 0 : clamp(change7d, -60, 120);
  return 1 + (change / 100) * 0.8;
}

// A protocol that has run for years with no token has survived audits,
// cycles and competitors; a week-old one has not. Capped at four years.
export function maturityMultiplier(ageDays: number): number {
  return 0.5 + (Math.min(ageDays, 1460) / 1460) * 0.5;
}

// TVL spread across chains is stickier than TVL on one chain: a chain
// outage or a bridge exploit cannot take it all at once.
export function breadthMultiplier(chains: string[]): number {
  if (chains.length === 0) return 1;
  return 1 + 0.05 * Math.min(chains.length - 1, 4);
}

const DAY_MS = 24 * 60 * 60 * 1000;

// Whole days between the day DefiLlama began tracking a protocol and the
// snapshot's date. Unknown tracking start counts as a year old: old enough
// to be real, young enough not to claim four years of history it may not
// have. Never negative: a listing dated after the snapshot counts as day 0.
export function ageDays(listedAt: string | null, asOf: string): number {
  if (listedAt === null) return 365;
  const start = Date.parse(`${listedAt}T00:00:00Z`);
  const end = Date.parse(`${asOf}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(end)) return 365;
  return Math.max(0, Math.floor((end - start) / DAY_MS));
}

export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
): { implied: number; breakdown: ModelBreakdown; age: number } {
  const base = baseMultiple(protocol.category);
  const growth = growthMultiplier(protocol.change_7d);
  const age = ageDays(protocol.listed_at, asOf);
  const maturity = maturityMultiplier(age);
  const breadth = breadthMultiplier(protocol.chains);
  const raw = protocol.tvl_usd * base * growth * maturity * breadth;
  const capped = Math.min(raw, protocol.tvl_usd * 2);
  const implied = Math.max(1, Math.round(capped));
  return {
    implied,
    breakdown: { base_multiple: base, growth_mult: growth, maturity_mult: maturity, breadth_mult: breadth },
    age,
  };
}

// ------------------------------------------------------------------ ranking

// A protocol records no token when all three token fields are null.
export function isPreToken(protocol: SnapshotProtocol): boolean {
  return protocol.mcap_usd === null && protocol.gecko_id === null && protocol.symbol === null;
}

const VERSION_MARKER = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

// A wrapped, staked or bridged product of a token that already trades is
// not a token that does not exist yet: WBTC is Bitcoin on Ethereum, Binance
// staked ETH is ETH in Binance's staking product, and neither is a protocol
// still waiting on a launch of its own. This is the watchlist's own rule:
// the name carries a whole word wrapped, staked or staking (any case), the
// category is a bridge, staking or exchange product, or the name begins
// with an exchange's name.
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;

const EXCLUDED_CATEGORIES = new Set([
  'bridge',
  'canonical bridge',
  'liquid staking',
  'liquid restaking',
  'restaked btc',
  'cex',
]);

const EXCHANGE_PREFIX = /^(binance|coinbase|bybit|kraken|bitget|okx|bitfinex|gemini)\b/i;

// Rankable: records no token, is not a centralised exchange, is not a
// versioned fork of another protocol (a name ending in V2, v2, 2.0...), and
// is not a wrapped, staked or bridged product of a token that already
// trades.
export function isRankable(protocol: SnapshotProtocol): boolean {
  if (!isPreToken(protocol)) return false;
  if (protocol.category === 'CEX') return false;
  if (VERSION_MARKER.test(protocol.name)) return false;
  if (WRAPPED_WORD.test(protocol.name)) return false;
  const category = (protocol.category ?? '').trim().toLowerCase();
  if (EXCLUDED_CATEGORIES.has(category)) return false;
  if (EXCHANGE_PREFIX.test(protocol.name)) return false;
  return true;
}

export function rankBoard(snapshot: Snapshot): BoardRow[] {
  const watchlist = new Set(snapshot.watchlist);
  const rows: BoardRow[] = [];
  for (const protocol of snapshot.protocols) {
    if (!isRankable(protocol)) continue;
    const { implied, breakdown, age } = impliedValue(protocol, snapshot.as_of);
    rows.push({
      slug: protocol.slug,
      name: protocol.name,
      rank: 0,
      implied_value_usd: implied,
      farm_steps: farmSteps(protocol, age),
      category: protocol.category,
      chains: protocol.chains,
      tvl_usd: protocol.tvl_usd,
      change_7d: protocol.change_7d,
      age_days: age,
      base_multiple: breakdown.base_multiple,
      growth_mult: breakdown.growth_mult,
      maturity_mult: breakdown.maturity_mult,
      breadth_mult: breakdown.breadth_mult,
      watchlist: watchlist.has(protocol.slug),
    });
  }
  // Highest implied value first; ties break by slug so the order is stable
  // and identical on every run.
  rows.sort((a, b) => {
    if (b.implied_value_usd !== a.implied_value_usd) return b.implied_value_usd - a.implied_value_usd;
    return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
  });
  rows.forEach((row, i) => {
    row.rank = i + 1;
  });
  return rows;
}

// The live-token view: protocols whose token already trades, by market cap,
// centralised exchanges excluded. Shown apart from the board, never ranked
// into it, with their market value — not an implied one.
export function topLive(snapshot: Snapshot, count: number): LiveRow[] {
  const live = snapshot.protocols.filter(
    (p) => p.mcap_usd !== null && p.category !== 'CEX',
  );
  live.sort((a, b) => (b.mcap_usd as number) - (a.mcap_usd as number));
  return live.slice(0, count).map((p) => ({
    slug: p.slug,
    name: p.name,
    category: p.category,
    chains: p.chains,
    tvl_usd: p.tvl_usd,
    mcap_usd: p.mcap_usd as number,
    change_7d: p.change_7d,
    age_days: ageDays(p.listed_at, snapshot.as_of),
  }));
}

// ------------------------------------------------------------------ farm plans

// What a farm of this protocol actually does, by what the protocol is.
// The action is the category's verb; the numbers come from the record.
function categoryAction(category: string | null): string {
  const key = (category ?? '').trim().toLowerCase();
  switch (key) {
    case 'lending':
    case 'uncollateralized lending':
      return 'supply stablecoins to lend';
    case 'dexs':
      return 'provide liquidity to a pool';
    case 'bridge':
    case 'canonical bridge':
    case 'cross chain bridge':
      return 'bridge assets across chains';
    case 'liquid staking':
    case 'liquid restaking':
    case 'restaked btc':
    case 'restaking':
    case 'staking pool':
      return 'stake assets';
    case 'derivatives':
    case 'perpetuals':
    case 'interest rate derivatives':
    case 'options':
    case 'options vault':
      return 'open a small margined position';
    case 'yield':
    case 'yield aggregator':
    case 'farm':
      return 'deposit into a vault';
    case 'cdp':
    case 'cdp manager':
      return 'mint stablecoins against collateral';
    case 'rwa':
      return 'mint tokenised real-world assets';
    case 'insurance':
      return 'buy cover';
    case 'prediction market':
      return 'place a prediction position';
    case 'leveraged farming':
      return 'open a small leveraged farm';
    case 'liquidity manager':
      return 'deposit into a managed liquidity position';
    case 'launchpad':
      return 'join a launch allocation';
    default:
      return 'deposit into the protocol';
  }
}

function capitalTier(tvlUsd: number): number {
  if (tvlUsd >= 5_000_000_000) return 250;
  if (tvlUsd >= 1_000_000_000) return 150;
  if (tvlUsd >= 100_000_000) return 100;
  return 50;
}

function holdDays(age: number): number {
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

const CHEAP_L2 = new Set([
  'arbitrum',
  'optimism',
  'base',
  'polygon',
  'zksync era',
  'linea',
  'scroll',
  'starknet',
  'blast',
  'mode',
  'mantle',
  'unichain',
  'soneium',
  'ink',
  'zora',
  'fraxtal',
  'taiko',
  'manta',
  'metis',
  'bob',
  'boba',
  'polygon zkevm',
  'arbitrum nova',
  'immutable zkevm',
  'world chain',
  'katana',
  'swellchain',
]);

function gasNote(chain: string): string {
  const key = chain.trim().toLowerCase();
  if (key === 'ethereum') return 'about $5–15 per transaction on Ethereum';
  if (key === 'solana') return 'under $0.01 per transaction on Solana';
  if (CHEAP_L2.has(key)) return 'under $1 per transaction';
  if (key === 'bitcoin') return 'a few dollars per transaction on Bitcoin';
  return 'a few cents per transaction';
}

function money(n: number): string {
  return `$${n}`;
}

// Eight concrete steps. Every step carries what it costs and how long it
// takes, and no step names a URL: claims happen only through links the
// protocol itself publishes.
export function farmSteps(protocol: SnapshotProtocol, age: number): string[] {
  const capital = capitalTier(protocol.tvl_usd);
  const hold = holdDays(age);
  const firstChain = protocol.chains[0] ?? 'Ethereum';
  const gas = gasNote(firstChain);
  const action = categoryAction(protocol.category);
  const name = protocol.name;
  return [
    `Create a fresh wallet used only for this farm and write its seed phrase on paper, stored offline — never paste it into any site, chat or form. Cost: $0. Time: 10 minutes.`,
    `From that wallet, ${action} on ${name} with ${money(capital)} on ${firstChain}. Keep the receipt hash. Cost: ${money(capital)} capital plus gas (${gas}). Time: 15 minutes.`,
    `Do one qualifying action each week — a small extra deposit, a swap, or a vote — so the position stays active instead of looking like a one-off deposit. Cost: gas only (${gas}). Time: 10 minutes a week.`,
    `Hold the position for ${hold} days without withdrawing, so it reads as a real user rather than a flash farm. Cost: $0. Time: ${hold} days.`,
    `Before withdrawing, check ${name}'s own points or rewards page to confirm what your activity earned and whether anything needs claiming. Cost: $0. Time: 10 minutes.`,
    `Claim only from links the protocol itself publishes. Never pay anyone to claim for you and never connect your wallet from a link in a direct message. Cost: $0. Time: 5 minutes.`,
    `Log the wallet address, deposit date, transaction hashes and every action in one note, so you can prove the farm later if a claim is questioned. Cost: $0. Time: 5 minutes.`,
    `Exit by unwinding in reverse order — rewards first, then the position — and if a token launches, claim it before selling any of it. Cost: gas only (${gas}). Time: 20 minutes.`,
  ];
}

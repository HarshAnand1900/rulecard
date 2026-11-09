/* Rulecard game engine. Pure and deterministic: all state is one JSON object, time only moves through tick().
   Money model: constant-product bonding curve with virtual NEAR + "floor lift" after burns, so selling every token
   always pays out exactly the real NEAR in the curve. The contract implements the same rules. */
import {
  CARDS, CardType, RuleId, Tier, TIER_LEVEL, ANNOUNCE, LEVELS, MIN, HOUR, DAY, byTier,
} from './cards';

export const X0 = 30, Y0 = 1e9, CAP = 8e8;
const EPS = 1e-9;

export interface Config {
  minBal: number; holdAge: number; circleMinWallets: number; circleWalletCap: number; circleTarget: number; handLimit: number;
  maxSellRate: number; burnCapPct: number; potCapPct: number;
}
export const DEFAULT_CONFIG: Config = { minBal: 100_000, holdAge: HOUR, circleMinWallets: 25, circleWalletCap: 0.01, circleTarget: 0.10, handLimit: 7, maxSellRate: 0.03, burnCapPct: 0.05, potCapPct: 0.5 };

export interface Account { id: string; near: number; }
export interface Vest { amt: number; unlockAt: number; }
export interface Holding {
  bal: number; acq: number; buys: { t: number; amt: number }[]; launchBought: number;
  lastCheckin: number; lastCastAt: number; lastBigCastAt: number; lockedUntil: number; cotdDay: number; vest: Vest[];
}
export interface Nft {
  id: string; kind: 'card' | 'relic' | 'badge'; coin: string; owner: string; type: string; tier?: Tier;
  shiny?: boolean; title: string; createdAt: number; soulbound: boolean; burned?: boolean;
}
export interface Effect {
  id: string; type: CardType; tier: Tier; caster: string; cardId: string; castAt: number; startsAt: number; endsAt: number;
  status: 'announced' | 'active' | 'done'; data: any;
}
export interface Coin {
  id: string; name: string; ticker: string; creator: string; createdAt: number; feeRate: number; rules: RuleId[]; skin: string;
  x: number; y: number; K: number; real: number; circ: number; pot: number; prizePot: number; burned: number;
  inflow: number; holders: Record<string, Holding>;
  level: number; levelPendingSince: number | null;
  spark: number; ult: number; rareFreeAt: number; eclipseUsed: number;
  caps: { start: number; burned: number; potSpent: number };
  effects: Effect[]; priceHist: { t: number; p: number }[];
  htl: null | { start: number; end: number; snap: Record<string, number>; out: Record<string, boolean>; dipBudget: number; dipLeft: number; nextChunk: number; dipBuyers: Record<string, boolean> };
  htlCooldownUntil: number; bannerOf: string | null; bannerUntil: number; graduated: boolean;
}
export interface RaidSide { coin: string; stakes: Record<string, number>; startReal: number; inflowAtRound: number; score: number; tactics: (CardType | null)[]; }
export interface Raid {
  id: string; mode: 'friendly' | 'hard'; status: 'pending' | 'active' | 'settling' | 'done'; createdAt: number; acceptBy: number;
  startsAt: number; endsAt: number; round: number; sides: [RaidSide, RaidSide]; effectId: string; caster: string;
  winner: number | null; spoils: null | { tokensLeft: number; chunks: number; nextAt: number; burnHalf: number }; log: string[];
}
export interface LogEntry { t: number; coin: string | null; kind: string; text: string; }
export interface State {
  now: number; seq: number; rng: number; cfg: Config;
  accounts: Record<string, Account>; coins: Record<string, Coin>; nfts: Record<string, Nft>; raids: Record<string, Raid>;
  log: LogEntry[];
}

// ----------------------------------------------------------------- basics
export function newGame(now = Date.UTC(2026, 10, 10, 0, 0), cfg: Partial<Config> = {}, seed = 42): State {
  return { now, seq: 1, rng: seed >>> 0, cfg: { ...DEFAULT_CONFIG, ...cfg }, accounts: {}, coins: {}, nfts: {}, raids: {}, log: [] };
}
function rand(s: State) { // mulberry32 kept in state so saves replay identically
  let a = (s.rng = (s.rng + 0x6D2B79F5) | 0);
  let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const nid = (s: State, p: string) => `${p}${s.seq++}`;
function fail(msg: string): never { throw new Error(msg); }
function log(s: State, coin: string | null, kind: string, text: string) { s.log.push({ t: s.now, coin, kind, text }); if (s.log.length > 2000) s.log.splice(0, s.log.length - 2000); }

export function addAccount(s: State, id: string, near = 100) { if (s.accounts[id]) fail('account exists'); s.accounts[id] = { id, near }; return s.accounts[id]; }
const acct = (s: State, id: string) => s.accounts[id] || fail(`unknown account ${id}`);
export const coinOf = (s: State, id: string) => s.coins[id] || fail(`unknown coin ${id}`);
function hold(c: Coin, a: string): Holding {
  return c.holders[a] ||= { bal: 0, acq: 0, buys: [], launchBought: 0, lastCheckin: -1e15, lastCastAt: -1e15, lastBigCastAt: -1e15, lockedUntil: 0, cotdDay: -1, vest: [] };
}

// ----------------------------------------------------------------- curve math
export const price = (c: Coin) => c.x / c.y;
export const sold = (c: Coin) => Y0 - c.y;
export const maxPayout = (c: Coin) => c.x - c.K / (c.y + c.circ);
export const solvent = (c: Coin) => maxPayout(c) <= c.real * (1 + 1e-9) + 1e-9;
export const mcap = (c: Coin) => price(c) * 1e9;

function curveBuy(c: Coin, net: number) { // returns tokens out and NEAR actually used
  const room = c.y - (Y0 - CAP);
  let nx = c.x + net, ny = c.K / nx, t = c.y - ny;
  if (t >= room - EPS) { t = room; ny = c.y - t; nx = c.K / ny; net = nx - c.x; c.graduated = true; }
  c.x = nx; c.y = ny; c.real += net; c.circ += t; return { t, used: net };
}
function curveSell(c: Coin, t: number) { const ny = c.y + t, nx = c.K / ny, out = c.x - nx; c.x = nx; c.y = ny; c.real -= out; c.circ -= t; return out; }
function lift(c: Coin) { if (c.circ <= EPS) return; const nx = c.real * (c.y + c.circ) / c.circ; if (nx > c.x) { c.x = nx; c.K = c.x * c.y; } }
function rawBurn(c: Coin, t: number) { t = Math.max(0, Math.min(t, c.circ)); c.circ -= t; c.burned += t; lift(c); return t; }

// 24h rolling caps on card-driven burns and pot spending
function rollCaps(s: State, c: Coin) { if (s.now - c.caps.start >= DAY) c.caps = { start: s.now, burned: 0, potSpent: 0 }; }
function cappedBurn(s: State, c: Coin, t: number) { rollCaps(s, c); const room = burnRoom(s, c); const b = rawBurn(c, Math.min(t, room)); c.caps.burned += b; return b; }
export function burnRoom(s: State, c: Coin) { rollCaps(s, c); return Math.max(0, s.cfg.burnCapPct * (c.circ + c.caps.burned) - c.caps.burned); }
export function potRoom(s: State, c: Coin) { rollCaps(s, c); return Math.max(0, s.cfg.potCapPct * (c.pot + c.caps.potSpent) - c.caps.potSpent); }
function potBuyTokens(s: State, c: Coin, near: number) { // pot buys on the curve, feeless; returns tokens
  near = Math.min(near, c.pot, potRoom(s, c)); if (near <= EPS) return 0;
  const { t, used } = curveBuy(c, near); c.pot -= used; c.caps.potSpent += used; return t;
}
function potBurn(s: State, c: Coin, near: number) {
  // buy with the pot, then burn what the burn cap allows; any tokens the cap blocks go back... they cannot: so size the buy first
  const room = burnRoom(s, c); if (room <= EPS) return 0;
  // limit NEAR so the tokens bought do not exceed the burn room
  const maxNear = Math.max(0, c.K / (c.y - Math.min(room, c.y - (Y0 - CAP))) - c.x);
  const t = potBuyTokens(s, c, Math.min(near, maxNear)); return cappedBurn(s, c, t);
}

// ----------------------------------------------------------------- views
export function activeEffect(c: Coin, type: CardType, now: number) { return c.effects.find(e => e.type === type && e.status === 'active' && now < e.endsAt); }
export function feeRate(s: State, c: Coin) { return activeEffect(c, 'taxHoliday', s.now) ? 0 : c.feeRate; }
export function conviction(s: State, c: Coin, a: string) { const h = c.holders[a]; if (!h || h.bal <= 0) return 0; return h.bal * (1 + 2 * Math.min(1, Math.max(0, s.now - h.acq) / DAY)); }
export function eligible(s: State, c: Coin, a: string) { const h = c.holders[a]; return !!h && h.bal >= s.cfg.minBal && s.now - h.acq >= s.cfg.holdAge; }
export function pulse(s: State, c: Coin) {
  let tot = 0, chk = 0; for (const h of Object.values(c.holders)) { tot += h.bal; if (s.now - h.lastCheckin < HOUR) chk += h.bal; }
  return tot > 0 ? chk / tot : 0;
}
export function hand(s: State, coin: string, owner: string) { return Object.values(s.nfts).filter(n => n.kind === 'card' && !n.burned && n.coin === coin && n.owner === owner); }
export function inEclipse(s: State) { const m = s.now % (12 * HOUR); return m >= 6 * HOUR && m < 6.5 * HOUR; }
export const eclipseWindow = (s: State) => Math.floor(s.now / (12 * HOUR));
export function nextEclipse(s: State) { const start = Math.floor((s.now - 6 * HOUR) / (12 * HOUR)) * 12 * HOUR + 6 * HOUR; return s.now < start + 30 * MIN ? start : start + 12 * HOUR; }

// ----------------------------------------------------------------- NFTs
function mint(s: State, kind: Nft['kind'], coin: string, owner: string, type: string, title: string, tier?: Tier, shiny = false): Nft | null {
  if (kind === 'card' && hand(s, coin, owner).length >= s.cfg.handLimit) { log(s, coin, 'drop', `${owner}'s hand is full (${s.cfg.handLimit}); no ${title}`); return null; }
  const n: Nft = { id: nid(s, kind[0]), kind, coin, owner, type, tier, shiny, title, createdAt: s.now, soulbound: kind !== 'card' || tier === 'Common' };
  s.nfts[n.id] = n; return n;
}
export function mintCard(s: State, coin: string, owner: string, type: CardType, shiny = false) { return mint(s, 'card', coin, owner, type, CARDS[type].name, CARDS[type].tier, shiny); }
function randomCard(s: State, coin: string, owner: string, tier: Tier) { const pool = byTier(tier); return mintCard(s, coin, owner, pool[Math.floor(rand(s) * pool.length)] as CardType, rand(s) < 0.05); }
function badge(s: State, coin: string, owner: string, type: string, title: string) { return mint(s, 'badge', coin, owner, type, title); }
export function transferNft(s: State, from: string, to: string, id: string) {
  const n = s.nfts[id] || fail('no such NFT'); if (n.owner !== from) fail('not your NFT'); if (n.burned) fail('burned'); if (n.soulbound) fail(`${n.title} cannot be transferred`);
  acct(s, to); if (n.kind === 'card' && hand(s, n.coin, to).length >= s.cfg.handLimit) fail('their hand is full');
  n.owner = to; log(s, n.coin, 'nft', `${from} sent ${n.title} to ${to}`);
}

// ----------------------------------------------------------------- launch and trading
export function launchCoin(s: State, creator: string, o: { name: string; ticker: string; feeRate?: number; rules?: RuleId[]; firstBuy?: number }) {
  acct(s, creator); const rules = [...new Set(o.rules || [])] as RuleId[]; if (rules.length > 3) fail('pick at most 3 rules');
  const feeRate = o.feeRate ?? 0.01; if (feeRate < 0.01 - EPS || feeRate > 0.02 + EPS) fail('fee must be 1-2%');
  if (!o.name.trim() || !/^[A-Z0-9]{2,8}$/.test(o.ticker)) fail('ticker: 2-8 letters/digits');
  if (Object.values(s.coins).some(c => c.ticker === o.ticker)) fail('ticker taken');
  const id = nid(s, 'coin');
  const c: Coin = {
    id, name: o.name.trim(), ticker: o.ticker, creator, createdAt: s.now, feeRate, rules, skin: 'classic',
    x: X0, y: Y0, K: X0 * Y0, real: 0, circ: 0, pot: 0, prizePot: 0, burned: 0, inflow: 0, holders: {},
    level: 1, levelPendingSince: null, spark: 15, ult: 0, rareFreeAt: 0, eclipseUsed: -1,
    caps: { start: s.now, burned: 0, potSpent: 0 }, effects: [], priceHist: [{ t: s.now, p: X0 / Y0 }],
    htl: null, htlCooldownUntil: 0, bannerOf: null, bannerUntil: 0, graduated: false,
  };
  s.coins[id] = c; log(s, id, 'launch', `${creator} launched $${c.ticker} with ${rules.length ? rules.join(', ') : 'no rules'}`);
  for (const t of ['taxHoliday', 'rollCall', 'hypeSiren', 'slowBurn'] as CardType[]) mintCard(s, id, creator, t);
  if (o.firstBuy) buy(s, creator, id, Math.min(o.firstBuy, 1));
  return c;
}

export function buy(s: State, a: string, coinId: string, nearIn: number, minTokens = 0) {
  const ac = acct(s, a), c = coinOf(s, coinId);
  if (!(nearIn > 0)) fail('amount must be positive'); if (ac.near < nearIn - EPS) fail('not enough NEAR');
  if (c.graduated) fail('curve is full: this coin graduated');
  const h = hold(c, a);
  if (c.rules.includes('launchGuard') && s.now - c.createdAt < 10 * MIN && h.launchBought + nearIn > 1 + EPS) fail('Launch Guard: max 1 NEAR per wallet in the first 10 minutes');
  const fr = feeRate(s, c);
  const { t: got, used } = curveBuy(c, nearIn * (1 - fr));
  const fee = used * fr / (1 - fr || 1), spent = used + fee;
  let t = got;
  if (t < minTokens) fail('slippage: fewer tokens than your minimum');
  ac.near -= spent; c.pot += fee; c.inflow += used;
  if (s.now - c.createdAt < 10 * MIN) h.launchBought += spent;
  if (activeEffect(c, 'slowBurn', s.now)) t -= cappedBurn(s, c, t * 0.01);
  h.acq = (h.bal * h.acq + t * s.now) / (h.bal + t || 1); h.bal += t; h.buys.push({ t: s.now, amt: t });
  h.buys = h.buys.filter(b => s.now - b.t < 15 * MIN);
  c.ult = Math.min(100, c.ult + 2 * used);
  const hh = activeEffect(c, 'happyHour', s.now);
  if (hh) { const bonus = potBuyTokens(s, c, Math.min(used * 0.10, c.pot)); if (bonus > 0) { h.vest.push({ amt: bonus, unlockAt: s.now + 6 * HOUR }); hh.data.bonus = (hh.data.bonus || 0) + bonus; } }
  if (c.htl && !c.htl.dipBuyers[a]) { c.htl.dipBuyers[a] = true; badge(s, c.id, a, 'dipCatcher', 'Dip Catcher'); randomCard(s, c.id, a, 'Common'); }
  trackPrice(s, c);
  log(s, c.id, 'buy', `${a} bought ${fmtTok(t)} $${c.ticker} for ${spent.toFixed(3)} NEAR`);
  return t;
}

export function sell(s: State, a: string, coinId: string, tokens: number, minNear = 0) {
  const ac = acct(s, a), c = coinOf(s, coinId), h = hold(c, a);
  if (!(tokens > 0)) fail('amount must be positive'); if (h.bal < tokens - 1e-6) fail('not enough tokens'); tokens = Math.min(tokens, h.bal);
  if (s.now < h.lockedUntil) fail(`locked until ${new Date(h.lockedUntil).toISOString().slice(11, 16)} UTC (caster lock)`);
  if (a === c.creator && c.rules.includes('vaultSeal') && s.now - c.createdAt < DAY) fail('Vault Seal: creator cannot sell in the first 24h');
  // unvested Happy Hour bonus is forfeited and burned
  const unv = h.vest.filter(v => v.unlockAt > s.now).reduce((x, v) => x + v.amt, 0);
  if (unv > 0) { h.vest = h.vest.filter(v => v.unlockAt <= s.now); rawBurn(c, unv); log(s, c.id, 'burn', `${a} sold early: ${fmtTok(unv)} unvested bonus burned`); }
  const fr = feeRate(s, c);
  let extra = 0;
  if (c.rules.includes('paperTax')) { const recent = h.buys.filter(b => s.now - b.t < 15 * MIN).reduce((x, b) => x + b.amt, 0); extra += 0.02 * Math.min(1, recent / tokens); }
  const toll = c.htl ? 0.02 : 0;
  const room = Math.max(0, s.cfg.maxSellRate - fr); const tollR = Math.min(toll, room), paperR = Math.min(extra, room - tollR);
  h.bal -= tokens;
  let t = tokens;
  if (activeEffect(c, 'slowBurn', s.now)) t -= cappedBurn(s, c, t * 0.01);
  const out = curveSell(c, t), fee = out * fr, tollAmt = out * tollR, paperAmt = out * paperR, net = out - fee - tollAmt - paperAmt;
  if (net < minNear) fail('slippage: less NEAR than your minimum');
  c.pot += fee + paperAmt; c.prizePot += tollAmt; c.inflow -= out; ac.near += net;
  if (c.htl && c.htl.snap[a] !== undefined && h.bal < c.htl.snap[a] - 1e-6) c.htl.out[a] = true;
  trackPrice(s, c);
  log(s, c.id, 'sell', `${a} sold ${fmtTok(tokens)} $${c.ticker} for ${net.toFixed(3)} NEAR`);
  return net;
}

export function checkIn(s: State, a: string, coinId: string) {
  const c = coinOf(s, coinId), h = c.holders[a]; if (!h || h.bal < s.cfg.minBal) fail(`hold at least ${fmtTok(s.cfg.minBal)} to check in`);
  if (s.now - h.lastCheckin < 30 * MIN) fail('already checked in (every 30 min)');
  h.lastCheckin = s.now;
}
export function claimCardOfDay(s: State, a: string, coinId: string) {
  const c = coinOf(s, coinId), h = c.holders[a]; if (!eligible(s, c, a)) fail('need the minimum balance held for 1h');
  if (s.now - h.lastCheckin > DAY) fail('check in first'); const d = Math.floor(s.now / DAY); if (h.cotdDay === d) fail('already claimed today');
  const n = randomCard(s, coinId, a, 'Common'); if (!n) fail('hand is full'); h.cotdDay = d; log(s, coinId, 'drop', `${a} claimed Card of the Day: ${n.title}`); return n;
}

// ----------------------------------------------------------------- sacrifice and crafting
export function sacrificeTier(s: State, c: Coin, a: string, tokens: number): Tier | null {
  const f = tokens / (c.circ || 1), held = s.now - (c.holders[a]?.acq ?? s.now);
  if (f >= 0.03 && held >= DAY) return 'Mythic'; if (f >= 0.01 && held >= 6 * HOUR) return 'Epic'; if (f >= 0.002) return 'Rare'; if (f >= 0.0005) return 'Common'; return null;
}
export function sacrifice(s: State, a: string, coinId: string, tokens: number, type: CardType) {
  const c = coinOf(s, coinId), h = hold(c, a); if (h.bal < tokens - 1e-6) fail('not enough tokens');
  const tier = sacrificeTier(s, c, a, tokens); if (!tier) fail('burn at least 0.05% of supply'); if (CARDS[type].tier !== tier) fail(`that burn earns a ${tier} card`);
  if (hand(s, coinId, a).length >= s.cfg.handLimit) fail('hand is full');
  h.bal -= tokens; rawBurn(c, tokens); trackPrice(s, c);
  const n = mintCard(s, coinId, a, type, rand(s) < 0.05)!; log(s, coinId, 'burn', `${a} sacrificed ${fmtTok(tokens)} for ${n.shiny ? 'a SHINY ' : ''}${n.title}`); return n;
}
export function craft(s: State, a: string, ids: string[], type: CardType) {
  if (ids.length !== 3 || new Set(ids).size !== 3) fail('pick 3 cards');
  const cards = ids.map(i => s.nfts[i]); if (cards.some(n => !n || n.kind !== 'card' || n.burned || n.owner !== a)) fail('not your cards');
  const tier = cards[0].tier!, coin = cards[0].coin; if (cards.some(n => n.tier !== tier || n.coin !== coin)) fail('same coin and tier only');
  const next = { Common: 'Rare', Rare: 'Epic', Epic: 'Mythic' }[tier as 'Common'] as Tier | undefined; if (!next) fail('Mythic cannot be crafted up');
  if (CARDS[type].tier !== next) fail(`3 ${tier} make 1 ${next}`);
  cards.forEach(n => (n.burned = true)); const n = mintCard(s, coin, a, type)!; log(s, coin, 'craft', `${a} crafted ${n.title}`); return n;
}

// ----------------------------------------------------------------- casting
export interface CastOpts { target?: string; lock?: number; goal?: number; skin?: string; }
export function castCheck(s: State, a: string, cardId: string, o: CastOpts = {}): { ok: true } | { ok: false; why: string } {
  try { validateCast(s, a, cardId, o); return { ok: true }; } catch (e: any) { return { ok: false, why: e.message }; }
}
function bigActive(c: Coin) { return c.effects.some(e => (e.tier === 'Epic' || e.tier === 'Mythic') && e.status !== 'done'); }
function validateCast(s: State, a: string, cardId: string, o: CastOpts) {
  const n = s.nfts[cardId]; if (!n || n.kind !== 'card' || n.burned) fail('no such card'); if (n.owner !== a) fail('not your card');
  const def = CARDS[n.type as CardType], c = coinOf(s, n.coin), h = c.holders[a];
  if (c.level < TIER_LEVEL[def.tier]) fail(`${def.tier} cards unlock at level ${TIER_LEVEL[def.tier]}`);
  if (!h || h.bal < s.cfg.minBal) fail(`hold at least ${fmtTok(s.cfg.minBal)} $${c.ticker}`);
  if (s.now - h.acq < s.cfg.holdAge) fail('tokens must be held 1h');
  if (a === c.creator && s.now - c.createdAt < HOUR) fail('the creator cannot play cards in the first hour');
  if (s.now - h.lastCastAt < 30 * MIN) fail('one play per wallet every 30 minutes');
  const big = def.tier === 'Epic' || def.tier === 'Mythic';
  if (big && s.now - h.lastBigCastAt < DAY) fail('one Epic or Mythic per wallet per 24h');
  if (def.kind === 'tactic') {
    const r = Object.values(s.raids).find(r => r.status === 'active' && r.sides.some(sd => sd.coin === c.id)); if (!r) fail('tactics are played during a raid');
    const side = r.sides.findIndex(sd => sd.coin === c.id); if (r.sides[side].tactics[r.round] !== null) fail('your side already played a tactic this round');
  }
  if ((def.kind === 'tactic' || def.tier === 'Common') && c.spark < 5 - EPS) fail('Spark meter too low (needs 5)');
  if (def.tier === 'Rare' && def.kind !== 'tactic' && s.now < c.rareFreeAt) fail('one Rare per coin every 15 minutes');
  if (def.tier === 'Epic' && c.ult < 100 - EPS) fail('Ult meter must be full');
  if (def.tier === 'Mythic') { if (!inEclipse(s)) fail('Mythic cards only during an Eclipse (06:00-06:30 and 18:00-18:30 UTC)'); if (c.eclipseUsed === eclipseWindow(s)) fail('this Eclipse was already used'); }
  if (big && bigActive(c)) fail('only one Epic or Mythic effect at a time');
  if (def.kind === 'hand' || def.kind === 'cosmetic') { if (c.effects.some(e => e.type === def.type && e.status !== 'done')) fail(`${def.name} is already running`); }
  if (def.type === 'diamondPool' && ![HOUR, 6 * HOUR, DAY].includes(o.lock!)) fail('pick a lock of 1h, 6h or 24h');
  if (def.type === 'prophecy' && !(o.goal! >= Math.max(1, 0.05 * c.real))) fail(`goal must be at least ${Math.max(1, 0.05 * c.real).toFixed(1)} NEAR net inflow`);
  if (def.kind === 'raid') {
    const t = s.coins[o.target!]; if (!t || t.id === c.id) fail('pick another coin to raid'); if (t.level < 2) fail('target must be level 2+');
    if (def.type === 'hardRaid' && t.level < 3) fail('hard raids need both coins at level 3');
    if (Object.values(s.raids).some(r => r.status !== 'done' && r.sides.some(sd => sd.coin === c.id || sd.coin === t.id))) fail('one of the coins is already in a raid');
  }
  return { n, def, c, h, big };
}

export function cast(s: State, a: string, cardId: string, o: CastOpts = {}) {
  const { n, def, c, h, big } = validateCast(s, a, cardId, o);
  if (def.kind === 'tactic' || (def.tier === 'Common')) c.spark -= 5;
  if (def.tier === 'Rare' && def.kind !== 'tactic') c.rareFreeAt = s.now + 15 * MIN;
  if (def.tier === 'Epic') c.ult = 0;
  if (def.tier === 'Mythic') c.eclipseUsed = eclipseWindow(s);
  n.burned = true; h.lastCastAt = s.now; if (big) h.lastBigCastAt = s.now;
  if (def.kind === 'tactic') {
    const r = Object.values(s.raids).find(r => r.status === 'active' && r.sides.some(sd => sd.coin === c.id))!;
    const side = r.sides.findIndex(sd => sd.coin === c.id); r.sides[side].tactics[r.round] = def.type;
    log(s, c.id, 'cast', `${a} played a hidden tactic in the raid (round ${r.round + 1})`); return null;
  }
  const startsAt = s.now + ANNOUNCE[def.tier];
  const e: Effect = { id: nid(s, 'fx'), type: def.type, tier: def.tier, caster: a, cardId, castAt: s.now, startsAt, endsAt: startsAt + def.duration, status: 'announced', data: {} };
  if (def.type === 'inferno' || def.type === 'supernova') { h.lockedUntil = Math.max(h.lockedUntil, s.now + 2 * HOUR); e.data = { chunks: def.type === 'inferno' ? 12 : 24, done: 0, share: def.type === 'inferno' ? 0.5 : 1, burned: 0 }; }
  if (def.type === 'diamondPool') e.data = { lock: o.lock, stakes: {}, forfeit: 0, settled: false };
  if (def.type === 'summoningCircle') e.data = { chants: [] };
  if (def.type === 'prophecy') e.data = { goal: o.goal, base: null, joined: [] };
  if (def.type === 'blackHole') e.data = { pit: {}, total: 0 };
  if (def.type === 'rebrand') e.data = { skin: o.skin || 'neon' };
  c.effects.push(e);
  if (def.kind === 'raid') startRaid(s, c, coinOf(s, o.target!), def.type === 'hardRaid' ? 'hard' : 'friendly', e, a);
  log(s, c.id, 'cast', `${a} played ${def.name}${ANNOUNCE[def.tier] ? ` - starts in ${ANNOUNCE[def.tier] / MIN}m` : ''}`);
  if (startsAt <= s.now) activate(s, c, e);
  return e;
}

function activate(s: State, c: Coin, e: Effect) {
  e.status = 'active';
  if (e.type === 'prophecy') e.data.base = c.inflow;
  if (e.type === 'rebrand') c.skin = e.data.skin;
  if (e.type === 'hypeSiren') log(s, c.id, 'fx', `$${c.ticker} is pinned to Trending`);
  log(s, c.id, 'fx', `${CARDS[e.type].name} is live`);
}

// joining card events --------------------------------------------------
function liveEffect(s: State, coinId: string, type: CardType) {
  const c = coinOf(s, coinId), e = c.effects.find(x => x.type === type && x.status === 'active'); if (!e) fail(`no live ${CARDS[type].name}`); return { c, e };
}
function takeStake(s: State, c: Coin, a: string, amt: number) { const h = hold(c, a); if (!(amt > 0)) fail('amount must be positive'); if (h.bal < amt - 1e-6) fail('not enough tokens'); if (s.now < h.lockedUntil) fail('your tokens are locked'); h.bal -= Math.min(amt, h.bal); return h; }
function giveBack(c: Coin, a: string, amt: number, now: number, fresh = false) { const h = hold(c, a); if (fresh) h.acq = (h.bal * h.acq + amt * now) / (h.bal + amt || 1); else if (h.bal <= 0) h.acq = Math.min(h.acq || now, now); h.bal += amt; }

export function joinDiamond(s: State, a: string, coinId: string, amt: number) {
  const { c, e } = liveEffect(s, coinId, 'diamondPool'); if (s.now >= e.endsAt) fail('join window closed'); takeStake(s, c, a, amt);
  e.data.stakes[a] = (e.data.stakes[a] || 0) + amt; log(s, coinId, 'stake', `${a} locked ${fmtTok(amt)} in the Diamond Pool`);
}
export function leaveDiamond(s: State, a: string, coinId: string) {
  const c = coinOf(s, coinId), e = c.effects.find(x => x.type === 'diamondPool' && !x.data.settled && x.data.stakes[a]); if (!e) fail('you are not in a Diamond Pool');
  const st = e.data.stakes[a], pen = st * 0.2; delete e.data.stakes[a]; rawBurn(c, pen / 2); e.data.forfeit += pen / 2; giveBack(c, a, st - pen, s.now);
  trackPrice(s, c); log(s, coinId, 'burn', `${a} left the Diamond Pool early: ${fmtTok(pen / 2)} burned, ${fmtTok(pen / 2)} to the stayers`);
}
export function chant(s: State, a: string, coinId: string, amt: number) {
  const { c, e } = liveEffect(s, coinId, 'summoningCircle'); if (!eligible(s, c, a)) fail('need the minimum balance held for 1h');
  if (e.data.chants.some((x: any) => x.a === a)) fail('you already chanted');
  const w = Math.min(conviction(s, c, a), s.cfg.circleWalletCap * c.circ); takeStake(s, c, a, amt); e.data.chants.push({ a, amt, w, t: s.now });
  log(s, coinId, 'stake', `${a} chanted (${e.data.chants.length} so far)`);
}
export function joinProphecy(s: State, a: string, coinId: string) {
  const { c, e } = liveEffect(s, coinId, 'prophecy'); if (!eligible(s, c, a)) fail('need the minimum balance held for 1h'); if (e.data.joined.includes(a)) fail('already joined'); e.data.joined.push(a);
}
export function feedBlackHole(s: State, a: string, coinId: string, amt: number) {
  const { c, e } = liveEffect(s, coinId, 'blackHole'); takeStake(s, c, a, amt); e.data.pit[a] = (e.data.pit[a] || 0) + amt; e.data.total += amt;
  log(s, coinId, 'stake', `${a} threw ${fmtTok(amt)} into the Black Hole`);
}

// ----------------------------------------------------------------- raids
function startRaid(s: State, a: Coin, b: Coin, mode: Raid['mode'], e: Effect, caster: string) {
  const side = (c: Coin): RaidSide => ({ coin: c.id, stakes: {}, startReal: 0, inflowAtRound: 0, score: 0, tactics: [null, null, null, null] });
  const r: Raid = { id: nid(s, 'raid'), mode, status: 'pending', createdAt: s.now, acceptBy: s.now + 15 * MIN, startsAt: 0, endsAt: 0, round: 0, sides: [side(a), side(b)], effectId: e.id, caster, winner: null, spoils: null, log: [] };
  s.raids[r.id] = r; log(s, b.id, 'raid', `$${a.ticker} challenges $${b.ticker} to a ${mode} raid. Any eligible $${b.ticker} holder can accept within 15m`);
}
export function acceptRaid(s: State, a: string, raidId: string) {
  const r = s.raids[raidId] || fail('no such raid'); if (r.status !== 'pending') fail('raid is not waiting'); const b = coinOf(s, r.sides[1].coin);
  if (!eligible(s, b, a)) fail(`only eligible $${b.ticker} holders can accept`);
  r.status = 'active'; r.startsAt = s.now; r.endsAt = s.now + 2 * HOUR; r.round = 0;
  r.sides.forEach(sd => { const c = coinOf(s, sd.coin); sd.startReal = Math.max(c.real, 5); sd.inflowAtRound = c.inflow; });
  const e = coinOf(s, r.sides[0].coin).effects.find(x => x.id === r.effectId)!; e.endsAt = r.endsAt + HOUR;
  log(s, b.id, 'raid', `${a} accepted. The raid is on: 4 rounds of 30m`);
}
export function stakeRaid(s: State, a: string, raidId: string, coinId: string, amt: number) {
  const r = s.raids[raidId] || fail('no such raid'); if (r.status !== 'active') fail('raid is not running');
  const side = r.sides.findIndex(sd => sd.coin === coinId); if (side < 0) fail('stake tokens of one of the two coins');
  const other = r.sides[1 - side]; if (other.stakes[a]) fail('you already raid for the other side');
  const c = coinOf(s, r.sides[side].coin); takeStake(s, c, a, amt); r.sides[side].stakes[a] = (r.sides[side].stakes[a] || 0) + amt;
  log(s, c.id, 'raid', `${a} staked ${fmtTok(amt)} $${c.ticker} for the raid`);
}
const RALLY = 0.07, CURSE = 0.10, REFLECT = 0.07;
export function tacticMult(me: CardType | null, op: CardType | null) {
  let m = 1; if (me === 'rally') m *= 1 + (op === 'curse' ? RALLY / 2 : RALLY);
  if (op === 'curse' && me !== 'ward') m *= 1 - CURSE; if (me === 'curse' && op === 'ward') m *= 1 - REFLECT; return m;
}
function endRound(s: State, r: Raid) {
  const k = r.round;
  // Mirror copies the opponent's previous-round card
  const tac = r.sides.map((sd, i) => { const t = sd.tactics[k]; return t === 'mirror' ? (k > 0 ? r.sides[1 - i].tactics[k - 1] : null) : t; });
  r.sides.forEach((sd, i) => {
    const c = coinOf(s, sd.coin), net = c.inflow - sd.inflowAtRound; sd.inflowAtRound = c.inflow;
    const base = 100 * Math.max(0, 1 + net / sd.startReal), pts = base * tacticMult(tac[i], tac[1 - i]); sd.score += pts;
  });
  const names = tac.map(t => (t ? CARDS[t].name : 'none'));
  r.log.push(`Round ${k + 1}: $${coinOf(s, r.sides[0].coin).ticker} ${names[0]} vs $${coinOf(s, r.sides[1].coin).ticker} ${names[1]} -> ${r.sides[0].score.toFixed(1)} : ${r.sides[1].score.toFixed(1)}`);
  log(s, r.sides[0].coin, 'raid', r.log[r.log.length - 1]); log(s, r.sides[1].coin, 'raid', r.log[r.log.length - 1]);
  r.round++;
}
function settleRaid(s: State, r: Raid) {
  const [A, B] = r.sides; const w = Math.abs(A.score - B.score) < 1e-9 ? null : A.score > B.score ? 0 : 1; r.winner = w;
  const ret = (sd: RaidSide, keep: number) => { const c = coinOf(s, sd.coin); for (const [a, v] of Object.entries(sd.stakes)) giveBack(c, a, v * keep, s.now); };
  if (w === null) { ret(A, 1); ret(B, 1); r.status = 'done'; log(s, A.coin, 'raid', 'Raid tied: all stakes returned'); return; }
  const W = r.sides[w], Lz = r.sides[1 - w], wc = coinOf(s, W.coin), lc = coinOf(s, Lz.coin);
  ret(W, 1);
  const lost = Object.values(Lz.stakes).reduce((x, v) => x + v, 0);
  const mvp = Object.entries(W.stakes).sort((x, y) => y[1] - x[1])[0]?.[0];
  if (mvp) { badge(s, wc.id, mvp, 'raidMvp', 'Raid MVP'); randomCard(s, wc.id, mvp, 'Rare'); }
  for (const a of Object.keys(W.stakes)) mint(s, 'relic', wc.id, a, 'raidWin', `Won a ${r.mode} raid vs $${lc.ticker}`);
  if (r.mode === 'friendly') {
    ret(Lz, 0.7); rawBurn(lc, lost * 0.3); trackPrice(s, lc); r.status = 'done';
    log(s, wc.id, 'raid', `$${wc.ticker} won the friendly raid. ${fmtTok(lost * 0.3)} $${lc.ticker} burned on their own coin`);
  } else {
    ret(Lz, 0.5); r.status = 'settling'; r.spoils = { tokensLeft: lost * 0.5, chunks: 12, nextAt: s.now, burnHalf: 0.5 };
    lc.bannerOf = wc.id; lc.bannerUntil = s.now + 12 * HOUR;
    log(s, wc.id, 'raid', `$${wc.ticker} won the HARD raid. ${fmtTok(lost * 0.5)} $${lc.ticker} will be sold over 1h to buy $${wc.ticker}`);
  }
}
function spoilsChunk(s: State, r: Raid) {
  const sp = r.spoils!, W = r.sides[r.winner!], lc = coinOf(s, r.sides[1 - r.winner!].coin), wc = coinOf(s, W.coin);
  const t = sp.tokensLeft / sp.chunks; sp.tokensLeft -= t; sp.chunks--; sp.nextAt = s.now + 5 * MIN;
  // escrowed loser tokens are circulating; sell them through the loser curve like any trader (fee goes to loser pot)
  const out = curveSell(lc, t), fee = out * lc.feeRate; lc.pot += fee; lc.inflow -= out;
  const { t: got, used } = curveBuy(wc, (out - fee) * (1 - wc.feeRate)); const wfee = (out - fee) - used; wc.pot += wfee; wc.inflow += used;
  rawBurn(wc, got * sp.burnHalf); const share = got * (1 - sp.burnHalf), tot = Object.values(W.stakes).reduce((x, v) => x + v, 0);
  if (tot > 0) for (const [a, v] of Object.entries(W.stakes)) giveBack(wc, a, share * v / tot, s.now, true); else rawBurn(wc, share);
  trackPrice(s, lc); trackPrice(s, wc);
  if (sp.chunks <= 0) { r.status = 'done'; log(s, wc.id, 'raid', 'Raid spoils fully paid'); }
}

// ----------------------------------------------------------------- time
function trackPrice(s: State, c: Coin) { const h = c.priceHist, p = price(c); if (h.length && s.now - h[h.length - 1].t < MIN) h[h.length - 1].p = p; else h.push({ t: s.now, p }); if (h.length > 6000) h.splice(0, h.length - 6000); }

export function tick(s: State, to: number) {
  while (s.now < to) { const next = Math.floor(s.now / MIN) * MIN + MIN; if (next > to) { s.now = to; break; } s.now = next; minute(s); }
}
function minute(s: State) {
  for (const c of Object.values(s.coins)) coinMinute(s, c);
  for (const r of Object.values(s.raids)) {
    if (r.status === 'pending' && s.now >= r.acceptBy) {
      r.status = 'done'; const e = coinOf(s, r.sides[0].coin).effects.find(x => x.id === r.effectId)!; e.status = 'done';
      const card = s.nfts[e.cardId]; card.burned = false; const h = coinOf(s, r.sides[0].coin).holders[r.caster]; h.lastCastAt = -1e15; h.lastBigCastAt = -1e15;
      log(s, r.sides[0].coin, 'raid', 'Nobody accepted the raid. Card returned');
    }
    if (r.status === 'active') { while (r.round < 4 && s.now >= r.startsAt + (r.round + 1) * 30 * MIN) endRound(s, r); if (r.round >= 4) settleRaid(s, r); }
    if (r.status === 'settling' && s.now >= r.spoils!.nextAt) spoilsChunk(s, r);
  }
}
function coinMinute(s: State, c: Coin) {
  const now = s.now;
  // meters
  const p = pulse(s, c) * (activeEffect(c, 'rollCall', now) ? 2 : 1);
  c.spark = Math.min(30, c.spark + 24 * p / 60); c.ult = Math.min(100, c.ult + 30 * p / 60);
  // levels: must hold above the next threshold for 15 minutes; never re-locks
  const nxt = c.level < 5 ? LEVELS[c.level] : Infinity;
  if (c.real >= nxt) { if (c.levelPendingSince === null) c.levelPendingSince = now; else if (now - c.levelPendingSince >= 15 * MIN) levelUp(s, c); } else c.levelPendingSince = null;
  // vesting
  for (const h of Object.values(c.holders)) if (h.vest.length) { const done = h.vest.filter(v => v.unlockAt <= now); if (done.length) { h.vest = h.vest.filter(v => v.unlockAt > now); h.bal += done.reduce((x, v) => x + v.amt, 0); } }
  // effects
  for (const e of c.effects) {
    if (e.status === 'announced' && now >= e.startsAt) activate(s, c, e);
    if (e.status !== 'active') continue;
    if ((e.type === 'inferno' || e.type === 'supernova') && e.data.done < e.data.chunks && now >= e.startsAt + e.data.done * (e.endsAt - e.startsAt) / e.data.chunks) {
      if (e.data.done === 0) e.data.budget = potRoom(s, c) * e.data.share;
      const b = potBurn(s, c, e.data.budget / e.data.chunks); e.data.burned += b; e.data.done++; trackPrice(s, c);
    }
    if (e.type === 'diamondPool' && !e.data.settled && now >= e.endsAt + e.data.lock) settleDiamond(s, c, e);
    if (now >= e.endsAt && e.type !== 'diamondPool') finish(s, c, e);
  }
  c.effects = c.effects.filter(e => e.status !== 'done' || now - e.endsAt < 6 * HOUR);
  // Hold the Line
  if (c.rules.includes('holdTheLine')) holdTheLine(s, c);
  if (c.bannerOf && now >= c.bannerUntil) c.bannerOf = null;
  trackPrice(s, c);
}
function levelUp(s: State, c: Coin) {
  c.level++; c.levelPendingSince = null; const crossedAt = s.now - 15 * MIN;
  log(s, c.id, 'level', `$${c.ticker} reached level ${c.level}`);
  // drops: only wallets that held 1h BEFORE the level was crossed; ranked by Conviction
  const elig = Object.entries(c.holders).filter(([, h]) => h.bal >= s.cfg.minBal && crossedAt - h.acq >= HOUR).map(([a]) => ({ a, w: conviction(s, c, a) })).sort((x, y) => y.w - x.w);
  const nE = Math.max(1, Math.round(elig.length * 0.01)), nR = Math.max(1, Math.round(elig.length * 0.10));
  elig.forEach((x, i) => { const tier: Tier = c.level >= 3 && i < nE ? 'Epic' : i < nR ? 'Rare' : 'Common'; randomCard(s, c.id, x.a, c.level >= 2 ? tier : 'Common'); });
  if (elig.length) log(s, c.id, 'drop', `Level-up drop to ${elig.length} holders`);
}
function settleDiamond(s: State, c: Coin, e: Effect) {
  e.data.settled = true; e.status = 'done'; const tot = Object.values<number>(e.data.stakes).reduce((x, v) => x + v, 0);
  for (const [a, v] of Object.entries<number>(e.data.stakes)) giveBack(c, a, v + (tot ? e.data.forfeit * v / tot : 0), s.now);
  if (tot === 0 && e.data.forfeit > 0) rawBurn(c, e.data.forfeit);
  mint(s, 'relic', c.id, e.caster, 'diamondPool', `Ran a Diamond Pool on $${c.ticker}`); log(s, c.id, 'fx', 'Diamond Pool unlocked: stayers paid');
}
function finish(s: State, c: Coin, e: Effect) {
  e.status = 'done'; const T = c.ticker;
  if (e.type === 'rebrand') c.skin = 'classic';
  if (e.type === 'summoningCircle') {
    const ch = e.data.chants as { a: string; amt: number; w: number }[]; const weight = ch.reduce((x, v) => x + v.w, 0);
    const ok = ch.length >= s.cfg.circleMinWallets && weight >= s.cfg.circleTarget * c.circ;
    ch.forEach((v, i) => { giveBack(c, v.a, ok ? v.amt * 0.9 : v.amt, s.now); if (ok) randomCard(s, c.id, v.a, i < Math.ceil(ch.length / 4) ? 'Rare' : 'Common'); });
    if (ok) { rawBurn(c, ch.reduce((x, v) => x + v.amt * 0.1, 0)); trackPrice(s, c); }
    log(s, c.id, 'fx', ok ? `The circle is complete: ${ch.length} chanters, 10% of stakes burned` : `The circle failed (${ch.length}/${s.cfg.circleMinWallets} wallets, ${(100 * weight / (c.circ || 1)).toFixed(1)}%/${100 * s.cfg.circleTarget}% weight). Stakes returned`);
    if (!ok) return;
  }
  if (e.type === 'prophecy') {
    const got = c.inflow - (e.data.base ?? c.inflow), ok = got >= e.data.goal;
    if (ok) { e.data.joined.slice(0, 20).forEach((a: string) => randomCard(s, c.id, a, 'Rare')); c.ult = Math.min(100, c.ult + 50); }
    log(s, c.id, 'fx', ok ? `Prophecy fulfilled (+${got.toFixed(1)} NEAR): Rare cards for ${Math.min(20, e.data.joined.length)} believers` : `Prophecy failed (${got.toFixed(1)}/${e.data.goal} NEAR)`);
    if (!ok) return;
  }
  if (e.type === 'blackHole') {
    rawBurn(c, e.data.total); trackPrice(s, c);
    for (const a of Object.keys(e.data.pit)) { badge(s, c.id, a, 'blackHole', 'Black Hole contributor'); randomCard(s, c.id, a, 'Common'); }
    log(s, c.id, 'burn', `The Black Hole collapsed: ${fmtTok(e.data.total)} $${T} burned`);
  }
  if (e.type === 'inferno' || e.type === 'supernova') log(s, c.id, 'burn', `${CARDS[e.type].name} finished: ${fmtTok(e.data.burned)} $${T} bought and burned`);
  if (e.type === 'happyHour') log(s, c.id, 'fx', `Happy Hour over: ${fmtTok(e.data.bonus || 0)} bonus tokens vesting`);
  if (CARDS[e.type].kind !== 'raid') mint(s, 'relic', c.id, e.caster, e.type, `Played ${CARDS[e.type].name} on $${T}`);
}
function holdTheLine(s: State, c: Coin) {
  const now = s.now;
  if (c.htl) {
    const H = c.htl;
    if (H.dipLeft > EPS && now >= H.nextChunk) { const part = H.dipBudget / 36; potBurn(s, c, Math.min(part, H.dipLeft)); H.dipLeft -= part; H.nextChunk = now + 10 * MIN; trackPrice(s, c); }
    if (now >= H.end) {
      const surv = Object.keys(H.snap).filter(a => !H.out[a] && (c.holders[a]?.bal || 0) >= H.snap[a] - 1e-6);
      const bonus = Math.min(c.pot * 0.2, potRoom(s, c)); c.pot -= bonus; c.caps.potSpent += bonus; const pool = c.prizePot + bonus; c.prizePot = 0;
      const ws = surv.map(a => conviction(s, c, a)), tot = ws.reduce((x, v) => x + v, 0);
      surv.forEach((a, i) => { if (tot > 0) s.accounts[a].near += pool * ws[i] / tot; badge(s, c.id, a, 'survivor', 'Survivor'); });
      if (!surv.length) c.pot += pool;
      surv.map((a, i) => ({ a, w: ws[i] })).sort((x, y) => y.w - x.w).slice(0, Math.max(1, Math.round(surv.length * 0.1))).forEach(x => randomCard(s, c.id, x.a, 'Rare'));
      log(s, c.id, 'htl', `Hold the Line ends: ${surv.length} survivors share ${pool.toFixed(3)} NEAR`);
      c.htl = null; c.htlCooldownUntil = now + 6 * HOUR;
    }
    return;
  }
  // armed only once the coin is 1h old and level 2+, so launch-hour volatility doesn't burn the pot with nobody eligible
  if (now < c.htlCooldownUntil || c.circ <= 0 || now - c.createdAt < HOUR || c.level < 2) return;
  const hr = c.priceHist.filter(x => now - x.t <= HOUR); const peak = Math.max(...hr.map(x => x.p)), p = price(c);
  if (peak > 0 && p <= peak * 0.8) {
    const snap: Record<string, number> = {}; for (const [a, h] of Object.entries(c.holders)) if (h.bal >= s.cfg.minBal && now - h.acq >= HOUR) snap[a] = h.bal;
    const dip = potRoom(s, c) * 1.0; // the trap may use the whole 24h pot allowance, dripped over 6h
    c.htl = { start: now, end: now + 6 * HOUR, snap, out: {}, dipBudget: dip, dipLeft: dip, nextChunk: now, dipBuyers: {} };
    log(s, c.id, 'htl', `HOLD THE LINE! $${c.ticker} fell ${(100 * (1 - p / peak)).toFixed(0)}% in an hour. 6h: +2% sell toll to the prize, the pot buys the dip, holders who stay get paid`);
  }
}

// ----------------------------------------------------------------- accounting checks (used by tests and the app's debug panel)
export function tokenLedger(s: State, c: Coin) {
  let held = 0; for (const h of Object.values(c.holders)) held += h.bal + h.vest.reduce((x, v) => x + v.amt, 0);
  let esc = 0; for (const e of c.effects) {
    if (e.type === 'diamondPool' && !e.data.settled) esc += Object.values<number>(e.data.stakes).reduce((x, v) => x + v, 0) + e.data.forfeit;
    if (e.type === 'summoningCircle' && e.status !== 'done') esc += e.data.chants.reduce((x: number, v: any) => x + v.amt, 0);
    if (e.type === 'blackHole' && e.status !== 'done') esc += e.data.total;
  }
  for (const r of Object.values(s.raids)) { if (r.status === 'active' || r.status === 'pending') r.sides.forEach(sd => { if (sd.coin === c.id) esc += Object.values(sd.stakes).reduce((x, v) => x + v, 0); }); if (r.status === 'settling' && r.sides[1 - r.winner!].coin === c.id) esc += r.spoils!.tokensLeft; }
  return { circ: c.circ, accounted: held + esc };
}
export function totalNear(s: State) { let t = 0; for (const a of Object.values(s.accounts)) t += a.near; for (const c of Object.values(s.coins)) t += c.real + c.pot + c.prizePot; return t; }

export const fmtTok = (t: number) => (t >= 1e6 ? (t / 1e6).toFixed(2) + 'M' : t >= 1e3 ? (t / 1e3).toFixed(1) + 'k' : t.toFixed(0));
export { CARDS, HOUR, MIN, DAY };

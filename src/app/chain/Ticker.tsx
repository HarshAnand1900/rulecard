// Live ticker: what just happened across every coin (Rituals, raids, cards, omens, level ups), newest first. Built only from each coin's own
// on-chain log and current raid, so nothing here is made up. Scrolls slowly, pauses on hover, and each item opens its coin.
import { useEffect, useState } from 'react';
import type { Net } from './net';
import type { CoinEntry, LogEntry, RaidView } from './types';
import { toNear, fmtNear } from './near';

type Tone = 'good' | 'bad' | 'gold' | 'card' | 'omen' | 'raid';
interface Item { key: string; at: number; text: string; coin: string; hot?: boolean; tone?: Tone }
const TONE: Record<string, Tone> = { ritual_made: 'good', ritual_missed: 'bad', level_up: 'gold', graduated: 'gold', card: 'card', omen: 'omen', raid: 'raid' };
const sym = (id: string) => id.split('.')[0].toUpperCase();

function describe(e: LogEntry, s: string): string | null {
  switch (e.kind) {
    case 'ritual_made': return `$${s} made its Ritual: pot burned ${fmtNear(toNear(e.near))} NEAR`;
    case 'ritual_missed': return `$${s} missed its Ritual · idle burn ×2`;
    case 'level_up': return `$${s} reached ${e.memo}`;
    case 'card': return `${e.memo.split(':')[0].trim() || 'A card'} played on $${s}`;
    case 'omen': return `${e.memo} over $${s}`;
    case 'graduated': return `$${s} graduated`;
    case 'raid': return e.memo.length <= 40 && !/[0-9]{7,}/.test(e.memo) ? `$${s} raid: ${e.memo}` : `A raid involving $${s} settled`;
    default: return null;
  }
}

export default function Ticker({ ch, coins, tick, go }: { ch: Net; coins: CoinEntry[]; tick: number; go: (id: string) => void }) {
  const [items, setItems] = useState<Item[]>([]);
  useEffect(() => {
    let live = true;
    (async () => {
      const out: Item[] = [];
      await Promise.all(coins.slice(0, 12).map(async e => {
        const s = sym(e.account_id);
        try {
          const [log, raid] = await Promise.all([ch.view<LogEntry[]>(e.account_id, 'get_log', { limit: 14 }), ch.view<RaidView | null>(e.account_id, 'get_raid')]);
          for (const l of log) { const t = describe(l, s); if (t) out.push({ key: `${e.account_id}:${l.seq}`, at: l.at, text: t, coin: e.account_id, tone: TONE[l.kind] }); }
          if (raid && raid.phase === 2 && raid.attacking) out.push({ key: `${e.account_id}:raid:${raid.seq}`, at: Number.MAX_SAFE_INTEGER, text: `$${sym(raid.attacker)} raiding $${sym(raid.defender)}${raid.round !== null ? `: Round ${raid.round + 1}` : ''}`, coin: e.account_id, hot: true });
        } catch { /* skip a coin that can't be read */ }
      }));
      out.sort((a, b) => b.at - a.at);
      if (live && out.length) setItems(out.slice(0, 16));
    })();
    return () => { live = false; };
  }, [ch, coins, tick]);
  if (!items.length) return null;
  const row = (suffix: string) => items.map(it => <button key={it.key + suffix} className={`tick-item ${it.hot ? 'hot' : ''} ${it.tone ? `tn-${it.tone}` : ''}`} onClick={() => go(it.coin)} tabIndex={suffix ? -1 : 0} aria-hidden={suffix ? true : undefined}>{it.text}</button>);
  return (
    <div className="ticker" role="marquee" aria-label="Latest events across all coins">
      <div className="ticker-track" style={{ ['--n' as any]: items.length }}>{row('')}{row('-b')}</div>
    </div>
  );
}

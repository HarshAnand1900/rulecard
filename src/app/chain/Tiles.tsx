// War Map tiles: every coin owns a block of tiles sized by its market cap. When a coin wins a raid it takes tiles from the loser and
// they turn the winner's colour. As the coins grow there are more tiles, so each tile gets smaller and the whole map still fits.
// Computed from what the coins report (market caps and finished raids), so anyone can recompute the same map.
import { useMemo } from 'react';
import { toNear } from './near';

export interface TileCoin { id: string; sym: string; mcap: string; color: string }
export interface TileEvent { at: number; winner: string; loser: string; level: number }

/** One tile stands for this much market cap. The tile count follows total market cap, so bigger coins mean smaller tiles. */
const NEAR_PER_TILE = 1;
const MIN_TILES = 24, MAX_TILES = 420;
/** Share of the loser's tiles a raid takes: 5% per raid level (L2 10%, L3 15%, L4 20%), at least one tile. */
const TAKE_PER_LEVEL = 0.05;

interface Tile { home: string; owner: string }

export function buildTiles(coins: TileCoin[], events: TileEvent[]) {
  const caps = coins.map(c => Math.max(0.01, toNear(c.mcap)));
  const total = caps.reduce((a, b) => a + b, 0);
  const target = Math.min(MAX_TILES, Math.max(MIN_TILES, Math.round(total / NEAR_PER_TILE)));
  // everyone gets at least 2 tiles; the rest follow market cap
  const counts = caps.map(c => Math.max(2, Math.round((c / total) * target)));
  const tiles: Tile[] = [];
  coins.forEach((c, i) => { for (let k = 0; k < counts[i]; k++) tiles.push({ home: c.id, owner: c.id }); });
  const owned = new Map(coins.map(c => [c.id, tiles.filter(t => t.owner === c.id).length]));
  const taken = new Map(coins.map(c => [c.id, 0]));
  for (const e of [...events].sort((a, b) => a.at - b.at)) {
    const have = owned.get(e.loser) ?? 0;
    if (have <= 1) continue;
    const n = Math.min(have - 1, Math.max(1, Math.round(have * TAKE_PER_LEVEL * e.level)));
    let moved = 0;
    // the loser gives up its tiles from the end of its own block first, so conquests read as a border moving
    for (let i = tiles.length - 1; i >= 0 && moved < n; i--) if (tiles[i].owner === e.loser) { tiles[i].owner = e.winner; moved++; }
    owned.set(e.loser, have - moved); owned.set(e.winner, (owned.get(e.winner) ?? 0) + moved); taken.set(e.winner, (taken.get(e.winner) ?? 0) + moved);
  }
  return { tiles, owned, taken, unit: total / tiles.length };
}

export default function Tiles({ coins, events, champion, go, recent }: {
  coins: TileCoin[]; events: TileEvent[]; champion?: string; go: (id: string) => void; recent: (id: string) => boolean;
}) {
  const { tiles, owned, taken, unit } = useMemo(() => buildTiles(coins, events), [coins, events]);
  const by = new Map(coins.map(c => [c.id, c]));
  // a 16:9 map: pick the column count that fills it, so more tiles means smaller tiles
  const cols = Math.max(6, Math.round(Math.sqrt((tiles.length * 16) / 9)));
  return (
    <div className="panel tilemap-panel">
      <div className="row between wrap"><h2>Territory</h2><span className="muted small mono">{tiles.length} TILES · 1 TILE ≈ {unit.toFixed(2)} N OF MARKET CAP</span></div>
      <div className="tilemap" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }} role="img" aria-label="War Map: each tile is held by the coin whose colour it shows">
        {tiles.map((t, i) => {
          const o = by.get(t.owner)!, h = by.get(t.home)!, conquered = t.owner !== t.home;
          return (
            <button key={i} className={`wt ${conquered ? 'taken' : ''} ${recent(t.owner) && conquered ? 'fresh' : ''} ${t.owner === champion ? 'champ' : ''}`} tabIndex={-1}
              style={{ ['--c' as any]: o.color, ['--h' as any]: h.color }} onClick={() => go(t.owner)}
              title={conquered ? `$${o.sym} holds this tile, taken from $${h.sym}` : `$${o.sym} home tile`} aria-hidden="true" />
          );
        })}
      </div>
      <div className="tile-legend">
        {coins.map(c => (
          <button key={c.id} className="tlg" style={{ ['--c' as any]: c.color }} onClick={() => go(c.id)}>
            <i /><strong>${c.sym}</strong><span className="mono">{owned.get(c.id) ?? 0} tiles</span>
            {(taken.get(c.id) ?? 0) > 0 && <small className="up mono">+{taken.get(c.id)} taken</small>}
            {c.id === champion && <small className="tlg-crown">Leader</small>}
          </button>
        ))}
      </div>
    </div>
  );
}

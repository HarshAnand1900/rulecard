// Launch a coin: four short steps on the left (identity, rules, seed, review) and a live preview of the coin with the exact cost on the right.
import { useEffect, useMemo, useState } from 'react';
import type { Net } from './net';
import type { CoinEntry, Rule } from './types';
import { RULE_TEXT } from './types';
import { toNear, nearToYocto, fmtNear } from './near';

const JOKERS = ['1-common-grin', '2-rare-laugh', '3-epic-wink', '4-mythic-starry', '5-wild-shades'];
const COLORS = ['#ff7a1a', '#4c8dff', '#f0518c', '#f5b729', '#2dd4bf', '#a78bfa'];
const hsh = (id: string) => { let h = 0; for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h; };

const RULES: { id: Rule; group: string }[] = [
  { id: 'LaunchGuard', group: 'Fair launch' }, { id: 'WhaleCap', group: 'Fair launch' },
  { id: 'PaperTax', group: 'Sell tax' }, { id: 'SoftTax', group: 'Sell tax' },
  { id: 'CreatorLock', group: 'Creator' }, { id: 'Ruthless', group: 'Burn' },
  { id: 'WarCoin', group: 'War' }, { id: 'PeaceCoin', group: 'War' },
];
const PRESETS: { name: string; blurb: string; rules: Rule[] }[] = [
  { name: 'Fair and calm', blurb: 'Guards the launch, no early whales', rules: ['LaunchGuard', 'WhaleCap'] },
  { name: 'Hardcore', blurb: 'Fast burn, fights from day one', rules: ['Ruthless', 'WarCoin'] },
  { name: 'Peaceful', blurb: 'No raids early, creator locked', rules: ['PeaceCoin', 'CreatorLock'] },
];
const STEPS = ['Identity', 'Rules', 'Seed', 'Review'];
const ICON_MAX = 12000; // characters of data URI (about 9 KB of image)

export default function Launch({ ch, me, act, busy, go, coins }: {
  ch: Net; me: string; act: (l: string, f: () => Promise<unknown>, d?: string) => Promise<void>; busy: string; go: (p: { kind: 'coin'; id: string }) => void; coins: CoinEntry[];
}) {
  const [name, setName] = useState(''); const [sym, setSym] = useState(''); const [seed, setSeed] = useState(20); const [rules, setRules] = useState<Rule[]>([]);
  const [icon, setIcon] = useState<string | null>(null); const [iconErr, setIconErr] = useState('');
  const [deposit, setDeposit] = useState(5);
  const [bounds, setBounds] = useState<[number, number]>([5, 100]);
  const [bal, setBal] = useState<number | null>(null);
  const [agree, setAgree] = useState(false);
  useEffect(() => { ch.view(ch.factoryId, 'get_params').then((p: any) => { setDeposit(toNear(p.deploy_deposit)); const b: [number, number] = [toNear(p.seed_min), toNear(p.seed_max)]; setBounds(b); setSeed(s => Math.min(b[1], Math.max(b[0], s > b[1] ? b[0] * 4 : s))); }); }, [ch, ch.scale]);
  useEffect(() => { ch.balance().then(setBal).catch(() => {}); }, [ch, me]);

  // The coin's picture: cropped to a square, shrunk and re-encoded until it is small enough to live on the chain inside the coin (every call loads it).
  const pickIcon = async (f: File | undefined) => {
    setIconErr(''); if (!f) return;
    if (!f.type.startsWith('image/')) { setIconErr('Choose an image file (PNG, JPG, WebP or GIF).'); return; }
    if (f.size > 8 * 1024 * 1024) { setIconErr('That file is over 8 MB. Pick a smaller picture.'); return; }
    try {
      const bmp = await createImageBitmap(f);
      const side = Math.min(bmp.width, bmp.height);
      for (const px of [160, 128, 96, 72]) {
        const cv = document.createElement('canvas'); cv.width = cv.height = px;
        const g = cv.getContext('2d'); if (!g) throw new Error('canvas');
        g.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, px, px);
        for (const q of [0.85, 0.7, 0.55, 0.4]) {
          const url = cv.toDataURL('image/webp', q);
          if (url.startsWith('data:image/webp') && url.length <= ICON_MAX) { setIcon(url); return; }
        }
      }
      setIconErr('That picture is too detailed to fit on the chain. Try a simpler one.');
    } catch { setIconErr('Could not read that image. Try a PNG or JPG.'); }
  };
  const toggle = (r: Rule) => setRules(rs => rs.includes(r) ? rs.filter(x => x !== r) : rs.length < 3 ? [...rs, r] : rs);
  const taxClash = rules.includes('PaperTax') && rules.includes('SoftTax');
  const symOk = /^[a-zA-Z0-9]{2,10}$/.test(sym);
  const taken = symOk && coins.some(c => c.account_id === ch.coinId(sym));
  const seedOk = seed >= bounds[0] && seed <= bounds[1];
  const total = seed + deposit;
  const poor = bal !== null && total + 0.1 > bal;
  const done = [name.trim().length > 0 && symOk && !taken, rules.length > 0 && !taxClash, seedOk, agree];
  const reason = !me ? 'Connect a wallet first' : !name.trim() ? 'Name your coin' : !symOk ? 'Ticker needs 2 to 10 letters or numbers' : taken ? 'That ticker is taken' : taxClash ? 'Pick either Paper Tax or Soft Tax' : !seedOk ? 'Seed is out of range' : poor ? 'Not enough NEAR' : !agree ? 'Confirm below' : '';
  const color = COLORS[hsh(sym || 'x') % COLORS.length], joker = JOKERS[hsh(sym || 'x') % JOKERS.length];
  const groups = useMemo(() => { const g: Record<string, typeof RULES> = {}; for (const r of RULES) (g[r.group] ??= []).push(r); return g; }, []);
  const pctSeed = bounds[1] > bounds[0] ? ((seed - bounds[0]) / (bounds[1] - bounds[0])) * 100 : 0;

  return (
    <section className="launch">
      <div className="row between wrap"><h1>Launch a coin</h1>
        <ol className="lsteps" aria-label="Progress">{STEPS.map((s, i) => <li key={s} className={done[i] ? 'ok' : ''}><span className="mono">{done[i] ? '✓' : i + 1}</span>{s}</li>)}</ol>
      </div>
      <p className="muted">Name it, pick up to three rules, add a seed. After launch nothing can be changed, not even by you.</p>

      <div className="trade-grid launch-grid">
        <div className="tg-left">
          <div className="panel lstep">
            <div className="ls-head"><span className="ls-n mono">1</span><h2>Identity</h2></div>
            <div className="lfields">
              <label>Name<input value={name} maxLength={32} onChange={e => setName(e.target.value)} placeholder="Frog Pond" /></label>
              <label>Ticker<div className="tickbox"><span className="mono">$</span><input value={sym} maxLength={10} onChange={e => setSym(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} placeholder="FROG" /></div>
                <small className={`lhint ${taken || (sym && !symOk) ? 'bad' : sym && symOk ? 'ok' : ''}`}>{taken ? 'This ticker is already taken.' : sym && !symOk ? '2 to 10 letters or numbers.' : sym ? `Contract: ${ch.coinId(sym)}` : '2 to 10 letters or numbers. It becomes the contract name.'}</small>
              </label>
              <div className="iconpick">
                <span className="iconprev" aria-hidden="true">{icon ? <img src={icon} alt="" /> : <b>{(sym || '?').slice(0, 3)}</b>}</span>
                <div className="iconctl">
                  <strong className="small">Coin picture <span className="muted">(optional)</span></strong>
                  <div className="row gap wrap">
                    <label className="btn ghost small filebtn">{icon ? 'Change picture' : 'Upload a picture'}<input type="file" accept="image/*" onChange={e => { void pickIcon(e.target.files?.[0]); e.target.value = ''; }} /></label>
                    {icon && <button type="button" className="btn ghost small" onClick={() => { setIcon(null); setIconErr(''); }}>Remove</button>}
                  </div>
                  <small className={`lhint ${iconErr ? 'bad' : ''}`}>{iconErr || (icon ? `Saved inside the coin on chain (${Math.round(icon.length / 1024 * 10) / 10} KB). It can't be changed later.` : 'Cropped to a square and shrunk to fit on the chain. Without one, the coin draws its own face from its war record.')}</small>
                </div>
              </div>
            </div>
          </div>

          <div className="panel lstep">
            <div className="ls-head"><span className="ls-n mono">2</span><h2>Rules</h2><span className="muted small mono ls-count">{rules.length} / 3</span></div>
            <p className="muted small">Locked forever. Start from a preset or pick your own.</p>
            <div className="presets3">{PRESETS.map(p => <button key={p.name} className={`preset ${p.rules.length === rules.length && p.rules.every(r => rules.includes(r)) ? 'on' : ''}`} onClick={() => setRules(p.rules)}><strong>{p.name}</strong><small className="muted">{p.blurb}</small></button>)}</div>
            {Object.entries(groups).map(([g, rs]) => (
              <div key={g} className="rgroup"><div className="rg-label mono">{g.toUpperCase()}</div>
                <div className="rule-cards">{rs.map(r => {
                  const on = rules.includes(r.id), blocked = !on && rules.length >= 3;
                  return <button key={r.id} className={`rcard ${on ? 'on' : ''}`} disabled={blocked} aria-pressed={on} onClick={() => toggle(r.id)}><span className="rc-top"><strong>{r.id}</strong><i className="rc-check" aria-hidden="true">{on ? '✓' : ''}</i></span><span className="small muted">{RULE_TEXT[r.id]}</span></button>;
                })}</div>
              </div>
            ))}
            {taxClash && <div className="warn">Paper Tax and Soft Tax overlap: pick one of them.</div>}
          </div>

          <div className="panel lstep">
            <div className="ls-head"><span className="ls-n mono">3</span><h2>Seed</h2></div>
            <p className="muted small">Your seed goes into the coin's pot, the fuel for burn cards. You cannot take it back.</p>
            <div className="seedrow"><label className="amt"><input type="number" min={bounds[0]} max={bounds[1]} step={bounds[0]} value={seed} onChange={e => setSeed(Number(e.target.value))} aria-label="Seed in NEAR" /><span className="unit">NEAR</span></label></div>
            <input className="slider" type="range" min={bounds[0]} max={bounds[1]} step={bounds[0] >= 1 ? 1 : bounds[0]} value={Math.min(bounds[1], Math.max(bounds[0], seed))} onChange={e => setSeed(Number(e.target.value))} style={{ ['--p' as any]: `${pctSeed}%` }} aria-label="Seed slider" />
            <div className="row between small muted mono"><span>MIN {fmtNear(bounds[0])}</span><span>MAX {fmtNear(bounds[1])}</span></div>
            <div className="presets">{[1, 2, 4, 10].map(k => <button key={k} onClick={() => setSeed(Math.min(bounds[1], bounds[0] * k))}>{fmtNear(Math.min(bounds[1], bounds[0] * k))} N</button>)}</div>
            {!seedOk && <div className="warn">Seed must be between {fmtNear(bounds[0])} and {fmtNear(bounds[1])} NEAR.</div>}
          </div>

          <div className="panel lstep">
            <div className="ls-head"><span className="ls-n mono">4</span><h2>Review</h2></div>
            <div className="xrows">
              <div className="row between"><span className="muted">Seed (into the pot)</span><span className="mono">{fmtNear(seed)} N</span></div>
              <div className="row between"><span className="muted">Storage deposit (the coin's code)</span><span className="mono">{fmtNear(deposit)} N</span></div>
              <div className="row between"><span className="muted">Network fee</span><span className="mono">a small amount</span></div>
              <div className="row between ltotal"><strong>Total you send</strong><strong className="mono">{fmtNear(total)} N</strong></div>
              {bal !== null && <div className="row between small"><span className="muted">Your balance</span><span className={`mono ${poor ? 'down' : ''}`}>{fmtNear(bal)} N</span></div>}
            </div>
            <div className="feebox"><strong className="small">Trade fees, forever</strong><div className="feebar" aria-hidden="true"><i style={{ width: '75%' }} /><i style={{ width: '15%' }} /><i style={{ width: '10%' }} /></div>
              <div className="feelegend small"><span><i className="d1" />1.5% to the pot</span><span><i className="d2" />0.3% protocol</span><span><i className="d3" />0.2% creator escrow, paid at graduation</span></div></div>
            <label className="agree"><input type="checkbox" checked={agree} onChange={e => setAgree(e.target.checked)} /><span>I understand the name, rules and seed cannot be changed or taken back. There is no admin key.</span></label>
            <button className="btn big-cta buy" disabled={!!reason || !!busy} onClick={() => act('Launch', async () => {
              await ch.call(ch.factoryId, 'create_coin', { name, symbol: sym, icon, rules }, nearToYocto(total));
              go({ kind: 'coin', id: ch.coinId(sym) });
            }, `$${sym} launched`)}>{busy ? `${busy}…` : reason || `Launch $${sym} for ${fmtNear(total)} NEAR`}</button>
          </div>
        </div>

        <div className="tg-right">
          <div className="panel lprev" style={{ ['--ac' as any]: color, ['--m' as any]: `url(/bg/jokers/${joker}.png)` }}>
            <div className="muted small mono">PREVIEW</div>
            <div className="lp-card">
              <span className="avatar big" aria-hidden="true">{icon ? <img src={icon} alt="" /> : <b>{(sym || '?').slice(0, 4)}</b>}</span>
              <div className="lp-id"><strong className="lp-sym">${sym || 'TICKER'}</strong><span className="muted">{name || 'Your coin name'}</span></div>
              <span className="lvl l1">L1 Launched</span>
            </div>
            <div className="chips">{rules.length ? rules.map(r => <span key={r} className="chip" title={RULE_TEXT[r]}>{r}</span>) : <span className="muted small">No rules yet</span>}</div>
            <div className="lp-stats mono">
              <div><small>POT AT START</small><b>{fmtNear(seed)} N</b></div>
              <div><small>YOU SEND</small><b>{fmtNear(total)} N</b></div>
              <div><small>SUPPLY</small><b>1B</b></div>
              <div><small>LEVEL</small><b>L1</b></div>
            </div>
          </div>
          <div className="panel">
            <h2>What happens next</h2>
            <ol className="d-steps">
              <li><span className="mono">1</span><span>The factory deploys your coin as its own contract.</span></li>
              <li><span className="mono">2</span><span>It appears on Discover and the first day begins.</span></li>
              <li><span className="mono">3</span><span>Holders say gm, lock, play cards and raid other coins.</span></li>
            </ol>
          </div>
        </div>
      </div>
    </section>
  );
}

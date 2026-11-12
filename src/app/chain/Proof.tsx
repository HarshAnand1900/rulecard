// Proof: everything a judge needs to trust the coins, read live from the chain (not from this app's own state).
import { useEffect, useState } from 'react';
import type { Net } from './net';
import type { CoinEntry, CoinView, Proposal } from './types';
import { toNear } from './near';
import Cheat from './Cheat';
import chart from '../../../docs/supply-60d.svg';

interface Check { label: string; ok: boolean | null; detail: string }
interface CoinProof { entry: CoinEntry; checks: Check[]; codeHash: string; keys: number }
interface FactoryProof { keys: number; admin: string | null; codeStored: boolean; mode: string; codeHash: string }

const explorer = (ch: Net, id: string) => (ch.explorer ? `${ch.explorer}/address/${id}` : undefined);
const STORAGE_PER_BYTE = 10n ** 19n;
const fmt = (y: bigint) => (Number(y / 10n ** 18n) / 1e6).toFixed(3);

export default function Proof({ ch, coins, tick }: { ch: Net; coins: CoinEntry[]; tick: number }) {
  const [f, setF] = useState<FactoryProof | null>(null);
  const [rows, setRows] = useState<CoinProof[]>([]);
  const [err, setErr] = useState('');

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const [info, params] = await Promise.all([ch.accountInfo(ch.factoryId), ch.view<any>(ch.factoryId, 'get_params')]);
        const out: CoinProof[] = [];
        for (const e of coins) {
          const [a, c, p, table] = await Promise.all([ch.accountInfo(e.account_id), ch.view<CoinView>(e.account_id, 'get_coin'), ch.view<any>(e.account_id, 'get_params'), ch.view<Proposal[]>(e.account_id, 'get_table')]);
          const held = BigInt(c.circulating) + BigInt(c.curve_room) + BigInt(c.reward_pool) + BigInt(p.dex_reserve);
          const supply = BigInt(c.total_supply);
          const chips = table.reduce((s, t) => s + BigInt(t.chip_total), 0n);
          const owed = BigInt(c.real) + BigInt(c.pot) + BigInt(c.escrow) + BigInt(c.protocol_owed) + chips;
          const free = BigInt(a.amount) - BigInt(a.storageUsage) * STORAGE_PER_BYTE;
          out.push({
            entry: e, codeHash: a.codeHash, keys: a.keys,
            checks: [
              { label: 'No access keys', ok: a.keys === 0, detail: `${a.keys} keys on the coin account: nobody can sign for it` },
              { label: 'No admin', ok: p.admin === null, detail: `get_params().admin = ${p.admin === null ? 'null' : p.admin}` },
              { label: 'Supply adds up', ok: held === supply, detail: `tokens held ${held.toString()} + unsold curve + reward pool + DEX reserve vs total supply ${supply.toString()} (difference ${(held - supply).toString()})` },
              { label: 'Curve fully backed', ok: c.solvent, detail: 'selling every circulating token would pay out no more than the real NEAR in the curve' },
              { label: 'Holds the NEAR it owes', ok: free >= owed, detail: `${fmt(free)} NEAR free on the contract vs ${fmt(owed)} owed (curve ${fmt(BigInt(c.real))} + pot ${fmt(BigInt(c.pot))} + escrow, fees and open card NEAR); margin ${fmt(free - owed)}` },
            ],
          });
        }
        const hashes = new Set(out.map(o => o.codeHash));
        for (const o of out) o.checks.push({ label: 'Same code as every other coin', ok: hashes.size === 1, detail: `code hash ${o.codeHash.slice(0, 12)}… ${hashes.size === 1 ? `(${out.length} coins, one hash)` : `(${hashes.size} different hashes!)`}` });
        if (!live) return;
        setF({ keys: info.keys, admin: params.admin, codeStored: params.code_stored, mode: params.mode, codeHash: info.codeHash });
        setRows(out); setErr('');
      } catch (e: any) { if (live) setErr(String(e?.message ?? e).slice(0, 200)); }
    })();
    return () => { live = false; };
  }, [ch, coins, tick]);

  const all = rows.flatMap(r => r.checks);
  const passed = all.filter(c => c.ok).length;
  const fPassed = f ? [f.keys === 0, f.admin === null, f.codeStored].filter(Boolean).length : 0;
  return (
    <section>
      <h1>Judges: start here</h1>
      <p className="muted">The memecoin track's requirements, each with where to see it. Everything below the table is read live from the chain.</p>
      <div className="panel">
        <table className="log">
          <thead><tr><th>The track asks for</th><th>Where to see it</th></tr></thead>
          <tbody>
            <tr><td>A NEP-141 token with the mechanic in the contract</td><td>Every coin is its own contract. Checks per coin are below; the rules are in <code>contracts/coin/src</code>.</td></tr>
            <tr><td>Parameters fixed at launch, readable, no admin</td><td>The No admin and No access keys rows below, and <code>get_params</code> on any coin.</td></tr>
            <tr><td>Streak and today's progress</td><td>The Ritual tab on a coin: today's progress, current streak and the coin's best streak (its high score).</td></tr>
            <tr><td>A log of every mint and burn</td><td>The Log tab and the price chart. Every one is also a NEP-297 event, so an indexer can rebuild the history.</td></tr>
            <tr><td>Sybil limits written plainly</td><td>Check-ins need 1 NEAR worth of tokens held (0.01 at demo scale). Levels count only wallets holding 2 NEAR worth for an hour. Practice wallets are free, so the demo world is not Sybil-resistant: on a real launch the NEAR a wallet must put in is the cost of each fake one. The README says what this does and doesn't stop.</td></tr>
            <tr><td>A simulation before the parameters</td><td>The 60-day chart further down, and the parameter sweep in the README.</td></tr>
            <tr><td>Raids: coins fighting coins</td><td>The War Map page. Labelled 🤖 bots keep the demo world moving; their whole brain is <code>sandbox/bots.mjs</code>.</td></tr>
          </tbody>
        </table>
      </div>
      <Cheat ch={ch} coins={coins} />
      <h2>Live proof</h2>
      <p className="muted">Read live from the chain every few seconds, not from this app's own state. Click any address to check it on the explorer yourself.</p>
      {err && <div className="warn">{err}</div>}
      <div className={`panel proof-head ${f && fPassed === 3 && passed === all.length ? 'ok' : ''}`}>
        <strong>{f ? `${fPassed + passed} of ${3 + all.length} checks pass` : 'Checking…'}</strong>
        <span className="small muted">{ch.mode} · {f?.mode} scale · {coins.length} coin{coins.length === 1 ? '' : 's'}</span>
      </div>

      <div className="panel stack">
        <h2>The factory <a className="small" href={explorer(ch, ch.factoryId)} target="_blank" rel="noreferrer">{ch.factoryId} ↗</a></h2>
        {f && <>
          <ProofRow ok={f.keys === 0} label="No access keys" detail={`${f.keys} keys: its only key was deleted in the same transaction that deployed it, so nobody can create an impostor coin under it`} />
          <ProofRow ok={f.admin === null} label="No admin" detail={`get_params().admin = ${f.admin === null ? 'null' : f.admin}`} />
          <ProofRow ok={f.codeStored} label="Coin code fixed" detail="the coin code was stored once, in the deploy transaction; there is no method to change it" />
        </>}
      </div>

      {rows.map(r => (
        <div key={r.entry.account_id} className="panel stack">
          <h2>${r.entry.symbol} <a className="small" href={explorer(ch, r.entry.account_id)} target="_blank" rel="noreferrer">{r.entry.account_id} ↗</a></h2>
          {r.checks.map(c => <ProofRow key={c.label} ok={c.ok} label={c.label} detail={c.detail} />)}
        </div>
      ))}

      <div className="panel stack">
        <h2>The 60-day simulation</h2>
        <p className="small muted">Run before choosing the parameters (<code>node research/supply-60d-sim.cjs</code>): total supply under an active, a fading and a dead community, and what each kind of wallet keeps.</p>
        <img src={chart} alt="60-day simulation: total supply under three communities, and what each kind of wallet keeps" style={{ width: '100%', borderRadius: 8 }} />
      </div>

      <div className="panel stack">
        <h2>What this page does not prove</h2>
        <ul className="small">
          <li>It shows the numbers the contract reports; it doesn't audit the Rust code. The source and the tests are in the repo.</li>
          <li>"Holds the NEAR it owes" compares the contract's free balance with what its own books say it owes; it can't see off-chain promises (there are none).</li>
          <li>Randomness (card rolls, fire times) uses the block random seed. Raid plans are readable from contract state. See the README's honest limits.</li>
        </ul>
      </div>
    </section>
  );
}

function ProofRow({ ok, label, detail }: { ok: boolean | null; label: string; detail: string }) {
  return (
    <div className={`proof-row ${ok ? 'ok' : ok === null ? '' : 'bad'}`}>
      <span className="proof-mark" aria-label={ok ? 'pass' : 'fail'}>{ok ? '✓' : ok === null ? '·' : '✗'}</span>
      <span><strong>{label}</strong><br /><span className="small muted">{detail}</span></span>
    </div>
  );
}

export { toNear };

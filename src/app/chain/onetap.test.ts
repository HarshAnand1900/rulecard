// @ts-nocheck (uses node:fs; the app's tsconfig has no node types)
// Needs the local sandbox (./sandbox/start.sh, node sandbox/deploy.mjs, node sandbox/seed.mjs). Skips itself otherwise.
// Run: npx vitest run src/app/chain/onetap.test.ts
// It proves the safety claim of one-tap on a real chain: a function-call key limited to one coin and a method list can
// check in, but can't attach a deposit (so can't sell, lock, bet or buy), can't call other methods, and can't touch other contracts.
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { connect, keyStores, KeyPair } from 'near-api-js';
import { ONE_TAP_METHODS, ONE_TAP_ALLOWANCE, newOneTapKey, callWithOneTapKey } from './onetap';

const keyFile = 'sandbox/.keys/keys.json';
const up = async (url: string) => { try { const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"jsonrpc":"2.0","id":1,"method":"status","params":[]}', signal: AbortSignal.timeout(1500) }); return r.ok; } catch { return false; } };
const keys: any = existsSync(keyFile) ? JSON.parse(readFileSync(keyFile, 'utf8')) : null;
const ready = !!keys && (await up(keys.nodeUrl));

describe.skipIf(!ready)('one-tap function-call key (local sandbox)', () => {
  it('can check in, but cannot move money or call anything else', async () => {
    const coin = `frog.${keys.factories.demo}`, other = `moth.${keys.factories.demo}`;
    const who = keys.accounts.bob.accountId;
    const ks = new keyStores.InMemoryKeyStore();
    await ks.setKey(keys.networkId, who, KeyPair.fromString(keys.accounts.bob.secretKey));
    const near = await connect({ networkId: keys.networkId, nodeUrl: keys.nodeUrl, keyStore: ks });
    const bob = await near.account(who);

    // the wallet would add this key with one approval; here the full-access key does it
    const k = newOneTapKey();
    await bob.addKey(k.publicKey, coin, ONE_TAP_METHODS, BigInt(ONE_TAP_ALLOWANCE));
    const base = { nodeUrl: keys.nodeUrl, networkId: keys.networkId, accountId: who, secretKey: k.secret };

    // 1. allowed methods work with no full-access key (poke always succeeds; gm succeeds or says why not)
    await callWithOneTapKey({ ...base, contractId: coin, method: 'poke' });
    const gm = await callWithOneTapKey({ ...base, contractId: coin, method: 'gm' }).then(() => 'ok', (e: any) => String(e?.message ?? e));
    expect(gm === 'ok' || /gm once every 6h|buy first|hold at least/.test(gm)).toBe(true);

    // 2. money-moving calls need a deposit, which a function-call key can never attach
    await expect(callWithOneTapKey({ ...base, contractId: coin, method: 'lock', args: { amount: '1', hours: 24 }, deposit: 1n })).rejects.toThrow();
    await expect(callWithOneTapKey({ ...base, contractId: coin, method: 'buy', deposit: 1_000_000_000_000_000_000_000_000n })).rejects.toThrow();

    // 3. methods outside the list, and other contracts, are refused
    await expect(callWithOneTapKey({ ...base, contractId: coin, method: 'drop_card', args: { card: 'Rally' } })).rejects.toThrow(/method|Method/);
    await expect(callWithOneTapKey({ ...base, contractId: other, method: 'poke' })).rejects.toThrow();
  }, 120_000);
});

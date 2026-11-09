import { call, view, NEAR, rpc, chainTime, errMsg } from './lib.mjs';
const id = await call('you', 'launch_coin', { name: 'Smoke Test', ticker: 'SMOKE', fee_bps: 100, rules: ['holdTheLine', 'paperTax'] }, NEAR(1));
console.log('launched coin', id);
const got = await call('alice', 'buy', { coin_id: id, min_tokens: '0' }, NEAR(3));
console.log('alice bought', (BigInt(got) / 10n ** 18n).toString(), 'tokens');
const c = await view('get_coin', { coin_id: id });
console.log('coin', c.ticker, 'level', c.level, 'real', Number(BigInt(c.real) / 10n ** 21n) / 1000, 'NEAR pot', Number(BigInt(c.pot) / 10n ** 21n) / 1000, 'solvent', c.solvent);
console.log('hand of you:', (await view('nfts_for_owner', { account_id: 'you.test.near' })).map(n => n.title).join(', '));
try { await call('bob', 'sell', { coin_id: id, tokens: '1', min_near: '0' }); } catch (e) { console.log('expected error:', errMsg(e)); }
const t0 = c.now; const h0 = (await rpc('status', [])).sync_info.latest_block_height;
await rpc('sandbox_fast_forward', { delta_height: 600 });
const h1 = (await rpc('status', [])).sync_info.latest_block_height;
await call('you', 'crank', { coin_id: id });
const c2 = await view('get_coin', { coin_id: id });
console.log(`fast_forward 600 blocks: height ${h0} -> ${h1}, contract clock +${((c2.now - t0) / 60000).toFixed(1)} min`);

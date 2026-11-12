// One-tap actions. A NEAR function-call access key is limited to ONE contract (a coin), to a short list of methods and
// to a gas allowance, and it can never attach NEAR. So a key created for a coin can check in, claim packs, back cards and
// Battle cry without a wallet popup, but it cannot sell, lock, bet, buy or move a single token: those calls need a deposit
// (1 yoctoNEAR) that only a full-access key can attach.
import './polyfill';
import { connect, keyStores, KeyPair } from 'near-api-js';

/** Methods the key may call. None of them takes a deposit and none can lose the player tokens or NEAR. */
export const ONE_TAP_METHODS = ['gm', 'claim_pack', 'claim_level_drop', 'claim_vault', 'claim_raid_pack', 'back', 'sign', 'sign_raid', 'set_plan', 'battle_cry', 'poke', 'unlock'];
/** Gas budget of the key (it is paid from this allowance and the player's balance): about 80 calls. */
export const ONE_TAP_ALLOWANCE = '500000000000000000000000'; // 0.5 NEAR
const GAS = 60_000_000_000_000n; // 60 Tgas per call (a call costs a fraction of that)

export const oneTapKeyName = (account: string, coin: string) => `rulecard-onetap:${account}:${coin}`;

export function newOneTapKey(): { secret: string; publicKey: string } {
  const kp = KeyPair.fromRandom('ed25519');
  return { secret: kp.toString(), publicKey: kp.getPublicKey().toString() };
}

/** The AddKey action (in wallet-selector's "internal" format) that registers the key for one coin. */
export const oneTapAddKeyAction = (publicKey: string, coin: string) => ({
  type: 'AddKey' as const,
  params: { publicKey, accessKey: { permission: { receiverId: coin, allowance: ONE_TAP_ALLOWANCE, methodNames: ONE_TAP_METHODS } } },
});

/** Sign and send one call with the limited key. Throws whatever the network says (contract panics included). */
export async function callWithOneTapKey(o: { nodeUrl: string; networkId: string; accountId: string; secretKey: string; contractId: string; method: string; args?: object; deposit?: bigint; gas?: bigint }): Promise<any> {
  const ks = new keyStores.InMemoryKeyStore();
  await ks.setKey(o.networkId, o.accountId, KeyPair.fromString(o.secretKey as any));
  const near = await connect({ networkId: o.networkId, nodeUrl: o.nodeUrl, keyStore: ks });
  const account = await near.account(o.accountId);
  const r: any = await account.functionCall({ contractId: o.contractId, methodName: o.method, args: o.args ?? {}, gas: o.gas ?? GAS, attachedDeposit: o.deposit ?? 0n });
  const v = r.status?.SuccessValue;
  return v ? JSON.parse(atob(v)) : null;
}

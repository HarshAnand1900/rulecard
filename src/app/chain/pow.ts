// A small proof of work for the practice faucet: find a nonce so sha256("<account>:<time>:<nonce>") starts with `bits` zero bits.
// A visitor's browser pays about a second; a script asking for thousands of wallets pays for every one. Must match api/fund.mjs.
const enc = new TextEncoder();
const zeroBits = (h: Uint8Array) => { let n = 0; for (const b of h) { if (b === 0) { n += 8; continue; } n += Math.clz32(b) - 24; break; } return n; };
export async function solvePow(account: string, bits: number, ts = Date.now()): Promise<{ ts: number; nonce: number }> {
  if (bits <= 0) return { ts, nonce: 0 };
  const batch = 512;
  for (let start = 0; ; start += batch) {
    const hashes = await Promise.all(Array.from({ length: batch }, (_, i) => crypto.subtle.digest('SHA-256', enc.encode(`${account}:${ts}:${start + i}`))));
    for (let i = 0; i < batch; i++) if (zeroBits(new Uint8Array(hashes[i])) >= bits) return { ts, nonce: start + i };
  }
}
export const POW_BITS = 16; // about 65,000 tries: a second in a browser

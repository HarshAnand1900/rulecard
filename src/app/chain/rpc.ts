// Shared RPC client for the testnet modes (wallet and practice): endpoint failover, retry on network errors, and a small read cache.
import { toNear } from './near';

export const panicText = (e: any) => { const m = String(e?.message ?? e); if (/MethodNotFound/.test(m)) return 'MethodNotFound: this contract has no such method'; const k = m.match(/Smart contract panicked: ([^"\\]*)/); return k ? k[1] : m.slice(0, 160); };

export class RpcClient {
  private ep = 0; // index of the RPC endpoint that last worked
  private cache = new Map<string, { at: number; p: Promise<any> }>();
  constructor(public nodeUrls: string[]) {}
  get nodeUrl() { return this.nodeUrls[this.ep % this.nodeUrls.length]; }
  rotate() { this.ep = (this.ep + 1) % this.nodeUrls.length; }
  clearCache() { this.cache.clear(); }

  /** Public RPCs rate-limit, and their 429 replies carry no CORS header (the browser then reports a network error), so a failed
   *  request is retried on the next endpoint. RPC-level answers (no such account, a contract panic) are real and thrown at once. */
  async rpc(method: string, params: any) {
    let last: any;
    for (let i = 0; i < 6; i++) {
      const idx = (this.ep + i) % this.nodeUrls.length;
      let r: any;
      try {
        const res = await fetch(this.nodeUrls[idx], { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 'rc', method, params }) });
        if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status}`);
        r = await res.json();
      } catch (e) { last = e; await new Promise(r => setTimeout(r, 300 * 2 ** Math.min(i, 3))); continue; }
      this.ep = idx;
      if (r.error) throw new Error(r.error?.data ?? r.error?.message ?? 'RPC error');
      if (r.result?.error) throw new Error(panicText(r.result.error));
      return r.result;
    }
    throw new Error(`the RPC isn't answering (${String(last?.message ?? last).slice(0, 60)}); try again in a moment`);
  }

  view<T>(contractId: string, method: string, args: object = {}): Promise<T> {
    const key = `${contractId}|${method}|${JSON.stringify(args)}`, hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < 3000) return hit.p;
    const p = this.rpc('query', { request_type: 'call_function', finality: 'optimistic', account_id: contractId, method_name: method, args_base64: btoa(JSON.stringify(args)) })
      .then(r => JSON.parse(new TextDecoder().decode(new Uint8Array(r.result))) as T);
    this.cache.set(key, { at: Date.now(), p });
    p.catch(() => this.cache.delete(key));
    return p;
  }

  async accountInfo(account: string) {
    const [a, k] = await Promise.all([this.rpc('query', { request_type: 'view_account', finality: 'final', account_id: account }), this.rpc('query', { request_type: 'view_access_key_list', finality: 'final', account_id: account })]);
    return { amount: a.amount as string, storageUsage: a.storage_usage as number, codeHash: a.code_hash as string, keys: k.keys.length as number };
  }

  /** NEAR in an account (0 if it doesn't exist yet). */
  async balanceOf(account: string): Promise<number> {
    try { const r = await this.rpc('query', { request_type: 'view_account', finality: 'optimistic', account_id: account }); return toNear(r.amount); } catch { return 0; }
  }
}

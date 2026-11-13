// Docs: a sidebar of sections, one page at a time, with search across every page and part. Press / to jump to the search box.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { DOCS, type Block, type DocPage } from './docsData';

const text = (b: Block): string => 'p' in b ? b.p : 'note' in b ? b.note : 'ul' in b ? b.ul.join(' ') : 'steps' in b ? b.steps.join(' ') : [b.table.head.join(' '), ...b.table.rows.map(r => r.join(' '))].join(' ');
const hl = (s: string, q: string): ReactNode => {
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean); if (!terms.length) return s;
  const re = new RegExp(`(${terms.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
  return s.split(re).map((x, i) => (i % 2 ? <mark key={i}>{x}</mark> : x));
};

interface Hit { page: DocPage; part: DocPage['parts'][number]; snippet: string; score: number }

export default function Docs() {
  const [pageId, setPageId] = useState(() => { try { return location.hash.startsWith('#doc-') ? location.hash.slice(5).split('/')[0] : 'welcome'; } catch { return 'welcome'; } });
  const [q, setQ] = useState('');
  const box = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') { e.preventDefault(); box.current?.focus(); } if (e.key === 'Escape') { setQ(''); box.current?.blur(); } };
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  }, []);

  const page = DOCS.find(d => d.id === pageId) ?? DOCS[0];
  const groups = useMemo(() => { const g: Record<string, DocPage[]> = {}; for (const d of DOCS) (g[d.group] ??= []).push(d); return g; }, []);

  const hits = useMemo<Hit[]>(() => {
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean); if (!terms.length) return [];
    const out: Hit[] = [];
    for (const d of DOCS) for (const part of d.parts) {
      const body = part.blocks.map(text).join(' · '), hay = `${d.title} ${part.title} ${body}`.toLowerCase();
      if (!terms.every(t => hay.includes(t))) continue;
      const at = body.toLowerCase().indexOf(terms[0]);
      const snippet = at < 0 ? body.slice(0, 140) : (at > 50 ? '…' : '') + body.slice(Math.max(0, at - 50), at + 110) + (body.length > at + 110 ? '…' : '');
      const score = (part.title.toLowerCase().includes(terms[0]) ? 4 : 0) + (d.title.toLowerCase().includes(terms[0]) ? 2 : 0) + terms.filter(t => body.toLowerCase().includes(t)).length;
      out.push({ page: d, part, snippet, score });
    }
    return out.sort((a, b) => b.score - a.score).slice(0, 30);
  }, [q]);

  const open = (id: string, part?: string) => {
    setPageId(id); setQ('');
    try { history.replaceState(null, '', `#doc-${id}${part ? '/' + part : ''}`); } catch { /* ignore */ }
    setTimeout(() => { if (part) document.getElementById(`${id}-${part}`)?.scrollIntoView({ block: 'start', behavior: 'smooth' }); else window.scrollTo({ top: 0, behavior: 'smooth' }); }, 60);
  };
  const idx = DOCS.findIndex(d => d.id === page.id), prev = DOCS[idx - 1], next = DOCS[idx + 1];

  const render = (b: Block, i: number) => {
    if ('p' in b) return <p key={i} className="d-p">{b.p}</p>;
    if ('note' in b) return <p key={i} className="d-note">{b.note}</p>;
    if ('ul' in b) return <ul key={i} className="d-ul">{b.ul.map((x, k) => <li key={k}>{x}</li>)}</ul>;
    if ('steps' in b) return <ol key={i} className="d-steps">{b.steps.map((x, k) => <li key={k}><span className="mono">{k + 1}</span><span>{x}</span></li>)}</ol>;
    return <div key={i} className="d-table-wrap"><table className="d-table"><thead><tr>{b.table.head.map((h, k) => <th key={k}>{h}</th>)}</tr></thead><tbody>{b.table.rows.map((r, k) => <tr key={k}>{r.map((c, j) => <td key={j} className={j === 0 ? 'mono d-first' : ''}>{c}</td>)}</tr>)}</tbody></table></div>;
  };

  return (
    <section className="docs">
      <div className="docs-top">
        <div><h1>Docs</h1><p className="muted">Everything about Rulecard, from first steps to the glossary.</p></div>
        <label className="docs-search"><span className="sr-only">Search the docs</span>
          <input ref={box} type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search the docs" aria-label="Search the docs" /><kbd className="mono">/</kbd>
        </label>
      </div>
      <div className="docs-grid">
        <nav className="docs-nav panel" aria-label="Docs sections">
          {Object.entries(groups).map(([g, ds]) => (
            <div key={g} className="dn-group"><div className="dn-label mono">{g.toUpperCase()}</div>
              {ds.map(d => <button key={d.id} className={`dn-item ${!q && d.id === page.id ? 'on' : ''}`} onClick={() => open(d.id)}>{d.title}</button>)}
            </div>
          ))}
        </nav>

        <article className="docs-main panel">
          {q ? <>
            <div className="d-results-head mono">{hits.length} RESULT{hits.length === 1 ? '' : 'S'} FOR "{q}"</div>
            {!hits.length && <p className="muted">Nothing matches. Try a shorter word, like "gm", "raid" or "fee".</p>}
            <div className="d-results">{hits.map((h, i) => (
              <button key={i} className="d-hit" onClick={() => open(h.page.id, h.part.id)}>
                <span className="d-crumb mono">{h.page.group.toUpperCase()} › {h.page.title}</span>
                <strong>{hl(h.part.title, q)}</strong>
                <span className="muted small">{hl(h.snippet, q)}</span>
              </button>))}</div>
          </> : <>
            <div className="d-crumb mono">{page.group.toUpperCase()}</div>
            <h2 className="d-title">{page.title}</h2>
            <p className="muted d-sum">{page.summary}</p>
            {page.parts.length > 1 && <div className="d-toc">{page.parts.map(p => <button key={p.id} className="chip" onClick={() => document.getElementById(`${page.id}-${p.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>{p.title}</button>)}</div>}
            {page.parts.map(p => (
              <section key={p.id} id={`${page.id}-${p.id}`} className="d-part">
                <h3>{p.title}</h3>
                {p.blocks.map(render)}
              </section>
            ))}
            <div className="d-pager">
              {prev ? <button className="btn" onClick={() => open(prev.id)}>← {prev.title}</button> : <span />}
              {next ? <button className="btn" onClick={() => open(next.id)}>{next.title} →</button> : <span />}
            </div>
          </>}
        </article>
      </div>
    </section>
  );
}

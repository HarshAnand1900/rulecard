import { StrictMode, lazy, Suspense, useState } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

const ChainApp = lazy(() => import('./chain/ChainApp'));
const KEY = 'rulecard-mode';

function Root() {
  const [mode, setMode] = useState<'sim' | 'chain'>(() => { try { return (localStorage.getItem(KEY) as 'chain') || 'sim'; } catch { return 'sim'; } });
  const pick = (m: 'sim' | 'chain') => { setMode(m); try { localStorage.setItem(KEY, m); } catch { /* ignore */ } };
  return (
    <>
      <div className="modebar seg" role="group" aria-label="Mode">
        <button aria-pressed={mode === 'sim'} onClick={() => pick('sim')}>Local sim</button>
        <button aria-pressed={mode === 'chain'} onClick={() => pick('chain')}>Sandbox chain</button>
      </div>
      {mode === 'sim' ? <App /> : <Suspense fallback={<div className="panel" style={{ margin: 16 }}>Loading…</div>}><ChainApp /></Suspense>}
    </>
  );
}

createRoot(document.getElementById('root')!).render(<StrictMode><Root /></StrictMode>);

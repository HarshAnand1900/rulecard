import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import ChainApp from './chain/ChainApp';
import './styles.css';

createRoot(document.getElementById('root')!).render(<StrictMode><ChainApp /></StrictMode>);

import { mountCard } from './app/chain/epic/mount';
import type { Card } from './app/chain/types';

/** Draws the real card designs into every [data-card] slot under root. The landing page calls this after it builds the deck. */
const live = new WeakMap<Element, () => void>();
(window as any).RCmount = (root: ParentNode = document) => {
  root.querySelectorAll<HTMLElement>('[data-card]').forEach(el => {
    live.get(el)?.();
    live.set(el, mountCard(el, el.dataset.card as Card, 1));
  });
};
(window as any).RCunmount = (root: ParentNode = document) => {
  root.querySelectorAll<HTMLElement>('[data-card]').forEach(el => { live.get(el)?.(); live.delete(el); });
};
window.dispatchEvent(new Event('rc-cards-ready'));

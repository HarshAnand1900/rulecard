import { useLayoutEffect, useRef } from 'react';
import type { Card } from '../types';
import { mountCard } from './mount';

/** One card, drawn in its rarity's design inside its own shadow root so the app's styles cannot leak in. Hover tilts and lights it; click turns it over. */
export function EpicCard({ card, scale = 1 }: { card: Card; scale?: number }) {
  const host = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => (host.current ? mountCard(host.current, card, scale) : undefined), [card, scale]);
  return <div className="ec-host" ref={host} style={{ width: 240 * scale, height: 340 * scale, flex: 'none' }} />;
}

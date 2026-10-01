// Presenting in two windows: the slides (for the audience) and the presenter
// view (notes, the next slide, a timer). They keep to the same slide over a
// BroadcastChannel named after the deck:
//   slides → { type: 'at', at, black }   on every change, and to answer 'hello'
//   slides → { type: 'end' }             presenting stopped
//   view   → { type: 'hello' }           "who's presenting?"
//   view   → { type: 'go', at }          show this slide
//   view   → { type: 'black', on }       black screen on / off

/** Listens and talks on the deck's channel; `post` / `close`. Silent where there are no channels. */
export function presentChannel(deckId, onMessage) {
  if (typeof BroadcastChannel === 'undefined') return { post() {}, close() {} };
  const ch = new BroadcastChannel(`pz-present-${deckId}`);
  ch.onmessage = (e) => onMessage(e.data || {});
  return { post: (m) => ch.postMessage(m), close: () => ch.close() };
}

export const presenterUrl = (deckId) => `/presentations/${deckId}/presenter`;

/** Opens (or brings back) the presenter view in a window of its own. */
export const openPresenterView = (deckId) => window.open(presenterUrl(deckId), `pz-presenter-${deckId}`, 'popup,width=1280,height=800');

/** Keys while presenting → what they do (the same in both windows). */
export function presentKey(e) {
  if (['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter'].includes(e.key)) return 'next';
  if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'].includes(e.key)) return 'prev';
  if (e.key === 'Home') return 'first';
  if (e.key === 'End') return 'last';
  if (e.key === 'b' || e.key === 'B' || e.key === '.') return 'black';
  if (e.key === 'g' || e.key === 'G') return 'overview';
  if (e.key === 'Escape') return 'escape';
  return null;
}

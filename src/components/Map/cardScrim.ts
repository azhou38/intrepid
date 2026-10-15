// The black scrim behind text that is laid over a card's photo (the carousel cards in SpotSheet and the grid SpotCards
// in the destination sheet's Spots tab). It is as tall as the text block it sits behind — the block's measured height,
// its bottom inset and a short soft edge — and reaches real shading by the first line of text. The shared
// GRADIENT_STOPS fade across the whole height, which left a title on an almost clear patch.

// Height (px) of the soft edge above the text block, where the scrim fades in from clear.
export const CARD_SCRIM_FADE = 36;

// The gradient for a given total height: a smooth fade from clear to ~60% black over the top CARD_SCRIM_FADE px, then on
// to ~90% at the bottom of the card.
export function cardScrimStops(totalH: number): { offset: string; opacity: number }[] {
  const f = Math.min(1, CARD_SCRIM_FADE / Math.max(totalH, 1));
  const out = Array.from({ length: 7 }, (_, i) => {
    const t = i / 6;
    return { offset: `${(f * t).toFixed(3)}`, opacity: 0.6 * t * t * (3 - 2 * t) };
  });
  out.push({ offset: '1', opacity: 0.9 });
  return out;
}

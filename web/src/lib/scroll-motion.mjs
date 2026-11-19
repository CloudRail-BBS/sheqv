/** Offset a background layer so it travels at a fraction of the page speed. */
export function parallaxCompensation(scrollOffset, depth) {
  return Math.round(scrollOffset * (1 - depth) * 1000) / 1000;
}

/** Return the configured reveal line, rounded to the nearest CSS pixel. */
export function revealTriggerLinePx(viewportHeight) {
  return Math.round(viewportHeight * 0.85);
}

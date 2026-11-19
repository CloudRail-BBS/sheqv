import assert from 'node:assert/strict';
import test from 'node:test';

const motion = await import('../src/lib/scroll-motion.mjs').catch(() => null);

test('parallax compensation keeps the background at its configured scroll depth', () => {
  assert.ok(motion, 'scroll-motion module should exist');
  assert.equal(motion.parallaxCompensation(120, 0.15), 102);
  assert.equal(motion.parallaxCompensation(120, 0.4), 72);
  assert.equal(motion.parallaxCompensation(120, 0.7), 36);
  assert.equal(motion.parallaxCompensation(0, 0.15), 0);
});

test('scroll reveal trigger line is 85 percent down the viewport', () => {
  assert.ok(motion, 'scroll-motion module should exist');
  assert.equal(motion.revealTriggerLinePx(168), 143);
  assert.equal(motion.revealTriggerLinePx(200), 170);
});

// @ts-check
// Minimal render-on-demand shim for the ported cinema system.
// collisionReplay.js (copied verbatim from main) imports markDirty from here.
// main.js wires this to its render-on-demand `dirty` flag via setDirtyCallback.
let _cb = null;
/** @param {() => void} cb */
export function setDirtyCallback(cb) {
  _cb = typeof cb === 'function' ? cb : null;
}
export function markDirty() {
  if (_cb) _cb();
}

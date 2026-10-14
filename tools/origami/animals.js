// Extra traditional models on the fold engine: cat face, dog face, cicada.  Paper: diamond T(0,1) R(1,0) B(0,-1) L(-1,0).
const {Model, iso} = require('./ori-engine.js'); const PI = Math.PI;
const nrm = v => { const l = Math.hypot(v[0], v[1]); return [v[0] / l, v[1] / l]; };
const lineThrough = (a, c) => ({p: a, d: nrm([c[0] - a[0], c[1] - a[1]])});
const sideOf = (l, q) => Math.sign(l.d[0] * (q[1] - l.p[1]) - l.d[1] * (q[0] - l.p[0]));
function triangle(name) {
  const M = new Model(name, [[[0, -1], [1, 0], [0, 1], [-1, 0]]]);
  M.fold([{sel: () => true, p: [0, 0], d: [1, 0], side: 1, dir: 1}], 'triangle');      // top corner down: point at B, open edge on top
  return M;
}
// ear: fold the corner K over the hinge A–C (A on the top edge, C on the slanted edge)
function ears(M, A, C, dir, label) {
  const g = [];
  for (const s of [-1, 1]) {
    const a = [Math.abs(A[0]) * s, A[1]], c = [Math.abs(C[0]) * s, C[1]], l = lineThrough(a, c), K = [s, 0];
    g.push({sel: () => true, p: l.p, d: l.d, side: sideOf(l, K), dir});
  }
  M.fold(g, label);
}
function cat(o = {}) {
  const M = triangle('cat');
  ears(M, [-.56, 0], [-.12, -.88], 1, 'ears up');
  M.fold([{sel: () => true, p: [0, -.78], d: [1, 0], side: -1, dir: -1}], 'chin');   // blunt the chin behind                   // corners swing up past the top edge: pointed ears
  M.turnOver();
  M.fold([{sel: () => true, p: [0, 0], d: [0, 1], side: 1, dir: -1}], 'shape', {partial: (o.ridge ?? 30) * PI / 180});
  return M;
}
function dog(o = {}) {
  const M = triangle('dog');
  ears(M, [-.4, 0], [-.78, -.22], 1, 'ears down');                 // corners flop down beside the face
  M.fold([{sel: () => true, p: [0, -.62], d: [1, 0], side: -1, dir: 1}], 'nose');     // tip up: the nose
  M.fold([{sel: () => true, p: [0, 0], d: [0, 1], side: 1, dir: 1}], 'shape', {partial: (o.ridge ?? 26) * PI / 180});
  return M;
}
function cicada(o = {}) {
  const M = triangle('cicada');
  M.fold([{sel: () => true, p: [0, 0], d: [1, 1], side: 1, dir: 1},
          {sel: () => true, p: [0, 0], d: [1, -1], side: 1, dir: 1}], 'corners down');
  // wings: each flap swings back up and out along a hinge from the centre line
  const isFlap = f => { const c = f.poly.reduce((s, p) => [s[0] + p[0] / f.poly.length, s[1] + p[1] / f.poly.length], [0, 0]); return Math.abs(c[0]) > Math.abs(c[1]); };
  const w = o.w ?? .16;
  const g = [];
  for (const s of [-1, 1]) {
    const l = lineThrough([0, -.25], [.4 * s, -.6 - w * 0]);
    g.push({sel: (pc, fc, f) => isFlap(f) && fc[0] * s > 0, p: l.p, d: l.d, side: sideOf(l, [0, -1]), dir: 1});
  }
  M.fold(g, 'wings');
  // head: the front point up
  M.fold([{sel: (pc) => pc[1] > .2, p: [0, -.64], d: [1, 0], side: -1, dir: 1}], 'head');
  M.turnOver();
  M.fold([{sel: () => true, p: [-.3, 0], d: [0, 1], side: 1, dir: -1}, {sel: () => true, p: [.3, 0], d: [0, 1], side: -1, dir: -1}], 'body', {partial: (o.body ?? 55) * PI / 180});
  return M;
}
module.exports = {cat, dog, cicada};

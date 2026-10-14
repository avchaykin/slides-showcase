// Yoshizawa-style butterfly: waterbomb base -> front corners up -> turn over -> fold the point up past the edge
// -> lock the tip over the edge -> turn over -> open the wings (3D)
const {Model, iso} = require('./ori-engine.js'); const PI = Math.PI;
function build(o = {}) {
  const M = new Model('butterfly', [[[-1, -1], [1, -1], [1, 1], [-1, 1]]]);
  M.base([{a: [-1, -1], b: [1, 1], ang: -PI}, {a: [-1, 1], b: [1, -1], ang: -PI}, {a: [-1, 0], b: [1, 0], ang: PI}], 'waterbomb base');
  M.frame([0, 0], [0, 0], [0, -1], [0, -1]);
  const Qb = p => p[1] < -Math.abs(p[0]), Ql = p => p[0] < -Math.abs(p[1]), Qr = p => p[0] > Math.abs(p[1]);
  M.fold([{sel: p => Qb(p) || (Ql(p) && p[1] < 0), p: [0, -1], d: [-.5, .5], side: 1, dir: 1},
          {sel: p => Qb(p) || (Qr(p) && p[1] < 0), p: [0, -1], d: [.5, .5], side: -1, dir: 1}], 'corners up');
  M.turnOver(); M.rotateView(PI);                       // turn over top-to-bottom: the point is now at the bottom
  const h = o.h ?? 0.6;
  M.fold([{sel: () => true, p: [0, h], d: [1, 0], side: -1, dir: 1}], 'point up');
  M.fold([{sel: () => true, p: [0, 1], d: [1, 0], side: 1, dir: -1}], 'lock tip');
  M.turnOver();
  M.fold([{sel: () => true, p: [0, 0], d: [0, 1], side: 1, dir: 1}], 'wings', {partial: (o.wing ?? 70) * PI / 180});
  return M;
}
module.exports = {build};
if (require.main === module) {
  const {toFOLD} = require('./fold-export.js'); const {run} = require('./fold-run.js'); const fs = require('fs');
  const M = build(); console.log(M.states.map(s => s.label).join(' > '), 'facets', M.facets.length);
  const F = toFOLD(M); fs.writeFileSync('butterfly.fold', JSON.stringify(F));
  console.log(run(F, 6000, 'os-out.json'));
}

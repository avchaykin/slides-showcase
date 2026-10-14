// Fox face (traditional kitsune): triangle -> side corners down to the point -> pleat them back up as ears -> turn over
const {Model, iso} = require('./ori-engine.js'); const PI = Math.PI;
const nrm = v => { const l = Math.hypot(v[0], v[1]); return [v[0] / l, v[1] / l]; };
function build(o = {}) {
  // diamond with corners T(0,1) B(0,-1) L(-1,0) R(1,0); colored side down
  const M = new Model('fox', [[[0, -1], [1, 0], [0, 1], [-1, 0]]]);
  M.fold([{sel: () => true, p: [0, 0], d: [1, 0], side: 1, dir: 1}], 'triangle');           // top corner down to the bottom
  M.fold([{sel: () => true, p: [0, 0], d: [1, 1], side: 1, dir: 1},
          {sel: () => true, p: [0, 0], d: [1, -1], side: 1, dir: 1}], 'corners down');
  // ears: fold each flap back up along a line from its hinge corner (∓.5,-.5) to (0,q): the tip rises above the top edge
  const q = o.q ?? -0.3;
  const HL = [-.5, -.5], HR = [.5, -.5], Q = [0, q];
  M.fold([{sel: (pc, fc, f) => isFlap(M, f) && fc[0] < 1e-9 && pc[0] < 0, p: HL, d: nrm([Q[0] - HL[0], Q[1] - HL[1]]), side: -1, dir: 1},
          {sel: (pc, fc, f) => isFlap(M, f) && fc[0] > -1e-9 && pc[0] > 0, p: HR, d: nrm([Q[0] - HR[0], Q[1] - HR[1]]), side: 1, dir: 1}], 'ears');
  M.turnOver();
  if (o.chin) M.fold([{sel: () => true, p: [0, -o.chin], d: [1, 0], side: -1, dir: -1}], 'chin');
  M.fold([{sel: () => true, p: [0, 0], d: [0, 1], side: 1, dir: -1}], 'shape', {partial: (o.ridge ?? 28) * PI / 180});
  return M;
}
// the folded-down corner flaps are the facets whose transform was changed by the 'corners down' step:
// in paper terms they are the regions near L and R beyond the corner-fold lines
function isFlap(M, f) { const c = f.poly.reduce((s, p) => [s[0] + p[0] / f.poly.length, s[1] + p[1] / f.poly.length], [0, 0]); return Math.abs(c[0]) > Math.abs(c[1]); }
module.exports = {build};
if (require.main === module) {
  const {toFOLD} = require('./fold-export.js'); const {run} = require('./fold-run.js'); const fs = require('fs');
  const M = build(); console.log(M.states.map(s => s.label).join(' > '), 'facets', M.facets.length);
  fs.writeFileSync('fox-state.json', JSON.stringify(M.facets.map((f, i) => ({poly: f.poly.map(p => iso.apply(f.T, p)), z: i, det: iso.det(f.T)}))));
  const F = toFOLD(M); fs.writeFileSync('fox.fold', JSON.stringify(F));
  console.log(run(F, 6000, 'os-out.json'));
}

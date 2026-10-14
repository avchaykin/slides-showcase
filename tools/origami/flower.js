// Pinwheel flower: the traditional pinwheel base (Origami Simulator library) with its four flaps lifted and curled
const OS = require('./ossim.js'); const fs = require('fs');
function build(o = {}) {
  const fold = OS.parseSVG(fs.readFileSync(__dirname + '/patterns/pinwheelBase.svg', 'utf8'));
  const V = fold.vertices_coords, a = 0.5;   // quarter lines at ±0.5 of the unit sheet
  // classify and re-angle the creases
  fold.edges_foldAngle = fold.edges_foldAngle.map((ang, i) => {
    if (ang === null) return null;
    const [p, q] = fold.edges_vertices[i].map(k => V[k]);
    const onSquare = Math.abs(Math.abs(p[0]) - a) < 1e-3 && Math.abs(Math.abs(q[0]) - a) < 1e-3 || Math.abs(Math.abs(p[1]) - a) < 1e-3 && Math.abs(Math.abs(q[1]) - a) < 1e-3;
    if (fold.edges_assignment[i] === 'V') return ang * (o.petal ?? .62);   // pinwheel flaps lift up as petals
    if (onSquare) return ang * (o.square ?? .9);
    return ang * (o.diag ?? .78);
  });
  // curl: shallow valley creases across each petal, parallel to its free edge
  return fold;
}
module.exports = {build};
if (require.main === module) {
  const {run} = require('./fold-run.js');
  const o = JSON.parse(process.argv[2] || '{}');
  const F = build(o); fs.writeFileSync('flower.fold', JSON.stringify(F));
  console.log(run(F, 6000, 'os-out.json'));
}

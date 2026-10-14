const OS = require('./ossim.js'); const fs = require('fs');
function run(fold, steps, out) {
  const sim = OS.create(fold);
  for (let s = 0; s < steps; s++) { sim.setPercent(Math.min(1, s / (steps * .6))); sim.step(); }
  const e = sim.creaseError();
  const P = []; for (let i = 0; i < sim.X.length; i += 3) P.push([sim.X[i], sim.X[i + 1], sim.X[i + 2]]);
  fs.writeFileSync(out, JSON.stringify({P, tris: sim.g.tris}));
  return {verts: sim.g.V.length, tris: sim.g.tris.length, errMax: +e.max.toFixed(1), errMean: +e.mean.toFixed(2), strain: +sim.strain().toFixed(4)};
}
module.exports = {run};

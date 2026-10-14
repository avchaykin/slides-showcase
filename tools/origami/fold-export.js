// engine model -> FOLD (final crease angles) for the OS solver
const {iso} = require('./ori-engine.js');
function toFOLD(M) {
  const ex = M.export(), last = ex.steps[ex.steps.length - 1];
  const E = [], A = [], ANG = [];
  const border = new Set();
  ex.edges.forEach(([u, v], i) => {
    // border edges: belong to only one face
    let n = 0; ex.faces.forEach(f => f.forEach((k, m) => { const o = f[(m + 1) % f.length]; if ((k === u && o === v) || (k === v && o === u)) n++; }));
    const a = last[i];
    E.push([u, v]);
    if (n < 2) { A.push('B'); ANG.push(null); }
    else if (a > 0) { A.push('V'); ANG.push(a); }
    else if (a < 0) { A.push('M'); ANG.push(a); }
    else { A.push('F'); ANG.push(0); }
  });
  return {vertices_coords: ex.pts, edges_vertices: E, edges_assignment: A, edges_foldAngle: ANG};
}
module.exports = {toFOLD};

// ===== Fold-sequence engine (offline): exact flat-folded states + crease angles after every step =====
// A model is built by steps. Each facet keeps a 2D isometry (paper -> folded plane). Crease angles are kept per
// shared edge; a step changes them by the rule  new = old + dir·π·det(unmoved neighbour)  for edges along the
// fold line, which is how a fold of selected layers toward (+1) or away from (-1) the viewer changes a crease.
const ORI = require('./ori-core.js');
const PI = Math.PI;

const iso = {
  apply: (T, p) => [T[0] * p[0] + T[1] * p[1] + T[4], T[2] * p[0] + T[3] * p[1] + T[5]],
  mul: (A, B) => [A[0] * B[0] + A[1] * B[2], A[0] * B[1] + A[1] * B[3], A[2] * B[0] + A[3] * B[2], A[2] * B[1] + A[3] * B[3],
                  A[0] * B[4] + A[1] * B[5] + A[4], A[2] * B[4] + A[3] * B[5] + A[5]],
  inv: T => { const det = T[0] * T[3] - T[1] * T[2]; const a = T[3] / det, b = -T[1] / det, c = -T[2] / det, d = T[0] / det;
              return [a, b, c, d, -(a * T[4] + b * T[5]), -(c * T[4] + d * T[5])]; },
  det: T => Math.sign(T[0] * T[3] - T[1] * T[2]),
  reflect: (p, d) => { const l = Math.hypot(d[0], d[1]), x = d[0] / l, y = d[1] / l, a = x * x - y * y, b = 2 * x * y;
                       return [a, b, b, -a, p[0] - (a * p[0] + b * p[1]), p[1] - (b * p[0] - a * p[1])]; },
  rot: a => [Math.cos(a), -Math.sin(a), Math.sin(a), Math.cos(a), 0, 0],
  flipX: [-1, 0, 0, 1, 0, 0]
};
const side = (p, d, q) => d[0] * (q[1] - p[1]) - d[1] * (q[0] - p[0]);
const centroid = poly => { let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < poly.length; i++) { const p = poly[i], q = poly[(i + 1) % poly.length], c = p[0] * q[1] - q[0] * p[1]; a += c; cx += (p[0] + q[0]) * c; cy += (p[1] + q[1]) * c; }
  return Math.abs(a) < 1e-14 ? poly.reduce((s, p) => [s[0] + p[0] / poly.length, s[1] + p[1] / poly.length], [0, 0]) : [cx / (3 * a), cy / (3 * a)]; };
const area = poly => Math.abs(poly.reduce((s, p, i) => { const q = poly[(i + 1) % poly.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2;
function splitPoly(poly, f) {   // split by the sign of an affine function f(p); returns [pos, neg, chord]
  const P = [], N = [], chord = [], v = poly.map(f), eps = 1e-10;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length], fa = v[i], fb = v[(i + 1) % poly.length];
    if (fa >= -eps) P.push(a); if (fa <= eps) N.push(a);
    if (Math.abs(fa) <= eps) chord.push(a);
    if ((fa > eps && fb < -eps) || (fa < -eps && fb > eps)) {
      const t = fa / (fa - fb), m = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      P.push(m); N.push(m); chord.push(m);
    }
  }
  return [area(P) > 1e-9 ? P : null, area(N) > 1e-9 ? N : null, chord.length === 2 ? chord : null];
}
function inPoly(poly, p) {
  let s = 0;
  for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length]; const c = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]); if (c < -1e-12) return false; }
  return true;
}

class Model {
  constructor(name, outline, opts = {}) {
    this.name = name; this.opts = opts;
    this.facets = outline.map((poly, i) => ({poly: poly.map(p => p.slice()), T: [1, 0, 0, 1, 0, 0], piece: i}));
    this.ang = new Map();       // edge key -> angle (radians)
    this.states = [];           // after each step: {label, angles: Map}
    this.shapes = [];           // final 3D shaping: list of {fn(edge) -> angle | undefined}
    this.edges = null;
    this.snap('flat');
  }
  // ---- adjacency / edges ----
  rebuild() {
    const segs = [];
    this.facets.forEach(f => f.poly.forEach((p, i) => segs.push({a: p, b: f.poly[(i + 1) % f.poly.length], id: 0})));
    const arr = ORI.arrangement(segs);
    const old = this.edges, oldAng = this.ang;
    const edges = [];
    arr.edges.forEach(e => {
      const a = arr.pts[e.u], b = arr.pts[e.v], m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      const d = [b[0] - a[0], b[1] - a[1]], l = Math.hypot(d[0], d[1]), nrm = [-d[1] / l * 1e-6, d[0] / l * 1e-6];
      const L = this.facets.findIndex(f => inPoly(f.poly, [m[0] + nrm[0], m[1] + nrm[1]]));
      const R = this.facets.findIndex(f => inPoly(f.poly, [m[0] - nrm[0], m[1] - nrm[1]]));
      edges.push({a, b, m, L, R, key: m[0].toFixed(7) + ',' + m[1].toFixed(7)});
    });
    const ang = new Map();
    edges.forEach(e => {
      if (e.L < 0 || e.R < 0) return;
      let v = 0;
      if (old) {   // inherit from the old edge that contains this midpoint
        for (const o of old) {
          if (o.L < 0 || o.R < 0) continue;
          const d = [o.b[0] - o.a[0], o.b[1] - o.a[1]], L2 = d[0] * d[0] + d[1] * d[1];
          const t = ((e.m[0] - o.a[0]) * d[0] + (e.m[1] - o.a[1]) * d[1]) / L2;
          if (t < -1e-9 || t > 1 + 1e-9) continue;
          if (Math.abs((e.m[0] - o.a[0]) * d[1] - (e.m[1] - o.a[1]) * d[0]) / Math.sqrt(L2) > 1e-7) continue;
          v = oldAng.get(o.key) || 0; break;
        }
      }
      ang.set(e.key, v);
    });
    this.edges = edges; this.ang = ang;
  }
  snap(label) { if (!this.edges) this.rebuild(); this.states.push({label, ang: new Map(this.ang), edges: this.edges}); }
  // place the model: paper point A goes to folded point a, and paper point B lies in direction of b from a
  frame(A, a, B, b) {
    const fa = this.facets.find(f => inPoly(f.poly, A)) || this.facets.find(f => f.poly.some(p => Math.hypot(p[0] - A[0], p[1] - A[1]) < 1e-6));
    const fb = this.facets.find(f => inPoly(f.poly, B)) || this.facets.find(f => f.poly.some(p => Math.hypot(p[0] - B[0], p[1] - B[1]) < 1e-6));
    const pa = iso.apply(fa.T, A), pb = iso.apply(fb.T, B);
    const ang = Math.atan2(b[1] - a[1], b[0] - a[0]) - Math.atan2(pb[1] - pa[1], pb[0] - pa[0]);
    const R = iso.rot(ang), q = iso.apply(R, pa);
    const M = [R[0], R[1], R[2], R[3], a[0] - q[0], a[1] - q[1]];
    this.facets.forEach(f => { f.T = iso.mul(M, f.T); });
  }
  where(P) { const f = this.facets.find(x => inPoly(x.poly, P)) || this.facets.find(x => x.poly.some(p => Math.hypot(p[0] - P[0], p[1] - P[1]) < 1e-6)); return iso.apply(f.T, P); }
  // folded-plane helpers
  fc(f) { return iso.apply(f.T, centroid(f.poly)); }
  pc(f) { return centroid(f.poly); }
  select(sel) { return this.facets.filter(f => sel(this.pc(f), this.fc(f), f)); }
  // split the given facets along a line (folded coordinates)
  split(facets, p, d) {
    const out = [];
    for (const f of this.facets) {
      if (!facets.includes(f)) { out.push(f); continue; }
      const fn = q => side(p, d, iso.apply(f.T, q));
      const [A, B] = splitPoly(f.poly, fn);
      if (A && B) { out.push({...f, poly: A}, {...f, poly: B}); }
      else out.push(f);
    }
    this.facets = out;
  }
  // ---- operations ----
  crease(p, d, sel = () => true, label = 'crease') { this.split(this.select(sel), p, d); this.rebuild(); }
  // groups: [{sel, p, d, side: +1 (left of d) | -1, dir: +1 toward viewer | -1 away}]
  fold(groups, label, opt = {}) {
    groups = groups.map(g => ({side: 1, dir: 1, ...g}));
    const amount = opt.partial ?? PI;
    for (const g of groups) { this.split(this.select(g.sel), g.p, g.d); }
    this.rebuild();
    const gOf = new Map();
    groups.forEach((g, gi) => this.select(g.sel).forEach(f => {
      if (side(g.p, g.d, this.fc(f)) * g.side > 0 && !gOf.has(f)) gOf.set(f, gi);
    }));
    const detBefore = new Map(this.facets.map(f => [f, iso.det(f.T)]));
    const Tbefore = new Map(this.facets.map(f => [f, f.T]));
    // crease angle updates
    for (const e of this.edges) {
      if (e.L < 0 || e.R < 0) continue;
      const A = this.facets[e.L], B = this.facets[e.R];
      const ga = gOf.has(A) ? gOf.get(A) : -1, gb = gOf.has(B) ? gOf.get(B) : -1;
      if (ga === gb) continue;
      const old = this.ang.get(e.key);
      let nv;
      if (ga >= 0 && gb >= 0) {
        const G1 = groups[ga], G2 = groups[gb];
        if (G1.dir === -G2.dir && Math.abs(side(G1.p, G1.d, G2.p)) < 1e-9 && Math.abs(G1.d[0] * G2.d[1] - G1.d[1] * G2.d[0]) < 1e-9) nv = -old;
        else if (G1.pairRule === 'keep' || G2.pairRule === 'keep') nv = old;
        else throw new Error(`${this.name}/${label}: crease between two groups at ${e.m}`);
      } else {
        const g = groups[ga >= 0 ? ga : gb], U = ga >= 0 ? B : A;
        // the edge must lie on the fold line
        const ea = iso.apply(Tbefore.get(U), e.a), eb = iso.apply(Tbefore.get(U), e.b);
        if (Math.abs(side(g.p, g.d, ea)) > 1e-6 || Math.abs(side(g.p, g.d, eb)) > 1e-6) throw new Error(`${this.name}/${label}: tear at ${e.m.map(x => x.toFixed(3))}`);
        nv = old + g.dir * amount * detBefore.get(U);
        if (nv > PI + 1e-6 || nv < -PI - 1e-6) throw new Error(`${this.name}/${label}: crease over-folded at ${e.m.map(x => x.toFixed(3))}`);
      }
      this.ang.set(e.key, nv);
    }
    // move facets (a partial fold is a final 3D shaping step: flat transforms stay)
    if (opt.partial === undefined) for (const [f, gi] of gOf) { const g = groups[gi]; f.T = iso.mul(iso.reflect(g.p, g.d), f.T); }
    this.snap(label);
  }
  simple(p, d, sideSel, dir, sel = () => true, label) { this.fold([{sel, p, d, side: sideSel, dir}], label); }
  turnOver() { this.facets.forEach(f => { f.T = iso.mul(iso.flipX, f.T); }); }
  rotateView(a) { const R = iso.rot(a); this.facets.forEach(f => { f.T = iso.mul(R, f.T); }); }
  // initial base from a crease pattern (flat paper only): segs [{a,b,ang}] ; transforms by BFS reflections
  base(segs, label) {
    // a base is defined on the unfolded sheet: rebuild facets as the arrangement of existing edges + the CP segments
    const all = [];
    this.facets.forEach(f => f.poly.forEach((p, i) => all.push({a: p, b: f.poly[(i + 1) % f.poly.length], id: 0})));
    segs.forEach(s => all.push({a: s.a, b: s.b, id: 1}));
    const arr = ORI.arrangement(all);
    const oldF = this.facets;
    this.facets = arr.faces.map(fc => { const poly = fc.map(k => arr.pts[k].slice()); const c = centroid(poly);
      const o = oldF.find(f => inPoly(f.poly, c)); return {poly, T: [1, 0, 0, 1, 0, 0], piece: o ? o.piece : 0}; });
    this.rebuild();
    for (const k of this.ang.keys()) this.ang.set(k, 0);
    for (const e of this.edges) {
      if (e.L < 0 || e.R < 0) continue;
      for (const s of segs) {
        const d = [s.b[0] - s.a[0], s.b[1] - s.a[1]], L2 = d[0] * d[0] + d[1] * d[1];
        const t = ((e.m[0] - s.a[0]) * d[0] + (e.m[1] - s.a[1]) * d[1]) / L2;
        if (t < 1e-9 || t > 1 - 1e-9) continue;
        if (Math.abs((e.m[0] - s.a[0]) * d[1] - (e.m[1] - s.a[1]) * d[0]) / Math.sqrt(L2) > 1e-7) continue;
        this.ang.set(e.key, s.ang);
      }
    }
    // BFS transforms
    const seen = new Set([0]), queue = [0];
    this.facets.forEach(f => { f.T = [1, 0, 0, 1, 0, 0]; });
    while (queue.length) {
      const fi = queue.shift();
      for (const e of this.edges) {
        if (e.L < 0 || e.R < 0) continue;
        const other = e.L === fi ? e.R : e.R === fi ? e.L : -1;
        if (other < 0 || seen.has(other)) continue;
        const a = this.ang.get(e.key), F = this.facets[fi];
        const folded = Math.abs(Math.abs(a) - PI) < 1e-6;
        this.facets[other].T = folded ? iso.mul(F.T, iso.reflect(e.a, [e.b[0] - e.a[0], e.b[1] - e.a[1]])) : F.T.slice();
        seen.add(other); queue.push(other);
      }
    }
    this.snap(label);
  }
  // 3D shaping (final steps): fn(edge with paper a,b,m and current angle) -> new angle or undefined
  shape(fn, label) {
    for (const e of this.edges) { if (e.L < 0 || e.R < 0) continue; const v = fn(e, this.ang.get(e.key)); if (v !== undefined) this.ang.set(e.key, v); }
    this.snap(label);
  }
  // ---- export ----
  export() {
    const segs = [];
    this.facets.forEach(f => f.poly.forEach((p, i) => segs.push({a: p, b: f.poly[(i + 1) % f.poly.length], id: 0})));
    const arr = ORI.arrangement(segs);
    const keyOf = (a, b) => { const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; return m[0].toFixed(7) + ',' + m[1].toFixed(7); };
    const steps = this.states.map(s => arr.edges.map(e => {
      const k = keyOf(arr.pts[e.u], arr.pts[e.v]);
      const v = s.ang.has(k) ? s.ang.get(k) : this.lookup(s, arr.pts[e.u], arr.pts[e.v]);
      return Math.round((v || 0) * 180 / PI);
    }));
    const piece = arr.faces.map(f => { const c = centroid(f.map(k => arr.pts[k])); const F = this.facets.find(x => inPoly(x.poly, c)); return F ? F.piece : 0; });
    return {name: this.name, pts: arr.pts.map(p => [+p[0].toFixed(5), +p[1].toFixed(5)]), faces: arr.faces, edges: arr.edges.map(e => [e.u, e.v]),
            steps, labels: this.states.map(s => s.label), piece, opts: this.opts};
  }
  lookup(state, a, b) {   // final edges may be finer than an earlier state's edges
    const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], angMap = state.ang;
    for (const e of state.edges) {
      if (e.L < 0 || e.R < 0) continue;
      const d = [e.b[0] - e.a[0], e.b[1] - e.a[1]], L2 = d[0] * d[0] + d[1] * d[1];
      const t = ((m[0] - e.a[0]) * d[0] + (m[1] - e.a[1]) * d[1]) / L2;
      if (t < -1e-9 || t > 1 + 1e-9) continue;
      if (Math.abs((m[0] - e.a[0]) * d[1] - (m[1] - e.a[1]) * d[0]) / Math.sqrt(L2) > 1e-7) continue;
      return angMap.get(e.key) || 0;
    }
    return 0;
  }
}
module.exports = {Model, iso, side, centroid, PI};

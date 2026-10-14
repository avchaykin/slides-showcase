// ===== ORI core: crease-pattern arrangement, triangulated mesh, signed dihedrals, PBD folding solver =====
// Pure JS, no dependencies. Paper coordinates are 2D; the sheet starts flat in z = 0 with its front (+z) up.
const ORI = (() => {
  const TAU = Math.PI * 2;
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const len = a => Math.hypot(a[0], a[1], a[2]);

  // ---------- planar arrangement ----------
  // segs: [{a:[x,y], b:[x,y], id}] ; border segments have id = -1. Returns vertices, edges (with id), faces (CCW vertex loops).
  function arrangement(segs, tol = 1e-7) {
    const pts = [], key = new Map();
    const q = v => Math.round(v / (tol * 10));
    function addPt(p) {
      const k = q(p[0]) + ',' + q(p[1]);
      for (const dx of [-1, 0, 1]) for (const dy of [-1, 0, 1]) {
        const kk = (q(p[0]) + dx) + ',' + (q(p[1]) + dy);
        if (key.has(kk)) { const i = key.get(kk); if (Math.hypot(pts[i][0] - p[0], pts[i][1] - p[1]) < tol * 20) return i; }
      }
      key.set(k, pts.length); pts.push([p[0], p[1]]); return pts.length - 1;
    }
    const onSeg = segs.map(() => []);
    segs.forEach((s, i) => { onSeg[i].push(addPt(s.a), addPt(s.b)); });
    for (let i = 0; i < segs.length; i++) for (let j = i + 1; j < segs.length; j++) {
      const A = segs[i].a, B = segs[i].b, C = segs[j].a, D = segs[j].b;
      const r = [B[0] - A[0], B[1] - A[1]], s = [D[0] - C[0], D[1] - C[1]];
      const den = r[0] * s[1] - r[1] * s[0];
      if (Math.abs(den) < 1e-12) continue;
      const t = ((C[0] - A[0]) * s[1] - (C[1] - A[1]) * s[0]) / den, u = ((C[0] - A[0]) * r[1] - (C[1] - A[1]) * r[0]) / den;
      if (t < -1e-9 || t > 1 + 1e-9 || u < -1e-9 || u > 1 + 1e-9) continue;
      const k = addPt([A[0] + r[0] * t, A[1] + r[1] * t]);
      onSeg[i].push(k); onSeg[j].push(k);
    }
    // vertices lying on segments (T-junctions)
    segs.forEach((s, i) => {
      const r = [s.b[0] - s.a[0], s.b[1] - s.a[1]], L2 = r[0] * r[0] + r[1] * r[1], L = Math.sqrt(L2);
      pts.forEach((p, k) => {
        const t = ((p[0] - s.a[0]) * r[0] + (p[1] - s.a[1]) * r[1]) / L2;
        if (t <= 1e-9 || t >= 1 - 1e-9) return;
        const d = Math.abs((p[0] - s.a[0]) * r[1] - (p[1] - s.a[1]) * r[0]) / L;
        if (d < tol * 20) onSeg[i].push(k);
      });
    });
    const edges = [], ekey = new Map();
    segs.forEach((s, i) => {
      const r = [s.b[0] - s.a[0], s.b[1] - s.a[1]];
      const list = [...new Set(onSeg[i])].map(k => ({k, t: (pts[k][0] - s.a[0]) * r[0] + (pts[k][1] - s.a[1]) * r[1]})).sort((x, y) => x.t - y.t);
      for (let m = 0; m + 1 < list.length; m++) {
        const u = list[m].k, v = list[m + 1].k;
        if (u === v) continue;
        const kk = u < v ? u + '_' + v : v + '_' + u;
        if (ekey.has(kk)) { const e = edges[ekey.get(kk)]; if (e.id < 0 && s.id >= 0) e.id = s.id; continue; }
        ekey.set(kk, edges.length); edges.push({u, v, id: s.id});
      }
    });
    // half-edge face walk
    const out = pts.map(() => []);
    edges.forEach((e, i) => { out[e.u].push({to: e.v, e: i}); out[e.v].push({to: e.u, e: i}); });
    out.forEach((l, k) => l.sort((a, b) => Math.atan2(pts[a.to][1] - pts[k][1], pts[a.to][0] - pts[k][0]) - Math.atan2(pts[b.to][1] - pts[k][1], pts[b.to][0] - pts[k][0])));
    const used = new Set(), faces = [];
    for (let u = 0; u < pts.length; u++) for (const h of out[u]) {
      const hk = u + '>' + h.to;
      if (used.has(hk)) continue;
      const loop = []; let a = u, b = h.to, guard = 0;
      while (!used.has(a + '>' + b) && guard++ < 10000) {
        used.add(a + '>' + b); loop.push(a);
        const l = out[b], idx = l.findIndex(x => x.to === a);
        const nx = l[(idx - 1 + l.length) % l.length];   // previous in CCW order = turn left-most for the left face
        a = b; b = nx.to;
      }
      let area = 0;
      for (let m = 0; m < loop.length; m++) { const p = pts[loop[m]], r = pts[loop[(m + 1) % loop.length]]; area += p[0] * r[1] - r[0] * p[1]; }
      if (area > 1e-10) faces.push(loop);
    }
    return {pts, edges, faces};
  }

  // ---------- mesh ----------
  // Each face is fanned from its centroid. Crease edges carry a dihedral constraint with a target;
  // spokes inside a face carry a stiff flat constraint so facets stay planar.
  function buildMesh(arr) {
    const P = arr.pts.map(p => [p[0], p[1], 0]);
    const faceC = arr.faces.map(f => { const c = [0, 0]; f.forEach(k => { c[0] += arr.pts[k][0] / f.length; c[1] += arr.pts[k][1] / f.length; }); return c; });
    // triangles stay whole; larger faces are fanned from their centroid
    const cIdx = faceC.map((c, fi) => { if (arr.faces[fi].length === 3) return -1; P.push([c[0], c[1], 0]); return P.length - 1; });
    const tris = [], triFace = [];
    arr.faces.forEach((f, fi) => {
      if (cIdx[fi] < 0) { tris.push([f[0], f[1], f[2]]); triFace.push(fi); return; }
      f.forEach((k, m) => { tris.push([cIdx[fi], k, f[(m + 1) % f.length]]); triFace.push(fi); });
    });
    const opp = (fi, u, v) => { if (cIdx[fi] >= 0) return cIdx[fi]; return arr.faces[fi].find(k => k !== u && k !== v); };
    const leftOf = new Map();
    arr.faces.forEach((f, fi) => f.forEach((k, m) => leftOf.set(k + '>' + f[(m + 1) % f.length], fi)));
    const hinges = [];
    arr.edges.forEach((e, ei) => {
      const A = leftOf.get(e.u + '>' + e.v), B = leftOf.get(e.v + '>' + e.u);
      if (A === undefined || B === undefined) { e.border = true; return; }
      hinges.push({p1: e.u, p2: e.v, p3: opp(A, e.u, e.v), p4: opp(B, e.v, e.u), edge: ei, fa: A, fb: B});
    });
    arr.faces.forEach((f, fi) => { if (cIdx[fi] < 0) return; f.forEach((k, m) => {
      hinges.push({p1: cIdx[fi], p2: k, p3: f[(m + 1) % f.length], p4: f[(m - 1 + f.length) % f.length], edge: -1, flat: true});
    }); });
    const elen = new Map(), lens = [];
    const addE = (a, b) => { const kk = a < b ? a + '_' + b : b + '_' + a; if (elen.has(kk)) return; elen.set(kk, 1); lens.push([a, b, len(sub(P[a], P[b]))]); };
    tris.forEach(t => { addE(t[0], t[1]); addE(t[1], t[2]); addE(t[2], t[0]); });
    return {P0: P.map(p => p.slice()), P, tris, triFace, hinges, lens, cIdx, faceC, nFaceVerts: arr.pts.length};
  }

  // signed dihedral: + = valley (face B swings toward face A's front normal)
  function dihedral(P, h) {
    const p1 = P[h.p1], p2 = P[h.p2], p3 = P[h.p3], p4 = P[h.p4];
    const e = sub(p2, p1), nA = cross(e, sub(p3, p1)), nB = cross(sub(p1, p2), sub(p4, p2));
    const el = len(e);
    return Math.atan2(dot(cross(nB, nA), e) / el, dot(nA, nB)) ;
  }
  // gradient of the dihedral w.r.t. the four points (analytic, verified numerically in tests)
  function dihedralGrad(P, h) {
    const p1 = P[h.p1], p2 = P[h.p2], p3 = P[h.p3], p4 = P[h.p4];
    const e = sub(p2, p1), el = len(e);
    const nA = cross(e, sub(p3, p1)), nB = cross(sub(p1, p2), sub(p4, p2));
    const lA = dot(nA, nA), lB = dot(nB, nB);
    if (lA < 1e-14 || lB < 1e-14 || el < 1e-9) return null;
    // d theta / d p3 = -el / |nA|^2 * nA ; d theta / d p4 = -el / |nB|^2 * nB   (sign fixed by numeric test)
    const g3 = nA.map(x => x * el / lA), g4 = nB.map(x => x * el / lB);
    const s3 = dot(sub(p3, p1), e) / (el * el), s4 = dot(sub(p4, p1), e) / (el * el);
    const g1 = [0, 1, 2].map(i => -((1 - s3) * g3[i] + (1 - s4) * g4[i]));
    const g2 = [0, 1, 2].map(i => -(s3 * g3[i] + s4 * g4[i]));
    return [g1, g2, g3, g4];
  }

  // ---------- solver ----------
  function makeSolver(mesh) {
    const P = mesh.P, n = P.length;
    const w = new Float64Array(n).fill(1);
    const theta = mesh.hinges.map(() => 0), target = mesh.hinges.map(() => 0);
    const S = {mesh, P, w, theta, target, iters: 24, kCrease: .25, kFlat: .6, maxC: .15};
    S.pin = (idx, pos) => { w[idx] = 0; if (pos) P[idx] = pos.slice(); };
    S.step = function () {
      const H = mesh.hinges;
      for (let it = 0; it < S.iters; it++) {
        for (let hi = 0; hi < H.length; hi++) {
          const h = H[hi];
          let th = dihedral(P, h);
          if (!h.flat) {   // unwrap so a crease never jumps across ±180°, but paper cannot wind past it either
            th += TAU * Math.round((theta[hi] - th) / TAU);
            if (th > Math.PI + .5) th -= TAU; else if (th < -Math.PI - .5) th += TAU;
          }
          theta[hi] = th;
          let C = th - (h.flat ? 0 : target[hi]);
          if (C > S.maxC) C = S.maxC; else if (C < -S.maxC) C = -S.maxC;
          if (Math.abs(C) < 1e-6) continue;
          const g = dihedralGrad(P, h);
          if (!g) continue;
          const ids = [h.p1, h.p2, h.p3, h.p4];
          let den = 0;
          for (let j = 0; j < 4; j++) den += w[ids[j]] * dot(g[j], g[j]);
          if (den < 1e-12) continue;
          const sc = -(h.flat ? S.kFlat : S.kCrease) * C / den;
          for (let j = 0; j < 4; j++) { const wi = w[ids[j]]; if (!wi) continue; const p = P[ids[j]]; p[0] += sc * wi * g[j][0]; p[1] += sc * wi * g[j][1]; p[2] += sc * wi * g[j][2]; }
        }
        for (let pass = 0; pass < 2; pass++) for (const [a, b, L] of mesh.lens) {
          const pa = P[a], pb = P[b], d = sub(pb, pa), l = len(d), wa = w[a], wb = w[b];
          if (l < 1e-12 || wa + wb === 0) continue;
          const c = (l - L) / (l * (wa + wb));
          pa[0] += wa * c * d[0]; pa[1] += wa * c * d[1]; pa[2] += wa * c * d[2];
          pb[0] -= wb * c * d[0]; pb[1] -= wb * c * d[1]; pb[2] -= wb * c * d[2];
        }
      }
    };
    // pull every vertex toward guide positions (weight k), used before the constraint iterations
    S.guide = (G, k) => { for (let i = 0; i < n; i++) { if (!w[i]) continue; const p = P[i], g = G[i]; p[0] += (g[0] - p[0]) * k; p[1] += (g[1] - p[1]) * k; p[2] += (g[2] - p[2]) * k; } };
    S.strain = () => { let m = 0; for (const [a, b, L] of mesh.lens) m = Math.max(m, Math.abs(len(sub(P[a], P[b])) - L) / L); return m; };
    return S;
  }

  // ---------- forward kinematics guide ----------
  // spanning tree over faces through crease edges; each child face = parent face rotated about the shared crease
  function makeFK(arr, mesh, rootFace = 0) {
    const nF = arr.faces.length, adj = arr.faces.map(() => []);
    mesh.hinges.forEach((h, hi) => { if (!h.flat) { adj[h.fa].push({f: h.fb, hi}); adj[h.fb].push({f: h.fa, hi}); } });
    const parent = new Int32Array(nF).fill(-1), via = new Int32Array(nF).fill(-1), order = [rootFace];
    const seen = new Uint8Array(nF); seen[rootFace] = 1;
    for (let q = 0; q < order.length; q++) for (const {f, hi} of adj[order[q]]) if (!seen[f]) { seen[f] = 1; parent[f] = order[q]; via[f] = hi; order.push(f); }
    // per face: R (3x3 row-major) and t
    const R = arr.faces.map(() => new Float64Array(9)), T = arr.faces.map(() => new Float64Array(3));
    const faceVerts = arr.faces.map((f, fi) => mesh.cIdx[fi] >= 0 ? f.concat([mesh.cIdx[fi]]) : f.slice());
    const G = mesh.P0.map(() => [0, 0, 0]), cnt = new Float64Array(mesh.P0.length);
    function compute(angleOf) {   // angleOf(hingeIndex) -> radians
      R[rootFace].set([1, 0, 0, 0, 1, 0, 0, 0, 1]); T[rootFace].fill(0);
      for (let q = 1; q < order.length; q++) {
        const f = order[q], p = parent[f], h = mesh.hinges[via[f]];
        const a = mesh.P0[h.p1], b = mesh.P0[h.p2];
        let dx = b[0] - a[0], dy = b[1] - a[1]; const l = Math.hypot(dx, dy); dx /= l; dy /= l;
        // child on the right of p1->p2 when it is face B
        const th = angleOf(via[f]) * (h.fb === f ? -1 : 1);
        const c = Math.cos(th), s = Math.sin(th), C = 1 - c;
        const r = [c + dx * dx * C, dx * dy * C, dy * s, dx * dy * C, c + dy * dy * C, -dx * s, -dy * s, dx * s, c];
        // local rotation about the crease line (paper space) then the parent's transform
        const Rp = R[p], Tp = T[p], M = R[f];
        for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) M[i * 3 + j] = Rp[i * 3] * r[j] + Rp[i * 3 + 1] * r[3 + j] + Rp[i * 3 + 2] * r[6 + j];
        // translation: x' = Rp (r (x - a) + a) + Tp  ->  M x + (Rp a - M a + Tp)
        const ax = a[0], ay = a[1];
        for (let i = 0; i < 3; i++) T[f][i] = Rp[i * 3] * ax + Rp[i * 3 + 1] * ay - (M[i * 3] * ax + M[i * 3 + 1] * ay) + Tp[i];
      }
      G.forEach(g => { g[0] = g[1] = g[2] = 0; }); cnt.fill(0);
      faceVerts.forEach((vs, fi) => { const M = R[fi], t = T[fi];
        for (const k of vs) { const x = mesh.P0[k][0], y = mesh.P0[k][1];
          G[k][0] += M[0] * x + M[1] * y + t[0]; G[k][1] += M[3] * x + M[4] * y + t[1]; G[k][2] += M[6] * x + M[7] * y + t[2]; cnt[k]++; } });
      G.forEach((g, k) => { g[0] /= cnt[k]; g[1] /= cnt[k]; g[2] /= cnt[k]; });
      return G;
    }
    return {compute, order, R, T};
  }

  return {arrangement, buildMesh, dihedral, dihedralGrad, makeSolver, makeFK, sub, cross, dot, len};
})();
if (typeof module !== 'undefined') module.exports = ORI;

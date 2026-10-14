// CPU port of the Origami Simulator dynamic solver (Ghassaei, Demaine, Gershenfeld 2018; MIT licence)
// Same model as its GPU shaders: axial beams with damping, crease torques k·(θt·p − θ) with moment arms,
// face-angle constraints, explicit Euler at dt = 0.9 / (2π ω_max). Input is FOLD-style data.
const OSSIM = (() => {
  const P = {axialStiffness: 20, creaseStiffness: 0.7, panelStiffness: 0.7, faceStiffness: 0.2, percentDamping: 0.45};

  // ---- FOLD prep: planar graph -> faces -> triangulation, like OS's pattern.js ----
  function prepare(fold) {
    const V = fold.vertices_coords.map(v => v.slice());
    let E = fold.edges_vertices.map(e => e.slice()), A = fold.edges_assignment.slice(), ANG = fold.edges_foldAngle.slice();
    // remove degree-2 collinear vertices (vertices that only split an edge)
    for (let changed = true; changed;) {
      changed = false;
      const inc = V.map(() => []); E.forEach((e, i) => { inc[e[0]].push(i); inc[e[1]].push(i); });
      for (let v = 0; v < V.length && !changed; v++) {
        if (inc[v].length !== 2) continue;
        const [i, j] = inc[v]; if (A[i] !== A[j] || (ANG[i] ?? 0) !== (ANG[j] ?? 0)) continue;
        const a = E[i][0] === v ? E[i][1] : E[i][0], b = E[j][0] === v ? E[j][1] : E[j][0];
        const cr = (V[a][0] - V[v][0]) * (V[b][1] - V[v][1]) - (V[a][1] - V[v][1]) * (V[b][0] - V[v][0]);
        const l = Math.hypot(V[a][0] - V[v][0], V[a][1] - V[v][1]) * Math.hypot(V[b][0] - V[v][0], V[b][1] - V[v][1]);
        if (Math.abs(cr) > 1e-4 * l) continue;
        E[i] = [a, b]; E.splice(j, 1); A.splice(j, 1); ANG.splice(j, 1); changed = true;
      }
    }
    // faces by walking the planar graph (left faces of directed edges, CCW)
    const out = V.map(() => []);
    E.forEach((e, i) => { out[e[0]].push(e[1]); out[e[1]].push(e[0]); });
    out.forEach((l, k) => l.sort((a, b) => Math.atan2(V[a][1] - V[k][1], V[a][0] - V[k][0]) - Math.atan2(V[b][1] - V[k][1], V[b][0] - V[k][0])));
    const used = new Set(), faces = [];
    V.forEach((_, u) => out[u].forEach(w => {
      if (used.has(u + '>' + w)) return;
      const loop = []; let a = u, b = w, g = 0;
      while (!used.has(a + '>' + b) && g++ < 1000) { used.add(a + '>' + b); loop.push(a); const l = out[b], i = l.indexOf(a); const nx = l[(i - 1 + l.length) % l.length]; a = b; b = nx; }
      let ar = 0; loop.forEach((p, i) => { const q = loop[(i + 1) % loop.length]; ar += V[p][0] * V[q][1] - V[q][0] * V[p][1]; });
      if (ar > 1e-10) faces.push(loop);
    }));
    // triangulate: quads by the shorter diagonal, larger convex faces by an ear fan from the best-shaped corner
    const tris = [];
    const addF = (a, b) => { E.push([a, b]); A.push('F'); ANG.push(0); };
    faces.forEach(f => {
      if (f.length === 3) { tris.push(f); return; }
      if (f.length === 4) {
        const d1 = Math.hypot(V[f[0]][0] - V[f[2]][0], V[f[0]][1] - V[f[2]][1]), d2 = Math.hypot(V[f[1]][0] - V[f[3]][0], V[f[1]][1] - V[f[3]][1]);
        if (d2 < d1) { addF(f[1], f[3]); tris.push([f[0], f[1], f[3]], [f[1], f[2], f[3]]); }
        else { addF(f[0], f[2]); tris.push([f[0], f[1], f[2]], [f[0], f[2], f[3]]); }
        return;
      }
      earclip(f, V).forEach(t => tris.push(t));
      // diagonals become facet edges
      const have = new Set(); f.forEach((k, i) => { const o = f[(i + 1) % f.length]; have.add(Math.min(k, o) + '_' + Math.max(k, o)); });
      tris.slice(-f.length + 2).forEach(t => [[t[0], t[1]], [t[1], t[2]], [t[2], t[0]]].forEach(([a, b]) => { const kk = Math.min(a, b) + '_' + Math.max(a, b); if (!have.has(kk)) { have.add(kk); addF(a, b); } }));
    });
    return {V, E, A, ANG, tris, faces};
  }
  function earclip(f, V) {   // simple ear clipping for a CCW polygon (skips degenerate ears)
    const poly = f.slice(), res = [];
    const area2 = (a, b, c) => (V[b][0] - V[a][0]) * (V[c][1] - V[a][1]) - (V[b][1] - V[a][1]) * (V[c][0] - V[a][0]);
    let guard = 0;
    while (poly.length > 3 && guard++ < 1000) {
      let best = -1, bestQ = -1;
      for (let i = 0; i < poly.length; i++) {
        const a = poly[(i - 1 + poly.length) % poly.length], b = poly[i], c = poly[(i + 1) % poly.length];
        const ar = area2(a, b, c); if (ar <= 1e-12) continue;
        let ok = true; for (const p of poly) { if (p === a || p === b || p === c) continue; if (area2(a, b, p) >= 0 && area2(b, c, p) >= 0 && area2(c, a, p) >= 0) { ok = false; break; } }
        if (!ok) continue;
        const l = Math.hypot(V[a][0] - V[c][0], V[a][1] - V[c][1]), q = ar / (l * l);   // prefer well-shaped ears
        if (q > bestQ) { bestQ = q; best = i; }
      }
      if (best < 0) break;
      const a = poly[(best - 1 + poly.length) % poly.length], b = poly[best], c = poly[(best + 1) % poly.length];
      res.push([a, b, c]); poly.splice(best, 1);
    }
    if (poly.length === 3) res.push(poly.slice());
    return res;
  }

  // ---- model + solver ----
  function create(fold, opts = {}) {
    const g = prepare(fold), n = g.V.length;
    const prm = {...P, ...opts};
    const X0 = new Float64Array(n * 3), X = new Float64Array(n * 3), Vel = new Float64Array(n * 3), F = new Float64Array(n * 3);
    g.V.forEach((v, i) => { X0[i * 3] = v[0]; X0[i * 3 + 1] = v[1]; X0[i * 3 + 2] = 0; });
    X.set(X0);
    // a tiny deterministic out-of-plane jitter breaks the perfect symmetry of a flat sheet
    for (let i = 0; i < n; i++) X[i * 3 + 2] = 1e-3 * Math.sin(i * 12.9898 + 4.1);
    const fixed = new Uint8Array(n);
    // beams: all edges (OS uses every edge incl. facet diagonals)
    const beams = [];
    const seen = new Set();
    g.E.forEach(([a, b]) => { const k = Math.min(a, b) + '_' + Math.max(a, b); if (seen.has(k)) return; seen.add(k);
      const L = Math.hypot(g.V[a][0] - g.V[b][0], g.V[a][1] - g.V[b][1]); beams.push({a, b, L}); });
    // creases: M / V / F edges with two faces
    const creases = [];
    g.E.forEach((e, ei) => {
      const as = g.A[ei]; if (as !== 'M' && as !== 'V' && as !== 'F') return;
      const [v1, v2] = e, cp = [];
      for (let j = 0; j < g.tris.length; j++) {
        const fv = g.tris[j].slice(), i1 = fv.indexOf(v1); if (i1 < 0) continue; const i2 = fv.indexOf(v2); if (i2 < 0) continue;
        cp.push(j); const rest = fv.filter(x => x !== v1 && x !== v2); cp.push(rest[0]);
        if (cp.length === 4) {
          let params = cp.slice();
          if (i2 - i1 === 1 || i2 - i1 === -2) params = [cp[2], cp[3], cp[0], cp[1]];
          creases.push({f1: params[0], n1: params[1], f2: params[2], n2: params[3], e0: v1, e1: v2,
            target: as === 'F' ? 0 : (g.ANG[ei] ?? (as === 'M' ? -180 : 180)) * Math.PI / 180, panel: as === 'F',
            L: Math.hypot(g.V[v1][0] - g.V[v2][0], g.V[v1][1] - g.V[v2][1]), theta: 0});
          break;
        }
      }
    });
    creases.forEach(c => { c.k = (c.panel ? prm.panelStiffness : prm.creaseStiffness) * c.L; });
    const nominal = g.tris.map(t => { const [a, b, c] = t.map(i => g.V[i]);
      const ang = (p, q, r) => { const u = [q[0] - p[0], q[1] - p[1]], v = [r[0] - p[0], r[1] - p[1]]; return Math.acos(Math.max(-1, Math.min(1, (u[0] * v[0] + u[1] * v[1]) / (Math.hypot(...u) * Math.hypot(...v))))); };
      return [ang(a, b, c), ang(b, a, c), ang(c, a, b)]; });
    let wmax = 0; beams.forEach(b => { b.k = prm.axialStiffness / b.L; b.d = prm.percentDamping * 2 * Math.sqrt(b.k); wmax = Math.max(wmax, Math.sqrt(b.k)); });
    const dt = 1 / (2 * Math.PI * wmax) * 0.9;
    const normals = new Float64Array(g.tris.length * 3);
    let percent = 0;

    function step() {
      // normals
      for (let t = 0; t < g.tris.length; t++) {
        const [a, b, c] = g.tris[t];
        const ux = X[b * 3] - X[a * 3], uy = X[b * 3 + 1] - X[a * 3 + 1], uz = X[b * 3 + 2] - X[a * 3 + 2];
        const vx = X[c * 3] - X[a * 3], vy = X[c * 3 + 1] - X[a * 3 + 1], vz = X[c * 3 + 2] - X[a * 3 + 2];
        let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz) || 1;
        normals[t * 3] = nx / l; normals[t * 3 + 1] = ny / l; normals[t * 3 + 2] = nz / l;
      }
      F.fill(0);
      // beams
      for (const b of beams) {
        const i = b.a * 3, j = b.b * 3;
        const dx = X[j] - X[i], dy = X[j + 1] - X[i + 1], dz = X[j + 2] - X[i + 2], l = Math.hypot(dx, dy, dz) || 1e-12;
        const s = b.k * (1 - b.L / l);
        const fx = dx * s + (Vel[j] - Vel[i]) * b.d, fy = dy * s + (Vel[j + 1] - Vel[i + 1]) * b.d, fz = dz * s + (Vel[j + 2] - Vel[i + 2]) * b.d;
        F[i] += fx; F[i + 1] += fy; F[i + 2] += fz; F[j] -= fx; F[j + 1] -= fy; F[j + 2] -= fz;
      }
      // creases
      for (const c of creases) {
        const n1 = [normals[c.f1 * 3], normals[c.f1 * 3 + 1], normals[c.f1 * 3 + 2]], n2 = [normals[c.f2 * 3], normals[c.f2 * 3 + 1], normals[c.f2 * 3 + 2]];
        let dn = n1[0] * n2[0] + n1[1] * n2[1] + n1[2] * n2[2]; dn = Math.max(-1, Math.min(1, dn));
        const e0 = c.e0 * 3, e1 = c.e1 * 3;
        let cx = X[e1] - X[e0], cy = X[e1 + 1] - X[e0 + 1], cz = X[e1 + 2] - X[e0 + 2]; const cl = Math.hypot(cx, cy, cz);
        if (cl < 1e-6) continue; cx /= cl; cy /= cl; cz /= cl;
        const kx = n1[1] * cz - n1[2] * cy, ky = n1[2] * cx - n1[0] * cz, kz = n1[0] * cy - n1[1] * cx;
        let th = Math.atan2(kx * n2[0] + ky * n2[1] + kz * n2[2], dn);
        let diff = th - c.theta; if (diff < -5) diff += 2 * Math.PI; else if (diff > 5) diff -= 2 * Math.PI;
        th = c.theta + diff; c.theta = th;
        // crease geometry
        const v1x = X[c.n1 * 3] - X[e0], v1y = X[c.n1 * 3 + 1] - X[e0 + 1], v1z = X[c.n1 * 3 + 2] - X[e0 + 2];
        const v2x = X[c.n2 * 3] - X[e0], v2y = X[c.n2 * 3 + 1] - X[e0 + 1], v2z = X[c.n2 * 3 + 2] - X[e0 + 2];
        const p1 = cx * v1x + cy * v1y + cz * v1z, p2 = cx * v2x + cy * v2y + cz * v2z;
        const h1 = Math.sqrt(Math.abs(v1x * v1x + v1y * v1y + v1z * v1z - p1 * p1)), h2 = Math.sqrt(Math.abs(v2x * v2x + v2y * v2y + v2z * v2z - p2 * p2));
        if (h1 < 1e-6 || h2 < 1e-6) continue;
        const coef1 = p1 / cl, coef2 = p2 / cl;
        const ang = c.k * ((c.panel ? 0 : c.target * percent) - th);
        let q = c.n1 * 3; F[q] += ang / h1 * n1[0]; F[q + 1] += ang / h1 * n1[1]; F[q + 2] += ang / h1 * n1[2];
        q = c.n2 * 3; F[q] += ang / h2 * n2[0]; F[q + 1] += ang / h2 * n2[1]; F[q + 2] += ang / h2 * n2[2];
        // edge nodes: node3 = e0 uses (1 - coef), node4 = e1 uses coef
        for (const [node, a1, a2] of [[c.e0, 1 - coef1, 1 - coef2], [c.e1, coef1, coef2]]) {
          q = node * 3;
          F[q] += -ang * (a1 / h1 * n1[0] + a2 / h2 * n2[0]); F[q + 1] += -ang * (a1 / h1 * n1[1] + a2 / h2 * n2[1]); F[q + 2] += -ang * (a1 / h1 * n1[2] + a2 / h2 * n2[2]);
        }
      }
      // face angle constraints
      for (let t = 0; t < g.tris.length; t++) {
        const [ia, ib, ic] = g.tris[t];
        const a = [X[ia * 3], X[ia * 3 + 1], X[ia * 3 + 2]], b = [X[ib * 3], X[ib * 3 + 1], X[ib * 3 + 2]], cc = [X[ic * 3], X[ic * 3 + 1], X[ic * 3 + 2]];
        let ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], ac = [cc[0] - a[0], cc[1] - a[1], cc[2] - a[2]], bc = [cc[0] - b[0], cc[1] - b[1], cc[2] - b[2]];
        const lab = Math.hypot(...ab), lac = Math.hypot(...ac), lbc = Math.hypot(...bc);
        if (lab < 1e-7 || lac < 1e-7 || lbc < 1e-7) continue;
        ab = ab.map(x => x / lab); ac = ac.map(x => x / lac); bc = bc.map(x => x / lbc);
        const dd = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
        const angs = [Math.acos(Math.max(-1, Math.min(1, dd(ab, ac)))), Math.acos(Math.max(-1, Math.min(1, -dd(ab, bc)))), Math.acos(Math.max(-1, Math.min(1, dd(ac, bc))))];
        const nom = nominal[t], d = [0, 1, 2].map(k => (nom[k] - angs[k]) * prm.faceStiffness);
        const nrm = [normals[t * 3], normals[t * 3 + 1], normals[t * 3 + 2]];
        const cr = (u, s) => [(nrm[1] * u[2] - nrm[2] * u[1]) / s, (nrm[2] * u[0] - nrm[0] * u[2]) / s, (nrm[0] * u[1] - nrm[1] * u[0]) / s];
        const nAC = cr(ac, lac), nAB = cr(ab, lab), nBC = cr(bc, lbc);
        for (let k = 0; k < 3; k++) {
          F[ia * 3 + k] += -d[0] * (nAC[k] - nAB[k]) - d[1] * nAB[k] + d[2] * nAC[k];
          F[ib * 3 + k] += -d[0] * nAB[k] + d[1] * (nAB[k] + nBC[k]) - d[2] * nBC[k];
          F[ic * 3 + k] += d[0] * nAC[k] - d[1] * nBC[k] + d[2] * (nBC[k] - nAC[k]);
        }
      }
      // integrate (explicit Euler, mass 1)
      for (let i = 0; i < n; i++) {
        if (fixed[i]) continue;
        const q = i * 3;
        Vel[q] += F[q] * dt; Vel[q + 1] += F[q + 1] * dt; Vel[q + 2] += F[q + 2] * dt;
        X[q] += Vel[q] * dt; X[q + 1] += Vel[q + 1] * dt; X[q + 2] += Vel[q + 2] * dt;
      }
    }
    return {
      g, X, X0, Vel, creases, beams, dt, fixed,
      setPercent(p) { percent = p; },
      get percent() { return percent; },
      step,
      solve(nSteps) { for (let i = 0; i < nSteps; i++) step(); },
      strain() { let m = 0; for (const b of beams) { const i = b.a * 3, j = b.b * 3; m = Math.max(m, Math.abs(Math.hypot(X[j] - X[i], X[j + 1] - X[i + 1], X[j + 2] - X[i + 2]) - b.L) / b.L); } return m; },
      creaseError() { let m = 0, s = 0, c = 0; for (const cr of creases) if (!cr.panel) { const e = Math.abs(cr.theta - cr.target * percent); m = Math.max(m, e); s += e; c++; } return {max: m * 180 / Math.PI, mean: s / c * 180 / Math.PI}; },
      reset() { X.set(X0); for (let i = 0; i < n; i++) X[i * 3 + 2] = 1e-3 * Math.sin(i * 12.9898 + 4.1); Vel.fill(0); creases.forEach(c => { c.theta = 0; }); }
    };
  }
  // SVG crease pattern (OS colour convention: black border, red mountain, blue valley, yellow facet, opacity = angle/180)
  function foldFromSVGLines(lines, tol) {
    const V = [], E = [], A = [], ANG = [];
    const idx = p => { for (let i = 0; i < V.length; i++) if (Math.hypot(V[i][0] - p[0], V[i][1] - p[1]) < tol) return i; V.push(p.slice()); return V.length - 1; };
    // split at intersections first (lines are segments)
    const segs = lines.map(l => ({...l}));
    const pts = segs.map(() => []);
    for (let i = 0; i < segs.length; i++) for (let j = i + 1; j < segs.length; j++) {
      const s = segs[i], t = segs[j], r = [s.b[0] - s.a[0], s.b[1] - s.a[1]], q = [t.b[0] - t.a[0], t.b[1] - t.a[1]];
      const den = r[0] * q[1] - r[1] * q[0]; if (Math.abs(den) < 1e-12) continue;
      const u = ((t.a[0] - s.a[0]) * q[1] - (t.a[1] - s.a[1]) * q[0]) / den, w = ((t.a[0] - s.a[0]) * r[1] - (t.a[1] - s.a[1]) * r[0]) / den;
      if (u < -1e-9 || u > 1 + 1e-9 || w < -1e-9 || w > 1 + 1e-9) continue;
      const p = [s.a[0] + r[0] * u, s.a[1] + r[1] * u]; pts[i].push(p); pts[j].push(p);
    }
    // also vertices lying on other segments
    segs.forEach((s, i) => segs.forEach(t => [t.a, t.b].forEach(p => {
      const r = [s.b[0] - s.a[0], s.b[1] - s.a[1]], L = Math.hypot(...r), u = ((p[0] - s.a[0]) * r[0] + (p[1] - s.a[1]) * r[1]) / (L * L);
      if (u > 1e-6 && u < 1 - 1e-6 && Math.abs((p[0] - s.a[0]) * r[1] - (p[1] - s.a[1]) * r[0]) / L < tol) pts[i].push(p.slice());
    })));
    const ek = new Set();
    segs.forEach((s, i) => {
      const r = [s.b[0] - s.a[0], s.b[1] - s.a[1]];
      const list = [s.a, s.b, ...pts[i]].map(p => ({p, t: (p[0] - s.a[0]) * r[0] + (p[1] - s.a[1]) * r[1]})).sort((x, y) => x.t - y.t);
      for (let m = 0; m + 1 < list.length; m++) {
        const u = idx(list[m].p), v = idx(list[m + 1].p); if (u === v) continue;
        const k = Math.min(u, v) + '_' + Math.max(u, v); if (ek.has(k)) continue; ek.add(k);
        E.push([u, v]); A.push(s.as); ANG.push(s.as === 'B' ? null : s.ang);
      }
    });
    return {vertices_coords: V, edges_vertices: E, edges_assignment: A, edges_foldAngle: ANG};
  }
  function parseSVG(text) {
    const lines = []; const re = /<line([^>]*)\/?>/g; let m;
    const get = (a, k) => { const r = new RegExp('\\s' + k + '="([^"]*)"').exec(a); return r ? r[1] : null; };
    while ((m = re.exec(text))) {
      const a = m[1], st = (get(a, 'stroke') || '').toLowerCase(), op = get(a, 'opacity') !== null ? +get(a, 'opacity') : 1;
      const as = st === '#ff0000' || st === 'red' ? 'M' : st === '#0000ff' || st === 'blue' ? 'V' : st === '#ffff00' ? 'F' : 'B';
      lines.push({a: [+get(a, 'x1'), +get(a, 'y1')], b: [+get(a, 'x2'), +get(a, 'y2')], as, ang: as === 'M' ? -180 * op : as === 'V' ? 180 * op : 0});
    }
    // polylines, polygons and simple paths (M/L/H/V, absolute and relative)
    const reP = /<(polyline|polygon|path)([\s\S]*?)\/?>/g;
    while ((m = reP.exec(text))) {
      const tag = m[1], a = m[2], st = (get(a, 'stroke') || '').toLowerCase(), op = get(a, 'opacity') !== null ? +get(a, 'opacity') : 1;
      const as = st === '#ff0000' || st === 'red' ? 'M' : st === '#0000ff' || st === 'blue' ? 'V' : st === '#ffff00' ? 'F' : 'B';
      const ang = as === 'M' ? -180 * op : as === 'V' ? 180 * op : 0;
      const polys = [];
      if (tag !== 'path') {
        const nums = (get(a, 'points') || '').trim().split(/[\s,]+/).filter(Boolean).map(Number), pts = [];
        for (let i = 0; i + 1 < nums.length; i += 2) pts.push([nums[i], nums[i + 1]]);
        if (tag === 'polygon') pts.push(pts[0]);
        polys.push(pts);
      } else {
        const d = get(a, 'd') || '', tok = d.match(/[MmLlHhVvZz]|-?\d*\.?\d+(?:e-?\d+)?/g) || [];
        let cur = [0, 0], start = [0, 0], cmd = 'M', pts = null, i = 0;
        while (i < tok.length) {
          if (/[A-Za-z]/.test(tok[i])) { cmd = tok[i++]; if (cmd === 'Z' || cmd === 'z') { if (pts) pts.push(start.slice()); continue; } }
          const num = () => +tok[i++];
          if (cmd === 'M' || cmd === 'm') { const x = num(), y = num(); cur = cmd === 'M' ? [x, y] : [cur[0] + x, cur[1] + y]; start = cur.slice(); pts = [cur.slice()]; polys.push(pts); cmd = cmd === 'M' ? 'L' : 'l'; }
          else if (cmd === 'L' || cmd === 'l') { const x = num(), y = num(); cur = cmd === 'L' ? [x, y] : [cur[0] + x, cur[1] + y]; pts.push(cur.slice()); }
          else if (cmd === 'H' || cmd === 'h') { const x = num(); cur = cmd === 'H' ? [x, cur[1]] : [cur[0] + x, cur[1]]; pts.push(cur.slice()); }
          else if (cmd === 'V' || cmd === 'v') { const y = num(); cur = cmd === 'V' ? [cur[0], y] : [cur[0], cur[1] + y]; pts.push(cur.slice()); }
          else i++;
        }
      }
      polys.forEach(pts => { for (let k = 0; k + 1 < pts.length; k++) lines.push({a: pts[k], b: pts[k + 1], as, ang}); });
    }
    const re2 = /<rect([^>]*)\/?>/g;
    while ((m = re2.exec(text))) { const a = m[1], x = +get(a, 'x'), y = +get(a, 'y'), w = +get(a, 'width'), h = +get(a, 'height');
      [[x, y, x + w, y], [x + w, y, x + w, y + h], [x + w, y + h, x, y + h], [x, y + h, x, y]].forEach(([x1, y1, x2, y2]) => lines.push({a: [x1, y1], b: [x2, y2], as: 'B', ang: 0})); }
    // normalise to a unit-ish square centred at 0, y up
    let mnx = 1e9, mny = 1e9, mxx = -1e9, mxy = -1e9;
    lines.forEach(l => [l.a, l.b].forEach(p => { mnx = Math.min(mnx, p[0]); mny = Math.min(mny, p[1]); mxx = Math.max(mxx, p[0]); mxy = Math.max(mxy, p[1]); }));
    const s = 2 / Math.max(mxx - mnx, mxy - mny), cx = (mnx + mxx) / 2, cy = (mny + mxy) / 2;
    lines.forEach(l => { l.a = [(l.a[0] - cx) * s, -(l.a[1] - cy) * s]; l.b = [(l.b[0] - cx) * s, -(l.b[1] - cy) * s]; });
    return foldFromSVGLines(lines, 3 * s);
  }
  return {create, prepare, parseSVG, foldFromSVGLines, params: P};
})();
if (typeof module !== 'undefined') module.exports = OSSIM;

// All origami models for the page, grouped by theme (birds / animals / flowers / insects), as compact FOLD in [-1,1]^2
const OS = require('./ossim.js'); const fs = require('fs'); const {toFOLD} = require('./fold-export.js');
const AN = require('./animals.js');
function clean(F) {
  return {v: F.vertices_coords.map(p => [+p[0].toFixed(5), +p[1].toFixed(5)]), e: F.edges_vertices, a: F.edges_assignment.join(''),
          f: F.edges_foldAngle.map(x => x === null ? 0 : +(+x).toFixed(1))};
}
const svg = (f, k = 1) => { const F = OS.parseSVG(fs.readFileSync(require('path').join(__dirname, 'patterns', f), 'utf8')); if (k !== 1) F.edges_foldAngle = F.edges_foldAngle.map(x => x === null ? null : x * k); return F; };
const diamond = F => { F.vertices_coords = F.vertices_coords.map(p => [p[0] - p[1], p[0] + p[1]]); return F; };
const out = {
  crane: clean(svg('traditionalCrane.svg')),
  flapbird: clean(svg('flappingBird.svg')),
  randlett: clean(svg('randlettflappingbird.svg')),
  fox: clean(diamond(toFOLD(require('./fox.js').build()))),
  cat: clean(diamond(toFOLD(require('./fox.js').build({q: -.3, chin: .8})))),
  dog: clean(diamond(toFOLD(AN.dog()))),
  flower: clean(require('./flower.js').build({petal: .7})),
  orchid: clean(svg('langOrchid.svg', .9)),
  lily: clean(svg('frogBase.svg', .5)),
  butterfly: clean(toFOLD(require('./butterfly.js').build())),
  moth: clean(toFOLD(require('./butterfly.js').build({h: .5, wing: 100}))),
  cicada: clean(diamond(toFOLD(AN.cicada()))),
};
fs.writeFileSync('models2.json', JSON.stringify(out));
for (const k in out) console.log(k.padEnd(10), 'V', out[k].v.length, 'bbox', [0, 1].map(i => [Math.min(...out[k].v.map(p => p[i])), Math.max(...out[k].v.map(p => p[i]))].map(x => x.toFixed(2)).join('..')).join(' '));
console.log('bytes', JSON.stringify(out).length);

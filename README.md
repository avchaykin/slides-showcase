# Torus TV — slides showcase

A single-file, scroll-driven presentation (4 test slides) with 14 switchable visual styles and generative music.
Open `index.html` in a browser — no build step, no dependencies (WebGL + WebAudio).

## Visual styles (keys)
| Key | Style |
|---|---|
| 1 | Torus — purple CRT blob |
| 2 | Knot — living trefoil knot |
| 3 | Sphere — glass lens over the text (drag it) |
| 4 | Matrix — fly-through glyph rain |
| 5 | Escher — "Other World" hatched architecture |
| 6 | Julia — morphing Julia set |
| 7 | Mandelbrot — dives into classic regions |
| 8 | Origami — real folding (Origami Simulator solver port); 3 models per slide, click to switch, drag/zoom |
| 9 | Halftone — AM-screened density plot of two sine waves |
| 0 | Kaleidoscope — tumbling faceted glass shards |
| - | Rain — drops on glass over a blurred sky (dawn → day → sunset → storm); intensity slider |
| = | Aurora — northern lights with curls and folds |
| [ | Tube — macro view of a CRT shadow mask; the cursor shades the phosphors |
| ] | Vector — retro vector tunnel with interlace and glitches |

Music styles (♪ menu): Downtempo, Upbeat, Demoscene, Math rock, Acid jazz, Aurora, Grid. `M` toggles sound.

## Origami tooling (`tools/origami`)
- `ossim.js` — CPU port of the Origami Simulator dynamic solver (Ghassaei, Demaine, Gershenfeld; MIT) and SVG crease-pattern parser.
- `ori-engine.js`, `ori-core.js`, `fold-export.js` — small fold-sequence engine that builds crease patterns from folding steps and exports FOLD.
- `fox.js`, `butterfly.js`, `flower.js`, `animals.js` — model definitions (fox/cat, butterfly/moth, pinwheel flower, dog, cicada).
- `patterns/` — crease patterns from the Origami Simulator library (crane, flapping birds, Lang's orchid, frog base, pinwheel base).
- `node gen-models2.js` regenerates `models2.json`, which is embedded in `index.html` as `ORI_DATA`.

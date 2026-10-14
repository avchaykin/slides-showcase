# Prompts to recreate each style

Copy-paste prompts for an AI coding assistant (or a brief for a developer) to rebuild every visual style of
Torus TV from scratch. Each style prompt is self-contained, but they all assume the shared framework described
first. Paste **"0. Shared framework"** together with any style prompt.

The numbers in the prompts are the values the reference implementation (`index.html`) uses. They are a
starting point you can tune, not hard requirements.

---

## 0. Shared framework (prepend to every style prompt)

> Build a single self-contained `index.html` presentation: no build step, no libraries, only vanilla JS, CSS,
> WebGL1 and WebAudio. Fonts come from Google Fonts: Unbounded 400/700/900 (display), Manrope 400–600 (body),
> JetBrains Mono 400–800 (mono).
>
> **Layout**
> - Four test slides are stacked in a `position:fixed` stage.
> - A hidden scroll track of 4 `100svh` stops with `scroll-snap-type:y mandatory` drives a continuous float
>   `f` (0…3) that eases toward the scroll target (`f += (target − f)·min(1, dt·5.5)`).
> - Each slide's content moves with `d = f − index`: it translates, skews and fades, and blurs by a "glitch"
>   amount `g = sin(π·frac(f))^1.5` that peaks halfway between slides.
> - Keyboard: ↑/↓/PageUp/PageDown/Space go to the previous or next slide. A right-hand dot rail jumps directly.
>   A HUD has a top bar with style buttons and sound controls, and a bottom bar with "CH 0x / 04", a progress
>   bar and "Scroll".
> - Slide content:
>   1. intro: big headline, paragraph, hint;
>   2. "three principles" list;
>   3. three big stat numbers and a tag;
>   4. centred closing headline and a button back to slide 1.
>
>   Each text block has a soft radial scrim behind it (`--scrim`) so it stays readable over any background.
>
> **Styles**
> - A full-viewport `<canvas id="gl">` (`pointer-events:none`) behind the text renders the current style.
> - Styles are switched with `html[data-mode]`. Every style defines CSS tokens (`--bg --fg --muted --accent --hot
>   --cyan --line --sh1 --sh2 --chip --vig --scrim`, optionally `--f-display`), so the page UI recolours with it.
>   The style is persisted in localStorage and the URL hash, and number keys switch it.
> - Per-slide parameters for a style live in a `KEYS[mode] = {wide:[4 rows], narrow:[4 rows]}` table, interpolated
>   by `f` with an ease (`narrow` applies at ≤720 px).
> - Compile shaders lazily per style. Use a full-screen triangle for fragment-shader styles.
> - Pick the device-pixel ratio per style (cheap styles up to 2, heavy raymarchers scaled by an adaptive `quality`
>   that drops when the frame time exceeds about 22 ms).
> - Honour `prefers-reduced-motion` by slowing everything about 4× and disabling glitches.
>
> **Butterfly**
> - A small 3D pink butterfly (WebGL, its own canvas) flies with flap physics and lands on words of the current
>   slide.
> - It gets a per-style tint pass so it matches the style.

---

## 1. Torus — living CRT blob (key 1)

> Background: a raymarched **torus SDF** in purple, with a "living" radius: the major and minor radii breathe,
> and low-frequency sin noise displaces the surface (amplitude about 0.08–0.15 × a per-slide `morph` value).
> It rotates slowly on two axes and spins faster during slide transitions (`ry += dt·(0.45 + g·2.6)`).
>
> **Shading**
> - Base `#6b1feb`-ish purple, diffuse plus fresnel iridescence: `0.5 + 0.5·cos(2π(fresnel·0.9 + n.y·0.35 + t·0.07 + [0, .12, .26]))`,
>   mixed 35 % toward lavender.
> - Sharp specular, and a purple glow accumulated along the ray (`exp(−9·d)`).
> - Background `#07050c` with a faint violet radial lift.
> - Tone-map `1 − exp(−1.35·c)`.
>
> **Strong CRT post-process**
> - Render the scene at about 0.4× resolution (adaptive).
> - Upscale through a CRT shader: barrel distortion, RGB shadow-mask stripes, scanlines, chromatic offset that
>   grows with `g`, rolling bright band, noise, vignette and rounded tube corners.
> - Horizontal tearing when `g > 0`.
>
> **Per slide (`KEYS.torus`)**
> - Values per slide: x, y offset (screen heights), scale and morph amount.
> - The blob sits right of the text on slide 1, left on 2, right and smaller on 3, centred and largest on 4.
>
> **Theme:** `--bg #07050c --fg #f1e9ff --accent #b47cff --hot #ff4fd8 --cyan #3ff0ff`.

## 2. Knot — living trefoil knot (key 2)

> Same pipeline and CRT post as Torus, but the SDF is a **trefoil knot tube**: the minimum distance to the
> parametric curve `(sin t + 2 sin 2t, cos t − 2 cos 2t, −sin 3t)`, sampled about 64×, with a tube radius.
>
> **Make it alive**
> - The tube radius breathes along the curve (`r·(1 + 0.25 sin(3t + time))`).
> - The knot partly "unties": blend the curve toward a circle by `0.3 · (0.5 + 0.5 sin(time·0.3))`.
> - Animate the volume.
>
> Use lower detail than the torus for performance (fewer curve samples, about 60 march steps).
> Per-slide positions mirror the Torus ones, slightly smaller.

## 3. Sphere — glass lens over the text (key 3)

> A living transparent sphere sits **in front of** the text and refracts it like a lens.
>
> **Text texture**
> - Each frame the text changes, paint the visible slide's text into an offscreen 2D canvas.
> - Walk text nodes and use `Range.getClientRects` per word, with the same font, colour and letter-spacing.
> - Upload it as a texture.
>
> **Lens shader (full-screen quad)**
> - Inside radius `r`, offset the sampling UV by a refraction term that grows toward the rim (`n·(1 − z)·k`),
>   with a slight per-channel dispersion (R/G/B sampled at 0.97 / 1 / 1.03).
> - Add a fresnel rim, a soft specular highlight and an inner shadow.
> - Outside the lens, show the normal DOM text.
> - The surface wobbles: radius modulated by `sin` noise over angle and time, plus the drag speed (jelly effect).
>
> **Motion**
> - Per-slide keyframes (`x, y` as viewport fractions, radius, wobble) and a slow drift.
> - The user can **drag the sphere with the mouse**; it springs back to its keyframe on slide change.
> - Spring physics: `v += ((target − p)·55 − v·10)·dt`.
>
> **Note:** the CRT effect is not used here (for performance), but keep the site palette.

## 4. Matrix — fly-through glyph rain (key 4)

> A green Matrix "digital rain" as a non-dominant background, rendered as a **fly-through** of several depth layers.
>
> **Glyphs**
> - Build a glyph atlas on a canvas: half-width katakana, digits, some Latin capitals and symbols
>   (`ｱｲｳ…ﾝ0-9ZXY…:.=*+-<>¦|ЖЯФШЮΣΔΞΠΩ`).
> - The fragment shader tiles columns per layer. Each column has its own speed and phase; glyphs change randomly
>   over time. The head glyph is bright white-green, and the trail fades to dark green.
>
> **Flight**
> - The camera moves forward through 4–6 layers at different depths (parallax plus scaling). It occasionally eases
>   back (pulls away) and rushes forward during slide transitions (speed `0.28 + 0.5 sin(t·0.17) + g·3.2`).
> - Subtle FOV breathing.
>
> Keep it dim: overall opacity about 0.35 and a vignette. Fallback without WebGL: a 2D-canvas column rain.
>
> **Theme:** `--bg #020a05 --fg #d9ffe6 --accent #22f07a`, display font JetBrains Mono.

## 5. Escher — "Other World" (key 5)

> A raymarched impossible architecture in the spirit of M. C. Escher's woodcut *Other World*, rendered as an
> **engraving**.
>
> **Scene**
> - A repeated cubic lattice of open rooms or arches (domain repetition with `mod`).
> - Pillars, arched openings and floors, so you see walls and gravity in three directions.
>
> **Camera**
> - A quaternion camera that slowly rotates through the three gravity axes per slide, so floors become walls.
> - Small drift: yaw ±0.12 and pitch ±0.08 sinusoids.
>
> **Shading as hatching**
> - Compute lighting, then render ink hatching: line density follows darkness, with parallel lines along
>   screen-space or object-space axes and cross-hatching in deep shadow.
> - Sepia ink `#1d1914` on paper `#e8dfcb`, with paper grain and a vignette (`rgba(70,50,25,.32)`).
>
> **Typography:** light theme, Old Standard TT for the display headings. The HUD gets paper-coloured gradient
> backgrounds so it stays legible.

## 6. Julia — morphing Julia set (key 6)

> A full-screen **Julia set** whose constant `c` travels around the circle `|c| ≈ 0.7885`. The angle advances
> continuously and faster during transitions (`angle += dt·0.07·(1 + 4g)`). The shape morphs constantly through
> dendrites, spirals and Siegel disks.
>
> **Render**
> - About 160–200 iterations with smooth (continuous) colouring.
> - A deep-navy palette with gold and coral bands; black interior.
>
> **Per slide (`KEYS.julia`):** c-angle offset, zoom, centre x/y and rotation. Each slide frames a different part.
> Add slow rotation and zoom breathing (±6 %). Scale resolution adaptively.
>
> **Theme:** `--bg #03050f --accent #ffb547 --hot #ff5e7a --cyan #5ef2ff`.

## 7. Mandelbrot — dives to classic regions (key 7)

> A full-screen **Mandelbrot set** with 240 iterations, bailout 256 and smooth iteration count.
>
> **Palette:** the classic "Ultra Fractal" ramp — `#000764 → #206bcb → #edffff → #ffaa00 → #000200` at
> 0 / 0.16 / 0.42 / 0.6425 / 0.8575. Index by `sqrt(smooth)·0.16 + t·0.012`. Black interior.
>
> **Per slide:** fly (zoom out, then in) to a classic region. Each row is centre x, y, log(half-height), rotation:
> 1. whole set `(−1.3, 0)`, log zoom 0.14;
> 2. Seahorse Valley `(−0.7436, 0.1318)`, log zoom −4.42;
> 3. Elephant Valley `(0.2858, 0.0118)`, log zoom −4.6;
> 4. the period-3 mini-brot `(−1.74995, 0)`, log zoom −3.91.
>
> **Transitions:** interpolate the centre; the zoom pulls back by `exp(2.4·sin(π·frac(f)))` mid-transition, so
> it reads as out-then-in. Vignette.

## 8. Origami — real folding figures (key 8)

> Black background; large paper figures **actually fold and unfold** from a flat square, with a soft glow around
> them.
>
> **Physics (do not fake it)**
> - Port the **Origami Simulator** dynamic solver (Ghassaei, Demaine, Gershenfeld; MIT) to CPU JS.
> - Parse FOLD or SVG crease patterns and triangulate faces.
> - Axial beam springs (`k = 20/L`, damping `0.45·2√k`).
> - Crease torques `0.7·L·(target·percent − θ)` with moment arms; face-angle constraints (stiffness 0.2).
> - Explicit Euler with `dt = 0.9/(2π√kmax)`.
> - Unwrap θ at ±5 rad. Scale ±180° targets to 0.965 to avoid coplanar z-fighting. Add a tiny deterministic
>   z-jitter so symmetric patterns buckle.
> - Run a fixed ms budget of steps per frame and ramp the fold percent with smoothstep.
>
> **Models: three per slide**, cycling every about 8 s, and a click or tap on the figure switches to the next:
> - Birds: traditional crane CP, flapping bird, Randlett's flapping bird.
> - Animals: fox face, cat face (fox with a blunted chin), dog with drooping ears.
> - Flowers: pinwheel-base flower, Lang's orchid (folded 90 %), frog base folded 50 % as a lily.
> - Insects: Yoshizawa-style butterfly, moth (butterfly variant), cicada.
>
> Use the Origami Simulator SVG library where it exists, and generate the rest from folding sequences.
>
> **Transition:** the old model unfolds to flat, rests, then the new crease pattern folds up.
>
> **Display**
> - Show the model in the frame of a chosen reference facet, so it doesn't drift.
> - Slerp from the flat-sheet pose to the figure pose as it folds.
> - Per-figure colour, "up" vector, tilt and size. Gentle sway.
>
> **Material: matte paper**
> - Wrapped diffuse, cool sky fill, warm bounce, slight translucency.
> - Fibre, mottling and tooth noise fixed to the sheet's paper coordinates.
> - A faint grazing sheen, and **no drawn crease lines**.
> - Two-sided: one side coloured, one side cream.
>
> **Glow:** silhouette rendered at ¼ resolution, blurred twice and added.
>
> **Interaction:** drag to rotate with inertia; wheel or pinch to zoom (only over the figure, otherwise the wheel
> scrolls slides). It eases home after 5 s idle or on a slide change.

## 9. Halftone — magazine print of a living density plot (key 9)

> A light lavender page showing a **2D density plot of two crossing sine waves** printed as **AM halftone**, as
> if seen through a loupe.
>
> **Field**
> - Two plane waves in rotated directions, each with a slowly varying frequency, amplitude and phase, and a
>   gentle chirp and warp (`s1 = sin(f1·u1·(1 + 0.18 sin…) + φ1 + 1.2 sin(0.55 u2 + t·0.21))`).
> - Wave 1 drives the cyan plate, wave 2 the magenta plate, `pow(v1·v2, 2.2)` the key plate, and yellow fills the
>   troughs lightly.
>
> **Screening**
> - Four rotated dot screens at the classic angles: Y 0°, C 15°, M 75°, K 45°.
> - Each ink samples the field **once per screen cell** (at the cell centre), so dot size carries the tone.
> - Cosine spot function: round dots → checkerboard → round holes. Threshold `1 − 2√cov` with fwidth
>   anti-aliasing, plus noise on the edge for ink spread.
> - Multiply inks subtractively on paper `#f8f4fc` with fibre noise.
>
> **Lighter purple inks:** periwinkle `(.55,.66,1)`, orchid `(.96,.55,.9)`, pale yellow `(1,.95,.74)`,
> violet key `(.5,.36,.8)`. Cells are about 17 px (big zoom).
>
> **Per slide:** loupe zoom, two frequencies and two directions. The loupe pulls back 38 % mid-transition, and
> the plates misregister slightly, jumping during transitions.
>
> **Theme:** light, `--bg #f5f0fc --fg #26134d --accent #7a4ee0`, with a strong paper scrim behind the text.

## 0. Kaleidoscope — faceted glass shards (key 0)

> A **full-bleed** real three-mirror kaleidoscope with a soft vignette (no eyepiece circle).
>
> **Mirrors:** fold every pixel into an equilateral triangle by repeatedly reflecting across its three edges
> (about 40 iterations). Lose 4.5 % of the light per reflection, and add a faint light leak along the mirror seams.
>
> **Object cell: about 26 glass shards simulated on the CPU**
> - Circles in a round chamber with gravity, damping (oil-filled), pairwise collisions, and wall friction that
>   drags them round as the tube turns.
> - The tube turns slowly by itself, fast during slide changes, and the user can turn it by dragging horizontally.
>
> **Shard rendering in the shader** (passed as uniforms: x, y, angle, size + colour index)
> - Irregular convex polygons with 4–7 jittered vertices, some stretched into splinters, with chipped noisy edges.
> - Faceted like crumpled cellophane or foil: Voronoi cells inside each shard. Each facet gets a random "tilt" that
>   sets transmitted brightness, plus white glints on the most tilted facets, lit ridges along facet borders and a
>   thin dark outline.
> - Transmission multiplies the backlight, so overlapping shards mix colours.
> - Palette: ruby, amber, emerald, sapphire, violet, teal, brown, yellow, navy, lime, orange, sky.
>
> **Theme:** dark with warm accents (`--accent #ffb83d --hot #ff3f6e`).

## − Rain — drops on a window (key −)

> Drops on window glass in front of a **blurred sky** that changes per slide: dawn → day → sunset → storm with
> lightning.
>
> **Sky (procedural)**
> - Gradient (top / mid / horizon colours per scene), a sun disc with haze, drifting fbm clouds, a wavy horizon
>   and a ground with bokeh lights.
> - It accepts a "sharpness" parameter: blurred for the background, sharp for what is seen through drops.
> - Scenes crossfade.
> - Storm: dark clouds, flashes that light the clouds from inside (3 flickers per strike, every 3–9 s), and a
>   jagged bolt drawn behind the glass.
>
> **Water simulation (CPU, up to about 1400 drops)**
> - Drops land at a rate set by the scene and a **user intensity slider** (0–3, persisted). A drop landing on
>   another merges with it, and resting drops slowly swell.
> - When a drop exceeds about 7 px it lets go: its momentum grows with weight, it sticks now and then, it wipes
>   the mist along its track, absorbs smaller drops it touches, and leaves a trail of small beads.
> - A mist layer of tiny droplets slowly evaporates.
>
> **Rendering**
> - Paint all drops into a "water map" canvas using a normal-map sprite: RG = normal, B = thickness, A = coverage.
>   Sliding drops stretch.
> - Upload it as a texture each frame.
> - Shader: misted, desaturated sky behind; inside a drop, sample the **sharp sky, offset by the normal (a lens
>   shows the view refracted)**, add a specular highlight (brighter with lightning) and a dark meniscus rim.
>
> Text gets a soft dark shadow for legibility.

## = Aurora — northern lights (key =)

> Night over a mountain lake with **aurora curtains**.
>
> **Curtains (ray-marched through altitude layers)**
> - For each pixel, march about 40 jittered height layers.
> - Intersect each layer with two curtains, defined as wavy centre-lines in the ground plane
>   (`z = z0 + meander·fbm(x) + longFold·sin(0.2x − t·0.22) + shortRipple·sin(0.62x − t·0.31)`).
> - Curtain brightness: a Gaussian across the line, vertical rays (`pow(noise(x·5 + t), 3)`), travelling brightness
>   waves along the curtain, and a height profile with a sharp bright lower edge fading upward.
>
> **Vortices:** 2–3 curls per curtain that are born, roll along the curtain and die (about 60 s life). Implement
> them by locally swirling ground-plane coordinates around a point on the curtain before evaluating it.
>
> **Colour by height:** green lower edge → violet or crimson top.
>
> **Scene:** twinkling stars, a faint Milky Way, fbm mountain silhouettes lit by the aurora at their rim, and a
> rippled lake reflection. Tone-map softly.
>
> **Per slide**
>
> | Slide | Palette | Shape |
> |---|---|---|
> | 1 | green / pink | gentle waves |
> | 2 | teal / violet | broad S-folds |
> | 3 | crimson | dense ripples |
> | 4 | full spectrum along the ribbon | deep folds |
>
> Each slide also sets camera yaw/pitch, intensity and vortex strength.
>
> **Smoothness is critical**
> - Drive all per-slide parameters with a **critically damped spring** (about 4 s, independent of scroll easing).
> - Only blend amplitudes, never frequencies or phases, so distant parts of the ribbons don't sweep.
> - Add a gentle intensity surge proportional to spring velocity.

## [ Tube — CRT under a macro lens (key [)

> A CRT screen seen through a macro lens: huge **round RGB phosphor dots** in a delta shadow mask.
>
> **Mask**
> - Hexagonal packing (rows `d·0.866` apart, every other row shifted), dot pitch about 16 px (11 px on mobile).
> - Dots are strictly circular. The channel cycles R, G, B along the row.
> - Each RGB triad samples the picture **once** at the triad centre.
> - The dot core brightness and a bloom halo grow with the value. Unlit phosphors stay faintly visible.
>
> **Picture:** dynamic geometric animation, scaled so it runs **beyond the slide edges** (a background, not a
> focal object):
> 1. orbit rings with planets and a central sun;
> 2. nested counter-rotating polygons;
> 3. a chequered tunnel rushing forward;
> 4. bouncing, rotating boxes and discs over sweeping bars.
>
> Scenes crossfade.
>
> **Extras:** a rolling scan brightness, faint whole-picture bloom through the glass, curved-glass vignette and a
> window reflection.
>
> **Zoom:** a spring-driven zoom per slide `[1, 1.4, 0.8, 1.18]`, plus a 16 % pull-back mid-transition.
>
> **Cursor:** dims the phosphors around it in a soft Gaussian, like a hand's shadow on the glass. It fades out
> when the pointer leaves the page.

## ] Vector — retro vector tunnel (key ])

> An early-80s **vector display** in the spirit of *Tron*: a flight down a bending 3D tunnel built of square
> panels.
>
> **Tunnel**
> - The centre-line is a winding 3D curve (sums of slow sines in x and y along −z).
> - Rings every 2 units, 20 panels around, about 38 rings visible.
> - Draw ring edges and longitudinal edges: every 10th ring uses the accent colour, every 5th the third colour.
> - Rings twist slowly along z and breathe with the music.
> - **The cross-section morphs per slide: circle → rectangle → triangle → hexagon**, blending through a spring.
> - The camera rides the centre-line, looks ahead and banks into bends. Speed rises during transitions.
>
> **Beams**
> - Project and near-clip segments on the CPU. Draw each as a thin quad with a soft cross-section, additively
>   blended, fading with distance.
> - **Low retro resolution:** render into an offscreen target about 3 CSS px per pixel and upscale with NEAREST,
>   so beams are chunky and stair-stepped.
> - A wide blurred glow pass at ¼ resolution underneath.
>
> **CRT post (no constant wobble)**
> - Each retro row is a lit line with a dark gap, and **interlaced fields** alternate dimming odd and even rows
>   every frame.
> - Fine background grain tinted with the palette lifts the black. A tiny colour fringe.
> - **Glitch bursts** every 1.5–5 s and on every slide change: horizontal bands jump sideways, a tear line, colour
>   split, vertical-hold slip and heavier snow.
>
> **One retro palette per slide, never mixed:**
>
> | Slide | Palette | Main / accent / third |
> |---|---|---|
> | 1 | green phosphor CRT | `(.2,1,.3)` / `(.65,1,.55)` / `(.12,.6,.18)` |
> | 2 | amber CRT | `(1,.6,.08)` / `(1,.82,.35)` / `(.7,.36,.04)` |
> | 3 | CGA | cyan `#55ffff` / magenta `#ff55ff` / white |
> | 4 | EGA | blue `#5555ff` / yellow `#ffff55` / light red `#ff5555` |
>
> The page UI (text, accents, progress bar, dots) switches to the same palette via `html[data-vpal]`. Display
> font is monospace.

---

## Generative music (♪ menu, key M)

> **WebAudio engine**
> - Master chain: lowpass → compressor → trim → soft tanh clipper. A convolution reverb (3 s noise IR), a
>   tempo-synced feedback delay, a noise buffer and a 4-bit crusher.
> - Each style owns a bus, a BPM, per-slide layer levels plus a filter cutoff (layers enter as slides advance),
>   and a 16th-step look-ahead sequencer (schedule 0.3 s ahead every 50 ms).
> - Kicks feed a `pulse()` value that the visuals use.
> - Each style has a transition "fx" sound on slide change.
>
> **Styles**
> 1. **Downtempo** (82 BPM, swung): warm detuned saw pads, FM electric-piano chords, sine sub bass, soft drums,
>    sparse pentatonic triangle melody.
> 2. **Upbeat** (122): nu-disco four-on-the-floor, offbeat octave bass, sidechain-pumped chord stabs, claps, a
>    pulse-wave pluck hook.
> 3. **Demoscene** (132): tracker-style 48 Hz pulse arpeggios, acid octave bass, crushed drums, portamento lead
>    with motifs.
> 4. **Math rock** (150, 7/8 as 2+2+3): tapped clean-guitar arpeggios over maj9/m11 shapes, syncopated bass, busy
>    drums with ride and tom fills.
> 5. **Acid jazz** (98, swung): Rhodes with tremolo, Hammond drawbar pad, funky bass with chromatic approaches,
>    brass stabs, a muted-trumpet dorian solo.
> 6. **Aurora** (64): ambient drone, slow-blooming detuned pads, glassy FM bells in E pentatonic into long echoes,
>    high shimmer, a soft heartbeat on later slides.
> 7. **Grid** (108): Tron-like synthwave — octave 16th bass ostinato, sidechained saw pads, gated-reverb snare, a
>    16th arpeggio into the delay, a slow gliding brassy lead over Dm–B♭–Gm–A.

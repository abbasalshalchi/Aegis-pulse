// ---------------------------------------------------------------------------
// Tower View cinematic manifest.
//
// The Tower View is built from two kinds of Blender exports:
//   • STILLS  — the crisp resting states. One self-contained vector SVG each:
//               hand-filled component shapes + Freestyle line-art, already
//               themed (see scripts that produced public/tower/stills/*.svg).
//   • CLIPS   — short pre-rendered videos of the camera moving between states
//               (true 3D orbit/perspective moves).
//
// Drop the exports into public/tower/ (see public/tower/README.md) and flip
// ASSETS_AVAILABLE to true. Until then the stage falls back to the built-in
// placeholder line-art + CSS-zoom so the app keeps working.
// ---------------------------------------------------------------------------

// The themed stills are in place, so the stage renders the real artwork.
export const STILLS_AVAILABLE = true

// Camera-move clips are in public/tower/clips (0.8s H.264 MP4, 1280×720).
export const CLIPS_AVAILABLE = true

// Artwork/clip aspect ratio. Placeholder art is 5:7 (portrait); the Blender
// render is 1920×1080 (16:9). Switched automatically with STILLS_AVAILABLE.
export const STAGE_ASPECT_W = STILLS_AVAILABLE ? 16 : 5
export const STAGE_ASPECT_H = STILLS_AVAILABLE ? 9 : 7

const BASE = '/tower'

// Resting states → the self-contained themed SVG. Keys match the store's
// zoomedSection ids, plus 'full' for the whole-tower view.
export const STILLS = {
  full: `${BASE}/stills/full.svg`,
  mast: `${BASE}/stills/mast.svg`,
  bts: `${BASE}/stills/bts.svg`,
  generator: `${BASE}/stills/generator.svg`,
}

export function stillFor(section) {
  return STILLS[section ?? 'full'] ?? STILLS.full
}

// Transition clip for a camera move. from/to ∈ 'map'|'full'|'mast'|'bts'|'generator'.
export function clipUrl(from, to) {
  if (!from || !to) return null
  return `${BASE}/clips/${from}-to-${to}.mp4`
}

// Every clip to warm into cache when the Tower View mounts.
export const PRELOAD_CLIPS = [
  clipUrl('map', 'full'),
  clipUrl('full', 'mast'),
  clipUrl('mast', 'full'),
  clipUrl('full', 'bts'),
  clipUrl('bts', 'full'),
  clipUrl('full', 'generator'),
  clipUrl('generator', 'full'),
]

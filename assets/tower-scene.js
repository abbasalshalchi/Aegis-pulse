// ---------------------------------------------------------------------------
// Tower View still manifest.
//
// Everything the Tower View draws comes out of the baked IVG files in
// assets/InterVG/ — each one carries a camera move plus the two resting states
// it runs between, so there is no second set of still exports to keep in sync.
// Both the clips and the stills are wired up in components/TowerStage.vue,
// because choosing a clip also means choosing a playback direction.
//
// This module is now only the stage geometry shared with the placeholder art.
// ---------------------------------------------------------------------------

// Real artwork is available, so the stage renders it instead of the built-in
// placeholder line-art + CSS-zoom fallback.
export const STILLS_AVAILABLE = true

// Artwork aspect ratio. Placeholder art is 5:7 (portrait); the baked artwork is
// 16:9. Switched automatically with STILLS_AVAILABLE.
export const STAGE_ASPECT_W = STILLS_AVAILABLE ? 16 : 5
export const STAGE_ASPECT_H = STILLS_AVAILABLE ? 9 : 7

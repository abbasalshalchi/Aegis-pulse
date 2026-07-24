# Tower View cinematic assets

Blender exports the Tower View reads at runtime. The stage falls back to
placeholder art until these exist and `ASSETS_AVAILABLE` is flipped in
[`assets/tower-scene.js`](../../assets/tower-scene.js).

## 1. Stills (resting states) — `stills/` ✅ done

Each resting state is **one self-contained themed vector SVG**: hand-filled
component shapes + Freestyle line-art, in a native `0 0 1920 1080` viewBox.
No separate fill PNG is needed.

| File | State | Source |
|------|-------|--------|
| `stills/full.svg` | whole tower | `assets/svg/default.svg` |
| `stills/mast.svg` | mast close-up | `assets/svg/tower.svg` |
| `stills/bts.svg` | BTS cabinet close-up | `assets/svg/bts cabinet.svg` |
| `stills/generator.svg` | power generator close-up | `assets/svg/power generator.svg` |

Fills are grouped by `data-component` (`mast`, `cabinet`, `door`, `generator`,
`base`, `fence`, `dish`, `sectors`) so each part can be themed and made
interactive. Regenerate from the hand-filled sources with the retheme script.

## 2. Clips (camera moves) — `clips/`

Short pre-rendered videos of the camera moving **between** states. Name them
`${from}-to-${to}.webm`. The **last frame of each clip must match the destination
still exactly** so the swap to the static state is invisible.

| File | Move |
|------|------|
| `clips/map-to-full.webm` | arriving at the tower |
| `clips/full-to-mast.webm` / `clips/mast-to-full.webm` | mast in / out |
| `clips/full-to-bts.webm` / `clips/bts-to-full.webm` | cabinet in / out |
| `clips/full-to-generator.webm` / `clips/generator-to-full.webm` | generator in / out |

Export settings: **~1280–1600px wide, 24fps, 0.4–0.8s**, VP9/WebM (H.264 MP4 also
fine — change the extension in `clipUrl()`). Render fills + lines composited
together; the moving frames don't need separate vector line-art.

## 3. Turning it on

1. Add the files above.
2. In `assets/tower-scene.js` set `ASSETS_AVAILABLE = true`.
3. Re-author `OVERLAY_GEOMETRY` in `components/TowerStage.vue` for the real
   artwork's coordinates to re-enable the spatial sensor overlays (they're
   tuned to the placeholder's 500×700 space and are hidden in asset mode until
   retuned).

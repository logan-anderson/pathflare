# Pathflare

Client-only sports-clip editor. Upload or record a short throw, mark the flight with a handful of points, overlay a glow trail, and download an MP4. **Your video never leaves this device.**

Pathflare interpolates a live glow from sparse marks. It is not a stadium tracking system and does not auto-track.

## Local run

```bash
npm install
npm run dev
```

Then open the printed localhost URL (Vite default: `http://localhost:5173`).

Production build:

```bash
npm run build
```

This runs TypeScript, unit tests, and `vite build`, writing a static site to `dist/`. Preview it with `npm run preview`.

```bash
npm test
```

## Vercel (static SPA, zero serverless)

Vercel should serve `dist` as a static SPA. There are **no serverless functions** and **no API routes**.

Suggested project settings:

- Framework: Vite
- Build command: `npm run build`
- Output directory: `dist`

`vercel.json` sets security headers and an SPA rewrite to `index.html`. It does not declare functions.

## What v2 does

1. **Upload** (`accept=video/*`) or **Record** rear camera, max 10 seconds.
2. Pick a glow color: Disc / Golf ball / Basketball / Custom.
3. **Mark path.** Scrub with the timeline, filmstrip, J/K or arrows (Shift = 10 frames), and Space to play/pause.
4. Place **4–10 marks** along the perceived flight (release, last tight frame, sky/wide, landing). Desktop: click. Touch: drag the reticle, then **Add mark**. Two marks make a straight line; three or more make a smooth centripetal Catmull-Rom curve. The glow is live while tagging.
5. Pinch or wheel to zoom. Pause where the curve misses and add another mark.
6. **Export** bakes the same spline into an MP4 (`Frame i / N`). Play back and download `pathflare-{sport}-{timestamp}.mp4`.

Coordinates are normalized video pixels. Click mapping accounts for `object-fit: contain` letterboxing (including portrait 1080×1920 and 720×1280). iPhone rotation metadata (`-90` / 270) is applied so portrait displays correctly.

HEVC (hvc1 / Dolby Vision) often fails in Chrome. Pathflare shows a clear message: use Safari, or re-export as Most Compatible (H.264). Decode is time-bounded so a bad codec does not hang the tab.

Clip budget: process and export at 720p30. 1080p and 4K are downscaled; 4K ImageData is never allocated. Clips longer than 10s show a warning but still export (up to 20s).

## License

MIT. Runtime libraries are limited to MIT/Apache/BSD/MPL (React, Vite, TypeScript, mediabunny MPL-2.0).

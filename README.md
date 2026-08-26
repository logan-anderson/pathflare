# Pathflare

Client-only sports-clip editor. Upload or record a short throw/hit, tap the flying object on the first frame, overlay a glow trail, play it back, and download an MP4. **Your video never leaves this device.**

Pathflare is a browser demo for one-object tap-to-seed tracking. It is not a stadium tracking system.

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

This runs TypeScript and `vite build`, writing a static site to `dist/`. Preview it with `npm run preview`.

## Vercel (static SPA, zero serverless)

Vercel should serve `dist` as a static SPA. There are **no serverless functions** and **no API routes**.

Suggested project settings:

- Framework: Vite
- Build command: `npm run build`
- Output directory: `dist`

`vercel.json` sets security headers and an SPA rewrite to `index.html`. It does not declare functions.

## What v1 does

1. **Upload** (`accept=video/*`) or **Record** rear camera at 1280×720, max 10 seconds.
2. Pick a sport preset: Disc / Golf ball / Basketball / Custom color.
3. Tap the object on frame 0.
4. Watch `Frame i / N · ETA` with cancel (screen wake lock while running).
5. Play the result and download `pathflare-{sport}-{timestamp}.mp4`.

Tracking is tap-to-seed Kalman (`x, y, vx, vy`) plus a color histogram and NCC template match in a gated ROI. If lock is lost, re-tap. The app never invents a trail.

Decode/encode uses **mediabunny + WebCodecs** in a Web Worker with OffscreenCanvas. If WebCodecs is missing, Pathflare falls back to `<video>` + canvas + MediaRecorder.

Clip budget: process and export at 720p30; 4K is downscaled immediately and 4K ImageData is never allocated. Phone clips longer than 15s or 4K show a warning.

## License

MIT. Runtime libraries are limited to MIT/Apache/BSD/MPL (React, Vite, TypeScript, mediabunny MPL-2.0).

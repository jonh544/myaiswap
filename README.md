# Real-Time AI Video Studio

A native Tauri desktop studio for camera-based, real-time video transformation with fal.ai Lucy 2.5.

## Current status

The application uses the official `@fal-ai/client` package for fal realtime connections and WebSocket signaling, with WebRTC media transport for Lucy's returned video. Local camera preview and remote transformed stream are shown separately; the transformed preview is never replaced with the local webcam feed.

The Rust/Tauri backend requests a short-lived token restricted to `decart/lucy-2-5/realtime`. It reads `FAL_KEY` only from its process environment. The key is not stored in the frontend, settings, or a `VITE_` variable.

## Requirements

### macOS

- macOS 12+ preferred for desktop development.
- Intel-based Macs such as a 2020 Intel MacBook Pro are explicitly supported as the baseline target.
- Xcode Command Line Tools required for Tauri native builds.
- Rust and Node.js must be installed.

### Windows

- Windows 10 and 11 are the target support range.
- Camera and microphone permission prompts must be validated on a supported Windows machine.
- The Windows WebView2 WebRTC and media-device flow is not testable from a macOS environment.

## Prerequisites

```bash
# Install Rust
curl https://sh.rustup.rs -sSf | sh -s -- -y
source "$HOME/.cargo/env"

# Verify toolchain
rustc --version
cargo --version

# Install Node dependencies
npm install
```

## Development

```bash
npm run dev
```

## Configure fal.ai

The browser app requests a 120-second token from `/api/fal/realtime-token`. The server function reads `FAL_KEY` and requests a token restricted to `decart/lucy-2-5/realtime`; the key is never included in frontend code. This follows fal's [realtime client token-provider guidance](https://fal.ai/docs/api-reference/client-libraries/javascript/realtime.md) and [API key guidance](https://fal.ai/docs/documentation/setting-up/authentication/index.md).

```bash
npm run dev
```

For local browser development, add `FAL_KEY=your-fal-api-key` to the ignored `.env.local` file. Vite loads it for the development-only API middleware. Do not use a `VITE_` prefix or commit the file.

### Vercel deployment settings

In the Vercel project settings:

1. Set **Framework Preset** to **Vite** (or keep the detected Vite preset).
2. Set **Build Command** to `npm run build`.
3. Set **Output Directory** to `dist`.
4. Under **Settings → Environment Variables**, add `FAL_KEY` with the fal.ai API key. Select **Production** and also **Preview** and **Development** if those environments should work.
5. Redeploy after adding or changing the variable.

Vercel automatically detects the root `api/` directory as Node.js Functions, so no custom route configuration is required. Do not set `VITE_FAL_KEY`: Vite-prefixed values are client-visible. The Vercel web app and desktop Tauri app use different server-side token providers; for Tauri, set `FAL_KEY` in the environment that launches the app.

The token endpoint rejects cross-origin requests and only returns the short-lived restricted token. Lucy's realtime endpoint also requires fal.ai account access and internet connectivity.

## Production build

```bash
npm run build
```

## Tauri desktop app

```bash
npx tauri dev
```

## Platform notes

- macOS and Windows camera/microphone permissions, WebRTC connectivity, and Lucy output require real-device testing on each target OS.
- Microphone selection is provided for device management, but Lucy 2.5 is a video-to-video endpoint and does not process microphone audio.
- No virtual camera or virtual audio output implementation is included or claimed.

## Project structure

- `src/` — React UI and state management
- `src-tauri/` — Rust backend and Tauri configuration
- `docs/BUILD-ARCHITECTURE.md` — platform architecture and component guidance

## Media and provenance

The character reference must be PNG, JPEG, or WebP and at least 512 × 512 pixels. The app passes the selected image as Lucy's documented `reference_image_url` input and sends camera video as a WebRTC stream. Provider watermarking/provenance is preserved.

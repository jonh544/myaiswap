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

Set `FAL_KEY` in the environment used to launch the Tauri process. Do not put it in a `VITE_` variable or commit it.

```bash
export FAL_KEY="your-fal-api-key"
npx tauri dev
```

On PowerShell:

```powershell
$env:FAL_KEY = "your-fal-api-key"
npx tauri dev
```

`.env.example` documents the variable name only; Vite does not load or expose the key to the frontend. Lucy's realtime endpoint requires internet access and account access to the model.

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

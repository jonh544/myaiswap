# Build Architecture

## Overview

This application follows a Tauri 2 desktop architecture with a Rust backend and a React/Vite frontend. The desktop app captures local camera video and uses fal.ai's Lucy 2.5 realtime endpoint for remote video transformation.

## Runtime design

- Frontend: React + TypeScript + Vite
- Desktop shell: Tauri 2
- Backend language: Rust
- Local configuration: JSON-backed Tauri settings storage
- Media capture: browser capture APIs for local device enumeration and preview
- Realtime transformation: fal.ai WebSocket signaling plus WebRTC media transport

## Why this architecture

Tauri provides a native shell and Rust backend without a separate web server. The Rust command reads `FAL_KEY` from the process environment and requests a 120-second fal token restricted to `decart/lucy-2-5/realtime`. The frontend receives only that short-lived token and uses the official `@fal-ai/client` realtime WebSocket client alongside the endpoint's WebRTC signaling flow.

The fal token command takes no caller-supplied endpoint or key, has an in-process rate limit, and does not log credentials or token responses. Configure `FAL_KEY` in the environment that launches the Tauri process; it is not a Vite variable and must never use a `VITE_` prefix.

Lucy 2.5 accepts a prompt and optional reference image for character swap/virtual try-on; the reference image must be PNG, JPEG, or WebP and at least 512 × 512. In WebRTC mode, the camera stream is sent as media, not through the separate `image_url` input. The microphone is selectable for device management but this video-to-video endpoint does not process microphone audio.

## macOS-specific architecture

Camera and microphone permission prompts depend on the WKWebView and must be tested on the target macOS version. The studio displays transformed video in-app and does not provide a virtual camera or audio output driver.

## Windows-specific architecture

Camera and microphone permission prompts depend on WebView2 and must be tested on a Windows device. No virtual camera or audio output driver is included.

## Provider integrations

### fal.ai Lucy 2.5

The studio distinguishes local camera preview from the remote transformed stream. It displays transformed output only after WebRTC delivers remote media. Prompt and reference updates use the realtime connection's input-message mechanism and documented Lucy input fields.

Provider watermarking and provenance are left intact.

## Local app configuration

The app uses local JSON or SQLite-backed storage for configuration and session metadata. This allows a desktop user to persist identity names, output routing preference, and device selection without requiring a remote backend.

## Build and test expectations

- `npm install` to install frontend dependencies
- `npm run build` to check the React/Vite build
- Set `FAL_KEY` in the launching process environment, then run `npx tauri dev`
- Platform-specific native validation is required on each target OS before production claims

## Important limitations

The WebRTC flow and camera/microphone permissions still require real-device tests on macOS and Windows. No virtual camera or virtual audio output is implemented or claimed.

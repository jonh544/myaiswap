# Build Architecture

## Overview

This application follows a Tauri 2 desktop architecture with a Rust backend and a React/Vite frontend. The app intentionally separates local capture, preview, identity management, and provider-backed features so the desktop flow remains usable even when external APIs are unavailable.

## Runtime design

- Frontend: React + TypeScript + Vite
- Desktop shell: Tauri 2
- Backend language: Rust
- Local configuration: SQLite or JSON-backed settings storage
- Media capture: browser capture APIs for local device enumeration and live preview
- Native platform modules: future macOS and Windows virtual-camera implementations

## Why this architecture

Tauri provides a useful native shell and Rust backend without a web-server requirement. The user-facing experience is a desktop application, and the core local studio flow can be exercised without external cloud access. This keeps the app realistic for local testing while maintaining a clean integration path for NamiFusion and realtime voice conversion.

## macOS-specific architecture

A real virtual camera on macOS normally requires a native camera-extension or CoreMediaIO-style integration, depending on the library and OS version in use. Design guidance:

- Use a signed macOS extension where the system camera route is required.
- Handle camera entitlement and permission prompts during installation.
- Keep the app’s preview path independent from the virtual-device runtime so errors remain visible in diagnostics.
- Validate actual frame delivery and extension lifecycle on a macOS device before claiming production-level functionality.

## Windows-specific architecture

On Windows, a virtual camera must be created through supported APIs and packaged with the app. The implementation must be tested on an actual Windows machine because cross-compilation alone cannot verify native driver and permission behavior. The expected architecture includes:

- Windows 10/11 support target
- Proper virtual camera installation and permission flow
- Validation of Media Foundation or equivalent camera integration path
- Explicit user notices when the underlying native virtual camera is unavailable

## Provider integrations

### NamiFusion

NamiFusion integration is treated as an optional API-backed service. The frontend includes a clear provider status panel and session-readiness gating to ensure users understand when credentials or internet connectivity are missing.

### Voice conversion provider

The voice-library screen models provider status states including:

- Ready
- Needs credentials
- Needs network

This design ensures the app does not falsely imply a working conversion pipeline without runtime confirmation.

## Local app configuration

The app uses local JSON or SQLite-backed storage for configuration and session metadata. This allows a desktop user to persist identity names, output routing preference, and device selection without requiring a remote backend.

## Build and test expectations

- `npm install` to install frontend dependencies
- `npm run build` to check the React/Vite build
- `npx tauri dev` to start the desktop shell
- Platform-specific native validation is required on each target OS before production claims

## Important limitations

This project is intentionally honest about what is implemented and what remains provider-specific or OS-specific. The app does not claim native virtual camera functionality on macOS or Windows beyond the architecture and runtime stub logic until a real target machine validates the necessary signed components and system permissions.

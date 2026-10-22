# Real-Time AI Virtual Identity Studio

A native desktop studio for local identity previews, live camera capture, microphone and voice routing, and provider-backed realtime face-swap/voice conversion workflows.

## Current status

This project is scaffolded and the desktop UI has been implemented as a Tauri 2 + React + TypeScript app with a functional studio layout, identity workflow, voice profiles, device selection, diagnostics, and installation notes.

The app is designed to run as a desktop application on macOS and Windows. It includes local preview logic that works without external provider credentials, while API-backed services such as NamiFusion and live voice conversion are clearly marked as provider-dependent features.

## Requirements

### macOS

- macOS 12+ preferred for desktop development.
- Intel-based Macs such as a 2020 Intel MacBook Pro are explicitly supported as the baseline target.
- Xcode Command Line Tools required for Tauri native builds.
- Rust and Node.js must be installed.

### Windows

- Windows 10 and 11 are the target support range.
- Native virtual-camera packaging and permissions must be validated on a supported Windows machine.
- The Windows-specific virtual camera mechanism is not fully testable from a macOS environment.

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

## Production build

```bash
npm run build
```

## Tauri desktop app

```bash
npx tauri dev
```

## Platform notes

- macOS: virtual camera creation and routing require a native component and codesigning/entitlements validation on a real macOS machine.
- Windows: virtual camera support depends on the Windows-supported camera APIs and packaging flow, which must be reviewed and validated on Windows.
- This repository intentionally keeps local functionality independent from a remote provider so the app remains usable during offline or credential-missing states.

## Project structure

- `src/` — React UI and state management
- `src-tauri/` — Rust backend and Tauri configuration
- `docs/BUILD-ARCHITECTURE.md` — platform architecture and component guidance

## Important caveat

The real NamiFusion face-swap API and a genuine realtime voice-conversion engine are external services. This app includes the required integration strategy and workflow states explicitly, but actual cloud API calls or native virtual-device drivers must be implemented and signed for each target OS before claiming full runtime completion.

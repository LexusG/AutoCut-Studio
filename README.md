# AutoCut Studio

AutoCut Studio is a local-first Linux desktop application for turning a group of source clips into a finished video. This repository currently contains the functional Phase 1 foundation: media import, metadata analysis, thumbnail generation, clip organization, and source preview.

All footage remains on the local computer. Electron owns filesystem access and FFmpeg execution; the React renderer only communicates through a small, typed preload API.

## Phase 1 features

- Electron, React, TypeScript, Vite, Tailwind CSS, Zustand, and Lucide icons
- Secure Electron window with context isolation, sandboxing, and Node integration disabled
- FFmpeg and FFprobe availability checks at startup
- Native multi-file picker and desktop drag-and-drop import
- MP4, MOV, MKV, WebM, AVI, and M4V validation
- FFprobe metadata for duration, size, resolution, frame rate, codec, audio, bitrate, and rotation
- Cached mid-clip thumbnails generated with FFmpeg
- Reorderable clip cards, duplicate prevention, removal, and detailed import errors
- Local source-video preview through an allowlisted custom Electron protocol

## Prerequisites

- Ubuntu or another current Linux distribution
- Node.js 20 or newer
- npm 10 or newer
- FFmpeg and FFprobe

On Ubuntu, install FFmpeg with:

```bash
sudo apt update
sudo apt install ffmpeg
```

Verify both tools are available:

```bash
ffmpeg -version
ffprobe -version
```

## Install and run

```bash
npm install
npm run dev
```

The development command starts Vite and launches the Electron desktop window. It does not start a separate application backend.

## Validation and production build

```bash
npm run typecheck
npm test
npm run build
npm run test:smoke
```

To open the compiled application locally:

```bash
npm run preview
```

The smoke test requires FFmpeg and a graphical Linux session or `xvfb-run`. In a headless shell, run `xvfb-run -a npm run test:smoke`.

AppImage packaging will be configured after the core render pipeline is implemented, as specified for the later packaging phase.

## Project structure

```text
src/
  main/
    ipc/                 Typed IPC handlers
    services/
      ffmpeg/            Binary detection and child-process execution
      filesystem/        Guarded local-media protocol
      video/             FFprobe import and thumbnail services
  preload/               Narrow contextBridge API
  renderer/
    components/          Editor UI components
    hooks/               Import workflow hooks
    pages/               Home and Project Editor screens
    stores/              Zustand application state
    utils/               Display formatting helpers
  shared/
    constants/           App and supported-media constants
    types/               IPC and media contracts
tests/                   Unit tests
```

## Security and file handling

- The renderer has no direct Node.js access.
- IPC channels are explicitly allowlisted and validate incoming paths.
- Preview URLs only resolve paths authorized during import.
- Original videos are referenced in place and are never changed or deleted.
- Thumbnails are cached under Electron's application data directory.

## Troubleshooting

### FFmpeg is missing

Install the distribution package shown above and restart the app. AutoCut Studio needs both `ffmpeg` and `ffprobe` on `PATH`.

### A clip does not import

Expand the import error in the Media panel. Confirm the source still exists, its extension is supported, and FFprobe can read a video stream from it.

### The window does not launch on Linux

Run `npm run build` first to expose TypeScript or bundling errors. On minimal Linux installations, Electron may also require standard desktop libraries supplied by the distribution's Chromium/Electron packages.

## Next: Phase 2

Phase 2 adds output aspect ratio and resolution controls, editing pace, and the default-on **Use Every Clip** rule. Automatic trimming, normalization, and MP4 generation intentionally begin in Phase 3.

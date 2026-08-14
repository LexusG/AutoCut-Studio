# AutoCut Studio

AutoCut Studio is a local-first Linux desktop application for configuring an automatic video project from local source clips. The Phase 2 editor adds social-platform presets, complete video/editing configuration, background-audio preparation, JSON project persistence, and validation on top of the Phase 1 media workflow.

All footage remains on the local computer. Electron owns filesystem access and FFmpeg execution; the React renderer only communicates through a small, typed preload API.

## Current features

- Electron, React, TypeScript, Vite, Tailwind CSS, Zustand, and Lucide icons
- Secure Electron window with context isolation, sandboxing, and Node integration disabled
- FFmpeg and FFprobe availability checks at startup
- Native multi-file picker and desktop drag-and-drop import
- MP4, MOV, MKV, WebM, AVI, and M4V validation
- FFprobe metadata for duration, size, resolution, frame rate, codec, audio, bitrate, and rotation
- Cached mid-clip thumbnails generated with FFmpeg
- Reorderable clip cards, duplicate prevention, removal, and detailed import errors
- Local source-video preview through an allowlisted custom Electron protocol
- Original-order, automatic, and random clip arrangements
- Instagram Reel, Story, Feed Portrait, and Feed Square presets
- YouTube Standard and Shorts presets
- LinkedIn Landscape, Portrait, and Square presets
- Editable presets with automatic Modified-state detection
- Slow, normal, and fast editing pace configuration
- Original, 16:9, 9:16, 1:1, and 4:5 output ratios
- Five common manual resolutions, custom dimensions, Auto/24/30/60 FPS, Crop to Fill/Fit, and quality controls
- Output-ratio preview canvases that crop or fit source footage without stretching
- Auto, 15, 30, 60, 90, and custom target duration settings with Use Every Clip warnings
- MP3, WAV, AAC, M4A, OGG, and FLAC background-audio import and FFprobe metadata
- Local music playback/seek, preview volume, looping, start position, fades, and ducking configuration
- Original-clip audio preservation, volume, and normalization configuration
- Versioned JSON project save/open with complete settings restoration and recent projects
- Missing background-audio recovery through Locate File or Remove Audio
- Automatic editable output filenames based on the selected platform format
- Mixed-orientation, mixed-frame-rate, and audio-stream normalization in the existing basic renderer
- Default-on **Use Every Clip** guarantee with all-or-fail rendering
- H.264/AAC MP4 generation to a user-selected path
- Real render stages and FFmpeg progress with safe cancellation and cleanup
- Finished-video preview inside the app

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

AppImage packaging will be configured in the later packaging phase.

## Project files

Use **Save Project** in the editor to create a versioned `.autocut.json` project. Project files store local media paths and configuration; they do not copy source videos or music. Open them from the Home screen or the Recent Projects list.

When referenced music has moved, the project opens with an **Audio file missing** state and offers Locate File or Remove Audio. Unavailable source-video paths are reported through the existing media import error UI.

## Project structure

```text
src/
  main/
    ipc/                 Typed IPC handlers
    services/
      ffmpeg/            Binary detection and child-process execution
      filesystem/        Guarded local-media protocol
      audio/             FFprobe background-audio import
      projects/          Atomic project and recent-project persistence
      video/             Import, planning, normalization, and render services
  preload/               Narrow contextBridge API
  renderer/
    components/          Editor UI components
    hooks/               Import workflow hooks
    pages/               Home and Project Editor screens
    stores/              Zustand application state
    utils/               Display formatting helpers
  shared/
    constants/           Media support and centralized platform presets
    types/               IPC, project, audio, preset, and render contracts
    utils/               Project codec, filename, settings, and validation logic
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

## Phase 2 boundaries

Phase 2 stores target-duration, transition, loudness normalization, looping, fades, and ducking intent. The existing basic renderer remains available, but it does not yet enforce target duration or mix the configured background track into the exported MP4.

## Next: Phase 3

Phase 3 connects the complete `ProjectRenderConfiguration` to automatic trimming, precise target-duration planning, normalization, concatenation, and background-audio processing. Advanced AI analysis, beat detection, and multiple music tracks remain out of scope.

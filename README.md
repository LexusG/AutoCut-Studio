# AutoCut Studio

AutoCut Studio is a local-first Linux desktop application that automatically plans, previews, and exports an edited video from local source clips. Phase 4 adds sampled Smart Selection, blurred Fit backgrounds, multi-track soundtracks, accurate loudness normalization, and a persisted preview-version browser to the existing FFmpeg render pipeline.

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
- Auto, 15, 30, 60, 90, and custom target durations applied before rendering
- Classic deterministic selection plus cached Smart Selection across multiple bounded candidate windows
- Local sharpness, exposure, motion, stability, audio-activity, scene, black-frame, and duplicate scoring
- Fast, Balanced, and Detailed analysis sampling with per-clip Classic fallback and cancellable FFmpeg processes
- Optional local-ML provider interface; no model, cloud service, API key, or network connection is required
- Reusable duration allocation with transition-overlap accounting and source-capacity redistribution
- Minimum feasible duration recovery when Use Every Clip conflicts with a short target
- MP3, WAV, AAC, M4A, OGG, and FLAC background-audio import and FFprobe metadata
- Ordered multi-track soundtrack with local preview, per-track volume/offset/fades, enable, reorder, and removal controls
- Soundtrack looping, track crossfades, master volume, and source-audio ducking
- Original-clip audio preservation, volume, and normalization configuration
- Version 3 JSON project save/open with Phase 2/3 migration, preview history, complete settings restoration, and recent projects
- Missing background-audio recovery through Locate File or Remove Audio
- Automatic editable output filenames based on the selected platform format
- Mixed-orientation, mixed-frame-rate, pixel-format, aspect-ratio, and audio-stream normalization
- Crop to Fill, black Fit, and moving blurred-background Fit without stretching; rotation metadata is respected
- None, Crossfade, Fade, and Dip to Black transitions with configurable duration
- Original audio preservation, volume control, Off/Fast/Accurate normalization, and safe silence for clips without audio
- Structured two-pass FFmpeg loudnorm measurement with true-peak targets and single-pass fallback
- Default-on **Use Every Clip** hard guarantee with an explicit feasibility result
- Frozen, serializable RenderPlan separating edit decisions from FFmpeg execution
- Fast and full-quality temporary preview rendering in the application temp area
- Dedicated Review screen with thumbnails, playable preview history, settings snapshots, restore/delete controls, and approval state
- Approval export that reuses a full-quality preview or re-renders a fast preview from the exact same plan
- FFprobe verification of duration, dimensions, FPS, streams, readability, and file size before success
- Real render stages and FFmpeg progress with safe process cancellation and incomplete-file cleanup
- Structured render plans, FFmpeg arguments, warnings, fallbacks, and errors in per-render logs
- Explicit overwrite confirmation and Open File/Open Folder actions after export

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

The smoke workflow creates five real mixed-orientation video fixtures and two music tracks. It verifies Smart Selection, cache reuse, blurred Fit, accurate normalization, soundtrack mixing, regeneration, preview history, frozen-plan approval, project reopen, safe version deletion, final export, and FFprobe metadata.

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
      video/             Planning, Smart analysis, audio, execution, preview, logs, and verification
  preload/               Narrow contextBridge API
  renderer/
    components/          Editor UI components
    hooks/               Import workflow hooks
    pages/               Home, Project Editor, and Final Preview screens
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
- Preview intermediates are created under the system temp directory and never beside source media.
- Up to 10 unprotected preview artifacts are retained per project; source media and approved/current previews are never removed by retention cleanup.

## Troubleshooting

### FFmpeg is missing

Install the distribution package shown above and restart the app. AutoCut Studio needs both `ffmpeg` and `ffprobe` on `PATH`.

### A clip does not import

Expand the import error in the Media panel. Confirm the source still exists, its extension is supported, and FFprobe can read a video stream from it.

### The window does not launch on Linux

Run `npm run build` first to expose TypeScript or bundling errors. On minimal Linux installations, Electron may also require standard desktop libraries supplied by the distribution's Chromium/Electron packages.

## Rendering architecture

`render-planner.ts` arranges sources and creates the Classic plan scaffold. In Smart mode, sampled candidate analysis and cached scoring run before the plan is frozen. `segment-allocator.ts` still owns pace ranges, feasibility, target allocation, capacity redistribution, and transition overlap. `render-executor.ts` consumes the frozen plan without selecting clips again. Smart analysis, soundtrack preparation, loudness measurement, audio filters, preview management, process execution, and FFprobe verification remain separate services.

Fast preview may reduce dimensions and encoding quality, but it keeps the same clip order, section timing, crop, transitions, and audio composition. Approving it performs a full-quality render from its frozen plan. A full-quality preview is copied to the selected destination without unnecessary re-encoding.

Any render-affecting edit marks existing versions as **Settings Changed** and blocks approval until regeneration. Old preview files remain watchable from Preview History while available.

## Phase 4 boundaries

Smart Selection currently uses deterministic FFmpeg media-analysis heuristics. The optional local-ML provider is present, but no face/person model is bundled, so person presence remains a neutral score. Scene timing is lightweight, audio activity uses energy rather than speech recognition, and severe camera movement is estimated rather than stabilized. Accurate mode performs two-pass normalization on source segments; optional final-mix normalization remains single-pass.

## Future work

A lightweight opt-in local person detector, richer scene-boundary placement, final-program two-pass loudness verification, configurable cache/storage management, speech transcription, captions, beat-synchronized editing, subject-aware reframing, advanced waveform editing, nonlinear timelines, and Linux packaging remain future work.

# AutoCut Studio

AutoCut Studio is a local-first Linux desktop application that automatically plans, previews, and exports edited videos from local source clips. Phase 8 adds offline transcript semantics, topic and highlight discovery, goal-directed editing, and independently planned social output variants to the existing FFmpeg pipeline.

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
- Bundled MediaPipe Pose Landmarker Lite model with checksum/version metadata and no runtime network requirement
- Dedicated MediaPipe worker, distributed 3/6/10-frame sampling, presence-ratio scoring, cancellation, diagnostics, and heuristic fallback
- Prefer People weighting that rewards consistent subject presence without overriding severe blur, darkness, shake, or exposure problems
- Local Whisper transcription with word timestamps, corrections, exact search, captions, SRT/VTT export, and text-based media edits
- Explicitly installed local MiniLM sentence embeddings through Transformers.js and ONNX, with offline-only inference after installation
- Revision-aware semantic chunk and embedding caches that reuse unchanged transcript ranges
- Exact and semantic transcript search, Edit Goal strength, prioritized/avoided ranges, and semantic Smart Selection signals
- Ordered topic detection, editable chapter markers, topic importance, plain-text chapter export, and similar-take review
- Explainable multi-signal highlight candidates with semantic deduplication, novelty, source/topic diversity, alternatives, and custom-duration highlight reels
- Instagram Reel, Story, YouTube Short, LinkedIn Portrait, and custom output variants with independent frozen RenderPlans, captions, smart crops, previews, approvals, and exports
- Sequential batch preview/export queues with per-variant progress and cancellation, sharing source analysis across variants
- Reusable duration allocation with transition-overlap accounting and source-capacity redistribution
- Minimum feasible duration recovery when Use Every Clip conflicts with a short target
- MP3, WAV, AAC, M4A, OGG, and FLAC background-audio import and FFprobe metadata
- Ordered multi-track soundtrack with local preview, per-track volume/offset/fades, enable, reorder, and removal controls
- Soundtrack looping, track crossfades, master volume, and source-audio ducking
- Original-clip audio preservation, volume, and normalization configuration
- Version 7 JSON project save/open with migrations from earlier schemas, semantic metadata references, independent variant preview histories, complete settings restoration, and recent projects
- Missing background-audio recovery through Locate File or Remove Audio
- Automatic editable output filenames based on the selected platform format
- Mixed-orientation, mixed-frame-rate, pixel-format, aspect-ratio, and audio-stream normalization
- Crop to Fill, black Fit, and moving blurred-background Fit without stretching; rotation metadata is respected
- None, Crossfade, Fade, and Dip to Black transitions with configurable duration
- Original audio preservation, volume control, Off/Fast/Accurate normalization, and safe silence for clips without audio
- Independent Off/Fast/Accurate source and final-mix normalization controls
- Complete lossless PCM final-mix intermediate, measured two-pass normalization, verification, safe fallback, and video stream-copy mux
- Default-on **Use Every Clip** hard guarantee with an explicit feasibility result
- Frozen, serializable RenderPlan separating edit decisions from FFmpeg execution
- Temporary render workspaces promoted atomically into persistent preview storage only after verification
- Dedicated Review screen with persistent thumbnails, playable preview history, settings snapshots, restore/delete/pin controls, availability, and approval state
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

The smoke workflows cover the Phase 6 and 7 editing paths plus an eight-clip Phase 8 project with speech, silent footage, multiple people and topics, music, captions, semantic analysis, highlights, three portrait variants, sequential previews, approvals, exports, FFprobe validation, and restart persistence.

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
      filesystem/        Guarded media/model protocols and centralized storage paths
      audio/             FFprobe background-audio import
      models/            Shared managed model download support
      projects/          Atomic project and recent-project persistence
      semantic/          MiniLM provider, chunk/cache storage, search, topics, highlights, and job scheduling
      video/             Planning, Smart analysis, audio, execution, preview, logs, and verification
  preload/               Narrow contextBridge API
  renderer/
    components/          Editor UI components
    hooks/               Import, render, and person-worker lifecycle hooks
    workers/             Dedicated local MediaPipe inference worker
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
- Media URLs only resolve explicitly authorized paths; packaged model assets resolve through a separate read-only, path-restricted protocol.
- Original videos are referenced in place and are never changed or deleted.
- Thumbnails are cached under Electron's application data directory.
- Disposable render intermediates are created under the system temp directory and never beside source media.
- Successful previews live under Electron `userData/storage/projects/<project>/previews/<preview>/` with video, thumbnail, log, and metadata.
- Installed semantic model files live under `userData/storage/models/semantic/all-MiniLM-L6-v2/`; per-project embedding caches live under `userData/storage/projects/<project>/semantic/` and are not copied into project JSON.
- Up to 10 unprotected preview artifacts are retained per project; pinned, approved, current, watched, and exporting previews are protected.

## Troubleshooting

### FFmpeg is missing

Install the distribution package shown above and restart the app. AutoCut Studio needs both `ffmpeg` and `ffprobe` on `PATH`.

### A clip does not import

Expand the import error in the Media panel. Confirm the source still exists, its extension is supported, and FFprobe can read a video stream from it.

### Semantic analysis is unavailable

Open **Advanced Smart Settings** or the **Semantic** content tab and install the MiniLM model. Installation requires a network connection once; analysis and search run locally afterward. Exact transcript search and existing Smart Selection remain available if the model is missing or fails.

### The window does not launch on Linux

Run `npm run build` first to expose TypeScript or bundling errors. On minimal Linux installations, Electron may also require standard desktop libraries supplied by the distribution's Chromium/Electron packages.

## Rendering architecture

`render-planner.ts` arranges sources and creates the Classic plan scaffold. In Smart mode, sampled candidate analysis, MediaPipe worker inference, and versioned cached scoring run before the plan is frozen. `segment-allocator.ts` owns pace ranges, feasibility, target allocation, capacity redistribution, and transition overlap. `render-executor.ts` consumes the frozen plan without selecting clips again, renders video and the completed PCM program mix separately, normalizes audio, then muxes with video stream copy. Smart analysis, soundtrack preparation, loudness measurement, audio filters, preview storage, process execution, and FFprobe verification remain separate services.

Fast preview may reduce dimensions and encoding quality, but it keeps the same clip order, section timing, crop, transitions, and audio composition. Approving it performs a full-quality render from its frozen plan. A full-quality preview is copied to the selected destination without unnecessary re-encoding.

Any render-affecting edit marks existing versions as **Settings Changed** and blocks approval until regeneration. Old preview files remain watchable from Preview History while available.

## Phase 8 boundaries

MiniLM measures semantic similarity; it does not generate summaries, titles, chapters, or spoken content. The default model is English-focused, and the UI warns that other languages may have weaker results. Topics use transcript boundaries and representative source text rather than fabricated names. Semantic relevance can rerank usable footage, but hard constraints, manual locks, and severe quality penalties still win.

## Future work

Multilingual embedding providers, broader coordination of every analysis subsystem under the central scheduler, explicit model unloading controls, configurable cache/storage byte quotas, advanced waveform editing, nonlinear timelines, and Linux packaging remain future work.

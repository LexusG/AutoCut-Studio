# Phase 9 Packaging Matrix

| Environment | Build | Runtime | Notes |
| --- | --- | --- | --- |
| Linux x64 development | Verified | Verified | TypeScript, 102 unit tests, production build, and Phase 6-8 Playwright workflows |
| Linux x64 unpacked | Verified | Verified | Five-clip offline workflow completed transcription, diarization, semantic analysis, preview, export, and restart persistence |
| Linux x64 AppImage | Verified | Verified with extract-and-run | Launched from `/tmp` with repository-independent bundled runtimes; host does not provide FUSE 2 for direct mounting |
| Linux x64 deb | Verified | Verified after extraction | Package extracted and launched from `/tmp`; system installation was not attempted because the test session has no root install step |
| Linux ARM64 configuration | Configured | Not tested | Requires `AUTOCUT_ARM64_RUNTIME_DIR` with validated ARM64 FFmpeg, FFprobe, and whisper.cpp |
| Linux ARM64 hardware | Not tested | Not tested | No ARM64 host or emulator was available |

## Packaged Resources

```text
resources/
  resources/
    runtime/
      linux-x64/
        ffmpeg/ffmpeg
        ffprobe/ffprobe
        whisper/whisper-cli
        runtime-manifest.json
    mediapipe/wasm/
    models/person/
```

Downloaded models are stored under Electron `userData/storage/models` and remain usable offline after checksum-verified installation. User corrections and labels are kept separately from regenerable inference caches.

The packaging hook rejects native `.node` or `.so` files whose ELF architecture differs from the requested package architecture. ARM64 staging fails closed when a trusted ARM64 runtime bundle is unavailable.

## Packaged Workflow

The gated `e2e/phase9.packaged.spec.ts` workflow uses five real speech/person clips and an isolated Electron data directory with networking directed to a closed local endpoint. It exercises Smart Selection, a soundtrack, sequential transcription, explicit two-speaker diarization, manual speaker naming, confidence review, speaker captions, packaged MiniLM inference, related sections, preview generation, final export, save, close, and restart persistence. The final x64 run produced a verified 30 FPS MP4 and reopened all five clips with the manual speaker label intact.

The same host also exercised automatic and explicit speaker clustering directly through packaged Electron. Automatic clustering returned one cluster for the synthetic two-voice fixture, while explicit count 2 returned two clusters. That result is retained as a reminder that speaker-count auto-detection is model-dependent and manual review remains necessary.

Final x64 artifact checksums:

```text
81107b6b5795436ebbbdbe92c6af6871308fe3b9316dd15fe0d445554e98af62  AutoCut-Studio-0.1.0-x86_64.AppImage
c44dd992199afd7481e297ff2df8a071fc7c78d3a2d0bbb70fa97d26d708c4f4  AutoCut-Studio-0.1.0-amd64.deb
```

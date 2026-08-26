# Third-Party Notices

AutoCut Studio is distributed under the MIT License. The AppImage and `.deb` packages redistribute
the third-party components below. This document records what is shipped, under which licence, and
what obligations that creates.

---

## ⚠️ Unresolved: FFmpeg is GPLv3

**This must be resolved before AutoCut Studio 1.0.0 is distributed.**

The bundled FFmpeg build reports:

```
--enable-gpl --enable-version3
```

with, among others, `libx264`, `libx265`, `libvidstab`, `libzvbi`, `libopencore-amrnb/wb` and
`libvo-amrwbenc`. That combination makes the binary **GPL version 3**.

AutoCut Studio itself is MIT licensed and invokes FFmpeg as a separate process, which is the
ordinary arm's-length arrangement. However, **redistributing the GPLv3 binary inside our packages
carries obligations regardless of how we invoke it**, at minimum:

- shipping the GPL v3 licence text alongside the binary;
- providing the complete corresponding source for the exact FFmpeg build distributed, or a written
  offer valid for three years.

Neither is currently satisfied — the packages contain the FFmpeg binary with no licence text and no
source offer.

Options, to be decided before release:

1. **Ship an LGPL FFmpeg build.** Rebuild without `--enable-gpl`/`--enable-version3` and without the
   GPL-only libraries. Loses x264/x265 encoding, which the render pipeline currently depends on.
2. **Comply with GPLv3.** Include the licence text and publish the corresponding source for the
   exact build, with a written offer in the packages.
3. **Do not bundle FFmpeg.** Require a system FFmpeg. Removes the obligation but breaks the
   offline, self-contained installation the product promises.

No option has been chosen; this is recorded as release blocker **REL-004**.

---

## Bundled runtimes

| Component | Licence | Notes |
| --- | --- | --- |
| FFmpeg / FFprobe (static, johnvansickle.com build 7.0.2) | **GPL v3** | See the section above. Includes libx264, libx265, libaom, libdav1d, libvpx, libopus, libvorbis, libmp3lame, libass, libfreetype, libfribidi, libzimg, libsoxr, librubberband, libvidstab, libzvbi and others, each under their own terms. |
| whisper.cpp | MIT | Licence text is shipped at `resources/runtime/linux-x64/whisper/LICENSE`. |
| Electron | MIT | Bundles Chromium (BSD-style and others) and Node.js (MIT). |
| MediaPipe pose task assets | Apache 2.0 | Shipped under `resources/models/person` and `resources/mediapipe/wasm`. |

## Downloaded models (not bundled)

These are fetched only when the user chooses to install them, and are stored in the user's data
directory rather than inside the packages. Redistribution obligations do not apply, but the terms
still govern use.

| Model | Source | Licence |
| --- | --- | --- |
| Whisper GGML models | `huggingface.co/ggerganov/whisper.cpp` | MIT (model weights: MIT) |
| all-MiniLM-L6-v2 | `huggingface.co/Xenova/all-MiniLM-L6-v2` | Apache 2.0 |
| sherpa-onnx pyannote segmentation | `huggingface.co/csukuangfj/...` | See upstream; pyannote segmentation is MIT, redistribution terms should be confirmed |
| sherpa-onnx speaker embedding (3D-Speaker) | `github.com/k2-fsa/sherpa-onnx` | Apache 2.0 |

## Application dependencies

Runtime npm dependencies are MIT or Apache 2.0: `react`, `react-dom`, `zustand`, `lucide-react`,
`@huggingface/transformers`, `@mediapipe/tasks-vision`, `sherpa-onnx-node`, and their transitive
dependencies. `npm audit` currently reports 0 vulnerabilities.

## Fonts and icons

- Caption rendering defaults to **DejaVu Sans**, resolved from the host system rather than bundled.
  If a font is bundled in future, its licence must be recorded here.
- Interface icons come from **lucide-react** (ISC).
- **The application icon is currently the default Electron icon.** No AutoCut Studio branding asset
  is shipped. Recorded as **REL-012**.

## Status

This document is **incomplete pending resolution of REL-004**. A full per-library enumeration of the
FFmpeg build's own dependencies is required if option 2 is chosen.

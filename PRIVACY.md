# Privacy

AutoCut Studio processes video locally. This document describes exactly what that means and,
just as importantly, where it stops being true.

## What stays on your computer

All video and audio processing happens on your machine:

- clip import, inspection and thumbnailing
- Smart Selection analysis and scoring
- person and subject detection
- speech detection, beat analysis and loudness measurement
- speech-to-text transcription
- speaker diarization
- semantic analysis, search, topics and highlights
- caption generation
- preview rendering and final export

Your source footage, project files, transcripts, speaker labels, captions and exported videos are
never uploaded anywhere. There is no telemetry, no analytics, and no crash reporting.

## When AutoCut Studio uses the network

The application connects to the internet for exactly one purpose: **downloading optional AI models
that you explicitly choose to install.**

| Feature | Downloaded from | When |
| --- | --- | --- |
| Speech transcription (Whisper) | `huggingface.co` | Only when you install a transcription model |
| Semantic search (MiniLM) | `huggingface.co` | Only when you install the semantic model |
| Speaker diarization (sherpa-onnx) | `huggingface.co`, `github.com` | Only when you install the diarization models |

These downloads transfer model files to your computer. **No part of your project, footage, audio or
transcripts is sent** as part of a model download.

Every download is verified against a checksum recorded in the application before the file is used.

## After models are installed

Once the models you want are installed, every feature listed in the first section works with the
network disconnected. FFmpeg, FFprobe and the whisper.cpp runtime are bundled with the application
and are never downloaded.

## What is stored on disk

Under your user data directory:

- project files, wherever you choose to save them
- managed project data: previews, transcripts, speaker analysis, semantic caches, snapshots
- installed models
- recovery journals and autosave state
- diagnostic logs

Nothing in these locations is transmitted. You can inspect and delete them.

## What AutoCut Studio does not do

- It does not phone home, check for updates, or report usage.
- It does not upload footage, audio, transcripts, or project data.
- It does not identify people. Speaker diarization produces anonymous labels such as "Speaker 1";
  it does not know who anyone is and builds no reusable voice profile.

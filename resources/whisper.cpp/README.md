# whisper.cpp runtime

AutoCut Studio bundles the official Linux x86-64 CPU runtime from whisper.cpp v1.9.1.

- Source: https://github.com/ggml-org/whisper.cpp
- Release artifact: `whisper-bin-ubuntu-x64.tar.gz`
- Artifact SHA-256: `f3bf3b4369a99b54665b0f19b88483b30de27f25963b0414235dea03198515c5`
- License: see `LICENSE` in this directory

Speech models are intentionally not bundled. The application installs explicitly selected GGML models into its managed application-data storage.

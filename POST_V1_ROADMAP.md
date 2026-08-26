# Post-v1.0 Roadmap

Work deliberately deferred out of the v1.0 release. Items are recorded here rather than being
built during a feature freeze.

The largest entries are not new ideas — they are milestones that were planned, approved and then
merged incomplete. Phase 10 and Phase 11 each shipped Milestone 1 of 5.

## Automatic edit quality (Phase 11 M2–M5)

The single biggest gap between the product goal and the product. Planned and specified, not built:

- **Opening/hook selection** — scoring candidate openings and vetoing black lead-ins, camera-setup
  movement, severe blur and mid-sentence starts.
- **Whole-video pacing** — a pacing curve across opening/buildup/middle/peak/ending, replacing the
  current uniform equal-share duration allocation.
- **Music energy analysis** — an energy profile over the soundtrack so pacing can follow it.
- **Shot diversity** — cross-clip similarity so near-duplicate shots are not placed consecutively.
- **Intelligent transitions** — per-boundary type selection with a frequency budget, instead of one
  transition applied everywhere.
- **Ending selection** — choosing a deliberate final shot and coordinating it with the music.
- **Auto motion** — subtle Ken-Burns movement on static footage.
- **Visual consistency** — conservative brightness/contrast normalisation between clips.
- **Multi-version generation, ranking and Recommended** — genuinely different automatic edits.
- **Automatic quality review** — pre-preview checks with auto-fixes.

## Production workflow (Phase 10 M2–M5)

- Media fingerprinting and relink; portable project export/import
- Proxy media for high-resolution footage
- Hardware encoder detection with CPU fallback
- Render queue, interrupted-job recovery, checkpoint reuse
- Project templates and export recipes
- Storage manager and orphan cleanup
- Project locking and read-only mode
- Undo/redo
- Background job centre
- Update service and About screen

## In-app learning (Phase 12)

Specified in `docs/phase-12-requirements.md`, not implemented: Tutorial Center, Quick Tour,
interactive walkthroughs, contextual help, tutorial search, Help menu, and the written
`USER_GUIDE.md` / `TROUBLESHOOTING.md`.

## Platform support

- ARM64 Linux: build is configured but has never been runtime tested.
- Windows and macOS: not supported.

## Smaller items

- Global keyboard shortcuts (none exist today) and a shortcut reference.
- Focus management: no focus trap, no Escape-to-close on any dialog.
- Application branding: the default Electron icon is currently shipped.
- Multiple cuts per source clip — the planner is fixed at one segment per clip.
- Playwright regression suite in CI (currently typecheck, unit tests and build only).

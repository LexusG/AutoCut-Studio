# Technical Debt

Known structural problems, recorded so they are chosen rather than rediscovered.

## Planner and allocator

- **Duration decisions live in four places that must agree**: `paceRanges`, the seed durations and
  `distribute()` in `segment-allocator.ts`, plus a second, pace-agnostic equal-share allocator
  `rebalancePlan()` in `shared/utils/edit-plan.ts`. Any pacing change must touch all four or they
  will fight each other.
- **One segment per source clip.** `buildRenderPlan` maps clips to segments 1:1 and
  `preserveLockedSegments` keys locked segments by `sourcePath`. Supporting multiple cuts per clip
  breaks both, plus the analysis cache key.
- **`arrangeSources` is content-blind** — orientation, then has-audio, then longest-first. There is
  no content or narrative ordering.

## Renderer state

- `AppState` is a single flat object of ~80 fields with no slices. Adding a field means remembering
  three places: the `startProject` reset, the `loadProject` hydration and `markProjectSaved`.
  Forgetting one leaks state across projects.
- Preview retention is duplicated: `pruneManagedPreviews` in main and a hard-coded limit of 10 in
  `use-video-render.ts` that ignores `DEFAULT_PREVIEW_RETENTION`.

## Accessibility and UI

- **No focus management anywhere**: no focus trap, no `autoFocus`, no `tabIndex`, and no
  Escape-to-close on any of the five dialogs.
- **Duplicate accessible names.** "Generate Preview" exists in both the editor header and the Edit
  Plan footer; the Local AI gear button appears on two screens. The Content button's visible label
  is `Content` while its `aria-label` is `Transcript`. This already broke the e2e suite once.
- The global focus-visible rule covers `button`, `video` and `summary` but not `input`, `select`
  or `a`.

## Testing

- **Playwright is not in CI.** Only typecheck, unit tests and build run. Two classes of e2e
  breakage went unnoticed as a result: a selector made ambiguous by the Save Project As button
  added in Phase 10, and schema-version assertions pinned to `version: 8`.
- Vitest runs `environment: 'node'` with no jsdom or testing-library, so React components cannot be
  rendered in unit tests.
- Hard-coding schema versions in assertions has now caused breakage twice. New assertions should
  derive from `PROJECT_SCHEMA_VERSION`.

## Declared but unimplemented types

`VariantPreviewQueueItem` and `VariantBatchRequest` are declared in `shared/types/semantic.ts` with
no implementation. `VersionsPanel` re-implements queue state locally instead, including a two-pass
loop that reads a stale snapshot taken before its first `await`.

## Packaging

- `desktopName` is not set, so desktop environments may not associate windows with the `.desktop`
  entry.
- No application icon is configured; the default Electron icon ships.

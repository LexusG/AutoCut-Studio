# Phase 12 — Release Hardening & In-App Learning

Status: **specification**. Nothing in this document is implemented yet.

Phase 12 is the final phase before the v1.0 release. It has two concerns:

1. **Release hardening** — to be specified separately.
2. **In-app tutorial and guided learning system** — fully specified below.

The guiding requirement for part 2 is:

> A completely new user should be able to learn how to use every major AutoCut Studio feature
> without leaving the application.

The v1.0 release should not require users to search external documentation just to understand the
normal AutoCut Studio workflow.

---

## 1. Entry conditions

This section exists because a large share of the tutorial catalogue below describes features that
have not been built. Phase 10 and Phase 11 were each merged with **Milestone 1 of 5** complete.

Phase 12 tutorial work may begin immediately for topics marked **Ready** in
[the readiness matrix](#3-readiness-matrix). Topics marked **Blocked** cannot be authored — there
is nothing to point the walkthrough at — and their completion criteria cannot honestly be reported
as met until the named milestone lands.

Prerequisite milestones, by what they unblock:

| Prerequisite | Unblocks |
| --- | --- |
| Phase 11 M5 — multi-version generation, ranking, Auto workflow | Quick Tour (partly), Automatic Versions, Choosing a Version, Getting Started (partly) |
| Phase 10 M2 — fingerprinting, relink, portable projects | Portable Projects, Missing Media / Relink, Importing Media (partly) |
| Phase 10 M3 — proxy media | Proxy Media, Importing Media (partly) |
| Phase 10 M4 — render queue | Render Queue |
| Phase 10 M5 — templates, export recipes, storage manager | Project Templates, Export Recipes, Storage Management (partly) |
| New work in Phase 12 — global keyboard shortcuts | Keyboard Shortcuts reference |

---

## 2. Requirements

### 2.1 Primary entry point

A major application section named **Tutorials** (or **Learn AutoCut Studio**), reachable from:

- the Home screen
- the Help menu
- the Settings / Help area
- contextual help buttons where appropriate

The tutorial system must **not** be mandatory on every application start.

### 2.2 Tutorial Home

A dedicated tutorial browser, organised into categories:

Getting Started · Auto Editing · Importing Media · Platforms & Presets · Edit Styles ·
Music & Audio · Captions · Transcription · Smart Editing · Edit Plan · Manual Adjustments ·
Preview & Versions · Exporting · Projects & Backups · Advanced Features · Troubleshooting

At the top, prominently:

> **Start Here — Make Your First Video**

covering the complete basic workflow: create a project, import clips, choose a platform, choose
Auto or an Edit Style, add music if desired, generate versions, preview results, select a
favourite, export. This tutorial must emphasise that **most users do not need to manually edit the
timeline or touch advanced settings**.

### 2.3 Interactive walkthroughs

A walkthrough must be able to highlight a UI element, dim unrelated areas, and display a short
explanation, with **Next**, **Back**, **Skip Tutorial** and **Finish** controls.

```
Step 1 of 6
"Add your video clips here."          -> highlights: add-media
"Choose where you want to post."      -> highlights: platform-selector
```

Walkthroughs must guide users through the **real application UI**. Do not build fake screenshots
of controls that can be highlighted directly.

### 2.4 Walkthrough engine

Reusable architecture: `TutorialDefinition`, `TutorialStep`, `TutorialManager`, `TutorialProgress`.

A step may contain: `id`, `title`, `description`, target UI element, screen/page, preferred
placement, optional action requirement, optional completion condition.

**Step types**, at minimum:

| Type | Behaviour |
| --- | --- |
| Highlight | Highlight a specific control |
| Information | Explain a concept, no interaction required |
| Action | Wait for the user to do something ("Import at least one video") |
| Navigation | Guide the user to another screen |
| Completion | Show that the tutorial is finished |

**Action-based steps** may observe real actions — for example, keeping **Next** disabled until at
least one video is imported. This must not be forced on every step; instructional steps remain
valid.

### 2.5 Stable UI targets

Tutorials must not be coupled to fragile CSS selectors. Important components carry a stable
identifier (`data-tutorial-id` or equivalent). Example targets:

`add-media` · `platform-selector` · `edit-style-selector` · `music-panel` · `generate-button` ·
`preview-version-card` · `export-button`

### 2.6 Progress, resume and reset

Persist per-tutorial progress as **Not Started / In Progress / Completed**. Progress is local
application state; do not store excessive analytics.

- Closing a tutorial halfway offers **Resume Tutorial** and **Start Over**.
- **Settings → Tutorials** provides **Reset Tutorial Progress**, which must not touch project data.

### 2.7 Never block the application

Tutorial overlays must never trap the user in an unusable state. **Skip** and **Close** are always
available.

### 2.8 First run and Quick Tour

On first launch, after runtime setup, offer *"Would you like a quick tour?"* with **Start Quick
Tour** and **Maybe Later**. Never forced.

The Quick Tour is short — approximately **5–8 steps** — covering only Home, New Auto Edit, Import
Clips, Platform, Style, Generate, Versions, Export. It must not attempt to explain advanced
features.

### 2.9 Tutorial catalogue

Individual tutorials stay focused: prefer **3–10 steps** over one 70-step tutorial, splitting
complex subjects into several tutorials.

1. **Getting Started** — Create Your First Auto Edit: project, import, platform, style, generate, preview, export.
2. **Importing Media** — supported files, drag and drop, Add Clips, clip cards, removing, reordering, missing files, relinking, proxy media where relevant.
3. **Platform Presets** — Instagram Reel / Story / Feed, YouTube, YouTube Shorts, LinkedIn, Custom. Explain that presets configure resolution, aspect ratio and FPS. Do not overwhelm with codec detail.
4. **Edit Styles** — Auto, Clean, Social Fast, Cinematic, Energetic, Story, in plain language. *"Social Fast: faster cuts, punchier pacing and stronger music synchronization."*
5. **Use Every Clip** — *"When enabled, every imported clip will appear somewhere in the finished video."* Explain possible target-duration conflicts.
6. **Target Duration** — Auto, 15s, 30s, 60s, Custom; how shorter targets require faster edits.
7. **Music & Audio** — add music, multiple tracks, volume, original audio, ducking, normalization, fades, looping.
8. **Smart Editing** — Smart Selection analyses clips to choose stronger sections: visual quality, motion, person presence, speech, semantic relevance. Avoid unnecessary ML terminology.
9. **Edit Goal** — e.g. *"Focus on the finished product."* Explain that the goal prioritises relevant spoken content.
10. **Edit Plan** — selected segments, why a section was selected, Adjust Segment, Try Another Section, Lock Segment, Reorder, Rebalance Duration.
11. **Person & Subject Tracking** — Smart Subject Crop and how it keeps people visible when converting landscape footage to vertical.
12. **Speech-Aware Editing** — Speech Cut Protection and how AutoCut Studio avoids cutting mid-sentence.
13. **Beat-Aware Editing** — Natural, Beat Assisted, Beat Strong. Make clear Beat Assisted does **not** mean cutting on every beat.
14. **Transcription** — local transcription, model quality options, transcribe selected/all, transcript review, search, word correction, Confidence Review.
15. **Speaker Detection** — Speaker 1/2, rename, merge, filter. Make clear AutoCut Studio does **not** know a person's identity automatically.
16. **Captions** — generate, standard subtitles, dynamic social captions, templates, speaker names, word highlighting, safe areas, burned-in, SRT, WebVTT.
17. **Text-Based Editing** — Remove From Edit, Restore, find fillers, shorten pauses, Find Related Sections, Create Edit From Results.
18. **Semantic Search** — searching *"problems with installation"* can find related transcript sections even when those exact words were not spoken. Do not describe it as magical or perfect.
19. **Topics & Highlights** — Topics, Find Highlights, Highlight Reel, Prioritize This, Avoid This Section, Semantic Collections.
20. **Automatic Versions** — Generate 1 / 3 / 5, and how versions differ by opening, pacing, segment selection and structure.
21. **Choosing a Version** — Recommended, Favorite, Preview, Make Another Like This, Keep Opening, Keep Ending, Regenerate Rest.
22. **Preview History** — preview versions, Current, Outdated, Approved, Pinned, delete, persistent preview storage.
23. **Exporting** — Approve & Export, destination, filename, resolution, platform output, subtitle options, output verification.
24. **Output Variants** — Create Versions / Repurpose for Instagram Reel, YouTube Short, LinkedIn, sharing the same source media.
25. **Project Save & Recovery** — autosave, project snapshots, crash recovery, backups, Project History.
26. **Portable Projects** — Project Only, Project + Used Media, Complete Project, Import Portable Project.
27. **Missing Media** — missing source, Relink Media, Relink Folder, Exact / Likely / Possible match.
28. **Proxy Media** — what it is, when it is used, and that **final exports still use original footage**.
29. **Render Queue** — Queued, Rendering, Completed, Failed, Retry, Cancel, Pause Queue.
30. **Local AI & Processing** — installed models, model storage, runtime status, diagnostics. Use plain language: *"Transcription Model — used to convert speech into text."*
31. **Storage Management** — models, proxies, preview history, analysis cache, temporary files, safe cleanup. Warn that source footage is not treated as cache.
32. **Project Templates** — Start From Template, Save Current Settings as Template.
33. **Export Recipes** — reusable export configuration.
34. **Keyboard Shortcuts** — a searchable shortcut reference.
35. **Troubleshooting** — video won't import, model missing, rendering failed, export has no audio, project source moved, slow processing, insufficient disk space, hardware encoder unavailable.

### 2.10 Search

**Search Tutorials** by feature name, action, or problem — e.g. `captions`, `vertical video`,
`music too loud`, `missing file`, `Instagram`.

### 2.11 Contextual help

Small help buttons beside controls, e.g. `Editing Pace [?]`, opening a short explanation. Users
must not be forced into the full tutorial browser for every question.

Some popovers may offer **Learn More** or **Start Tutorial**:

> **Smart Subject Crop [?]** — "Automatically adjusts crop position to keep important subjects
> visible." → *Start Tutorial*

### 2.12 Help menu

Quick Tour · Tutorials · Keyboard Shortcuts · User Guide · Troubleshooting · Diagnostics ·
About AutoCut Studio

### 2.13 Completion screen

On completion show **Tutorial Complete**, optionally offering **Try It Now**, **Next Recommended
Tutorial**, and **Back to Tutorials**. No excessive celebration UI.

### 2.14 Recommended learning path

Tutorial Home recommends progression:

- **Beginner** — Make Your First Video · Add Music · Understand Versions · Export
- **Intermediate** — Captions · Smart Editing · Edit Plan · Highlights
- **Advanced** — Transcript Editing · Semantic Search · Speaker Detection · Output Variants · Project Portability

### 2.15 Demo media

Tutorials must work **without** bundled copyrighted footage. Action-based tutorials use the user's
own project where appropriate. A small legally-owned sample project may be added later; it is not
a Phase 12 blocker.

### 2.16 Versioning and graceful failure

Each tutorial carries a tutorial version, a minimum application version, and its target
identifiers. When a target control no longer exists the tutorial must **fail gracefully** and must
never crash the application.

### 2.17 Validation

Development-time validation must ensure tutorial target identifiers actually exist. If a tutorial
references `platform-selector` and no component provides it, the build or test suite must warn or
fail appropriately.

### 2.18 Responsive overlays

Overlays must work on small laptop windows, large desktops and under different display scaling.
Tooltips must never be positioned off-screen.

### 2.19 Accessibility

Keyboard navigation, visible focus, Escape to close, and screen-reader labels where practical.
Highlighting must not rely on colour alone.

### 2.20 Isolation from project state

Tutorial state must **not** affect the project, the RenderPlan, or the output. Changing tutorial
progress must never invalidate a preview, a render, or a project.

### 2.21 No analytics

Do not add cloud analytics to track tutorial completion. Progress stays local.

### 2.22 Documentation integration

The in-app tutorial complements `USER_GUIDE.md` and `TROUBLESHOOTING.md` rather than replacing
them. Where appropriate, reuse content structures to avoid conflicting instructions.

Neither file exists today. Phase 12 creates both, generated from or validated against the same
tutorial catalogue so the three cannot drift into contradicting each other.

---

## 3. Readiness matrix

Verified against the tree on 2026-08-25.

| # | Tutorial | Status | Blocking prerequisite |
| --- | --- | --- | --- |
| 1 | Getting Started | Partial | P11 M5 for the Auto workflow and versions steps |
| 2 | Importing Media | Partial | P10 M2 (relink), P10 M3 (proxy) |
| 3 | Platform Presets | **Ready** | — |
| 4 | Edit Styles | **Ready** | — |
| 5 | Use Every Clip | **Ready** | — |
| 6 | Target Duration | **Ready** | — |
| 7 | Music & Audio | **Ready** | — |
| 8 | Smart Editing | **Ready** | — |
| 9 | Edit Goal | **Ready** | — |
| 10 | Edit Plan | **Ready** | — |
| 11 | Person & Subject Tracking | **Ready** | — |
| 12 | Speech-Aware Editing | **Ready** | — |
| 13 | Beat-Aware Editing | **Ready** | — |
| 14 | Transcription | **Ready** | — |
| 15 | Speaker Detection | **Ready** | — |
| 16 | Captions | **Ready** | — |
| 17 | Text-Based Editing | **Ready** | — |
| 18 | Semantic Search | **Ready** | — |
| 19 | Topics & Highlights | **Ready** | — |
| 20 | Automatic Versions | **Blocked** | P11 M5 |
| 21 | Choosing a Version | **Blocked** | P11 M5 |
| 22 | Preview History | **Ready** | — |
| 23 | Exporting | **Ready** | — |
| 24 | Output Variants | **Ready** | — |
| 25 | Project Save & Recovery | Partial | Backups are not implemented; autosave, snapshots and recovery are |
| 26 | Portable Projects | **Blocked** | P10 M2 |
| 27 | Missing Media / Relink | **Blocked** | P10 M2 |
| 28 | Proxy Media | **Blocked** | P10 M3 |
| 29 | Render Queue | **Blocked** | P10 M4 |
| 30 | Local AI & Processing | **Ready** | — |
| 31 | Storage Management | Partial | P10 M5; only preview storage exists today |
| 32 | Project Templates | **Blocked** | P10 M5 |
| 33 | Export Recipes | **Blocked** | P10 M5 |
| 34 | Keyboard Shortcuts | **Blocked** | No global shortcuts exist; Phase 12 must add them first |
| 35 | Troubleshooting | Partial | Several scenarios reference unbuilt features (hardware encoder, disk space, moved sources) |

**The Quick Tour is itself partially blocked.** Its required steps include *New Auto Edit*,
*Generate* and *Versions*, all of which are Phase 11 Milestone 5.

---

## 4. Architecture notes

Grounded in the codebase as it stands. These are constraints discovered by inspection, not
suggestions.

### 4.1 Overlay layering

The existing z-index ladder, from `src/renderer/styles.css`:

```
 40  .edit-plan-overlay        inset: 64px 0 0
 45  .transcript-overlay       inset: 64px 0 0
 60  .system-overlay           inset: 0
 80  .recovery-overlay         inset: 0
100  .render-overlay           inset: 0     <- current ceiling
```

A tutorial coach-mark needs to sit above these; `120` is the natural next band.

Two overlays start at `top: 64px`, deliberately leaving the editor header visible — and **most
tutorial targets live in that header** (Create Edit Plan, Generate Preview, Save Project, Content).
A full-viewport scrim at `inset: 0` will cover them, so the spotlight must be a genuine cut-out
rather than a lower z-index.

The specification must decide explicitly whether the tutorial **yields to** blocking dialogs
(render progress, crash recovery) or sits above them. Sitting above a render-progress dialog while
a render is running would be actively misleading.

### 4.2 Focus management does not exist yet

There is **no focus trap, no `autoFocus`, no imperative `.focus()` call, no `tabIndex`, and no
Escape handling on any of the five existing dialogs**. The only keyboard handlers in the renderer
are three field-level ones (filename commit, vocabulary entry, transcript word edit).

Requirements 2.19 and completion criteria 33–34 therefore **introduce** focus management to this
codebase; there is no helper to reuse. Phase 12 should decide deliberately whether it also
retrofits Escape-to-close onto the five existing dialogs — a small, high-value side benefit — or
scopes the work to the tutorial overlay alone.

A single global focus-visible rule already exists, covering `button`, `video` and `summary` but
**not** `input`, `select` or `a`. Extending it is part of the accessibility requirement.

### 4.3 Stable target identifiers

There are **no `data-*` attributes in the renderer today** except `data-aspect-ratio`, and no
`data-testid` anywhere. The e2e suite selects entirely by accessible name and className.
Introducing `data-tutorial-id` makes it the first non-semantic hook attribute in the codebase — a
deliberate new convention that should be stated as such, including whether e2e should begin
preferring it over classNames.

It is justified, because name-based targeting is already ambiguous:

- **"Generate Preview" exists twice** — the editor header and the Edit Plan footer.
- The **Local AI gear button** appears on both Home and Editor with the same accessible name.
- The **Content button**'s visible text is `Content` while its `aria-label` is `Transcript`. The
  spec must pick one deliberately; today they disagree.

### 4.4 Conditional-rendering traps

Many targets are absent from the DOM until a precondition holds. Every step needs either a stated
precondition or defined skip-if-absent semantics:

| Target | Requires |
| --- | --- |
| Review Plan | an edit plan exists |
| Transition duration | `transitionPreference !== 'none'` |
| Analysis quality, Advanced Smart Settings | `selectionMode === 'smart'` |
| Crop focus | `fitMode === 'crop'` |
| Custom target duration input | `targetDuration.mode === 'custom'` |
| Speech cut protection | `contentAwareness !== 'off'` |
| Preview History panel | at least one preview exists |
| Project History, Preview Storage | inside collapsed `<details>` — the body is not visible until opened |
| Review screen | a preview result exists |

### 4.5 Progress persistence

The renderer **never touches disk**: no `localStorage`, no `node:fs`, `nodeIntegration` off, CSP
`default-src 'self'`. Every persistence path goes through `window.autoCut.*`.

Tutorial progress must therefore follow the established preference pattern — see
`src/main/services/runtime/processing-preferences.ts`:

```
renderer -> window.autoCut.* -> ipcRenderer.invoke
         -> ipcMain.handle (inline validation)
         -> main-process module holding an in-memory value
         -> writeFileAtomic(<userData>/storage/settings/tutorial-progress.json)
```

New channels: `tutorial:get-progress`, `tutorial:set-progress`, `tutorial:reset`. Writes use
`writeFileAtomic` with `{ mode: 0o600 }` and trailing-newline `JSON.stringify(value, null, 2)`,
consistent with the other two preference files.

### 4.6 Tutorial state must not live on the project store

Requirement 2.20 is enforceable only by keeping tutorial state out of `AppState`:

- `startProject()` wipes roughly 45 fields — tutorial progress on the store would be lost on New Project.
- `currentProjectFile()` serialises the store into `.autocut.json` — tutorial state would leak into saved projects.
- Any store write setting `projectDirty: true` triggers autosave and bumps `projectRevision`.

A dedicated `src/renderer/stores/tutorial-store.ts`, reading and writing only via IPC, is the clean
split.

### 4.7 Navigation

Tutorials drive screens through existing store actions: `startProject`, `returnHome`, `backToEdit`,
`showReview`, `showEditPlan` / `hideEditPlan`. Two hazards:

- `showReview()` and `showEditPlan()` **silently no-op** when their precondition is unmet.
- `startProject()` **destroys the current project**. A tutorial must never call it unprompted.

The `Screen` union in `app-store.ts` is currently **not exported** and will need to be, so steps
can be typed against it.

### 4.8 Help menu

`Menu.setApplicationMenu` is never called — there is no application menu at all. The Help menu is
greenfield work in `src/main/index.ts`.

### 4.9 Keyboard shortcuts

No global keyboard shortcuts exist. Tutorial 34 has nothing to document until Phase 12 adds them,
which is new scope rather than documentation of existing behaviour.

---

## 5. Validation strategy

`vitest.config.ts` runs `environment: 'node'` with `include: ['tests/**/*.test.ts']`. There is no
jsdom, no happy-dom, no testing-library, no `@renderer` alias, and `.tsx` is not matched. Component
rendering tests are **not possible today** without new dependencies and config changes.

Requirement 2.17 is therefore met with three complementary layers:

1. **Static scan test** (primary, zero new dependencies). `tests/phase12-tutorial-targets.test.ts`
   reads component sources with `node:fs` and asserts every id in a shared `TUTORIAL_TARGETS`
   registry appears in its expected file. This fits existing conventions exactly and catches the
   real failure mode — a renamed or deleted target.
2. **Pure-logic unit tests.** Step ordering, precondition predicates, progress serialisation and
   migration, and the next/back/skip reducers are plain TypeScript and unit-testable directly, in
   the same style as `tests/phase11-edit-styles.test.ts`.
3. **Playwright spec** for live-DOM behaviour — `e2e/phase12.smoke.spec.ts` walking the Quick Tour
   in the real application. Note Playwright is **not** currently run in CI.

---

## 6. Shared catalogue

A single catalogue — `id`, `title`, `category`, `order` — is the source for:

- the in-app tutorial list,
- the `USER_GUIDE.md` section structure,
- the `TROUBLESHOOTING.md` entries.

A test asserts every catalogue entry has both a tutorial definition and a guide section. This is
what prevents the in-app guidance and the written documentation from contradicting each other as
the application changes.

---

## 7. Completion criteria

Phase 12 v1.0 is not complete until all of the following hold. Criteria whose subject does not yet
exist are annotated; they must not be reported as met while blocked.

| # | Criterion | Prerequisite |
| --- | --- | --- |
| 1 | Tutorials section exists | — |
| 2 | Quick Tour exists | P11 M5 for its Auto/versions steps |
| 3 | First-run tutorial offer exists | — |
| 4 | Tutorial can be skipped | — |
| 5 | Tutorial progress persists | — |
| 6 | Tutorial can resume | — |
| 7 | Tutorial can restart | — |
| 8 | Interactive highlighting works | — |
| 9 | Stable tutorial target IDs are used | — |
| 10 | Tutorial overlay works across major screens | — |
| 11 | Getting Started tutorial exists | P11 M5 (partly) |
| 12 | Import tutorial exists | P10 M2/M3 (partly) |
| 13 | Platform preset tutorial exists | — |
| 14 | Edit Style tutorial exists | — |
| 15 | Music tutorial exists | — |
| 16 | Smart Editing tutorial exists | — |
| 17 | Edit Plan tutorial exists | — |
| 18 | Transcription tutorial exists | — |
| 19 | Caption tutorial exists | — |
| 20 | Semantic Search tutorial exists | — |
| 21 | Highlights tutorial exists | — |
| 22 | Automatic Versions tutorial exists | **P11 M5** |
| 23 | Preview/approval tutorial exists | — |
| 24 | Export tutorial exists | — |
| 25 | Project recovery tutorial exists | — |
| 26 | Portable Project tutorial exists | **P10 M2** |
| 27 | Relink Media tutorial exists | **P10 M2** |
| 28 | Local AI & Processing tutorial exists | — |
| 29 | Storage tutorial exists | P10 M5 (partly) |
| 30 | Troubleshooting tutorials exist | partly blocked |
| 31 | Tutorial search works | — |
| 32 | Contextual help works | — |
| 33 | Keyboard navigation works | new focus management |
| 34 | Escape closes tutorial | new focus management |
| 35 | Tutorials do not modify project output state | — |
| 36 | Broken tutorial targets fail safely | — |
| 37 | Tutorial target validation tests exist | — |
| 38 | Production AppImage tutorials work | — |
| 39 | Production deb tutorials work | — |
| 40 | First-time tester can complete the core Auto Edit workflow primarily using in-app guidance | **P11 M5** |

### Addition to the main Phase 12 completion list

> Complete in-app Tutorial Center, Quick Tour, contextual help, and interactive walkthroughs are
> implemented and verified in packaged builds.

---

## 8. Release acceptance test

Before v1.0, give the packaged application to a tester who has not followed development. Without
external instructions, ask them to:

1. Find the tutorial.
2. Complete the Quick Tour.
3. Import several clips.
4. Choose Instagram Reel.
5. Choose Auto or Social Fast.
6. Add music.
7. Generate versions.
8. Preview them.
9. Choose one.
10. Export.

Observe where they become confused and fix repeated onboarding problems.

This test can only be run once the Auto workflow and multi-version generation exist (Phase 11 M5).
Steps 1–6 and 10 are exercisable today; steps 7–9 are not.

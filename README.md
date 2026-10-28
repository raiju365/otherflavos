# Personal web portfolio

Root: **D:\portofolio-web**. A wide editorial portfolio with a stationary identity rail, a scrolling work pane, centered Now/Projects/About tabs, and prominent project screenshots. The current Sybiosme-inspired studio theme combines mineral/charcoal grounds, orange accents, a slowly flowing grain-textured identity background, an animated ASCII portrait and close-set Overused Grotesk type. The initial compact reference was superseded by the user's layout feedback. Research and design rationale are in `DESIGN-RESEARCH.md`.

Now presents a large selected project title, a main preview and a keyboard-accessible project index. Its two opening actions follow the selected project into the existing detail dialog. The profile is a fine point-character print of the original portrait with no photographic underlay. Eight source samples map to each point-character pattern, with error diffusion preserving facial detail instead of collapsing a whole patch into an alphabetic glyph. The cached characters use four irregular round-dot geometries and tiny fixed cell offsets to break long aligned rows. Antialias filtering handles fractional tile placement without nearest-neighbour stripe artifacts; all point positions stay fixed during the rhythm. At a 200px profile, 60x38 characters read 120x152 source details. The gradient and point-character rhythm continue while the theme menu is open; selecting a theme recolors the print without restarting its clock. The rail gradient and grain also continue through tab transitions and the Projects entrance, without restarting their field clock. The anchored 72 BPM rhythm changes small point patterns; shared facial points remain fully inked through transitions. Dark ink prints on a light paper ground tinted for each theme. Square corners, the full lower crop and existing visibility/reduced-motion gates remain. Run `node scripts/check-now-showcase.mjs` and `node scripts/check-portrait-ascii.mjs` for deterministic checks; their generated reports go into the ignored `artifacts/` directory. These checks do not establish browser visual acceptance or physical-device FPS.

Projects now reveals its curved cards during the incoming tab transition, with the lead project appearing first and a gently settling shared-cylinder motion (720ms compact / 900ms desktop). Real visible-image readiness starts the finite entrance, so a cold image cannot spend the whole animation while absent; unseen rear images do not delay it. Hidden/dialog suspension retains progress, while rapid navigation clears obsolete entrances. Run `node scripts/check-gallery-arrival.mjs` for 35 deterministic entrance/readiness/lifecycle checks; native browser appearance is separate from these fixtures.

Entry uses continuous asset-linked 0-100 numerals. The last 99 -> 100 is one centered 380ms whole-word carry with restrained rolling depth. During the existing 220ms confirmation, the real 100 row lands with a small squash/rebound and returns to its exact flat pose. The intact number then departs into the current curved page reveal. Cached rows and the existing counter/native animation owners handle the sequence; reduced motion opens the prepared content directly. Run `node scripts/check-entry-loader.mjs` for 57 counter/numeral/readiness/lifecycle fixture checks. Physical-device appearance/performance remains separate from these checks.

## Run locally

```powershell
cd D:\portofolio-web
npm install
npm run dev
```

Open **http://127.0.0.1:5175/** and keep the server terminal open. No backend is required.

```powershell
npm run check
npm run build
npm run preview
```

Production output: `D:\portofolio-web\dist`. Build preview: http://127.0.0.1:4175/.

## GitHub and Vercel

Mobile reel checks: `node scripts/check-mobile-reel.mjs`. Touch-capture regression check: `node scripts/check-gallery-touch.mjs`. This exercises implicit child-capture transfer, vertical continuation, rejected horizontal input, reversal, true capture loss, tap opening and drag-click suppression in the actual gallery controller. It is a deterministic event fixture, not a physical-phone test.

Repository: https://github.com/raiju365/otherflavos. The working source stays in `D:\portofolio-web`.

Import this repository in Vercel with the repository root as the Root Directory and `main` as the Production Branch. `vercel.json` selects Vite, runs `npm run check && npm run build`, and publishes `dist`. Use Node.js 24.x, matching the locally validated build runtime.

After the Vercel Git integration is connected and automatic deployments are enabled, pushes to `main` trigger production deployments. Other branches can produce preview deployments for review before merging. A successful GitHub push alone does not confirm that Vercel is connected or that a deployment has succeeded.

Commit source, public assets, scripts, documentation and `package-lock.json`. Dependencies, generated build output, local QA artifacts, Vercel account metadata, environment files and logs are excluded by `.gitignore`.

## Add your information

All identity, introduction, current activity, about text, contacts, and project content are in **`src/data.js`**.

- Identity and social URLs already contain the current user data. Replace current activity with confirmed information when ready.
- About currently uses user-approved dummy copy: replace `profile.aboutStatement` and the `profile.about` paragraphs, then set `profile.aboutIsDraft` to `false` to hide the dummy label.
- Set email and social URLs. A `null` URL is shown as unavailable and does not create a fake link.
- Replace each project's name, description, role, technology, and decision. Put actual screenshots in `public/projects/` and update `image` and `alt`.
- Set `liveUrl` and `sourceUrl` to valid HTTP(S) links, or leave them `null`.
- Change a project's `status` from `placeholder` to `published` when it represents actual work.
- About statement and paragraphs are rendered as escaped plain text.

The initial project previews are explicitly labeled placeholders. They do not represent the user's actual work. No identity, contact information, project, date, or achievement belonging to the reference creator is used as the user's own.

## Current studio design

### Current performance behavior

Theme colors commit immediately with no View Transition capture or full-screen mask. A single constant 16px glass material remains visible throughout the exact 56px-circle to 240px-panel morph and its reverse. src/theme-panel-motion.js coordinates the rounded mask, one matching rim, icons and X fill on a single 480ms non-bouncy spring clock. Retargeting carries the presented position and velocity; repeated input never queues. Surface/menu opacity stays 1 and labels keep their real size. Only the resting circle compresses on press; the expanded body stays fixed. Native completion hides closing content and releases the decorative pause, with stale completions guarded. No frame loop, animated blur or panel layout resize. Reduced motion, visibility, resize, API failure and abort settle directly. Four choices, focus, persistent preview and storage remain intact. Project swipes and wheel scrolling continue behind the open glass. Outside dismissal waits for a completed stationary tap, while swipes, cancellation and scrolling keep the panel open. The gallery stays input-driven; decorative rail/portrait work remains paused. This web adaptation does not establish exact native iOS fidelity or physical-phone frame rates.

The popup pairs translucent tint and brightness control with full-opacity text. Reflections and one directional rim define the surface. Unsupported backdrop filters, reduced transparency and higher contrast use solid fallback colors; forced colors uses system foregrounds. Bright project media behind the popup must not wash out labels.

References: [Apple Materials](https://developer.apple.com/design/human-interface-guidelines/materials) and the [Meet Liquid Glass transcript](https://developer.apple.com/videos/play/wwdc2025/219/) describe scattering, adaptation for legibility and a button opening into a menu. These principles inform the CSS material and source-to-menu shape; the timings are authored, and the implementation does not reproduce Apple's native lensing engine. Reference evidence here is documentation/transcript, not measured native iPhone motion.

The decorative flow and portrait pause while the theme menu, gallery motion or section transitions need the frame budget. The portrait has no idle repaint loop; pointer motion is finite. The blurred flow uses 144x96 pixels instead of 240x160 (64% fewer pixels), and separable row/column bending preserves the original formula without per-pixel array allocation. Mobile gallery output uses a capped 1.25 device pixel ratio, while desktop retains 1.75. Paragraphs reveal as blocks; display headings retain word motion.

Validation commands: `node scripts/check-theme-panel-motion.mjs` (20 continuity/lifecycle checks), `node scripts/check-theme-performance.mjs` (54 interaction checks), `node scripts/check-gallery-touch.mjs`, `node scripts/check-mobile-reel.mjs`, `npm run check`, `npm run build`. `node scripts/benchmark-rail-flow.mjs` measures CPU raster work in Node, not browser FPS or performance on a physical phone. In the local before/after sample, median raster time fell from 13.7ms to 3.3ms; optimized full-size buffers matched the prior buffers byte for byte across 28 sampled phases. These are local measurements, not a promise of a particular device frame rate.

On mobile (up to 800px), Now and Projects share the same prominent profile: a centered portrait/name on narrow portrait screens and a horizontal profile on wider/landscape screens. About uses available height for a larger horizontal portrait and name on taller screens; short screens keep the compact fit. Its complete biography/socials retain one-screen sizing. One finite native header transition connects photo, actual text position/scale and header height when sections change; identical Now/Projects geometry needs no resize animation. Reduced motion, desktop, entry, resize, visibility/pagehide and abort retain static layout ownership. Now scrolls naturally. Projects fills the remaining height with its vertical reel, and About socials follow the copy with room above the fixed theme button. Run node scripts/check-mobile-header-motion.mjs for 14 geometry/lifecycle fixture checks; browser rendering is a separate validation.

The active theme adapts [Sybiosme](https://www.sybiosme.com/en) through palette, close grotesk type, a monochrome studio portrait, restrained rounded media and coordinated reveal motion. The identity rail now uses the user's supplied Untitled blend: WHITE GREY / WHITE GREY / MOON HAZE / INK BLACK / BLACK, with soften 13, noise 64 and speed 10. Only the FLOW formula and original mesh are adapted from the supplied engine, with no React dependency or exported brand text. The moving 256px grain uses the supplied texture; the pointillist dot field remains above it. Flow and grain pause behind entry, offscreen, in hidden/cached pages, in project dialogs and for reduced motion/forced colors. It preserves the fixed desktop rail, nested work scroll, three tabs, real identity/social data and one project per row. Each real word reveals through a baseline mask; media unfolds through a clipping window with a small perspective tilt. The theme menu keeps its existing persistent Liquid Glass interaction.

The 92,656-byte Overused Grotesk variable font is self-hosted from its original OFL project. Its license/provenance is in public/fonts/SOURCES.md. The former About font pairing is superseded. Entry uses a large numeric 0-to-100 counter and a typographic reveal on charcoal, with active-font readiness. See DESIGN-RESEARCH.md for live-reference evidence and local-browser limits.

Project hover keeps the preview size and framing stable. A localized diagonal sheen with a faint halftone field follows the fine pointer; the orange opening cue moves beside it, stays within the image and returns to its corner on leave. Projects reserves the separate pause/play corner. Keyboard, touch, reduced motion and forced colors retain static access to the same project details. The controller only batches incoming pointer events; it owns no media transforms or idle animation loop. The interaction adapts the principle described in [Codrops Magnetic Buttons](https://tympanus.net/codrops/2020/08/05/magnetic-buttons/), without importing its code or libraries.

## Entry loading sequence

Refresh http://127.0.0.1:5175/ to replay. Only a large 0-to-100 numeral is visible during loading. Its display follows settled font/image/figure readiness; it never reaches 100 before the asset report completes. No percent sign, brand, caption, chrome object or skip-animation control is displayed. Hidden accessible progress remains.

At 100, a 220ms beat leads into three individually masked digits, staggered opposing exits and solid-to-outline ink. A single diagonal exposure reveals the destination while its media, portrait, name and navigation enter with overlapping but separate timing. Desktop handoff lasts up to 1590ms, compact timing scales to 80%. The number animation is finite and stops at each readiness ceiling; there is no permanent loader render loop or added dependency.

Existing readiness fallbacks and 12-second recovery remain. Hidden tabs pause the counter and native effects; reduced motion/missing APIs opens prepared content immediately. Resize, reduced-motion changes, abort, restoration, deadline and normal completion release effects, listeners, focus and interaction locks. Section navigation retains ownership of its inner media; the loader animates separate outer wrappers.

Validation: `node artifacts/entry-loader-check.mjs` passes 37 numeric-entry DOM/clock checks. Navigation/reveal integration passes 30 checks; rail atmosphere and project surfaces pass 12 and 22. `npm run check` and `npm run build` pass. These do not verify native visual quality, perceived timing or responsive rendering; the local-browser boundary remains in `DESIGN-RESEARCH.md`.

## Website showcase media

Projects uses one 16:9 preview per row, with a compact caption underneath. The three current moving previews are explicitly labeled local dummy studies. They are not recordings of the user's work. Now and detail continue to use `project.image`; detail keeps its natural proportions.

For a real screen recording, replace the project's `preview` with:

```js
preview: {
  image: '/projects/my-site-poster.webp',
  width: 1600,
  height: 900,
  video: '/projects/my-site.mp4',
  motion: 'static',
},
```

For a full-page screenshot instead, set `video: null`, `motion: 'scroll'`, the screenshot path and its real dimensions. Omit `preview` for a static screenshot using `image`. Replace all dummy paths when publishing real work. Video loads only when its stage is visible; visible motion waits until section entry completes. Pause/play, visibility, native dialogs and reduced motion control playback. No iframe or extra runtime dependency is used.

## Structure and behavior

- `index.html`: identity rail, spacious work canvas, accessible tabs, theme menu, native project dialog.
- `src/style.css`: base controls and legacy tokens. src/studio-theme.css loads last with current font/palette, halftone field, media treatment and responsive overrides.
- `src/entry-loader.js` / `.css` / `src/entry-counter.js` / `src/entry-readiness.js`: asset-linked numeric entry, kinetic digit handoff, diagonal exposure and lifecycle recovery. Critical first paint and module-failure recovery live in `index.html`. Legacy chrome modules remain unimported.
- `src/layout.css`: current editorial composition, stationary desktop rail, centered navigation, prominent project images, and responsive rearrangement.
- `src/navigation.css` / `src/section-navigation.js` / `src/section-reveal.js`: centered tabs and a signal dot; accessible baseline words and clipped depth media, with history, keyboard, scroll reset, interruption sampling, reduced motion and cleanup.
- `src/pointer-guides.js` / `src/pointer-guides.css`: stronger paper/ink viewport axes with small split orange registration marks. Each accent is nested in its own 1px axis; four arms grow from their inner edges, keeping equal 6px center gaps during hover, movement and press. A finite 38ms follow response catches the mouse and returns to idle; ticks stretch by movement direction, expand over interactive controls and compress on press. Over social links, the orange arms retract and the axes soften so the link text takes priority; other interactive controls retain their normal response. Social hover uses warm ink and a short horizontal arrow glide, with its underline kept transparent. Keyboard focus retains an outline and reduced motion removes displacement. The native cursor and all click targets remain in charge. Reduced motion tracks directly. Touch/coarse input, forced colors, keyboard navigation, entry, hidden pages and dialogs suppress the decoration. Run `node scripts/check-pointer-guides.mjs` for 39 tracking/lifecycle checks.
- `src/about.css`: statement/narrative columns, lower socials and mobile stacking; the active studio theme supplies the current sans typography.
- `src/theme-picker.css` / `src/theme-picker.js`: bottom-left Liquid Glass-inspired theme control; one clipped surface expands into a keyboard-accessible persistent preview. One selection capsule/checkmark moves between options; selecting a theme keeps it open. The circular X closes it. Includes reduced-motion, reduced-transparency, increased-contrast, and no-backdrop-filter fallbacks.
- `src/project-showcase.js` / `.css`: one-column 16:9 website showcase based on Stefan's Qode Highlights media sequence. Optional local/full-page capture panning or deferred muted inline video, per-preview pause/play, visibility/reduced-motion fallbacks and resource cleanup.
- `src/project-surface.js` / `.css`: shared Now/Projects hover sheen and bounded opening cue; event-batched coordinates, no image zoom or card lift, static accessibility fallbacks and lifecycle cleanup. Fixture: `node artifacts/project-surface-check.mjs`.
- `src/data.js`: editable personal/project data, including each project's optional `preview`.
- `src/main.js`: data rendering, navigation/theme initialization, and project details/focus restoration.
- `src/figure.js`: the supplied selfphoto.png at full opacity with a tighter face crop and subtle pointer-driven chromatic edges behind the original image. Cached at max DPR 2, with a 30fps drawing budget and offscreen/hidden/page-cache/entry/reduced-motion gates. src/portrait-image.js owns crop/effect geometry. No third-party image or 3D dependency.
- `src/rail-atmosphere.js` with `src/studio-theme.css`: CSS-only slow gradient motion behind the identity, gated by readiness, visibility, dialogs and motion/color preferences; drifting original grain at `public/textures/rail-grain.svg` and the soft original wave mask at `public/textures/rail-wave.svg`. No JavaScript render loop. Fixture: `node artifacts/rail-atmosphere-check.mjs`.
- `public/projects/`: local vector placeholders; replace with appropriately sized WebP/AVIF screenshots. Detail keeps the original image ratio.
- `public/fonts/`: active Overused Grotesk, retained legacy faces, OFL notices and SOURCES.md provenance.
- `scripts/placeholders.mjs`: recreates only the original demo screenshots. Do not run it after replacing those files with real screenshots.
- `scripts/preview-studies.mjs`: creates the separate `*-scroll.svg` dummy full-page studies from those demo screenshots. These are layout placeholders, not real website recordings.
- `artifacts/`: current screenshots and validation evidence, excluded from Git.

Tabs support Left/Right/Home/End. The theme trigger also opens with Up/Down; its menu supports Up/Down/Home/End and selection with Enter/Space. Selecting a theme and moving keyboard focus keep the preview open. An outside click/tap, X, or Escape dismisses it; X and Escape restore trigger focus. Tab navigates normally. When a project dialog is open, its native Escape behavior takes precedence over the background theme control. Browser Back/Forward restores the tab. Themes persist locally. Project dialogs restore the opening control's focus and preserve background scroll. Reduced motion removes animated transitions. There are no automatically loaded iframes, tracking calls, external runtime fonts, or additional libraries.

On desktop (>800px), the page occupies the viewport: the left identity stays still, and only the right `.workspace` scrolls. There is no top header; the color-theme button stays at the bottom left and opens its options upward. Tabs reset the right pane; opening/closing a project preserves its scroll position. At 800px and below, the document scrolls normally, with identity and figure above the work area. About becomes a readable single column at 600px and below. The shared footer appears only on Projects; Now and About hide its copyright, Back-to-overview link and rule. Projects always use one column. Existing identity and social data are preserved.

Decorative captions, repeated introduction copy, chapter metadata and generic slogans have been removed from the interface. `profile.currently` remains hidden while it contains a bracketed placeholder. The About dummy biography is visible by the user's request and marked as a draft. An unset email is omitted. All source data remains editable; the legacy `profile.intro` and `profile.chapters` data remain in the file but are not rendered by the current layout.

This is a local project and has not been published.

## Supplied rail gradient

Playback speed is 13, raised 30% from the supplied value of 10 at the user's request. Colors, curvature, grain and the existing rendering/lifecycle budgets are preserved.

`src/rail-flow-preset.json` preserves the export's five exact colors, dividers, mesh, parameters and starting phase. `src/rail-flow.js` matches the supplied interactive sRGB inverse-distance flow math; `src/rail-atmosphere.js` gates its single frame owner. The raster is 240x160, drawing at up to 24fps under a 13px CSS blur; no native performance measurement is claimed. `public/textures/rail-blend-grain.png` is the original 256px texture extracted from the user's CSS attachment, rendered at overlay opacity .32, matching noise 64. The static fallback retains the exact five stop positions 10/30/50/70/90%. The identity text uses opaque foreground ink with a small opposite-tone edge/shadow: light ink for Dark/Sage/Amethyst, dark ink for Light. The portrait retains the original photo colors across all themes. This replaces foreground difference blending, which disappeared into midtones. Background grain/dots retain their own blending. Native readability and perceived motion remain browser-unverified.

Run `node artifacts/rail-flow-check.mjs` (13 checks, including numerical agreement with the original supplied FLOW function) and `node artifacts/rail-atmosphere-check.mjs` (12 lifecycle checks). The formula comparison requires the original local attachment path recorded in the check script; normal app runtime has no attachment dependency.

## Four color themes

Dark, Light, Sage and Amethyst are available in the persistent theme picker. Amethyst combines a plum ground (#282136), pale lavender type (#F2E9FF) and the shared orange accent (#FF4C13). Theme changes adapt the page, text, dividers, hover/surface, focus/accent, rail gradient, project preview/detail media, glass control and numeric entry. The curved flow, grain and pointillism retain their current geometry and timing. Dark uses a darker neutral rail, Light stays pale and slightly warm, Sage has a green tint, and Amethyst has a violet tint. Preview media receives a gentle theme filter, not a transformed source asset.

The expanded glass is 240x288px with four choices and one close row; short viewports clamp its height and keep the options scrollable. Choosing an option keeps the picker open. X/outside/Escape closes it. All four selections persist after reload. `node artifacts/theme-picker-interaction-check.mjs` passes 22 DOM/controller checks, including the fourth selection, indicator alignment, wrap navigation and persisted-theme bootstrap; native appearance remains unverified.

The theme control follows the button-to-menu relationship described in Apple's [Meet Liquid Glass](https://developer.apple.com/videos/play/wwdc2025/219/) Dynamics transcript. The captured glass surface itself owns 12px backdrop blur (10px Light), with a shallow 4.5-5.5% tint (10% Light); keeping blur on the captured host prevents its child from losing the outside backdrop during native theme capture. The native group is rounded/clipped. Open material is immediate, with no blur interpolation or delayed tint fade. The moving option bar shares that filtered background rather than adding a separate filter. One reflective contour and surface wash paint above the blurred layer; the expanded host owns only the outer shadow. This replaces the rejected flat frosted material. The named live snapshot pair is clipped too. Open and close use authored 560ms/440ms critically damped CSS curves with coordinated icon/content motion and interruptible size transitions. A fallback timer releases closing content if transitionend is absent. Lighting stays fixed. Reduced motion/transparency and forced colors remain supported. Menu controller checks: 41 passed; native appearance/smoothness and exact iOS equivalence are not verified under the local-browser boundary.

## Theme color diffusion

The current transition reveals the new palette through three soft, asymmetrically placed elliptical fields that expand and merge. One begins at the theme trigger. The old theme dissolves at the feathered boundaries, while the page content stays in place and the full glass menu remains live above it. This replaces the rejected print/register plates and earlier cloth/glow effects. Duration: 520ms. No decorative SVG stage, page clone, added dependency or frame loop.

Fast input reuses one capture/effect per burst. Pending choices retain only the latest theme; after capture commits, further choices update the live palette synchronously without resetting the animation. Option feedback is immediate. No debounce, input lock or queued effect. Menu clicks stay open; outside/X/Escape keep their existing behavior. Scroll, focus and all four persisted themes are preserved.

CSS registered radius properties and intersected gradient masks are progressive enhancement. Missing mask/property support uses a 200ms dissolve; missing native View Transitions, reduced motion and forced colors apply the theme directly. Completion, failure and interruption remove mask animation, coordinates and ownership flags.

Validation: theme reveal 41 API/numeric fixture checks (including seven viewport coverage cases and 1,000 pending + 1,000 active selections), theme menu 41 DOM checks. Syntax/build checked separately. Native mask compositing, perceived quality, physical-input latency and frame time remain unverified under the existing local-browser boundary. Legacy print/cloth studies are retained on disk but are not active imports.

### Selection indicator motion

The moving glass bar uses a non-bouncy analytical spring, based on the continuity principles in Apple's [Animate with springs](https://developer.apple.com/videos/play/wwdc2023/10158/) transcript. A new choice carries the current position and velocity into its next target. One finite 460ms WAAPI effect replaces the old 200ms CSS transform transition. Same-target repeats keep the current effect; latest checked state/palette remains immediate. No frame loop, added library or queued animation. Close, visibility/pagehide, window blur, resize, reduced motion and abort settle to the chosen row. Material and popup animation are preserved. Run node artifacts/theme-selection-motion-check.mjs (12 checks) and node artifacts/theme-picker-interaction-check.mjs (41 checks). Native perceived rhythm and exact iOS equivalence remain unverified under the local-browser boundary.

### Clean monochrome studio portrait

The user chose a clean monochrome oval. The exact public/profile/selfphoto.png is rendered at full opacity inside a 4:5 oval, with a close proportional face crop and a restrained studio ground. CSS applies grayscale and modest contrast; the source asset remains untouched. There is no paper frame, backing sheet, orange tab, tilt, dot effect, fading face or chromatic overlay. src/figure.js retains one cached image, gentle whole-photo movement and the existing entry/hidden/offscreen/page-cache/reduced-motion/abort gates. The rail background, identity text and orange navigation/check accents remain. Run node artifacts/portrait-image-check.mjs (16 checks). Native framing/appearance and responsive spacing remain unverified under the local-browser boundary.

# Brand assets

## Status: placeholder

`ishoej-kreds18.svg` in this folder is a **placeholder**, not the kreds mark.

The brief describes `018-ishoej.svg` and `018-ishoej.png` as attached, but
neither file exists in this repository or the workspace it was prepared in. This
is recorded in `docs/PLAN.md` §0 and as open question 1 in §25, whose stated
default is to build against a placeholder with the correct aspect ratio and swap
it on arrival.

## Drop-in contract

Adding the real files completes the visual layer with no refactoring:

| File | Source | Notes |
| --- | --- | --- |
| `ishoej-kreds18.svg` | the supplied `018-ishoej.svg`, renamed | unmodified |
| `ishoej-kreds18.png` | the supplied `018-ishoej.png`, renamed | unmodified, optional |
| `ishoej-kreds18@300.png` | generated | build artefact, do not commit |

`scripts/build-logo-png.ts` rasterises the SVG to `ishoej-kreds18@300.png` at
exactly the pixel width implied by 32 mm at 300 ppi, preserving the SVG's own
aspect ratio. It runs as part of `bun run build`. The DOCX writer reads that
file and computes its `ImageRun` dimensions from the same ratio, so distortion
is impossible by construction.

## Rules that apply to the real mark

- The aspect ratio comes from the SVG's `viewBox` and is never overridden. Width
  is set, height follows.
- No recolouring, cropping, filters, rotation or drop shadow, and never placed
  over a tinted background.
- Minimum clear space on all sides equals the logo's cap height.
- Minimum reproduction width is 18 mm. Below that the wordmark stops being
  legible and the mark should be omitted rather than shrunk.

## When the real files arrive

1. Replace `ishoej-kreds18.svg` with the supplied file, unmodified.
2. Extract its actual fill values and replace every colour marked *provisional*
   in `docs/PLAN.md` §12.4 — currently `--c-accent` — in both `uno.config.ts`
   and `src/styles/tokens.css`.
3. Re-run `bun test tests/unit/styles` to confirm the contrast table still holds.
4. Confirm the intrinsic aspect ratio against the placement table in §12.8.

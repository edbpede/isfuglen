# Brand assets

## Status: real mark installed

`ishoej-kreds18.svg` is the supplied `018-ishoej.svg`, renamed and otherwise
unmodified. It shows Danmarks Lærerforening's circular emblem beside the
wordmark "Ishøj Lærerkreds".

| Property | Value |
| --- | --- |
| `viewBox` | `0 0 300 100` — a 3:1 box |
| Fill | `#253154` only. The mark is monochrome navy. |
| Source | supplied `018-ishoej.svg`, byte-for-byte |

The earlier placeholder is gone. `docs/PLAN.md` §0 and open question 1 in §25
are closed by this file.

## Files

| File | Source | Notes |
| --- | --- | --- |
| `ishoej-kreds18.svg` | the supplied `018-ishoej.svg`, renamed | unmodified |
| `ishoej-kreds18@300.png` | generated | build artefact, do not commit |

`scripts/build-logo-png.ts` rasterises the SVG to `ishoej-kreds18@300.png` at
exactly the pixel width implied by 32 mm at 300 ppi, preserving the SVG's own
aspect ratio. It runs as part of `bun run build`. The DOCX writer reads that
file and computes its `ImageRun` dimensions from the same ratio, so distortion
is impossible by construction.

## Rules that apply to the mark

- The aspect ratio comes from the SVG's `viewBox` and is never overridden. Width
  is set, height follows. `--logo-aspect` in `src/styles/tokens.css` mirrors it.
- No recolouring, cropping, filters, rotation or drop shadow, and never placed
  over a tinted background.
- Minimum clear space on all sides equals the logo's cap height.
- Minimum reproduction width is 18 mm. Below that the wordmark stops being
  legible and the mark should be omitted rather than shrunk.

## Palette note

The mark carries one fill, `#253154`. That value already matched `--c-brand` in
both `uno.config.ts` and `src/styles/tokens.css`, so the brand navy is now
confirmed by the artwork rather than inferred from `dlf.org` meta tags.

`--c-accent` (`#F2B233` gold) has no counterpart in the mark, because the mark
is monochrome. It stays a deliberate design choice for rules, chips and notice
bars, and it is still bound by the contrast rule stated in `uno.config.ts`. It
is no longer derivable from the artwork, so treat any change to it as a design
decision, not as extraction.

# Brand & design system

Everything visual derives from one asset: the CharmQuark mark — a hexagonal
lattice holding four quark nodes, drawn in a single gradient from deep violet to
clear blue.

## The gradient

Sampled directly from the mark:

| Token | Hex | Role |
|---|---|---|
| `--cq-plum` | `#3A0D4E` | Deepest. The navigation rail, dark grounds. |
| `--cq-violet` | `#6D28A8` | Brand purple. Gradient start. |
| `--cq-iris` | `#5A4CA0` | Where violet becomes blue. Links, focus rings, confirmed state. |
| `--cq-blue` | `#3576C2` | Brand blue. Gradient end, primary data series. |
| `--cq-lilac` | `#9B6FD4` | Lifted violet. The glow on the active nav item. |

`--cq-gradient` reproduces the mark's sweep at 135°. It is used sparingly and
always for the same meaning: **this is the primary action** (buttons, the user
avatar, the wordmark).

## Warm accents, and no cyan

Status colors are deliberately **warm**, so they counterpoint the cool brand
rather than competing with it:

| Token | Hex | Meaning |
|---|---|---|
| `--cq-sage` | `#4E9E71` | healthy · ready · pass |
| `--cq-apricot` | `#E0913A` | attention · assembling · in progress |
| `--cq-rose` | `#D4536B` | fault · blocked · fail |
| `--cq-slate` | `#7B7A96` | idle · draft · unknown |

**There is no cyan or teal anywhere in the app, on purpose.** Both sit too close
to the brand blue: they stop reading as a distinct status and push the whole
surface cold. If you are reaching for teal, the answer is `--cq-iris` (if you
mean "brand") or `--cq-sage` (if you mean "good"). A grep for
`(bg|text|border|ring)-(teal|cyan|sky)-` should return nothing.

## Neutrals are never gray

Every neutral is tinted toward violet — `--cq-ink`, `--cq-ink-soft`,
`--cq-ink-faint`, `--cq-line`, `--cq-ground`. Shadows too (`--cq-shadow`) are
violet-tinted rather than black. Per element the difference is invisible; across
a full page it is the difference between "a product" and "a template".

## Elements

- **`.cq-rail`** — the navigation rail carries the dark end of the gradient with
  a lilac bloom in the top corner. The active page is marked by a **quark**: a
  small luminous node in the margin, lifted straight from the mark.
- **`.cq-card`** — 16px radius, hairline in `--cq-line`, violet-tinted shadow.
- **`.cq-btn-primary`** — the mark's sweep. Brightens on hover, settles 0.5px on
  press.
- **`.cq-select`** — native selects re-skinned; the OS default reads as a
  different application.
- **`.cq-display`** — the geometric-sans display voice for titles and figures,
  echoing the wordmark's construction.
- **The aurora** — two very faint radial gradients at the top of `body`. On its
  own you cannot see it; remove it and the app goes flat.

## Assets

| File | Use |
|---|---|
| `web/public/charmquark-logo.svg` | Full mark. 48px and up — the lattice and orbitals turn to noise below that. |
| `web/public/charmquark-wordmark.svg` | Mark + wordmark, for light surfaces. |
| `web/public/charmquark-wordmark-light.svg` | Same, ramps lifted toward lilac for dark surfaces (this is what the rail uses). |
| `web/src/app/icon.svg` | Favicon. A simplified variant — solid brand tile, hexagon, three quarks — legible down to 16px. |
| `CQ Logo.png` | The original source artwork the palette was sampled from. |

## Tone

Elegant and a little whimsical. The physics metaphor is allowed to show — quarks
for active state, an "aurora" wash, orbitals in the mark — but it never gets in
the way of an operator trying to see whether a run is ready. Restraint first,
delight in the margins.

## Accessibility

- Focus-visible rings are `--cq-iris` at 2px with 2px offset, app-wide.
- The chart series order (blue → apricot → violet → sage) keeps the first four
  separable under the common colorblindness types.
- `prefers-reduced-motion` collapses every transition to ~0.

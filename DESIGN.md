---
name: NODUS
description: Configurable management workspace for SMBs, with an AI assistant that only proposes.
colors:
  ivory: "#F6F1E8"
  ivory-raised: "#FBF8F2"
  ivory-sunken: "#EFE8DC"
  anthracite: "#231F20"
  anthracite-soft: "#5E5859"
  line: "rgba(35, 31, 32, 0.14)"
  line-soft: "rgba(35, 31, 32, 0.08)"
  line-strong: "rgba(35, 31, 32, 0.28)"
  bordeaux: "#651F32"
  bordeaux-deep: "#4D1727"
  bordeaux-tint: "rgba(101, 31, 50, 0.08)"
  success: "#1F7A50"
  warning: "#9A5D10"
  danger: "#C2410C"
typography:
  wordmark:
    fontFamily: "Didot, \"Bodoni 72\", \"Times New Roman\", serif"
    fontWeight: 400
    letterSpacing: "0.12em"
  display:
    fontFamily: "Didot, \"Bodoni 72\", \"Times New Roman\", serif"
    fontSize: "clamp(2.5rem, 5vw, 4rem)"
    fontWeight: 400
    lineHeight: 1.05
  headline:
    fontFamily: "-apple-system, BlinkMacSystemFont, Inter, \"Helvetica Neue\", Arial, sans-serif"
    fontSize: "22px"
    fontWeight: 600
    lineHeight: 1.25
  title:
    fontFamily: "-apple-system, BlinkMacSystemFont, Inter, \"Helvetica Neue\", Arial, sans-serif"
    fontSize: "15px"
    fontWeight: 600
    lineHeight: 1.35
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, Inter, \"Helvetica Neue\", Arial, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "-apple-system, BlinkMacSystemFont, Inter, \"Helvetica Neue\", Arial, sans-serif"
    fontSize: "12px"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "0.04em"
rounded:
  xs: "4px"
  sm: "6px"
  md: "8px"
spacing:
  "1": "4px"
  "2": "8px"
  "3": "12px"
  "4": "16px"
  "5": "20px"
  "6": "24px"
  "8": "32px"
components:
  button-primary:
    backgroundColor: "{colors.bordeaux}"
    textColor: "{colors.ivory-raised}"
    rounded: "{rounded.sm}"
    height: "34px"
    padding: "0 14px"
  button-primary-hover:
    backgroundColor: "{colors.bordeaux-deep}"
  button-secondary:
    backgroundColor: "{colors.ivory-raised}"
    textColor: "{colors.anthracite}"
    rounded: "{rounded.sm}"
    height: "34px"
    padding: "0 12px"
  input:
    backgroundColor: "{colors.ivory-raised}"
    textColor: "{colors.anthracite}"
    rounded: "{rounded.sm}"
    height: "34px"
    padding: "0 10px"
  nav-item-active:
    backgroundColor: "{colors.bordeaux-tint}"
    textColor: "{colors.bordeaux}"
    rounded: "{rounded.sm}"
  card:
    backgroundColor: "{colors.ivory-raised}"
    rounded: "{rounded.md}"
    padding: "16px"
---

# Design System: NODUS

## Overview

**Creative North Star: "Il registro ben tenuto"** (the well-kept ledger)

NODUS is where operational staff of a small business spend their working day. The interface behaves like a well-kept professional register: everything in its place, ruled lines instead of decoration, calm ivory paper, dark anthracite ink. Order and precision are the aesthetic; nothing competes with the data.

Brand presence is concentrated, not spread: the node symbol and the uppercase Didot wordmark sign the product, and bordeaux appears only where the user can act. Surfaces are flat and separated by thin rules and slight tonal steps; shadows exist only for things that float above the page (menus, dialogs, drawers). Density is that of a working tool: compact rows and controls, but text sizes that stay comfortable over an eight-hour day.

Landing and onboarding may speak with more voice (Didot headlines, generous space), still on the same paper and ink; app screens stay quiet and fast.

**Key Characteristics:**
- Ivory paper, anthracite ink, bordeaux only for action.
- Flat, ruled, tonal layering; elevation only for overlays.
- Precise, lightly rounded forms (4–8px).
- Didot reserved for the wordmark and editorial headlines; system sans for everything functional.
- Legibility floor: body 14px, labels never below 12px.

## Colors

A two-tone register (ivory paper, anthracite ink) with a single bordeaux voice for interaction and three fixed state colours.

### Primary
- **Bordeaux** (bordeaux): the only interactive colour — primary buttons, links, selected navigation, selection highlights, focus rings. Deep bordeaux (bordeaux-deep) is its hover/pressed state; bordeaux tint (bordeaux-tint) is the background of selected rows and active nav items.

### Neutral
- **Ivory paper** (ivory): app and page background, about 60% of any screen.
- **Raised ivory** (ivory-raised): cards, tables, inputs, drawers — one tonal step above the paper.
- **Sunken ivory** (ivory-sunken): sidebar, table headers, wells — one step below.
- **Anthracite ink** (anthracite): all text and icons.
- **Soft anthracite** (anthracite-soft): secondary text, captions, placeholders; still ≥ 4.5:1 on ivory.
- **Rules** (line, line-soft, line-strong): anthracite at low opacity for borders and dividers.

### State colours
- **Green** (success), **Amber** (warning), **Red-orange** (danger): status pills, validation and alerts only, always paired with text or an icon.

### Named Rules
**The One Voice Rule.** Bordeaux means "you can act here". Never use it for decoration, headings, illustrations or static badges.

**The Three Inks Rule.** Every colour on screen is ivory, anthracite, bordeaux, or a state colour — or a tone/opacity of one of them, defined as a token in src/nodus-tokens.css. No cold greys, blues, pinks or sand as colours in their own right; no hex values written in components or stylesheets outside the token file.

**Incumbent drift (to remove).** The current code still uses cream #F4EBDD and #F9F5EF instead of ivory, dark bordeaux #32101A as text instead of anthracite, rose #B9828F and mauve grey #71666A as colours of their own, sand #E8DACA, and several hundred hand-written hex values including cool greys and blues in styles.css and design-system.css.

## Typography

**Display Font:** Didot (with Bodoni 72, Times New Roman, serif)
**Body Font:** system sans (-apple-system, BlinkMacSystemFont, Inter, Helvetica Neue, Arial)

**Character:** an editorial Didot signature over a plain, fast system sans that disappears into the data.

### Hierarchy
- **Wordmark** (Didot 400, uppercase, tracked): logo lockup only.
- **Display** (Didot 400, clamp 2.5–4rem, 1.05): landing and onboarding headlines only.
- **Headline** (sans 600, 22px, 1.25): page titles in the app.
- **Title** (sans 600, 15px, 1.35): card, panel and drawer titles.
- **Body** (sans 400, 14px, 1.5): table cells, form values, chat text; prose capped near 70ch.
- **Label** (sans 600, 12px, 0.04em): field labels, column headers, overlines; uppercase allowed for overlines only.

### Named Rules
**The Twelve Floor Rule.** No text below 12px anywhere; the incumbent 9–11px labels are retired.

**The Didot Reserve Rule.** Didot never appears inside app data screens (tables, forms, dashboard numbers).

## Layout

Fixed sidebar (232px) plus a 56px top bar; content width capped at 1420px. Spacing follows a 4px base scale (4, 8, 12, 16, 20, 24, 32). Controls are 34px high, table rows 42px. Below 768px the sidebar becomes an overlay drawer and grids collapse to one column; nothing may scroll horizontally except data tables inside their own container.

## Elevation & Depth

Flat by default with tonal layering: paper (ivory), raised (ivory-raised) and sunken (ivory-sunken) surfaces separated by thin rules. Shadows are reserved for elements floating above the page.

### Shadow Vocabulary
- **Menu** (`0 12px 30px rgba(35, 31, 32, .10)`): dropdowns, popovers, command palette.
- **Panel** (`-8px 0 32px rgba(35, 31, 32, .08)`): side drawers and the chat panel.

### Named Rules
**The Flat Page Rule.** Cards, tables and KPI tiles never carry a shadow at rest; separation is a rule or a tonal step.

## Shapes

Precise and sober: lightly rounded corners — 4px for chips and small controls, 6px for buttons and inputs, 8px for cards, panels and dialogs. 1px rules in anthracite at low opacity; no double borders, no thick coloured side stripes.

## Components

### Buttons
- **Shape:** gently squared (6px), 34px high.
- **Primary:** bordeaux fill, raised-ivory text; one primary per view.
- **Hover / Focus:** deep bordeaux on hover; 2px bordeaux focus ring offset 2px on every interactive element.
- **Secondary:** raised ivory with a thin rule, anthracite text; hover darkens the rule.
- **Disabled:** reduced opacity, no pointer, never the only signal of state.

### Chips / Status pills
- **Style:** 4px radius, small label type; state colour text on a light tint of the same state colour. Neutral statuses use anthracite on sunken ivory.

### Cards / Containers
- **Corner Style:** 8px.
- **Background:** raised ivory on ivory paper.
- **Shadow Strategy:** none at rest (see Elevation).
- **Border:** 1px rule.
- **Internal Padding:** 16px (20–24px on landing).

### Inputs / Fields
- **Style:** raised ivory, 1px rule, 6px radius, 34px high.
- **Focus:** bordeaux rule plus focus ring.
- **Error / Disabled:** danger rule and message below the field; disabled lowers contrast but keeps the value readable.

### Navigation
- Sidebar on sunken ivory; items are anthracite text with icons; hover is a faint anthracite tint; the active item uses bordeaux text on bordeaux tint. Section labels use the Label style.

### NODUS AI chat (signature)
- Right-side panel with Panel shadow; user messages are anthracite on sunken ivory, assistant messages on raised ivory; proposals are cards with explicit "Conferma"/"Annulla", the only bordeaux being the confirm action.

## Do's and Don'ts

### Do:
- **Do** take every colour from src/nodus-tokens.css.
- **Do** keep bordeaux for interactive elements only (≈10% of a screen).
- **Do** keep text contrast at least 4.5:1 and provide hover, focus, disabled, empty and error states.
- **Do** keep app screens dense but legible: 14px body, 12px minimum.

### Don't:
- **Don't** introduce cold greys, blues, pinks, sand or any fourth colour.
- **Don't** write hex values in components or stylesheets outside the token file.
- **Don't** use Didot inside data screens.
- **Don't** put shadows on cards or tables at rest.
- **Don't** give the interface a sector-specific character.

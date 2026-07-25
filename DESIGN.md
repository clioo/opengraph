---
name: OpenGraph
description: A precise, ready-to-use visual workflow editor for developers.
colors:
  canvas: "oklch(1 0 0)"
  surface: "oklch(0.97 0.004 255)"
  ink: "oklch(0.17 0.01 255)"
  muted: "oklch(0.50 0.012 255)"
  border: "oklch(0.88 0.007 255)"
  accent: "oklch(0.62 0.205 34.8)"
  terra: "oklch(0.58 0.15 145)"
  luna: "oklch(0.58 0.16 255)"
  sol: "oklch(0.59 0.21 28)"
typography:
  title:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "1.125rem"
    fontWeight: 650
    lineHeight: 1.3
    letterSpacing: "-0.015em"
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
    lineHeight: 1.35
  metadata:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.4
rounded:
  sm: "6px"
  control: "8px"
  md: "10px"
  lg: "12px"
  pill: "99px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.canvas}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "10px 14px"
    height: "40px"
  node:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "14px"
---

# Design System: OpenGraph

## 1. Overview

**Creative North Star: "The Ready Workbench"**

OpenGraph feels like a precisely arranged developer workbench under clear neutral light: everything needed is within reach, and nothing competes with the work. The canvas owns the screen. Controls are familiar, compact, and quiet until selected.

The interface borrows confidence from Linear, canvas clarity from Figma, and immediacy from tldraw without imitating any of them. It explicitly rejects childish whiteboards, ornate diagramming suites, generic SaaS dashboards, and control-dense enterprise software.

**Key Characteristics:**

- Pure neutral canvas with restrained functional color.
- Compact, explicit node metadata instead of color-coded guessing.
- Contextual controls that disappear when they are not useful.
- Flat surfaces with strong focus and selection states.
- Fast 150–200ms state transitions with reduced-motion support.

## 2. Colors

Color is semantic and scarce. Graphite creates structure; vermilion identifies primary action and focus; model hues support textual labels but never replace them.

### Primary

- **Workbench Vermilion:** Used only for the primary Copy graph action, active tool state, and focus emphasis.

### Secondary

- **Terra Green, Luna Blue, and Sol Red:** Small dots, fine outlines, and metadata accents paired with the complete model name.

### Neutral

- **Clear Canvas:** The graph and default page background.
- **Quiet Surface:** Toolbars, inspectors, menus, and hover washes.
- **Graphite Ink:** Primary text and graph geometry.
- **Muted Graphite:** Secondary labels that still meet contrast requirements.
- **Hairline Border:** Structure without decorative shadow.

**The Text Before Color Rule.** Every model and reasoning assignment must remain understandable in monochrome.

**The Ten Percent Rule.** Vermilion occupies no more than ten percent of a normal screen.

## 3. Typography

**Display Font:** System sans-serif stack
**Body Font:** System sans-serif stack
**Label/Mono Font:** Native UI monospace stack

**Character:** Fast-loading, familiar, and technically precise. One sans family carries the interface; monospace is reserved for model identifiers and reasoning metadata.

### Hierarchy

- **Title** (650, 1.125rem, 1.3): Node titles, inspector headings, and graph name.
- **Body** (400, 1rem, 1.5): Descriptions, notes, help, and error recovery.
- **Label** (600, 0.875rem, 1.35): Buttons, field labels, and compact navigation.
- **Metadata** (500, 0.75rem, 1.4): Model identifiers, reasoning effort, and inheritance state.

**The Metadata Boundary Rule.** Monospace never leaks into navigation, descriptions, or ordinary buttons.

## 4. Elevation

OpenGraph is flat by default. Depth comes from tonal layering and selection outlines. Small menus and floating controls may use one tight structural shadow with no more than 8px blur; nodes do not combine decorative borders and wide shadows.

**The Canvas Plane Rule.** Nodes rest on the canvas; they lift only during an active drag.

## 5. Components

### Buttons

- **Shape:** Moderately curved (10px), with a minimum 40px visual height and 44px hit target.
- **Primary:** Solid vermilion with white text; no gradient.
- **Hover / Focus:** Small color shift on hover and a clearly offset 2px focus ring.
- **Secondary / Ghost:** Neutral surface or transparent with graphite icon and label.

### Chips

- **Style:** Compact textual metadata with a subtle full-perimeter model-colored outline or dot.
- **State:** Always includes inheritance, model identifier, and reasoning effort where relevant.

### Cards / Containers

- **Corner Style:** Restrained 10–12px radius.
- **Background:** Canvas or quiet surface.
- **Shadow Strategy:** Flat by default; tight shadow only for temporary overlays.
- **Border:** One neutral hairline when separation is necessary.
- **Internal Padding:** 12–16px.

### Inputs / Fields

- **Style:** Visible label, neutral background, graphite text, 10px radius.
- **Focus:** Vermilion focus ring independent of border color.
- **Error / Disabled:** Text and icon accompany color; placeholders never replace labels.

### Navigation

The top bar and floating tool rail use consistent icon-and-label controls. The selected tool is visible through label, background, and focus treatment rather than color alone. Narrow screens collapse inspectors into dismissible overlays.

The optional Codex connection appears as one quiet text status, `Codex linked`, beside the brand. It is never the primary action and disappears entirely in standalone mode. The canvas also exposes a closed-by-default semantic **Outline** disclosure containing node titles and human-readable connections so browser agents and assistive technology can understand the graph without relying on SVG geometry.

### Workflow Node

The title is primary. A single compact metadata line immediately states `Default · model · reasoning` or `Override · model · reasoning`. Connection handles appear on hover, focus, or selection and are removed from exports.

## 6. Do's and Don'ts

### Do:

- **Do** keep the canvas dominant and immediately interactive.
- **Do** pair every model color with the complete textual model identifier.
- **Do** use 4px-based spacing and 8–12px corner radii consistently.
- **Do** expose settings contextually and provide complete keyboard alternatives.
- **Do** make local failure states recoverable without blocking graph editing.

### Don't:

- **Don't** resemble a childish whiteboard or use hand-drawn styling.
- **Don't** resemble an ornate diagramming suite, generic SaaS dashboard, or control-dense enterprise tool.
- **Don't** use glassmorphism, gradients, decorative wide shadows, nested cards, or side-stripe accents.
- **Don't** add account prompts, onboarding walls, login controls, or backend language.
- **Don't** rely on color alone for model, state, direction, or selection.
- **Don't** make Codex mode a second control surface; the same canvas and store remain authoritative for mouse, keyboard, and MCP actions.

---
name: Spark App Design System
status: draft
owners:
  - product
  - design
  - frontend
design_goals:
  - Blend into Shopify Admin while preserving a clean SaaS product feel
  - Prioritize task completion over marketing presentation
  - Keep tools visually consistent through shared tokens and shared components
  - Let Ant Design provide behavior and Tailwind CSS provide layout and appearance control
implementation:
  component_library: Ant Design
  styling_layer: Tailwind CSS
  visual_reference: Shopify App / Polaris / SaaS admin
  source_of_truth:
    - this file
    - shared tokens
    - shared primitives
principles:
  shopify_first: true
  saas_secondary: true
  task_first_tools: true
  avoid_marketing_surfaces: true
  avoid_page_specific_style_systems: true
colors:
  text:
    primary: "#1f2124"
    secondary: "#5c6066"
    tertiary: "#7a7f87"
    inverse: "#ffffff"
  surface:
    page: "#f6f6f7"
    primary: "#ffffff"
    secondary: "#fafbfb"
    subtle: "#f3f4f6"
  border:
    default: "#e1e3e5"
    subtle: "#ebedf0"
    strong: "#c9cdd2"
  state:
    success: "#008060"
    success-surface: "#e9f7ef"
    info: "#2c6ecb"
    info-surface: "#eef4ff"
    warning: "#b98900"
    warning-surface: "#fff7e0"
    progress: "#c05717"
    progress-surface: "#fff1e8"
    critical: "#d82c0d"
    critical-surface: "#fff0ee"
  focus:
    ring: "#2c6ecb"
typography:
  font_family: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
  note: "Brand type scale is not final. Use Shopify-compatible defaults until brand typography is defined."
  page_title:
    fontSize: "28px"
    fontWeight: 700
    lineHeight: 1.2
  page_subtitle:
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  section_title:
    fontSize: "18px"
    fontWeight: 700
    lineHeight: 1.3
  card_title:
    fontSize: "16px"
    fontWeight: 700
    lineHeight: 1.35
  body_strong:
    fontSize: "14px"
    fontWeight: 600
    lineHeight: 1.5
  body:
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  body_small:
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.5
  meta:
    fontSize: "12px"
    fontWeight: 500
    lineHeight: 1.45
  button_label:
    fontSize: "13px"
    fontWeight: 600
    lineHeight: 1.2
  badge_label:
    fontSize: "11px"
    fontWeight: 600
    lineHeight: 1.2
  numeric_emphasis:
    fontSize: "24px"
    fontWeight: 700
    lineHeight: 1.1
radius:
  control: "10px"
  card: "14px"
  pill: "999px"
spacing:
  page_gap: "24px"
  section_gap: "20px"
  card_padding: "20px"
  compact_padding: "12px"
  grid_gap: "16px"
shadow:
  card: "0 1px 2px rgba(0, 0, 0, 0.04), 0 3px 12px rgba(0, 0, 0, 0.04)"
  overlay: "0 12px 32px rgba(0, 0, 0, 0.14)"
components:
  page_shell:
    base: "Shopify App frame with neutral page background"
    do_not: "Add large hero banners or marketing headers"
  button:
    height:
      compact: "28px"
      default: "32px"
      large: "40px"
    radius: "10px"
    padding:
      compact: "0 10px"
      default: "0 12px"
      large: "0 16px"
    primary:
      background: "#008060"
      text: "#ffffff"
      border: "#008060"
    secondary:
      background: "#ffffff"
      text: "#1f2124"
      border: "#c9cdd2"
    subtle:
      background: "#f3f4f6"
      text: "#5c6066"
      border: "#ebedf0"
    destructive:
      background: "#d82c0d"
      text: "#ffffff"
      border: "#d82c0d"
  ai_assist:
    card_trigger:
      height: "28px"
      radius: "10px"
      tone: "secondary_or_subtle"
    field_trigger:
      size: "28px"
      radius: "10px"
      tone: "subtle_icon"
    suggestion_modal:
      width: "640px-760px"
      base: "Neutral overlay with clear title, suggestion body, preview comparison, and apply actions"
    suggestion_copy:
      base: "Inline suggestion block below field or section, neutral surface, restrained border"
  surface_card:
    base: "White or near-white surface, subtle border, light shadow"
    do_not: "Use heavy gradients or tinted cards as the default container"
  tabs:
    base: "Segmented, compact, neutral container"
    active: "Surface primary + stronger text"
    do_not: "Use strong color fills for the active tab"
  form_controls:
    base: "Ant Design controls styled with neutral surfaces and clear borders"
    do_not: "Mix raw browser controls and styled controls in the same section"
  status_badge:
    base: "Low-emphasis semantic pill with border"
    do_not: "Use saturated badges as decoration"
  summary_metrics:
    base: "Quiet metrics with numeric emphasis and restrained accents"
    do_not: "Use billing-style promotional strips"
  task_card:
    base: "Operational card focused on state, logs, review, and apply actions"
    do_not: "Present task cards like pricing or feature cards"
component_mapping:
  ant_design:
    Button: "Primary and secondary actions"
    Card: "Surface container"
    Tabs: "Page-level or section-level view switching"
    Alert: "Warnings, errors, and applied feedback"
    Modal: "Confirmations and review checkpoints"
    Empty: "Empty state container"
    Tag: "Status pill"
    Input: "Single-line entry"
    Select: "Option selection"
    Progress: "Task progress and completion feedback"
  tailwind:
    role: "Layout, spacing, density, alignment, and low-level visual tuning"
    do_not: "Create an untracked parallel token system"
---

# DESIGN.md

## Overview

This file defines how Spark should look and feel as a Shopify-embedded SaaS product.

It follows the `DESIGN.md` philosophy described by Stitch:

- It is a living artifact, not a one-time static spec.
- The YAML front matter gives agents machine-readable tokens.
- The markdown body gives humans and agents the rationale behind those tokens.
- The format is a foundation, not a prescription; new sections may be added when product needs expand.

This document replaces the previous `UI_DESIGN.md`.

## Product Context

Spark is not a marketing site and should not feel like one.

Spark contains multiple page types. Task-oriented tools are the strongest standardization target, but they are not the only page type in the app.

The primary page types are:

- task-oriented tool pages
- conversation pages
- commercial pages
- workspace / operations pages

Merchants should feel like they are operating inside a capable Shopify app, not browsing a pricing page or a promotional dashboard. That baseline applies across page types, but each type may express it differently.

That means:

- Visual hierarchy should support action and review workflows.
- Surfaces should feel operational, neutral, and dense enough for work.
- Color should clarify state, not compete for attention.
- Repeated tools should look like they belong to one system.

## Primary Visual Direction

The target visual direction is:

- **Shopify App first**
  - Blend into Shopify Admin.
  - Respect Shopify guidance on color meaning, hierarchy, and visual restraint.
  - Prefer neutral text and surface colors for most of the UI.
- **SaaS admin second**
  - Clean, high-clarity cards and forms are acceptable.
  - Slightly stronger structure than raw Shopify Admin is acceptable when it improves tool usability.
  - Avoid consumer, editorial, or marketing-heavy styling.

The app should feel:

- calm
- structured
- trustworthy
- efficient
- consistent

It should not feel:

- promotional
- overly branded
- playful
- gradient-heavy
- visually noisy

## Non-Goals

This file should not:

- redefine interaction flow that belongs in interaction or product specifications
- use billing or subscription pages as the default visual base for all tools
- encode temporary one-off page hacks as global design language
- force strong brand styling before brand decisions are made

## Rule Hierarchy

This document should be interpreted in three layers:

- **Global visual rules**
  - Apply to the whole product.
  - Define color semantics, hierarchy, spacing principles, container restraint, and primitive reuse.
- **Page-type visual templates**
  - Apply to a class of pages such as tools, conversation pages, commercial pages, or workspace pages.
  - Define the default visual skeleton for that class.
- **Page-level visual notes**
  - Apply only to a specific page.
  - May refine a page's business identity, but must not override global rules or ignore its page-type template.

This means:

- Billing should be judged as a commercial page, not as a task tool.
- AI Assistant should be judged as a conversation page, not as a task tool.
- Tool pages remain the strongest shared template because they have the highest repeated structural value.

## Shopify Alignment

Shopify visual guidance should be treated as the baseline until Spark defines stronger brand rules.

Key implications from Shopify visual design:

- Use neutral colors for the majority of text and surfaces.
- Use green for success or completed outcomes, not to attract attention.
- Use yellow for paused, incomplete, or cautionary information.
- Use orange for in-progress or attention-needed states that are not blocking.
- Use red only for blocked, destructive, or error states.
- Maintain readable hierarchy through size and weight, not color alone.
- Use at least `13px` for headings, body text, and interactive text, and `12px` only for smaller supporting text.

## Visual System

## Colors

### Default usage

- **Page background**
  - Use `surface.page`.
  - Avoid large color blocks behind operational content.
- **Primary cards**
  - Use `surface.primary` with `border.default`.
  - Cards may use minimal gradients only when the result is still visually neutral.
- **Secondary panels**
  - Use `surface.secondary` or `surface.subtle`.
  - These panels exist to group inputs, metadata, or logs.
- **Text**
  - Most text uses `text.primary` or `text.secondary`.
  - Avoid bright colored text unless it carries explicit semantic meaning.

### Semantic color rules

- **Success**
  - Completed actions
  - Applied changes
  - Confirmed healthy status
- **Info**
  - Informational emphasis
  - Links or focus accents
  - Neutral highlight when meaning is not success
- **Warning**
  - Incomplete states
  - Needs review
  - Low-priority attention
- **Progress**
  - Running or in-progress task states
  - Non-blocking operational motion
- **Critical**
  - Errors
  - Blocked actions
  - Destructive outcomes

### Color rules for tools

- Do not use green as the default active color for tabs, cards, and summaries all at once.
- Do not turn every important block into a tinted panel.
- Do not use multiple strong semantic colors in one compact area unless each color maps to a distinct state.
- When in doubt, use neutral surfaces and reserve semantic color for status indicators and primary actions.

## Typography

Brand typography is not final. Until it is defined:

- use one neutral sans-serif family
- keep hierarchy simple
- prefer size, weight, and spacing over decorative treatments

### Hierarchy

- **Page title**
  - The largest heading on the page.
  - Used once per page.
- **Page subtitle**
  - The short explanation directly below the page title.
  - Used to clarify purpose, not to carry warnings or dense instructions.
- **Section title**
  - Used for major blocks such as configuration, estimates, results, or task lists.
- **Card title**
  - Used inside cards, panels, dialogs, and list items that behave like compact objects.
- **Body strong**
  - Used for row-leading text, emphasis within body copy, and important inline labels.
- **Body**
  - Standard UI copy, labels, descriptions, and item text.
- **Body small**
  - Supporting descriptions inside dense cards, lists, and control groups.
- **Meta**
  - Captions, timestamps, hints, and secondary support text.
- **Button label**
  - Used for button text across primary, secondary, and utility actions.
- **Badge label**
  - Used inside status pills, micro labels, and compact chips.
- **Numeric emphasis**
  - Used for key counts, balances, and summary metrics when numeric value is the focal point.

### Rules

- Do not rely on color alone to indicate hierarchy.
- Do not make minor labels too small to read comfortably.
- Do not introduce custom display type styles for individual tools.

### Type specification

Use the following defaults unless a page-type template explicitly requires a tighter variation:

| Role | Font size | Weight | Line height | Default color | Typical usage |
|------|-----------|--------|-------------|---------------|---------------|
| Page title | `28px` | `700` | `1.2` | `text.primary` | Main page heading |
| Page subtitle | `14px` | `400` | `1.5` | `text.secondary` | Short page explanation below title |
| Section title | `18px` | `700` | `1.3` | `text.primary` | Titles for major sections |
| Card title | `16px` | `700` | `1.35` | `text.primary` | Card, dialog, panel, object titles |
| Body strong | `14px` | `600` | `1.5` | `text.primary` | Leading row text, strong inline labels |
| Body | `14px` | `400` | `1.5` | `text.primary` | Main readable content |
| Body small | `13px` | `400` | `1.5` | `text.secondary` | Dense supporting descriptions |
| Meta | `12px` | `500` | `1.45` | `text.tertiary` | Timestamps, hints, helper copy |
| Button label | `13px` | `600` | `1.2` | depends on button tone | Button text |
| Badge label | `11px` | `600` | `1.2` | semantic or subdued | Status pills and chips |
| Numeric emphasis | `24px` | `700` | `1.1` | `text.primary` | Metric values, balances |

### Text role constraints

- Page title and page subtitle are page-shell roles and should not be repeated inside cards.
- Section title is for major regions, not for every small grouped block.
- Card title should be the default title role for cards, dialogs, drawers, list cards, and compact detail headers.
- Body strong should be used for emphasis inside existing layouts, not to invent a new heading tier.
- Meta text should remain supportive; it must not become the primary information carrier of a workflow.
- Numeric emphasis should appear only when the number itself is the key decision signal.

### Color usage by text role

- `text.primary`
  - page titles
  - section titles
  - card titles
  - main body copy
  - active tab labels
- `text.secondary`
  - page subtitles
  - descriptions
  - secondary list text
  - inactive controls when still readable
- `text.tertiary`
  - timestamps
  - hints
  - minor metadata
  - supporting annotations

Do not:

- use semantic colors as the default color for ordinary titles
- render large blocks of body copy in tertiary text
- use low-contrast text for important instructions or primary actions

## Shape, Border, and Elevation

- Use rounded rectangles consistently.
- Prefer subtle borders over heavy shadows.
- Use stronger elevation only for overlays like modals.

### Surface rules

- Cards should feel layered but not floating dramatically.
- Forms should feel precise and stable, not soft or playful.
- Empty states should look calm and low-emphasis.
- Logs and review panels should feel operational and structured.

## Layout Principles

This file defines the visual treatment of layout, not the product flow itself.

### Default page rhythm

- page header
- optional warning or contextual notice
- primary work area
- supporting panels
- operational footnotes only if useful

### Tool pages

For task-oriented tools such as `ProductImprovePage`:

- configuration and task history are peer work modes
- summaries must not overpower the primary action area
- review and apply states must feel like workflow checkpoints, not marketing sections
- empty states should guide, not decorate

### Conversation pages

For conversation pages such as AI Assistant:

- the message flow is the primary workspace
- embedded cards are supporting interaction surfaces, not the page shell itself
- context controls may be denser than on tool pages
- utility actions should remain quiet relative to the active conversation

### Commercial pages

For commercial pages such as Billing:

- pricing hierarchy may be stronger than on tool pages
- recommendation treatment is acceptable when it helps plan choice
- plan comparison and purchase areas may carry more emphasis than operational tool surfaces
- these visual patterns must not leak back into default tool-page styling

### Workspace / operations pages

For workspace or operations pages:

- object management, selection, and filtering may be more prominent than task execution
- split panes, side panels, and denser data views are acceptable
- the page should still feel operational and restrained rather than dashboard-promotional

### Density

- Prefer medium density, not sparse landing-page spacing.
- Support scanning over storytelling.
- Keep related controls grouped tightly enough to read as one task.

## Component Guidance

## Ant Design + Tailwind Strategy

Spark uses:

- **Ant Design** for component behavior and baseline structure
- **Tailwind CSS** for spacing, layout, and controlled appearance tuning

Rules:

- Ant Design components must be wrapped or themed to match this design system.
- Tailwind classes should express layout and small appearance adjustments, not invent new visual semantics.
- Shared primitives should mediate repeated patterns.
- Raw page-level style invention should decrease over time.

## Core Primitives

### Container semantics

Before choosing a visual container, decide which semantic role the block serves:

- **Surface card**
  - A distinct object or section with its own state, purpose, or actions.
- **Inner panel**
  - A grouped region inside a card, used for controls, estimates, logs, or secondary detail.
- **List row**
  - A repeated, scan-oriented item in a homogeneous collection.
- **Plain section**
  - Explanatory copy, helper text, or lightweight grouped content that does not deserve its own card.

Rules:

- Do not promote every grouped block into a card.
- Do not use nested cards when an inner panel or list row would communicate the structure more clearly.
- If a block has no distinct state, action set, or scanning value, it should not default to a card.

### Page shell

- One clear title
- One concise subtitle when needed
- No billboard-style hero

Text defaults:

- title uses `page_title` + `text.primary`
- subtitle uses `page_subtitle` + `text.secondary`
- header-level warnings should not be merged into the subtitle; use a separate notice surface instead

### Surface card

- Default container for sections
- White or near-white surface
- Subtle border and light shadow

Text defaults:

- card heading uses `card_title` + `text.primary`
- card description uses `body_small` + `text.secondary`
- supporting metadata inside the card uses `meta` + `text.tertiary`

### Inner panel

- Used inside a card for grouped controls, estimates, or logs
- Lower emphasis than the surrounding card

Text defaults:

- panel title uses `body_strong` + `text.primary`
- panel description uses `body_small` + `text.secondary`

### List row

- Used for repeated, mostly homogeneous data
- Should support scanning, filtering, and comparison
- Actions belong at a stable edge of the row, not in shifting positions

Text defaults:

- primary row text uses `body_strong` + `text.primary`
- secondary row text uses `body_small` + `text.secondary`
- timestamps and technical metadata use `meta` + `text.tertiary`

### Plain section

- Used for explanatory text, helper notes, and low-emphasis support content
- Should not introduce unnecessary borders, shadows, or nested card framing

Text defaults:

- explanatory copy uses `body` or `body_small`
- helper copy uses `meta` when clearly secondary

### Tabs

- Compact segmented control
- Active item should be clearer, not louder
- The container should remain neutral
- For tool pages, prefer segmented page tabs for `配置页 / 任务页` switching instead of inventing page-specific tab skins
- Tool-internal segmented tabs must derive from the current tool page's modes, not from app-level navigation data
- Badge counts may appear on the task tab, but should remain secondary to the label
- Do not keep adding visible tab layers after the second level; deeper branching should become filters, anchors, or detail pages

Text defaults:

- tab labels use `body_small` or `button_label`
- active tab label uses `text.primary`
- inactive tab label uses `text.secondary`
- badge counts attached to tabs use `badge_label`

Visual defaults:

- default height should align visually with `32px` controls
- container background should remain neutral or near-neutral
- active tab should use stronger text and slightly clearer surface, not a saturated fill
- tab corners may be rounded, but the control should still read as compact and operational rather than playful

### Buttons

- Buttons should express hierarchy through fill, border, and weight before relying on color
- One area should have one clear primary button at most
- Secondary buttons should remain quiet and neutral
- Subtle or destructive actions should not visually compete with the primary path
- Do not mix multiple button systems with different radii, heights, and shadows in the same action group

Shopify-aligned default button spec:

| Tone | Height | Radius | Label | Background | Text | Border | Typical usage |
|------|--------|--------|-------|------------|------|--------|---------------|
| Primary | `32px` | `10px` | `button_label` | `state.success` | `text.inverse` | `state.success` | Confirm, apply, create, continue |
| Secondary | `32px` | `10px` | `button_label` | `surface.primary` | `text.primary` | `border.strong` | View details, open review, secondary decision |
| Subtle | `32px` | `10px` | `button_label` | `surface.subtle` | `text.secondary` | `border.subtle` | Cancel, dismiss, utility action |
| Destructive | `32px` | `10px` | `button_label` | `state.critical` | `text.inverse` | `state.critical` | Delete, remove, irreversible action |

Size guidance:

- `compact` = `28px`
  - for dense list rows, table actions, compact toolbars
- `default` = `32px`
  - default choice for almost all operational actions
- `large` = `40px`
  - only for page-level decision points or prominent commercial CTA areas

Shape guidance:

- Default button radius is `10px`
- Buttons should remain rounded rectangles, not pills, unless the control is explicitly a chip-like segmented selector
- Do not mix square, sharp-corner, and heavily rounded buttons in one page area

Default intent guidance:

- **Primary**
  - Confirm
  - Apply
  - Create
  - Continue to the true next step
- **Secondary**
  - View details
  - Open review
  - Edit supporting data
- **Subtle / utility**
  - Cancel
  - Dismiss
  - Remove low-priority items
  - Open secondary tools

Avoid:

- two filled primary buttons side by side in the same decision area
- using danger styling for ordinary cancellation
- turning simple links into heavy call-to-action buttons

Text defaults:

- button text uses `button_label`
- primary button text uses `text.inverse`
- secondary and subtle button text use `text.primary` or `text.secondary` based on emphasis
- button labels should stay short and action-led

Color and emphasis rules:

- Primary buttons should use Shopify-aligned green by default on tool pages and operational flows
- Green should indicate the chosen next step, not generic emphasis; if too many buttons are green, hierarchy has already failed
- Secondary buttons should stay white or near-white with a clear border; they should not use tinted semantic fills by default
- Subtle buttons should remain neutral and low-contrast enough to stay out of the primary visual rhythm
- Destructive red may only be used when the action is truly destructive or materially irreversible
- Warning, progress, or info colors should not be used as general-purpose button fills

Special cases:

- Commercial pages may use larger primary CTA buttons, but they still should not introduce neon fills, gradients, or oversized rounded pills as the default
- Dialog footers should usually contain one primary button plus one secondary or subtle companion action
- In dense table or list rows, prefer compact secondary or subtle buttons unless the row itself represents the current next step
- If an action is just navigation to a secondary detail surface, prefer secondary or text-link treatment over primary fill

### Form controls

- Use consistent height, radius, border, and label spacing
- Avoid mixing native browser controls, Shopify web components, and Ant Design controls in one cluster unless required by migration

Additional rules:

- Labels should remain visible and stable; placeholders must not carry the full semantic burden
- Long helper text belongs below the control, not inside the control
- Validation should be specific and local, not broadcast as a page-wide warning unless the issue blocks the whole workflow
- Dense form groups should use panels or spacing, not extra card nesting

Visual defaults:

- input / select / date controls should default to `32px` height in standard forms
- dense inline controls may use `28px` height
- larger `40px` controls should be reserved for prominent top-level forms or commercial decision areas
- default control radius should align with buttons at `10px`
- default field background should be `surface.primary`
- default field text should be `text.primary`
- placeholder text should use `text.tertiary`
- default border should use `border.default`
- focus state should prefer clear border/ring change over glow-heavy effects

### Status badge

- Small semantic pill
- Must remain low-emphasis relative to page titles and action buttons

Additional rules:

- Use badges for state, not decoration
- Do not stack many bright badges in one compact area
- If multiple states are shown, one should be dominant and the rest should be quieter qualifiers

Text defaults:

- badge text uses `badge_label`
- success / warning / progress / critical badges may use semantic text or semantic border/fill
- non-critical qualifier badges should prefer restrained neutral treatment over saturated fills

Visual defaults:

- badge height should typically sit in the `20px` to `24px` range
- border radius should remain pill-like for compact scanning
- default state treatment should favor subtle semantic surfaces over fully saturated fills

### Dialogs and drawers

- Overlays should feel like focused interruptions, not new page shells
- Dialog headers should be short and task-specific
- Footer actions should follow the same primary/secondary hierarchy as the page
- Drawers should be used for supportive work, not for replacing full detail pages

Default usage:

- **Dialog**
  - confirm a costly action
  - show a short preview
  - request one compact decision
- **Drawer**
  - edit supporting data
  - adjust secondary settings
  - inspect contextual detail without abandoning the main workspace

Avoid:

- long multi-section workflows inside a modal
- large hero-like headers in overlays
- decorative overlay backgrounds or exaggerated elevation

Text defaults:

- dialog title uses `card_title` + `text.primary`
- dialog description uses `body_small` + `text.secondary`
- drawer title uses `card_title` + `text.primary`
- drawer helper text uses `body_small` or `meta`

Dialog structure defaults:

- dialog header owns title, helper text, close affordance, and top-level task framing
- dialog body owns the actual content flow; it should not re-create a second shell
- dialog footer owns cancel, confirm, save, apply, and close actions
- footer separation should usually be expressed with a top divider, not a heavy nested card

Dialog type defaults:

- **Dialog Confirm**
  - keep the body compact and summary-oriented
  - avoid nested panels unless a warning block is required
  - footer should usually contain one primary action and one secondary action
- **Dialog Form**
  - body should primarily read as a stacked form, not as a rule card or detail card
  - ordinary fields should sit directly in the form flow without extra heavy panel wrappers
  - use section panels only when the form truly contains grouped summaries, warnings, or auxiliary previews
- **Suggestion Modal**
  - may use one or two restrained sections for summary, comparison, or proposed content
  - should not visually resemble a full page shell with repeated card surfaces
- **Dialog Table / Editor**
  - may use a toolbar, table shell, pagination zone, and footer
  - sectioning may be stronger than `Dialog Form`, but should still stay within one overlay hierarchy

Field control defaults in dialogs:

- boolean fields should prefer switch controls over action-like buttons
- enum fields should prefer selects or segmented controls when the option count is small
- action buttons should only represent explicit actions, not persistent field state
- compact utility actions such as `Refresh`, `Upload`, `Regenerate`, or `Edit` may use button treatments

Avoid:

- wrapping dialog title/description inside another card-like container
- wrapping footer actions inside another rounded panel that reads like a second overlay
- using buttons to represent long-lived boolean state such as `enabled`, `sync`, or `default on`
- stacking multiple heavy bordered panels for ordinary short forms

### AI assist triggers

- `AI Assist` is one shared capability with different trigger shapes based on object scope
- Object-level assist should look explicit and discoverable
- Field-level assist should stay lightweight and local
- Trigger styling should never compete with the page's true primary action

Default trigger rules:

- **Card Assist Trigger**
  - position: card header right side
  - style: compact `secondary` or `subtle` button
  - label: short explicit label such as `AI Improve` or `AI Suggestion`
  - use case: optimize the whole card object, not one field
- **Section Assist Trigger**
  - position: section header right side
  - style: compact button or compact icon-plus-label trigger
  - use case: optimize a grouped content block such as notes, list items, or long instructions
- **Field Assist Trigger**
  - position: field label row right side or trailing side inside the field shell
  - style: small icon button with tooltip
  - tooltip: explicit copy such as `AI improve this field`
  - use case: optimize one field without breaking the current editing flow

Visual defaults:

- card assist trigger should usually use `28px` compact button height
- field assist trigger should usually use a `28px` square icon button
- default trigger radius should align with control radius at `10px`
- card assist triggers should prefer neutral border/button treatments over colored fills
- field assist icons should remain subtle and low-emphasis until hover/focus

Avoid:

- using primary green fills for AI assist triggers by default
- placing multiple same-level AI triggers in the same compact header area
- using unlabeled decorative sparkles as the only affordance for object-level assist

### Suggestion surfaces

- Object-level AI results should use a dedicated suggestion surface
- Field-level AI results should use a lightweight inline suggestion surface
- Result surfaces should support review before apply; they must not auto-overwrite content

Default result rules:

- **Suggestion Modal**
  - used for card-level or object-level results
  - should feel like a focused review modal, not a new page shell
  - should support summary, suggested content, comparison, and apply actions
  - width should generally remain in the `640px` to `760px` range
- **Suggestion Copy**
  - used for field-level or lightweight section-level suggestions
  - should render inline below the field or below the section header
  - should read as a bounded suggestion block, not as error feedback
  - should support `replace`, `insert`, `regenerate`, and `dismiss`

Text defaults:

- suggestion modal title uses `card_title`
- suggestion modal helper text uses `body_small` or `meta`
- suggestion copy label uses `meta` or `badge_label`
- suggestion copy body uses `body` or `body_small`

Visual defaults:

- suggestion modal should use neutral surfaces, restrained border, and standard overlay elevation
- suggestion copy should use `surface.secondary` or `surface.subtle` with `border.subtle`
- suggestion copy should not use strong semantic success/warning fills unless the state itself carries that meaning

Avoid:

- using toast-like banners as the main suggestion container
- returning long object-level AI content as a tiny inline hint below a field
- turning field-level suggestion blocks into heavy modal workflows by default

### Lists and tables

- Use list rows when repeated items are primarily scanned vertically
- Use tables when horizontal comparison across stable columns is the primary task
- Use task cards when each item has state, progress, and its own next step
- Action positions must stay stable across items in the same list

Rules:

- Do not switch between row-style and card-style for the same data set without a strong semantic reason
- Dense operational data should prefer list/table clarity over oversized cards
- Repeated metadata should align consistently so scanning is predictable
- Tables should not default to per-cell AI assist triggers; complex assist belongs in detail editors

Object-type reminders:

- `Summary Row` should read as an entry row, not as a mini editor
- `Rule Card` should read as an operational object card, not as a full editor
- `Simple Form` should keep field controls primary and AI assist secondary
- `AI Suggestion Editor` should foreground suggested content rather than status chrome
- `Detail Editor` may host richer AI assist than the summary list or table entry that launched it

### Empty, loading, and feedback states

- Empty states should explain what is missing and what action unlocks the next step
- Loading states should preserve layout stability and avoid dramatic skeleton theatrics
- Success feedback should confirm completion without becoming celebratory UI
- Error feedback should be specific, actionable, and visually bounded

Avoid:

- illustration-heavy empty states on operational pages
- loading animations that dominate the viewport
- success banners that look like promotions

### Summary metrics

- A summary card can exist, but it must not visually dominate operational content
- Metrics should use restrained surfaces and numeric hierarchy
- Avoid pricing-card, plan-card, or subscription-summary styling for task tools

### Summary header

- Task detail pages should use one unified summary header block instead of multiple competing header sections
- The summary header should combine:
  - back action
  - task identity
  - status
  - a compact summary sentence or summary row
- The summary content should prioritize task context over system metadata
- Prefer one compact summary row such as quantity, output language, source language, style constraint, and object title
- Avoid filling the summary area with low-value internal fields such as raw IDs, duplicated billing fields, or debugging metadata
- Long object titles must truncate cleanly in one line and reveal full value on inspection rather than expanding the header height unpredictably

### Task card

- Organize around:
  - task identity
  - current state
  - progress
  - logs
  - review/apply actions
- Do not style task cards like feature cards or pricing cards
- Task cards may use a dedicated summary line for task context; this line should read like an operational brief, not a metadata dump
- When item titles are long or multiple objects are involved, truncate the object label instead of letting the card become visually noisy
- Card height may be slightly taller than legacy compact cards when it improves scanability of goal, summary, progress, and next action

### Log viewer

- Must read as an execution trace
- Latest step may be slightly emphasized
- The container should stay quiet and highly readable

### Action hierarchy

- On review or detail pages, there should be one visually dominant primary CTA for the true next step
- Auxiliary editing actions such as rating, notes, or further AI refinement should use secondary buttons or utility actions
- Do not present multiple equal-weight action panels beneath the main comparison area
- If auxiliary actions require forms, prefer modal or drawer presentation so the main comparison workspace retains vertical space

### Shared primitive first

- When a shared primitive already exists for a repeated interaction pattern, use it before inventing a page-local shell
- New local shells should be treated as temporary and must justify why an existing primitive is insufficient
- Repeated exceptions should trigger an update to this document and to the shared primitive layer

## Visual Effects Constraints

### Elevation and shadows

- Use subtle card shadows by default
- Stronger elevation is reserved for overlays and rare high-focus surfaces
- Do not stack several heavy-shadow layers in the same viewport

### Color fills and tinting

- Semantic tinting should be sparse and meaningful
- A neutral surface should remain the default background for most work areas
- Do not tint every card in a workflow just to create separation

### Gradients

- Gradients are exceptional accents, not default chrome
- They may appear in controlled, low-noise contexts when the surface still reads as neutral
- Tool pages should not rely on gradients for identity or hierarchy

### Motion and transitions

- Motion should clarify state changes, not advertise polish
- Prefer short, calm transitions for expand/collapse, tab switches, and progress updates
- Avoid bounce, springy theatrics, parallax, or decorative motion loops on operational pages

### Icons and illustration

- Icons should support recognition, not replace labels
- Illustrations should be rare on work-heavy pages
- Decorative imagery must never overpower task controls, logs, or data

### Border and separator usage

- Use borders to define structure before adding stronger fills
- Dividers should be quiet and regular
- Do not frame every subsection with a full border if spacing and headings already communicate the grouping

### Visual anti-patterns

Avoid the following unless the page type explicitly justifies them:

- pricing-card styling on tool pages
- multiple saturated semantic colors in one compact section
- floating glassmorphism or blurred translucent panels as a default pattern
- oversized shadows used to simulate importance
- decorative gradients behind routine operational content
- nested card-on-card-on-card stacks for simple grouping
- oversized icon chips or badges used as visual filler

## Page-Type Templates

## Task-Oriented Tool Template

This template should be the default for Spark tools.

### Suitable examples

- content generation
- translation
- image generation
- diagnosis
- monitoring

### Visual characteristics

- neutral page shell
- restrained config surface
- clear primary action
- explicit task state surfaces
- review and apply sections with clear semantic states
- low-noise footnotes
- page-internal segmented tabs for mode switching when both config and task modes exist
- detail headers that read as compact operational summaries instead of stacked marketing-like blocks
- comparison-focused workspaces where original content and generated content receive the majority of layout space

### Avoid

- billing-style highlight strips
- recommendation ribbons
- comparison-table visual language
- promotional gradients
- dashboard-style KPI emphasis when the page is primarily an action workflow

## Conversation Page Template

Conversation pages may use:

- higher information density in the main column
- embedded interactive cards inside the message flow
- contextual side panels or modals for adding scope and references
- a quieter page shell so the conversation remains the dominant surface

Conversation pages should avoid:

- being re-skinned like tool configuration forms
- treating every embedded card as a full page section
- turning the chat stream into a stack of equally loud cards

## Workspace / Operations Page Template

Workspace and operations pages may use:

- denser list views
- management-oriented side panels
- more explicit filtering and object selection controls
- multi-region layouts when they improve coordination work

Workspace pages should avoid:

- pricing-style emphasis
- decorative dashboards that overpower object management
- excessive card nesting for simple filters or support text

## Commercial Page Template

Billing, plans, or purchase flows can intentionally use stronger emphasis patterns.

These pages may use:

- stronger pricing hierarchy
- recommendation treatment
- plan comparison structures
- more assertive CTA presentation

These patterns belong to commercial pages and must not become the default visual language for task tools.

## Do and Don't

### Do

- fit visually into Shopify Admin
- use neutral surfaces by default
- let semantics drive color
- keep cards, panels, tabs, and badges restrained
- make operational pages feel focused and trustworthy
- keep design tokens and rationale in sync
- judge each page against its page type before applying page-level tastes

### Don't

- use billing pages as the default reference for all tools
- use green as a generic attention color
- stack too many tinted panels in one viewport
- make summaries louder than the primary task area
- use gradients as decoration
- encode layout sequence rules that belong in interaction specs
- treat Billing or AI Assistant as if they were default tool pages

## Implementation Rules

- This file is the visual source of truth.
- Shared tokens and shared primitives should implement this file.
- Page-specific styles should only exist when a shared primitive does not yet exist.
- When a page introduces a repeated pattern, update this file before spreading the pattern.

## Relationship to Other Docs

- `DESIGN.md` defines visual language and component appearance.
- Interaction or workflow documents define task flow, mode switching, and review/apply sequencing.
- If a visual choice would change product flow, it must be decided outside this file.

## Current Migration Guidance

The current priority is to normalize Spark tools around this design system.

Near-term implications:

- `ProductImprovePage` should be judged against the task-oriented tool template, not against billing.
- Existing billing visuals should be treated as commercial-page patterns, not as the default for tools.
- AI Assistant should be judged against the conversation-page template, not against tool-page structure.
- Workspace surfaces should be judged against the workspace / operations template, not against billing or tool templates by default.
- Shared page primitives should gradually replace page-level visual inventions.

## Maintenance

Update this document when:

- a new repeated component pattern becomes standard
- semantic token meanings change
- brand colors or type scale are finalized
- Shopify guidance or implementation strategy changes materially

When updating:

- keep YAML tokens machine-readable
- keep rationale concise and human-readable
- avoid duplicating old values that no longer match implementation

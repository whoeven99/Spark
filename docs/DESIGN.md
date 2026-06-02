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
  section_title:
    fontSize: "18px"
    fontWeight: 700
    lineHeight: 1.3
  body:
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  meta:
    fontSize: "12px"
    fontWeight: 500
    lineHeight: 1.45
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

Most pages in Spark are task-oriented tools. Merchants should feel like they are operating inside a capable Shopify app, not browsing a pricing page or a promotional dashboard.

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
- **Section title**
  - Used for major blocks such as configuration, estimates, results, or task lists.
- **Body**
  - Standard UI copy, labels, descriptions, and item text.
- **Meta**
  - Captions, timestamps, hints, and secondary support text.

### Rules

- Do not rely on color alone to indicate hierarchy.
- Do not make minor labels too small to read comfortably.
- Do not introduce custom display type styles for individual tools.

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

### Page shell

- One clear title
- One concise subtitle when needed
- No billboard-style hero

### Surface card

- Default container for sections
- White or near-white surface
- Subtle border and light shadow

### Inner panel

- Used inside a card for grouped controls, estimates, or logs
- Lower emphasis than the surrounding card

### Tabs

- Compact segmented control
- Active item should be clearer, not louder
- The container should remain neutral
- For tool pages, prefer segmented page tabs for `配置页 / 任务页` switching instead of inventing page-specific tab skins
- Tool-internal segmented tabs must derive from the current tool page's modes, not from app-level navigation data
- Badge counts may appear on the task tab, but should remain secondary to the label

### Form controls

- Use consistent height, radius, border, and label spacing
- Avoid mixing native browser controls, Shopify web components, and Ant Design controls in one cluster unless required by migration

### Status badge

- Small semantic pill
- Must remain low-emphasis relative to page titles and action buttons

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

## Tool Templates

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

## Exception Template: Billing / Commercial Pages

Billing, plans, or purchase flows can intentionally use stronger emphasis patterns.

These pages may use:

- stronger pricing hierarchy
- recommendation treatment
- plan comparison structures
- more assertive CTA presentation

These patterns are exceptions and must not become the default visual language for task tools.

## Do and Don't

### Do

- fit visually into Shopify Admin
- use neutral surfaces by default
- let semantics drive color
- keep cards, panels, tabs, and badges restrained
- make operational pages feel focused and trustworthy
- keep design tokens and rationale in sync

### Don't

- use billing pages as the default reference for all tools
- use green as a generic attention color
- stack too many tinted panels in one viewport
- make summaries louder than the primary task area
- use gradients as decoration
- encode layout sequence rules that belong in interaction specs

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
- Existing billing visuals should be treated as billing-specific exceptions.
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

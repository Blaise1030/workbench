# Button Component Library Design

Date: 2026-04-05
Status: Approved for planning
Owner: Agent + User

## Goal

Create a reusable button component library for this Vue 3 + Tailwind app, then update existing platform usage to consume the new button primitive. Scope is core-only:

- Variants: `primary`, `secondary`, `ghost`, `destructive`
- Sizes: `sm`, `md`, `lg`

## Current Context

- UI is built with Vue 3 SFCs.
- Styling uses Tailwind and theme variables from `src/styles/globals.css`.
- Existing buttons are inline-styled directly in feature components (for example `src/components/ProjectTabs.vue`).

## Chosen Approach

Use a single reusable `BaseButton` component with typed variant and size props.

Why this approach:

- Centralizes button behavior and style tokens in one place.
- Minimizes migration complexity for existing components.
- Makes platform-wide updates simple (edit one primitive, all consumers inherit).

## Architecture

### Files

- `src/components/ui/BaseButton.vue`
  - Button primitive with typed props and native `<button>` semantics.
- `src/components/ui/button.ts`
  - Shared class maps/types for `variant` and `size`.

### Component Contract

`BaseButton` props:

- `variant`: `"primary" | "secondary" | "ghost" | "destructive"` (default `"primary"`)
- `size`: `"sm" | "md" | "lg"` (default `"md"`)
- `type`: native `button` type (default `"button"`)
- `disabled`: native disabled state

Slots:

- Default slot for label/content

Behavior:

- Compose classes from base + variant + size + caller-provided class.
- Forward native attributes/events (`aria-*`, `data-*`, `@click`, etc.).
- Preserve keyboard/focus semantics and disabled behavior.

## Styling Design

Base button classes include:

- Layout: inline-flex alignment and spacing
- Typography: stable text sizing/weight
- Shape: rounded corners aligned with existing radius tokens
- States: hover, focus-visible ring, disabled cursor/opacity

Variant classes:

- `primary`: high emphasis action
- `secondary`: default neutral action
- `ghost`: low-emphasis transparent surface
- `destructive`: destructive intent

Size classes:

- `sm`, `md`, `lg` mapped to height/padding/text scale

## Migration Plan

Initial migration target:

- `src/components/ProjectTabs.vue`

Mapping:

- Selected project tab -> `variant="primary"`
- Unselected project tab -> `variant="secondary"`
- Create tab button -> `variant="ghost"` + dashed border utility override for current affordance

Behavioral parity requirements:

- Keep emitted events identical (`select`, `create`)
- Keep button text and click targets unchanged

## Testing Plan

Add tests that verify:

1. Defaults: renders `primary` + `md` when props are omitted.
2. Variants: each variant applies expected class tokens.
3. Sizes: each size applies expected class tokens.
4. Native forwarding: `type`, `disabled`, `aria-label`, and click behavior forward correctly.
5. Integration: `ProjectTabs` still emits the same events after adopting `BaseButton`.

## Error Handling and Accessibility

- No custom runtime error path needed; invalid values are constrained by prop unions.
- Always default `type="button"` to prevent accidental form submission side effects.
- Preserve visible focus styling and disabled semantics.

## Out of Scope

- Icon-only buttons
- Loading states
- Button groups
- Link-button polymorphism
- Global docs/showcase pages

## Implementation Readiness

This design is scoped and ready for implementation planning.

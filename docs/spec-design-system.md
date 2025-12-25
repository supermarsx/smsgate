# Graphite Glass Design System — Overarching UI Spec

This design system defines the shared visual language for **smsgate2 (web)**, **smsrelay3 (Android)**, and any future admin/ops surfaces. It is **dark-mode first**, with a supportive light mode. The look is **glassmorphism** over **graphite tones**, **textured**, and intentionally **flat-ish** (low-gradient, high-clarity).

---

## 1) Design Goals

- **Operational clarity**: status, latency, presence, and risk must be readable instantly.
- **Glassy, premium, but not flashy**: restrained blur + subtle borders.
- **Dark-first**: optimized for low-light control rooms.
- **Accessible**: text contrast and focus states are non-negotiable.
- **Fast UI**: avoids visual clutter and heavy effects that harm performance.

---

## 2) Core Aesthetic

### 2.1 “Graphite Glass” recipe
- Background: deep graphite gradient *barely perceptible*.
- Surfaces: translucent panes with blur and a thin border.
- Texture: subtle noise overlay to avoid banding and make flat areas feel premium.
- Shadows: soft, short, with low opacity.

### 2.2 Flat-ish rules
- Prefer **solid fills** over gradients.
- If gradients are used, keep them **< 5% delta**.
- Avoid neon. Accents are crisp but controlled.

---

## 3) Color System

### 3.1 Palette (Graphite)

**Dark (default)**
- `G0` — #07090C (root background)
- `G1` — #0B0F14 (base)
- `G2` — #101722 (panel base)
- `G3` — #161F2B (panel hover)
- `G4` — #1D2735 (subtle emphasis)
- `G5` — #253246 (border-strong)

**Light (supportive)**
- `L0` — #F6F7FA (root)
- `L1` — #FFFFFF (surface)
- `L2` — #F0F2F6 (panel)
- `L3` — #E7EBF2 (hover)
- `L4` — #D8DFEA (border)

### 3.2 Text colors

**Dark**
- `T0` — #E9EEF6 (primary)
- `T1` — #B9C4D6 (secondary)
- `T2` — #7E8CA4 (muted)
- `T3` — #536079 (disabled)

**Light**
- `TL0` — #121826 (primary)
- `TL1` — #3A455A (secondary)
- `TL2` — #66728A (muted)

### 3.3 Accents (Exquisite, controlled)

- `A0` (Cyan) — #4CC9FF (primary accent)
- `A1` (Indigo) — #6C7CFF (secondary accent)
- `A2` (Mint) — #39F0C0 (success accent)
- `A3` (Amber) — #FFCC66 (warning)
- `A4` (Rose) — #FF5C7A (danger)

### 3.4 Semantic colors (tokens)

- `--color-primary` = `A0`
- `--color-info` = `A1`
- `--color-success` = `A2`
- `--color-warning` = `A3`
- `--color-danger` = `A4`

### 3.5 Status + presence palette

- Online: `A2` (mint)
- Degraded: `A3` (amber)
- Offline: `A4` (rose)
- Unknown: `T2`

---

## 4) Material Tokens (CSS variables)

### 4.1 Dark mode tokens
```css
:root[data-theme="dark"] {
  --bg: #07090C;
  --bg-2: #0B0F14;
  --panel: rgba(16, 23, 34, 0.62);
  --panel-2: rgba(22, 31, 43, 0.72);
  --panel-solid: #101722;

  --border: rgba(255, 255, 255, 0.08);
  --border-strong: rgba(255, 255, 255, 0.14);

  --text: #E9EEF6;
  --text-2: #B9C4D6;
  --text-3: #7E8CA4;

  --primary: #4CC9FF;
  --info: #6C7CFF;
  --success: #39F0C0;
  --warning: #FFCC66;
  --danger: #FF5C7A;

  --shadow-1: 0 8px 24px rgba(0,0,0,0.35);
  --shadow-2: 0 4px 14px rgba(0,0,0,0.28);

  --blur: 16px;
  --radius-lg: 18px;
  --radius-md: 12px;
  --radius-sm: 10px;
}
```

### 4.2 Light mode tokens
```css
:root[data-theme="light"] {
  --bg: #F6F7FA;
  --bg-2: #FFFFFF;
  --panel: rgba(255, 255, 255, 0.72);
  --panel-2: rgba(240, 242, 246, 0.82);
  --panel-solid: #FFFFFF;

  --border: rgba(18, 24, 38, 0.10);
  --border-strong: rgba(18, 24, 38, 0.16);

  --text: #121826;
  --text-2: #3A455A;
  --text-3: #66728A;

  --primary: #1FA7E6;
  --info: #4658F0;
  --success: #0DBA8C;
  --warning: #D79A2C;
  --danger: #E13E5B;

  --shadow-1: 0 10px 28px rgba(18,24,38,0.10);
  --shadow-2: 0 6px 18px rgba(18,24,38,0.08);

  --blur: 14px;
  --radius-lg: 18px;
  --radius-md: 12px;
  --radius-sm: 10px;
}
```

### 4.3 Glass surface utility
```css
.glass {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  backdrop-filter: blur(var(--blur));
  -webkit-backdrop-filter: blur(var(--blur));
  box-shadow: var(--shadow-2);
}

.glass-strong {
  background: var(--panel-2);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-lg);
  backdrop-filter: blur(calc(var(--blur) + 6px));
  box-shadow: var(--shadow-1);
}
```

### 4.4 Texture overlay (subtle noise)
- Use a tiny noise PNG or SVG data URI.
- Apply at **2–4% opacity**.
- Only on large surfaces.

```css
.noise::before {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  opacity: 0.035;
  mix-blend-mode: overlay;
  background-image: var(--noise-image);
}
```

---

## 5) Typography

### 5.1 Web (smsgate2)
- Primary font: **Inter** (fallback: system UI)
- Sizes:
  - Page title: 22–26
  - Section title: 16–18
  - Body: 14–15
  - Table: 13–14
- Tracking: slightly tighter for headings.

### 5.2 Android (smsrelay3)
- Use system font (Roboto/Google Sans where available).
- Mirror weights and sizing as close as platform guidelines allow.

### 5.3 Type hierarchy
- **One primary headline per screen**.
- Prefer short labels and avoid paragraph walls.

---

## 6) Layout, Spacing, and Density

- Base spacing unit: **8px**
- Comfortable density (default):
  - paddings: 12–18
  - gaps: 10–14
- Compact density (tables/logs):
  - paddings: 8–10

Grid:
- Sidebar: 260–280px
- Content max width: 1200–1400px for admin views

---

## 7) Components (Bulma mapping)

### 7.1 Buttons
- Default: glass outline
- Primary: filled accent with subtle shadow
- Danger: rose with clear confirmation states

States:
- hover: +4% brightness
- active: inset shadow
- disabled: 40% opacity + no glow

### 7.2 Tags/Badges (status)
- Online/degraded/offline/unknown using semantic palette.
- Include icon + label + optional latency number.

### 7.3 Cards / Panels
- Use `.glass` for most panels.
- Use `.glass-strong` for modals and critical info.

### 7.4 Tables
- Flat-ish table rows with subtle separators.
- Hover highlights use `G3` / `L3`.
- Sticky table header with glass background.

### 7.5 Forms
- Inputs:
  - background: `panel-2`
  - border: `border`
  - focus ring: `primary` at low alpha
- Validation:
  - danger ring + helper text

### 7.6 Nav + Sidebar
- Sidebar is a glass surface with grouped nav sections.
- Active item:
  - accent bar + bold label
  - subtle glow (low alpha)

### 7.7 Top Status Bar (smsgate2)
- Always visible.
- Uses compact badges:
  - WS status + RTT
  - Phone presence + RTT
  - E2E latency p50/p95

### 7.8 “iPhone Mockup” component
- Aluminum-like frame (dark graphite, low specular)
- Screen area is a glass surface.
- Messages inside:
  - compact bubbles
  - code-copy button aligned right
  - claimed state greys out bubble + reduces contrast

### 7.9 Logs screen (smsrelay3 + web)
- Monospace for log body.
- Color only for level markers; keep low saturation.
- Provide copy/export actions.

---

## 8) Motion and Feedback

- Prefer **instant** updates; motion should communicate state changes.
- Recommended motion:
  - 120–180ms ease-out
  - subtle opacity/translate (2–6px)
- Avoid heavy parallax.

Realtime events:
- New message appears with a brief fade-in.
- Status badge changes with crossfade.

---

## 9) Accessibility

- Maintain contrast:
  - body text ≥ WCAG AA
  - critical statuses must remain readable over glass
- Focus rings must be visible in dark mode.
- Reduce motion option respected.

---

## 10) Theming Rules

### 10.1 Theme selection
- Default: system preference.
- User override stored per-user:
  - `system | dark | light`

### 10.2 Locale-aware UI
- Keep labels short; allow expansion for pt-PT/es-ES.
- Avoid hardcoded widths for status badges.

---

## 11) Implementation Notes

### 11.1 Web (Bulma)
- Use Bulma core, then override variables + add utility classes:
  - `.glass`, `.glass-strong`, `.noise`, `.badge`, `.metric-pill`

### 11.2 Android
- Mirror palette tokens in a shared JSON.
- Use surfaces with low-elevation and subtle outlines.
- Do not attempt full blur effects where not performant; emulate with translucency and borders.

---

## 12) Deliverables

- Token file (JSON) for colors/sizes
- CSS variables file for smsgate2
- Android theme resources (colors.xml + typography + shapes)
- Component examples:
  - status bar badges
  - table
  - modal
  - phone mockup
  - logs view


---
name: Civic Intelligence Platform
colors:
  surface: '#f8f9ff'
  surface-dim: '#ccdbf3'
  surface-bright: '#f8f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#eff4ff'
  surface-container: '#e6eeff'
  surface-container-high: '#dce9ff'
  surface-container-highest: '#d5e3fc'
  on-surface: '#0d1c2e'
  on-surface-variant: '#43474e'
  inverse-surface: '#233144'
  inverse-on-surface: '#eaf1ff'
  outline: '#73777f'
  outline-variant: '#c3c6d0'
  surface-tint: '#40608b'
  primary: '#001e3d'
  on-primary: '#ffffff'
  primary-container: '#0c335c'
  on-primary-container: '#7d9ccb'
  inverse-primary: '#a8c8fa'
  secondary: '#b12b2f'
  on-secondary: '#ffffff'
  secondary-container: '#fd6260'
  on-secondary-container: '#65000c'
  tertiary: '#001658'
  on-tertiary: '#ffffff'
  tertiary-container: '#002789'
  on-tertiary-container: '#7a94ff'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#d4e3ff'
  primary-fixed-dim: '#a8c8fa'
  on-primary-fixed: '#001c3a'
  on-primary-fixed-variant: '#264872'
  secondary-fixed: '#ffdad7'
  secondary-fixed-dim: '#ffb3af'
  on-secondary-fixed: '#410005'
  on-secondary-fixed-variant: '#8f0f1a'
  tertiary-fixed: '#dde1ff'
  tertiary-fixed-dim: '#b8c4ff'
  on-tertiary-fixed: '#001453'
  on-tertiary-fixed-variant: '#173bab'
  background: '#f8f9ff'
  on-background: '#0d1c2e'
  surface-variant: '#d5e3fc'
typography:
  headline-xl:
    fontFamily: Source Sans 3, PingFang SC, Microsoft YaHei, sans-serif
    fontSize: 30px
    fontWeight: '700'
    lineHeight: 38px
  headline-xl-mobile:
    fontFamily: Source Sans 3, PingFang SC, Microsoft YaHei, sans-serif
    fontSize: 22px
    fontWeight: '700'
    lineHeight: 28px
  headline-lg:
    fontFamily: Source Sans 3, PingFang SC, Microsoft YaHei, sans-serif
    fontSize: 22px
    fontWeight: '600'
    lineHeight: 30px
  headline-md:
    fontFamily: Source Sans 3, PingFang SC, Microsoft YaHei, sans-serif
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 26px
  body-lg:
    fontFamily: Source Sans 3, PingFang SC, Microsoft YaHei, sans-serif
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Source Sans 3, PingFang SC, Microsoft YaHei, sans-serif
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  body-sm:
    fontFamily: Source Sans 3, PingFang SC, Microsoft YaHei, sans-serif
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 18px
  label-numeric-lg:
    fontFamily: JetBrains Mono, tabular-nums, monospace
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 36px
  label-numeric-md:
    fontFamily: JetBrains Mono, tabular-nums, monospace
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 24px
  label-numeric-sm:
    fontFamily: JetBrains Mono, tabular-nums, monospace
    fontSize: 13px
    fontWeight: '500'
    lineHeight: 16px
  label-caps:
    fontFamily: Source Sans 3, PingFang SC, sans-serif
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  gutter: 1rem
  gutter-desktop: 1.5rem
  margin: 1rem
  margin-desktop: 2rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2rem
---

## Brand & Style

The design system establishes a digital government interface designed for municipal street-level public service data reporting, validation, and automated decision assistance. 

### Brand Personality & Tone
- **Authoritative & Legitimate:** Evokes institutional trust, structural integrity, and regulatory compliance without feeling archaic.
- **Methodical & Precise:** Eliminates ambiguity. Information is presented with tabular discipline, rigorous status terminology, and zero decorative noise.
- **Modern Institutional (Digital Government):** Synthesizes modern enterprise SaaS efficiency with traditional official document standards (公文规范).

### Visual Aesthetic
The system draws from **Corporate Modernism** fused with **Official Document Architecture**:
- Crisp planar surfaces layered over structured institutional backgrounds.
- High typographic discipline emphasizing tabular legibility and strict visual categorization.
- High-contrast, standardized administrative state-tagging for immediate field review.

## Colors

The palette balances administrative authority, legal-grade attention triggers, and cognitive ergonomics for extended municipal data processing.

### Primary Canvas & Neutrals
- **Background Root:** `#f1f5f9` (Slate 100) — Calibrated cool administrative slate.
- **Card & Document Surface:** `#ffffff` (Pure Document White) — Crisp public-record paper contrast.
- **Dividers & Structural Borders:** `#cbd5e1` (Slate 300) and `#e2e8f0` (Slate 200).
- **Primary Text:** `#0f172a` (Slate 900) — Deep optical contrast for prolonged reading.
- **Muted Text / Annotations:** `#475569` (Slate 600).

### Institutional Core Tokens
- **Primary (`#0c335c`):** Institutional Executive Navy. Applied to top headers, key action bars, and root navigation.
- **Secondary (`#9f1d24`):** Seal Vermilion / Seal Red (公章红). Used for critical approvals, formal rejections, and administrative seal indicators.
- **Action Accent (`#1e40af` / `#2563eb`):** Cooperative Digital Blue. Applied to active states, buttons, links, and operational controls.

### Administrative Status Tokens
Each status term carries strict document-semantic exclusivity:
- **现行 / 新入库 (Active / Fresh Ingest):** Foreground `#15803d`, Surface `#f0fdf4`, Border `#bbf7d0`.
- **待核 / 待人工复核 (Pending Review):** Foreground `#1d4ed8`, Surface `#eff6ff`, Border `#bfdbfe`.
- **失败待重试 (Failed / Retry):** Foreground `#b45309`, Surface `#fffbeb`, Border `#fde68a`.
- **重复跳过 (Duplicate Skipped):** Foreground `#475569`, Surface `#f8fafc`, Border `#cbd5e1`.
- **已替代 (Superseded - Historic):** Foreground `#64748b`, Surface `#f1f5f9`, Border `#e2e8f0`.
- **被替代 (Replaced - Active Risk):** Foreground `#c2410c`, Surface `#fff7ed`, Border `#ffedd5`.
- **内部专用 (Internal Flag):** Foreground `#6d28d9`, Surface `#f5f3ff`, Border `#ddd6fe`.
- **待补充 (Incomplete / Pending Supplement):** Foreground `#c2410c`, Surface `#fef2f2`, Border `#fecaca`.
- **已退回 (Rejected / Returned):** Foreground `#9f1d24`, Surface `#fef2f2`, Border `#fca5a5`.

## Typography

Typography prioritizes information density, non-ambiguity, and tabular numerical precision.

### Font Hierarchy & Stacking
- **Chinese Administrative Primary:** Systematic fallback order: `"PingFang SC", "Microsoft YaHei", "SimHei", sans-serif`. For formal policy quote callouts and official dispatch extracts, apply `FangSong, SimSun, serif` strictly within blockquotes.
- **Interface & Data Display:** `Source Sans 3` paired with `JetBrains Mono` for alphanumeric sequences, file registry codes, citizen record IDs, and statistical indices.
- **Tabular Figures:** All data tables, summary counters, and comparison charts enforce `font-variant-numeric: tabular-nums` to guarantee vertical column alignment.

## Layout & Spacing

The interface implements a **Structural Desktop-First Grid** optimized for high-density administrative dispatch dashboards and multi-column verification consoles.

### Grid & Canvas Structure
- **Global Layout:** Fixed top utility bar (height: 56px), left institutional tree rail (fixed 240px width), fluid operational workspace (min-width: 1024px, max-width: 1920px).
- **Workspace Layout:** 12-column dynamic grid system with `gutter-desktop` (24px) on wide viewports (≥1280px), collapsing to 16px below 1280px.
- **Data Table Layout:** Fixed-header layout with strict column boundaries. Cell spacing preserves tight vertical padding (`space-xs` to `space-sm`) to maximize visible records per viewport fold.

### Responsive Breakpoints
- **Desktop Primary (≥1280px):** Full operational tri-pane view (Directory / Comparison View / Verification Audit Panel).
- **Compact Desktop / Tablet Landscape (1024px - 1279px):** Left navigation collapses into icon-rail, inspection panels convert into drawer overlays.
- **Mobile Handheld (≤768px):** Dedicated inspection emergency mode. Multi-column tables collapse into vertical structured record cards.

## Elevation & Depth

Visual hierarchy uses crisp boundary containment and subtle surface layering rather than dramatic drop shadows.

### Depth Stratification
1. **Canvas Layer (Level 0):** Background tone `#f1f5f9`. Recessed, non-interactive foundation.
2. **Document & Card Layer (Level 1):** `#ffffff` with a sharp 1px border (`#cbd5e1`). Shadow is ambient and negligible: `box-shadow: 0 1px 2px 0 rgba(15, 23, 42, 0.05)`.
3. **Elevated Toolbar / Fixed Headers (Level 2):** Subtle structural separation using `0 2px 4px -1px rgba(15, 23, 42, 0.06)`, framed with a solid bottom border `#cbd5e1`.
4. **Modal / Verification Drawers (Level 3):** Administrative review dialogs and error inspectors use clean directional elevation: `0 10px 15px -3px rgba(15, 23, 42, 0.1), 0 4px 6px -4px rgba(15, 23, 42, 0.05)` accompanied by a 30% slate backdrop curtain (`rgba(15, 23, 42, 0.3)`).

### Ghost Borders & Document Margins
Components avoid floating card looks. All sections utilize structural 1px dividers to preserve the feel of printed governmental ledgers and administrative folders.

## Shapes

The design system adopts a **Soft Industrial Geometry (Level 1)**.
- Base interactive controls (buttons, inputs, select triggers): `0.25rem` (4px).
- Panels, metric modules, and document cards: `0.375rem` (6px) or `0.5rem` (8px max).
- Status tags and badge elements: `2px` to `4px` maximum corner radius. Fully circular pills (`rounded-full`) are prohibited for official status tokens to preserve formal administrative gravity.

## Components

### 1. Document Paper Cards (`DocumentPaper`)
- **Structure:** Clean white surface (`#ffffff`), 1px solid border (`#cbd5e1`), subtle top accent rule (2px) in `#0c335c` for primary dashboards or `#9f1d24` for flagged verification streams.
- **Header:** Integrated title block featuring 14px bold labeling, metadata tag alignment, and quick export action triggers.

### 2. Statistical Metric Cards (KPI Blocks)
- **Numerical Prominence:** Display critical reporting metrics (e.g., `296`, `234`, `530`) in `JetBrains Mono` bold 32px (`label-numeric-lg`).
- **Contextual Delta:** Secondary row contains comparison trends (e.g., `周环比 +4.2%`) with strict status colors (green for compliant progress, seal red for anomaly surges).

### 3. Data Audit & Reconciliation Table
- **Header Row:** Background `#f8fafc`, text `#475569` (12px bold, tracking uppercase), border-bottom `2px solid #cbd5e1`.
- **Data Rows:** Height 44px (condensed) or 52px (standard). Alternating zebra striping optional; hover row state uses `#f8fafc` with a left border highlight in `#1e40af`.
- **Number Columns:** Strict right-alignment using `JetBrains Mono`.

### 4. Administrative Status Badges
- **Dimensions:** Height 22px, horizontal padding 8px, font size 12px, border-radius 2px.
- **Rendering:** Solid light-tint surface matching the status background color, paired with a matching 1px border and high-contrast text. No decorative glow or drop shadows.

### 5. Input Fields & Form Controls
- **Resting State:** Height 36px, background `#ffffff`, border `1px solid #cbd5e1`, font size 14px.
- **Focus State:** Border color `#1e40af`, outline `2px solid rgba(30, 64, 175, 0.15)`.
- **Read-Only / Official Archived State:** Background `#f8fafc`, text `#64748b`, border-style dashed.

### 6. Verification Issue Flow (问题单检查流)
- **Visual Pattern:** Sequential stepped timeline on the right side of the verification desk.
- **States:** Completed steps show green checkmarks with thin hairline links; pending manual reviews (待人工复核) pulse with a subtle cooperative blue rim; rejected items (已退回) display an explicit seal red stamp badge with auditor commentary fields.
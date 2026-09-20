# Design — Outsiderr design system

One-sentence purpose: the actual design tokens and component patterns as used in code — read before building any UI.
Last updated: 2025-09-20

## 1. Principles

- Dark-first, cinematic but legible. Neon accents are decoration, not structure.
- Culture-first: bold and confident, not sterile SaaS.
- Mobile-first "app feel": momentum scroll, fast taps, no bounce, no text-select on controls.
- Status is always explicit — pending/approved/rejected/clarification are visually distinct.

## 2. Tokens (as defined in `tailwind.config.ts` + `globals.css`)

### Colors

| Token | Value | Use |
|---|---|---|
| `ink` | `#0A0A0E` | dark-mode page background (`dark:bg-ink`) |
| `violet-neon` | `#8B5CF6` | primary accent, links, focus rings, active states |
| `pink-neon` | `#EC4899` | secondary accent, gradient end |
| `lime-neon` | `#E2F163` | rare highlight accent |
| zinc scale | Tailwind zinc | borders `zinc-200`/`white/10`, muted text, light surfaces |
| light theme | bg `#fafafa`, fg `#18181b` | `:root` CSS vars |
| semantic | emerald = success/confirmed · amber = pending/warning · red = danger/rejected · blue = info/clarification | status badges/banners |

### Effects

| Token | Value | Use |
|---|---|---|
| `neon-gradient` | `linear-gradient(90deg,#8B5CF6→#EC4899)` | `bg-neon-gradient` — primary CTAs, logo moments, branded loader |
| `shadow-glow-violet` | `0 0 20px rgba(139,92,246,.5)` | hover glow on primary elements |
| `shadow-glow-pink` / `-lime` | same pattern | sparingly |
| `.glass` | frosted panel (semi-opaque bg + `backdrop-blur-sm`) | cards, panels, navbar, dropdowns. **blur-sm intentionally** — `blur-md` caused scroll jank on low-end phones |
| `animate-fade-in` | 0.25s opacity+translateY | card/list entry |

### Radii & borders

- `rounded-full` — buttons, pills, chips, avatars.
- `rounded-2xl` — inputs, inner cards, dropdown items.
- `rounded-3xl` — page-level cards/panels.
- Borders: `border-zinc-200 dark:border-white/10`; subtle, 1px.

## 3. Typography

Font stack: system `font-sans` (no custom webfont loaded — body class in `src/app/layout.tsx`).

| Level | Classes | Example |
|---|---|---|
| Page title | `text-2xl font-black` | "KYC Review" |
| Section header | `text-lg`/`text-base font-bold` | card titles |
| Body | `text-sm` | paragraphs, lists |
| Muted/secondary | `text-xs text-muted` or `text-[10px] text-muted` | metadata, timestamps |
| Eyebrow label | `text-[10px] font-bold uppercase tracking-wide text-muted` | "PAN", "Bank Account" |
| Mono | `font-mono` | PINs, bank numbers, amounts, IDs |

## 4. Spacing & layout

- 8px rhythm: `gap-2/3/4`, `p-3`/`p-5`, `space-y-4`/`space-y-6`, `py-6` page padding.
- Admin: fixed sidebar `w-52` (desktop), mobile bottom tab bar (`fixed bottom-0`, icon + 10px label).
- Cards: `glass rounded-3xl p-5 space-y-4` is the standard recipe.
- z-index ladder: overlay `z-40`, menus/dropdowns `z-50`, mobile tab bar `z-30`.

## 5. Component catalog (→ `modules/shared/ui` after restructure)

Primitives: `Button`, `SubmitButton`/`ActionButton` (pending state), `Badge`, `Modal`, `Skeleton`, `BrandedLoader`/`BrandedPageLoader`, `QrCode` + `DownloadQrButton`, `PhoneInput`, `ImageCropper`, `NavigationProgress`, `InstagramIcon`, `WhatsAppIcon`.
Layout: `Navbar`, `Footer`, `UserMenu`, `NotificationBell`, `ThemeToggle`, `ThemeLogo`, `LocationSelector`.
Domain components live in their module (`modules/<m>/components/`).

## 6. Patterns

- **Status badge:** `rounded-full px-3 py-1 text-[10px] font-bold` + semantic bg/text pair (`bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400`, etc. — see `kyc-review-card.tsx` `statusColors`).
- **Form field:** `label` (eyebrow class) + `w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2.5 text-sm focus:border-violet-neon dark:border-white/10 dark:bg-white/5`.
- **Destructive action:** `confirm()` dialog + red pill button.
- **Empty state:** `glass rounded-3xl p-8 text-center` + muted copy.
- **Loading:** `BrandedLoader` in every `loading.tsx`; skeletons for content structure.
- **Banner:** `glass rounded-3xl border-2` + icon + title + muted message (see `kyc-status-banner.tsx` — amber/red/blue by status).

## 7. Accessibility & motion

- `aria-label` on all icon-only buttons; Escape closes dropdowns/menus; click-outside closes.
- `touch-action: manipulation` on buttons/links; `overscroll-behavior-y: none`.
- No global `scroll-behavior: smooth` — it fights App Router scroll restoration (documented in globals.css).
- `.no-scrollbar` for horizontal chip rails.

## 8. Brand assets

- `public/darkmode.png` / `public/lightmode.png` — theme-aware logo via `ThemeLogo`.
- Favicon: `src/app/icon.tsx`, `apple-icon.tsx`; PWA: `manifest.ts`, `public/sw.js`.
- Poster specs: card ~3:4, banner ~16:9, ≤1.5 MB, Supabase Storage.

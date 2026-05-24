---
name: ui-ux-designer
description: Use when building, designing, or improving UI/UX — from scratch or on existing code. Triggers on: design from scratch, build UI, create component, add animation, scroll animation, animated scrolling, scroll effect, 3D hero, 3D element, Three.js, GSAP, Framer Motion, Lenis, smooth scroll, glassmorphism, neobrutalism, neumorphism, claymorphism, bento layout, design system, design tokens, color palette, typography scale, landing page, hero section, redesign, improve UI, dark mode design, parallax, particle effect, WebGL, React Three Fiber, CSS animation, micro-interaction, page transition, motion design. For auditing existing visual design run sys-admin:ui-visual-qa instead.
---

# UI/UX Designer — Build, Animate, and Ship

## Mission

Act as a senior UI/UX engineer. Design and build polished interfaces with professional-grade animations, scroll effects, and 3D elements. Output ready-to-use code blocks with explanations. Never write directly to project files — paste blocks so the user controls what lands.

**Web research first.** Before generating any design pattern, animation recipe, or component, search the web for the current best implementation — real codepen demos, GitHub repos, official docs, and production site tear-downs. Don't rely on training knowledge alone; the web has fresher patterns.

---

## Web research protocol

**Trigger web research whenever:**
- Specific library version syntax is needed (GSAP 3.x ScrollTrigger, Framer Motion 11+, R3F v8+)
- User names a specific company's design (Stripe, Linear, Vercel, Loom, Raycast, etc.) — fetch their live site's CSS
- User asks for "the best" or "latest" approach to any animation/3D/design pattern
- A pattern feels complex enough that an existing open-source implementation probably exists
- User says words like: "how do real sites do X", "show me examples", "what's current best practice"

**What to search/fetch:**
```
Design inspiration sources (fetch these):
  https://github.com/voltagent/awesome-design-md   → company DESIGN.md files (Stripe, Linear, Vercel, 70+ more)
  https://www.designsystems.com/                    → design system directory
  https://bestofjs.org/                             → current trending JS animation/3D libs
  https://codepen.io/trending                       → live demos of animations/effects
  https://tympanus.net/codrops/                     → cutting-edge CSS/WebGL demos with source code
  https://ui.aceternity.com/                        → production-ready animated React components
  https://magicui.design/                           → animated component library
  https://animata.design/                           → animation collection with source
  https://www.hover.dev/                            → hover effect patterns

Library docs (always fetch for version-specific syntax):
  https://gsap.com/docs/v3/Plugins/ScrollTrigger/  → GSAP ScrollTrigger API
  https://www.framer.com/motion/                    → Framer Motion API
  https://threejs.org/docs/                         → Three.js docs
  https://docs.pmnd.rs/react-three-fiber/           → R3F docs
  https://lenis.darkroom.engineering/               → Lenis docs

Real-site CSS inspection (fetch homepage source):
  https://stripe.com/                               → fintech: Sohne, indigo, pill buttons
  https://linear.app/                               → SaaS: dark, 4px grid, lavender, no shadows
  https://vercel.com/                               → dev tools: geist, stark contrast, minimal
  https://raycast.com/                              → premium dark: gradients, glow, floating cards
  https://craft.do/                                 → playful: vibrant, rounded, clay-like
```

**Research output format:**
After fetching, extract: library version, exact API signature, gotchas, performance notes, and paste a condensed summary before the code block. Cite the source URL.

---

## Playwright scraping protocol

**Before generating any component or animation pattern, scrape design resources live using Playwright MCP.**  
Real implementations beat generated guesses every time. Always scrape first if Playwright MCP is connected.

### Priority scraping targets

| Site | What to scrape | How |
|------|---------------|-----|
| **https://21st.dev** | Component library — UI elements, animations, effects | Browse category pages, click components, extract source code tab |
| **https://ui.aceternity.com/components** | Animated React components (3D cards, spotlight, sparkles, Aurora) | Navigate to component, scrape code blocks |
| **https://magicui.design/components** | Animated components (particles, meteors, shimmer, ripple) | Navigate and extract |
| **https://animata.design** | Animation patterns with source | Extract code from animation demos |
| **https://www.hover.dev/components** | Hover effect components | Browse and extract source |
| **https://tympanus.net/codrops/** | Cutting-edge CSS/WebGL demos | Find demo, view source link, scrape JS/CSS |
| **https://codepen.io/trending** | Live trending demos | Search for the effect, scrape source |
| **https://github.com/voltagent/awesome-design-md** | Company DESIGN.md files | Fetch raw DESIGN.md per company slug |

### Scraping workflow (Playwright MCP)

```
1. Navigate to target site
2. Browse to the relevant category / search for the effect name
3. Click component / demo to open detail view
4. Extract the source code (look for "Code" tab, "View Source", or CodeSandbox link)
5. Read the extracted code — identify: library, version, key technique
6. Adapt to the project's stack (React/Vue/vanilla JS)
7. Output adapted code block + cite source URL
```

### Example — scrape 21st.dev for a scroll animation

```
User: "add a scroll reveal animation to my feature cards"

1. Navigate: https://21st.dev → search "scroll reveal" or browse Animations category
2. Find a matching component (e.g., "Fade Up on Scroll")
3. Click → copy source code from "Code" tab
4. Extract: library used (motion/GSAP/CSS), props interface, CSS classes
5. Adapt: if React + Framer Motion, wrap in user's component structure
6. Output with: Source: https://21st.dev/... | Library: framer-motion 11.x
```

### Scrape company design patterns

When user says "make it look like X":
```
Stripe  → fetch https://raw.githubusercontent.com/voltagent/awesome-design-md/main/design-md/stripe/DESIGN.md
Linear  → fetch https://raw.githubusercontent.com/voltagent/awesome-design-md/main/design-md/linear/DESIGN.md
Vercel  → fetch https://raw.githubusercontent.com/voltagent/awesome-design-md/main/design-md/vercel/DESIGN.md
Raycast → fetch https://raw.githubusercontent.com/voltagent/awesome-design-md/main/design-md/raycast/DESIGN.md
Loom    → fetch https://raw.githubusercontent.com/voltagent/awesome-design-md/main/design-md/loom/DESIGN.md
Notion  → fetch https://raw.githubusercontent.com/voltagent/awesome-design-md/main/design-md/notion/DESIGN.md
Figma   → fetch https://raw.githubusercontent.com/voltagent/awesome-design-md/main/design-md/figma/DESIGN.md
```

Extract: exact hex values, font names + weights, spacing base, border-radius values, shadow definitions, animation durations. Then generate tokens that match.

### Fallback when Playwright MCP not connected

Use WebFetch tool to fetch static content from the same URLs. For JavaScript-rendered sites (like 21st.dev), fetch the GitHub source if the component is open-source, or use the web research protocol above.

---

## Non-negotiable rules

- **Code blocks only** — no file writes. User pastes into their project.
- **`prefers-reduced-motion` always** — wrap every GSAP/CSS animation with reduced-motion check.
- **GPU-only transform properties** — animate `transform` and `opacity` only. Never `width`, `height`, `margin`, `top`, `left` (causes layout thrashing).
- **Mobile fallback for 3D/WebGL** — detect `window.matchMedia('(max-width: 768px)')` or device memory; degrade gracefully.
- **WCAG AA minimum** — all text contrast ≥ 4.5:1 (normal), ≥ 3:1 (large). Use design tokens, not hardcoded hex.
- **After build: recommend `sys-admin:ui-visual-qa`** — audit what was built.

---

## Mode detection

Read the request and pick one mode:

| Request signals | Mode |
|-----------------|------|
| "build from scratch", "new landing page", "create a design system" | **Mode A — Full design process** |
| "add animation to...", "make this scroll nicely", "add 3D to hero" | **Mode B — Add to existing** |
| "restyle this", "make it look like Stripe", "use glassmorphism" | **Mode C — Restyle** |
| "design tokens", "spacing system", "color palette" | **Mode D — Design system only** |

State detected mode before starting.

---

## Step 1 — Discovery (Mode A + C only)

Ask max 3 questions. One at a time.

**Q1 — Product type:**
```
A) Landing / marketing page
B) SaaS dashboard / app
C) Portfolio / personal
D) E-commerce
E) Mobile-first (PWA, React Native Web)
```

**Q2 — Visual tone:**
```
A) Minimal / clean (Notion, Linear style)
B) Bold / editorial (Vercel, Loom style)
C) Dark / premium (Raycast, Figma style)
D) Playful / vibrant (Craft, Pitch style)
E) Corporate / enterprise (Salesforce, SAP style)
```

**Q3 — Animation level:**
```
A) Subtle (hover states, fade-ins only)
B) Moderate (scroll reveals, smooth transitions)
C) Rich (parallax, 3D, GSAP-level choreography)
```

Skip Q1-Q3 for Mode B (user has context) and Mode D (tokens only).

---

## Step 2 — Design tokens

Generate CSS custom properties first. Everything derives from these.

```css
/* ─── DESIGN TOKENS ───────────────────────────── */
:root {
  /* Color — semantic (swap out the hex for the chosen palette) */
  --color-bg:         #ffffff;
  --color-bg-raised:  #f8f9fa;
  --color-bg-overlay: #f1f3f5;
  --color-border:     #e9ecef;
  --color-text:       #212529;
  --color-text-muted: #6c757d;   /* ≥4.5:1 on bg */
  --color-accent:     #5c6bc0;   /* ≥4.5:1 on bg */
  --color-accent-hover: #3f4eb5;
  --color-danger:     #e53e3e;
  --color-success:    #38a169;

  /* Typography */
  --font-sans: 'Inter', system-ui, -apple-system, sans-serif;
  --font-mono: 'JetBrains Mono', 'Fira Code', monospace;
  --text-xs:   0.75rem;   /* 12px */
  --text-sm:   0.875rem;  /* 14px */
  --text-base: 1rem;      /* 16px */
  --text-lg:   1.125rem;  /* 18px */
  --text-xl:   1.25rem;   /* 20px */
  --text-2xl:  1.5rem;    /* 24px */
  --text-3xl:  1.875rem;  /* 30px */
  --text-4xl:  2.25rem;   /* 36px */
  --text-5xl:  3rem;      /* 48px */
  --text-6xl:  3.75rem;   /* 60px */
  --leading-tight:  1.25;
  --leading-normal: 1.5;
  --leading-loose:  1.75;
  --weight-normal: 400;
  --weight-medium: 500;
  --weight-semibold: 600;
  --weight-bold: 700;

  /* Spacing — 4pt base */
  --space-1:  0.25rem;  /* 4px */
  --space-2:  0.5rem;   /* 8px */
  --space-3:  0.75rem;  /* 12px */
  --space-4:  1rem;     /* 16px */
  --space-5:  1.25rem;  /* 20px */
  --space-6:  1.5rem;   /* 24px */
  --space-8:  2rem;     /* 32px */
  --space-10: 2.5rem;   /* 40px */
  --space-12: 3rem;     /* 48px */
  --space-16: 4rem;     /* 64px */
  --space-20: 5rem;     /* 80px */
  --space-24: 6rem;     /* 96px */

  /* Radius */
  --radius-sm:   4px;
  --radius-md:   8px;
  --radius-lg:   12px;
  --radius-xl:   16px;
  --radius-2xl:  24px;
  --radius-full: 9999px;

  /* Elevation / shadow */
  --shadow-xs: 0 1px 2px rgba(0,0,0,0.05);
  --shadow-sm: 0 1px 3px rgba(0,0,0,0.1), 0 1px 2px rgba(0,0,0,0.06);
  --shadow-md: 0 4px 6px rgba(0,0,0,0.07), 0 2px 4px rgba(0,0,0,0.06);
  --shadow-lg: 0 10px 15px rgba(0,0,0,0.1), 0 4px 6px rgba(0,0,0,0.05);
  --shadow-xl: 0 20px 25px rgba(0,0,0,0.1), 0 10px 10px rgba(0,0,0,0.04);

  /* Motion */
  --ease-out:    cubic-bezier(0.0, 0.0, 0.2, 1);
  --ease-in-out: cubic-bezier(0.4, 0.0, 0.2, 1);
  --ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
  --duration-fast:   150ms;
  --duration-normal: 250ms;
  --duration-slow:   400ms;
  --duration-page:   600ms;

  /* Z-index scale */
  --z-base:    0;
  --z-raised:  10;
  --z-dropdown: 100;
  --z-sticky:  200;
  --z-overlay: 300;
  --z-modal:   400;
  --z-toast:   500;
  --z-tooltip: 600;
}

/* Dark mode — override only what changes */
[data-theme="dark"],
@media (prefers-color-scheme: dark) {
  :root {
    --color-bg:         #0a0a0a;
    --color-bg-raised:  #111111;
    --color-bg-overlay: #1a1a1a;
    --color-border:     #2a2a2a;
    --color-text:       #ededed;
    --color-text-muted: #888888;
    --shadow-sm: 0 1px 3px rgba(0,0,0,0.4);
    --shadow-md: 0 4px 6px rgba(0,0,0,0.4);
    --shadow-lg: 0 10px 15px rgba(0,0,0,0.5);
  }
}

/* Reduced motion — global kill switch */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## Step 3 — Style preset recipes

Pick one per project. Each recipe overrides the base tokens + adds signature CSS.

### Glass (Glassmorphism)
Best for: dark backgrounds, SaaS dashboards, hero sections.
```css
.glass {
  background: rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(16px) saturate(180%);
  -webkit-backdrop-filter: blur(16px) saturate(180%);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: var(--radius-xl);
}
/* Tokens override */
:root {
  --color-bg: #0d0d1a;
  --color-bg-raised: rgba(255,255,255,0.06);
  --color-accent: #818cf8;
}
```

### Neobrutal (Neo-brutalism)
Best for: bold marketing pages, tools, developer products.
```css
.neobrutal {
  border: 2px solid #000;
  box-shadow: 4px 4px 0px #000;
  border-radius: 0;
  transition: box-shadow var(--duration-fast), transform var(--duration-fast);
}
.neobrutal:hover {
  box-shadow: 6px 6px 0px #000;
  transform: translate(-2px, -2px);
}
:root {
  --color-bg:     #fffbe6;
  --color-accent: #ff3333;
  --radius-md:    0px;
  --font-sans:    'Space Grotesk', sans-serif;
}
```

### Clay (Claymorphism)
Best for: playful apps, mobile-first, consumer products.
```css
.clay {
  border-radius: var(--radius-2xl);
  box-shadow:
    inset 0 -6px 0 rgba(0,0,0,0.15),
    0 8px 30px rgba(0,0,0,0.12),
    inset 0 1px 0 rgba(255,255,255,0.8);
  background: linear-gradient(145deg, #f0f4ff, #e8eeff);
}
:root {
  --radius-md: 16px;
  --radius-lg: 24px;
  --color-accent: #6c63ff;
}
```

### Neu (Neumorphism)
Best for: settings screens, controls, soft-UI dashboards.
```css
:root { --color-bg: #e0e5ec; }
.neu {
  background: var(--color-bg);
  border-radius: var(--radius-xl);
  box-shadow:
     8px  8px 16px #b8bec7,
    -8px -8px 16px #ffffff;
}
.neu-inset {
  box-shadow:
    inset  6px  6px 12px #b8bec7,
    inset -6px -6px 12px #ffffff;
}
```

### Bento
Best for: portfolio, product showcases, grid feature pages.
```css
.bento-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: var(--space-4);
}
.bento-card {
  background: var(--color-bg-raised);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-xl);
  padding: var(--space-6);
  overflow: hidden;
  /* Span patterns */
}
.bento-card--wide   { grid-column: span 2; }
.bento-card--tall   { grid-row: span 2; }
.bento-card--hero   { grid-column: span 2; grid-row: span 2; }
```

### Premium (dark editorial)
Best for: SaaS pricing, agency sites, tools with dark aesthetic.
```css
:root {
  --color-bg:        #070707;
  --color-bg-raised: #0f0f0f;
  --color-border:    #1f1f1f;
  --color-text:      #fafafa;
  --color-accent:    #c084fc;
  --font-sans:       'Geist', 'Inter', sans-serif;
}
.premium-card {
  background: linear-gradient(135deg, #0f0f0f 0%, #1a1a1a 100%);
  border: 1px solid #2a2a2a;
  border-radius: var(--radius-xl);
  position: relative;
  overflow: hidden;
}
.premium-card::before {            /* glow border */
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: linear-gradient(135deg, #c084fc22, #818cf822);
  mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  -webkit-mask-composite: xor;
  mask-composite: exclude;
  padding: 1px;
}
```

### Minimal
Best for: content sites, documentation, B2B SaaS.
```css
:root {
  --color-bg:      #ffffff;
  --color-text:    #111111;
  --color-accent:  #0070f3;
  --radius-md:     6px;
  --shadow-sm:     none;
  --font-sans:     'Inter', sans-serif;
}
.minimal-card {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-6);
}
```

---

## Step 4 — Animation library decision tree

```
What are you animating?
│
├─ Simple hover/focus/show states
│    → CSS transitions (zero dependencies)
│
├─ Scroll-triggered reveals, staggered lists, hero entrance
│    → GSAP + ScrollTrigger  (best control, 60fps, ~30KB gzip)
│
├─ React components (mount/unmount, drag, layout shifts)
│    → Framer Motion  (native React, declarative, exit animations)
│
├─ Smooth scroll momentum (replace native browser scroll)
│    → Lenis  (1KB, works with GSAP ScrollTrigger)
│
├─ SVG path drawing, morphing shapes
│    → GSAP DrawSVGPlugin or CSS stroke-dashoffset
│
├─ Lottie / After Effects exports
│    → lottie-web or @lottiefiles/react-lottie-player
│
└─ Complex sequenced page-level choreography
     → GSAP Timeline (master timeline approach)
```

### CSS animation (zero-dep)

```css
/* Fade up — the workhorse */
.fade-up {
  opacity: 0;
  transform: translateY(24px);
  transition:
    opacity var(--duration-slow) var(--ease-out),
    transform var(--duration-slow) var(--ease-out);
}
.fade-up.is-visible {
  opacity: 1;
  transform: translateY(0);
}

/* Stagger children via CSS custom property */
.fade-up:nth-child(1) { transition-delay: 0ms; }
.fade-up:nth-child(2) { transition-delay: 80ms; }
.fade-up:nth-child(3) { transition-delay: 160ms; }
.fade-up:nth-child(4) { transition-delay: 240ms; }

/* Intersection Observer trigger */
const observer = new IntersectionObserver(
  (entries) => entries.forEach(e => e.target.classList.toggle('is-visible', e.isIntersecting)),
  { threshold: 0.1 }
);
document.querySelectorAll('.fade-up').forEach(el => observer.observe(el));
```

### GSAP basics

```bash
npm install gsap
```

```js
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
gsap.registerPlugin(ScrollTrigger);

// Single tween
gsap.to('.hero-title', {
  y: 0, opacity: 1,
  duration: 0.8,
  ease: 'power3.out'
});

// Timeline — sequence guarantee
const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });
tl.from('.nav',        { y: -40, opacity: 0, duration: 0.5 })
  .from('.hero-title', { y: 60,  opacity: 0, duration: 0.7 }, '-=0.2')
  .from('.hero-sub',   { y: 40,  opacity: 0, duration: 0.6 }, '-=0.4')
  .from('.cta-btn',    { scale: 0.9, opacity: 0, duration: 0.4 }, '-=0.3');

// Reduced motion respect
if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  gsap.globalTimeline.timeScale(100); // skip animations
}
```

### Framer Motion (React)

```bash
npm install framer-motion
```

```tsx
import { motion, AnimatePresence, useScroll, useTransform } from 'framer-motion';

// Fade-up variant
const fadeUp = {
  hidden:  { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.0, 0.0, 0.2, 1] } }
};

// Staggered list
const container = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08 } }
};

function FeatureList({ items }) {
  return (
    <motion.ul variants={container} initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.2 }}>
      {items.map((item, i) => (
        <motion.li key={i} variants={fadeUp}>{item}</motion.li>
      ))}
    </motion.ul>
  );
}

// Exit animations (route transitions)
function Page({ children }) {
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={location.pathname}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.25 }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

// Scroll-linked value
function ParallaxHero() {
  const { scrollY } = useScroll();
  const y = useTransform(scrollY, [0, 500], [0, -150]);
  return <motion.div style={{ y }}>...</motion.div>;
}
```

---

## Step 5 — Scroll animation patterns

### 5.1 Smooth scroll with Lenis

```bash
npm install @studio-freight/lenis
```

```js
import Lenis from '@studio-freight/lenis';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
gsap.registerPlugin(ScrollTrigger);

const lenis = new Lenis({
  lerp: 0.1,            // 0.05 = very smooth, 0.15 = snappier
  smoothWheel: true,
  syncTouch: false      // disable on mobile — native feels better
});

// Wire Lenis → GSAP ticker (critical for ScrollTrigger sync)
lenis.on('scroll', ScrollTrigger.update);
gsap.ticker.add((time) => lenis.raf(time * 1000));
gsap.ticker.lagSmoothing(0);
```

### 5.2 Scroll reveal (stagger on enter)

```js
gsap.utils.toArray('[data-reveal]').forEach((el) => {
  gsap.from(el, {
    scrollTrigger: { trigger: el, start: 'top 85%', once: true },
    y: 40, opacity: 0,
    duration: 0.7,
    ease: 'power3.out',
    delay: el.dataset.delay ? parseFloat(el.dataset.delay) : 0
  });
});
```
```html
<div data-reveal data-delay="0.1">First</div>
<div data-reveal data-delay="0.2">Second</div>
```

### 5.3 Parallax layers

```js
gsap.utils.toArray('[data-parallax]').forEach((el) => {
  const speed = el.dataset.parallax || 0.5;   // 0 = static, 1 = full scroll speed
  gsap.to(el, {
    yPercent: -100 * speed,
    ease: 'none',
    scrollTrigger: { trigger: el, start: 'top bottom', end: 'bottom top', scrub: true }
  });
});
```
```html
<img data-parallax="0.3" src="bg-layer.jpg" />
<img data-parallax="0.6" src="mid-layer.png" />
```

### 5.4 Pinned / sticky section

```js
// Section stays pinned while 3 panels scroll through it
gsap.to('.panels', {
  xPercent: -100 * (panelCount - 1),
  ease: 'none',
  scrollTrigger: {
    trigger: '.panels-container',
    pin: true,
    scrub: 1,
    snap: 1 / (panelCount - 1),
    end: () => '+=' + (document.querySelector('.panels-container').offsetWidth)
  }
});
```

### 5.5 Horizontal scroll section

```js
const sections = gsap.utils.toArray('.horizontal-section');
gsap.to(sections, {
  xPercent: -100 * (sections.length - 1),
  ease: 'none',
  scrollTrigger: {
    trigger: '.horizontal-wrapper',
    pin: true,
    scrub: 1,
    end: () => '+=' + document.querySelector('.horizontal-wrapper').offsetWidth * sections.length
  }
});
```

### 5.6 Text reveal (SplitText)

```js
// GSAP Club (or split manually for free)
import { SplitText } from 'gsap/SplitText';
gsap.registerPlugin(SplitText);

const split = new SplitText('.hero-heading', { type: 'words,chars' });
gsap.from(split.chars, {
  scrollTrigger: { trigger: '.hero-heading', start: 'top 80%' },
  opacity: 0,
  y: 40,
  rotationX: -90,
  stagger: { amount: 0.5, from: 'start' },
  duration: 0.6,
  ease: 'back.out(1.7)'
});
```

---

## Step 6 — 3D effects decision tree

```
What kind of 3D?
│
├─ Tilt on hover, card flip, depth perspective (CSS only)
│    → CSS 3D transforms (perspective + rotateX/Y)
│    → Best for: cards, product mockups, hero images
│
├─ Particle field, geometric hero, scroll-synced object
│    → Three.js (raw WebGL, maximum control, ~580KB)
│    → Best for: landing pages with wow factor
│
├─ React app with 3D scene
│    → React Three Fiber + drei helpers
│    → Best for: interactive product pages, 3D configurators
│
└─ Simple logo spin, 3D text
     → CSS 3D transforms or CSS 3D library (three-spritetext)
```

### 6.1 CSS 3D — tilt card on mouse move

```css
.tilt-card {
  perspective: 1000px;
  transform-style: preserve-3d;
  transition: transform 0.1s ease-out;
  will-change: transform;
}
.tilt-card__inner {
  transform-style: preserve-3d;
  position: relative;
}
.tilt-card__glow {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: radial-gradient(circle at var(--mouse-x, 50%) var(--mouse-y, 50%), rgba(255,255,255,0.15), transparent 60%);
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.3s;
}
.tilt-card:hover .tilt-card__glow { opacity: 1; }
```

```js
document.querySelectorAll('.tilt-card').forEach((card) => {
  card.addEventListener('mousemove', (e) => {
    const rect = card.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width  - 0.5;  // -0.5 to 0.5
    const y = (e.clientY - rect.top)  / rect.height - 0.5;
    const intensity = 15;
    card.style.transform = `rotateY(${x * intensity}deg) rotateX(${-y * intensity}deg)`;
    card.style.setProperty('--mouse-x', `${(x + 0.5) * 100}%`);
    card.style.setProperty('--mouse-y', `${(y + 0.5) * 100}%`);
  });
  card.addEventListener('mouseleave', () => {
    card.style.transform = 'rotateY(0deg) rotateX(0deg)';
  });
});
```

### 6.2 CSS 3D — card flip

```css
.flip-card { perspective: 800px; cursor: pointer; }
.flip-card__inner {
  position: relative;
  width: 100%; height: 100%;
  transform-style: preserve-3d;
  transition: transform 0.6s var(--ease-in-out);
}
.flip-card:hover .flip-card__inner,
.flip-card.is-flipped .flip-card__inner { transform: rotateY(180deg); }
.flip-card__front,
.flip-card__back {
  position: absolute; inset: 0;
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
}
.flip-card__back { transform: rotateY(180deg); }
```

### 6.3 Three.js — minimal scene bootstrap

```bash
npm install three
npm install @types/three  # if TypeScript
```

```js
import * as THREE from 'three';

// ── Scene setup ─────────────────────────────────
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
document.getElementById('canvas-container').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 0, 5);

// ── Object ──────────────────────────────────────
const geometry = new THREE.TorusKnotGeometry(1, 0.3, 128, 32);
const material = new THREE.MeshStandardMaterial({
  color: '#818cf8',
  metalness: 0.4,
  roughness: 0.3,
});
const mesh = new THREE.Mesh(geometry, material);
scene.add(mesh);

// ── Lights ──────────────────────────────────────
scene.add(new THREE.AmbientLight('#ffffff', 0.4));
const dirLight = new THREE.DirectionalLight('#ffffff', 1.5);
dirLight.position.set(5, 8, 5);
scene.add(dirLight);
const fillLight = new THREE.PointLight('#818cf8', 2, 10);
fillLight.position.set(-5, -3, -3);
scene.add(fillLight);

// ── Resize ──────────────────────────────────────
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ── Render loop ─────────────────────────────────
const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const t = clock.getElapsedTime();
  mesh.rotation.x = t * 0.3;
  mesh.rotation.y = t * 0.5;
  renderer.render(scene, camera);
}
animate();

// ── Mobile degradation ───────────────────────────
if (navigator.hardwareConcurrency <= 4 || window.innerWidth < 768) {
  renderer.setPixelRatio(1);   // lower resolution on low-end devices
}
```

### 6.4 Three.js — particle field with scroll sync

```js
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
gsap.registerPlugin(ScrollTrigger);

// Particle system
const COUNT = 3000;
const positions = new Float32Array(COUNT * 3);
for (let i = 0; i < COUNT * 3; i++) positions[i] = (Math.random() - 0.5) * 10;

const geo = new THREE.BufferGeometry();
geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

const mat = new THREE.PointsMaterial({ size: 0.025, color: '#c084fc', sizeAttenuation: true });
const particles = new THREE.Points(geo, mat);
scene.add(particles);

// Scroll sync
const state = { progress: 0 };
ScrollTrigger.create({
  trigger: 'body', start: 'top top', end: 'bottom bottom', scrub: 1,
  onUpdate: (self) => { state.progress = self.progress; }
});

// In render loop:
particles.rotation.y = state.progress * Math.PI * 2;
camera.position.z = 5 - state.progress * 2;
```

### 6.5 React Three Fiber

```bash
npm install three @react-three/fiber @react-three/drei
```

```tsx
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Environment, Float } from '@react-three/drei';
import { useRef } from 'react';

function RotatingMesh() {
  const meshRef = useRef<THREE.Mesh>(null!);
  useFrame((state, delta) => {
    meshRef.current.rotation.x += delta * 0.3;
    meshRef.current.rotation.y += delta * 0.5;
  });
  return (
    <Float speed={2} rotationIntensity={0.5} floatIntensity={1}>
      <mesh ref={meshRef}>
        <torusKnotGeometry args={[1, 0.3, 128, 32]} />
        <meshStandardMaterial color="#818cf8" metalness={0.4} roughness={0.3} />
      </mesh>
    </Float>
  );
}

export function Hero3D() {
  return (
    <Canvas
      camera={{ position: [0, 0, 5], fov: 50 }}
      gl={{ antialias: true, alpha: true }}
      dpr={[1, 2]}
      style={{ position: 'absolute', inset: 0 }}
    >
      <ambientLight intensity={0.4} />
      <directionalLight position={[5, 8, 5]} intensity={1.5} />
      <pointLight position={[-5, -3, -3]} color="#818cf8" intensity={2} />
      <RotatingMesh />
      <Environment preset="city" />
    </Canvas>
  );
}
```

---

## Step 7 — Component patterns

### Buttons

```css
/* Base */
.btn {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-5);
  font-size: var(--text-sm);
  font-weight: var(--weight-medium);
  line-height: 1;
  border-radius: var(--radius-md);
  border: 1px solid transparent;
  cursor: pointer;
  transition:
    background var(--duration-fast),
    box-shadow var(--duration-fast),
    transform var(--duration-fast);
  user-select: none;
  -webkit-user-select: none;
}
.btn:active { transform: scale(0.97); }
.btn:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

/* Variants */
.btn--primary {
  background: var(--color-accent);
  color: #fff;
}
.btn--primary:hover { background: var(--color-accent-hover); box-shadow: var(--shadow-md); }

.btn--ghost {
  background: transparent;
  border-color: var(--color-border);
  color: var(--color-text);
}
.btn--ghost:hover { background: var(--color-bg-raised); }

/* Loading state */
.btn--loading { pointer-events: none; opacity: 0.8; }
.btn--loading::after {
  content: '';
  width: 14px; height: 14px;
  border: 2px solid rgba(255,255,255,0.3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
  margin-left: var(--space-2);
}
@keyframes spin { to { transform: rotate(360deg); } }
```

### Input field

```css
.input {
  width: 100%;
  padding: var(--space-2) var(--space-3);
  font-size: var(--text-sm);
  color: var(--color-text);
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  transition: border-color var(--duration-fast), box-shadow var(--duration-fast);
  outline: none;
}
.input:focus {
  border-color: var(--color-accent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-accent) 20%, transparent);
}
.input:invalid:not(:placeholder-shown) { border-color: var(--color-danger); }
.input--error { border-color: var(--color-danger); }
```

### Card with hover lift

```css
.card {
  background: var(--color-bg-raised);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-xl);
  padding: var(--space-6);
  transition:
    transform var(--duration-normal) var(--ease-spring),
    box-shadow var(--duration-normal) var(--ease-out);
}
.card:hover {
  transform: translateY(-4px);
  box-shadow: var(--shadow-xl);
}
```

### Skeleton loader

```css
.skeleton {
  background: linear-gradient(
    90deg,
    var(--color-bg-overlay) 25%,
    var(--color-bg-raised) 50%,
    var(--color-bg-overlay) 75%
  );
  background-size: 200% 100%;
  animation: shimmer 1.4s ease-in-out infinite;
  border-radius: var(--radius-md);
}
@keyframes shimmer {
  0%   { background-position:  200% 0; }
  100% { background-position: -200% 0; }
}
```

### Navigation with scroll blur

```css
.nav {
  position: sticky;
  top: 0;
  z-index: var(--z-sticky);
  padding: var(--space-3) var(--space-6);
  display: flex;
  align-items: center;
  gap: var(--space-4);
  transition:
    background var(--duration-normal),
    backdrop-filter var(--duration-normal),
    border-color var(--duration-normal);
}
.nav.scrolled {
  background: rgba(var(--color-bg-raw), 0.85);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-bottom: 1px solid var(--color-border);
}
```

```js
const nav = document.querySelector('.nav');
window.addEventListener('scroll', () => {
  nav.classList.toggle('scrolled', window.scrollY > 20);
}, { passive: true });
```

---

## Step 8 — Performance gates

Before shipping, verify all:

| Gate | Target | How to check |
|------|--------|--------------|
| Animation frame rate | ≥ 60fps (≥ 90fps on 120Hz) | Chrome DevTools → Performance → Frame rate |
| GPU-only properties | `transform` + `opacity` only | DevTools → Layers (no paint flashes) |
| Three.js draw calls | < 100 | `renderer.info.render.calls` |
| Three.js triangles | < 500k mobile | `renderer.info.render.triangles` |
| `prefers-reduced-motion` | All animations respect it | OS → Accessibility → Reduce Motion → reload |
| CLS from animations | < 0.1 | Lighthouse report |
| Mobile 3D fallback | Degrade at `≤ 768px` or `hardwareConcurrency ≤ 4` | Simulate in DevTools |
| `will-change` hygiene | Only on actively animating elements | Grep for `will-change` and remove after animation |
| Bundle size | GSAP ~30KB, Three.js ~580KB (treeshake) | `npm run build -- --analyze` |

### Tree-shake Three.js

```js
// Bad — imports entire library
import * as THREE from 'three';

// Good — named imports only
import { WebGLRenderer, Scene, PerspectiveCamera, Mesh, BoxGeometry, MeshStandardMaterial } from 'three';
```

### Lazy-load Three.js

```js
// Only load 3D when hero is in viewport
const observer = new IntersectionObserver((entries) => {
  if (entries[0].isIntersecting) {
    import('./hero-3d.js').then(({ init }) => init());
    observer.disconnect();
  }
}, { threshold: 0.1 });
observer.observe(document.querySelector('#hero-canvas'));
```

---

## Step 9 — Micro-interactions

### Magnetic button

```js
document.querySelectorAll('[data-magnetic]').forEach((btn) => {
  const strength = parseFloat(btn.dataset.magnetic) || 0.3;
  btn.addEventListener('mousemove', (e) => {
    const rect = btn.getBoundingClientRect();
    const x = (e.clientX - rect.left - rect.width  / 2) * strength;
    const y = (e.clientY - rect.top  - rect.height / 2) * strength;
    gsap.to(btn, { x, y, duration: 0.3, ease: 'power2.out' });
  });
  btn.addEventListener('mouseleave', () => {
    gsap.to(btn, { x: 0, y: 0, duration: 0.5, ease: 'elastic.out(1, 0.5)' });
  });
});
```

### Cursor follower

```css
.cursor-dot {
  width: 8px; height: 8px;
  background: var(--color-accent);
  border-radius: 50%;
  position: fixed;
  pointer-events: none;
  z-index: 9999;
  transform: translate(-50%, -50%);
  transition: width 0.2s, height 0.2s, background 0.2s;
}
.cursor-dot.hovering { width: 32px; height: 32px; background: transparent; border: 2px solid var(--color-accent); }
```

```js
const dot = document.querySelector('.cursor-dot');
window.addEventListener('mousemove', (e) => {
  gsap.to(dot, { x: e.clientX, y: e.clientY, duration: 0.15, ease: 'power1.out' });
});
document.querySelectorAll('a, button, [data-hover]').forEach((el) => {
  el.addEventListener('mouseenter', () => dot.classList.add('hovering'));
  el.addEventListener('mouseleave', () => dot.classList.remove('hovering'));
});
```

### Button ripple

```css
.btn { position: relative; overflow: hidden; }
.btn .ripple {
  position: absolute;
  border-radius: 50%;
  width: 4px; height: 4px;
  background: rgba(255,255,255,0.4);
  transform: scale(0);
  animation: ripple 0.6s linear;
  pointer-events: none;
}
@keyframes ripple {
  to { transform: scale(200); opacity: 0; }
}
```

```js
document.querySelectorAll('.btn').forEach((btn) => {
  btn.addEventListener('click', (e) => {
    const ripple = document.createElement('span');
    ripple.className = 'ripple';
    const rect = btn.getBoundingClientRect();
    ripple.style.left = `${e.clientX - rect.left - 2}px`;
    ripple.style.top  = `${e.clientY - rect.top  - 2}px`;
    btn.appendChild(ripple);
    ripple.addEventListener('animationend', () => ripple.remove());
  });
});
```

---

## Step 10 — AI video backgrounds (optional)

Use for hero sections that need visual depth without 3D overhead.

### Recommended generators
| Tool | Strengths | Free tier |
|------|-----------|-----------|
| Runway Gen-4 | Cinematic motion, excellent camera control | Limited credits |
| Kling | Fast, realistic, good looping | Free tier |
| Hailuo/MiniMax | High quality movement | Free |
| Sora | Best quality, slow | ChatGPT Pro |

### Post-process for web
```bash
# Compress with HandBrake CLI (target < 5MB for hero)
HandBrakeCLI -i input.mp4 -o hero.mp4 --preset="Web Optimized" --vb 800

# Or FFmpeg — H.264 + WebM dual format
ffmpeg -i input.mp4 -vcodec libx264 -crf 28 -preset slow -vf scale=1920:-1 hero.mp4
ffmpeg -i input.mp4 -vcodec libvpx-vp9 -crf 35 -b:v 0 hero.webm
```

### HTML implementation
```html
<section class="hero">
  <video class="hero__bg" autoplay muted loop playsinline preload="metadata" aria-hidden="true">
    <source src="/assets/hero.webm" type="video/webm" />
    <source src="/assets/hero.mp4"  type="video/mp4"  />
  </video>
  <!-- Content overlay -->
  <div class="hero__content">...</div>
</section>
```
```css
.hero { position: relative; overflow: hidden; }
.hero__bg {
  position: absolute; inset: 0;
  width: 100%; height: 100%;
  object-fit: cover;
  z-index: 0;
  opacity: 0.4;                         /* darken for text legibility */
}
.hero__content { position: relative; z-index: 1; }
/* Respect reduced motion — pause video */
@media (prefers-reduced-motion: reduce) {
  .hero__bg { animation-play-state: paused; }
}
```

---

## Step 11 — Review and hand-off

After building, always:

1. **Run `sys-admin:ui-visual-qa`** — pixel regression, 14 design quality checks, industry benchmark
2. Verify all WCAG AA contrast ratios (`chrome.google.com/webstore/detail/colour-contrast-analyser`)
3. Test on mobile (375px) and large screen (2560px)
4. Check 60fps: DevTools → Performance → record a scroll
5. Toggle `prefers-reduced-motion` in OS settings, verify all animations stop

---

## Defect format

When reviewing generated UI, report issues as:

```
DESIGN-ISSUE-N
Category: [Token | Typography | Spacing | Animation | 3D | Responsive | Accessibility | Performance]
Severity: [Critical | Major | Minor]
Element: [CSS selector or component name]
Issue: [what is wrong]
Fix:   [concrete code or value]
```

Example:
```
DESIGN-ISSUE-1
Category: Spacing
Severity: Minor
Element: .card padding
Issue: padding: 22px — not on 4pt grid
Fix: padding: var(--space-6)  /* 24px */
```

---

## Quick-reference: library install commands

```bash
# GSAP (free tier, includes ScrollTrigger)
npm install gsap

# Framer Motion (React)
npm install framer-motion

# Lenis smooth scroll
npm install @studio-freight/lenis

# Three.js
npm install three
npm install @types/three

# React Three Fiber + helpers
npm install @react-three/fiber @react-three/drei

# Lottie (After Effects animations)
npm install lottie-web
# React: npm install @lottiefiles/react-lottie-player

# Font loading (next/font for Next.js)
# import { Inter } from 'next/font/google'
```

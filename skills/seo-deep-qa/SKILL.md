---
name: seo-deep-qa
description: Use when a website or web app needs SEO auditing — on-page optimization, technical SEO, Core Web Vitals, structured data, Open Graph, canonical URLs, robots/sitemap, hreflang, URL structure, internal linking, image SEO, page speed, mobile-first indexing, JavaScript SEO, duplicate content, E-E-A-T signals, crawlability, indexability, breadcrumbs, or page experience signals. Also triggers on: "SEO audit", "why isn't this ranking?", "page not indexed", "structured data errors", "Core Web Vitals failing", "sitemap issues", "canonical problems", "meta tags", "schema markup", "Open Graph", "robots.txt", "hreflang errors", "page speed", "mobile SEO", "duplicate content", "Google Search Console errors".
---

# SEO Deep QA

## Mission

Act as a strict SEO engineer. Audit a website across 20 check categories covering on-page SEO, technical SEO, Core Web Vitals, structured data, and page experience. Assume every site has gaps. Find them all, measure them precisely, and produce a prioritised fix plan.

---

## Non-negotiable rules

- **Read-only audit** — never submit forms, never make purchases, never modify page content.
- **Never use credentials** — do not log in. Audit only publicly accessible pages.
- **Fetch headers directly** — use `curl -I` or `fetch()` to inspect HTTP response headers (robots, canonical, X-Robots-Tag). Playwright DOM inspection alone misses HTTP-level signals.
- **Measure, don't estimate** — quote exact character counts, exact pixel dimensions, exact file sizes, exact scores.

---

## Mode detection

State execution mode at the top of every report.

### Mode 1 — Playwright MCP (preferred)
Live browser + network access. Full DOM inspection, computed styles, network requests, screenshots.

### Mode 2 — Static / CLI analysis
No running app. Use `curl`, `fetch`, file inspection, and Lighthouse CLI against a live URL.

```bash
# Install Lighthouse CLI
npm install -g lighthouse

# Run full audit
lighthouse https://example.com --output json --output-path ./seo-audit.json

# Check HTTP headers
curl -sI https://example.com | grep -i "content-type\|x-robots\|canonical\|location"
```

### Mode 3 — Source inspection
No live URL. Inspect HTML source files, `next.config.js`, `_app.tsx`, `layout.tsx`, sitemap generators.

---

## Initial state to declare

At the start of every audit, state:

- Target URL and site type (blog, e-commerce, SaaS, docs, local business)
- CMS or framework detected (Next.js, WordPress, Astro, Nuxt, custom)
- Sitemap URL found (or not found)
- robots.txt found (or not found)
- Execution mode used
- Which checks were skipped and why

---

## Check 1 — Title Tags

**Target:** 50–60 characters. Keyword near start. Unique per page. Brand suffix on inner pages.

**What to check:**
- Length: < 50 chars = too short (wasted opportunity); > 60 chars = truncated in SERP (~600px pixel limit)
- Keyword placement: primary keyword in first 30–40 characters
- Uniqueness: every page must have a distinct title
- Missing title: blank or `<title>` absent = Google auto-generates (often bad)
- Duplicate titles across pages (common with template-driven sites)
- Placeholder titles: "Home", "Page", "Untitled", "New Post"
- Brand pattern: `{Keyword} | {Brand}` or `{Brand} — {Keyword}` — consistent across all pages

**Playwright:**
```typescript
const title = await page.title();
const titleLength = title.length;
// Flag: < 50 or > 60 chars
// Flag: title === '' or 'Home' or 'Untitled'
```

**Static (multi-page):**
```bash
# Collect all titles from sitemap URLs
curl -s https://example.com/sitemap.xml | grep -oP '<loc>[^<]+' | sed 's/<loc>//' | \
  while read url; do
    title=$(curl -s "$url" | grep -oP '(?<=<title>)[^<]+')
    echo "$url | ${#title} chars | $title"
  done
```

**Defect format:**
```
SEO-DEFECT-1
Category: Title tag
Severity: Major
Page: /products
Issue: Title is 78 characters — truncated in SERP at ~60 chars
Current: "Buy Premium Organic Coffee Beans Online | Free Shipping On All Orders | Brand"
Fix: "Premium Organic Coffee Beans | Free Shipping | Brand" (52 chars)
```

---

## Check 2 — Meta Descriptions

**Target:** 150–160 characters. Unique. Includes primary keyword. Has a soft CTA. Not auto-generated.

**What to check:**
- Length: < 70 chars = too short; > 160 chars = truncated in SERP
- Missing: Google auto-generates from page content (usually a paragraph snippet — often acceptable but not optimal)
- Duplicate meta descriptions across pages (template issue)
- No CTA: descriptions with CTA have higher CTR ("Learn more", "Shop now", "Get started")
- Keyword present: helps bold the keyword in SERP when it matches the search query
- Placeholder: "Description", "TODO", site name repeated

**Playwright:**
```typescript
const metaDesc = await page.locator('meta[name="description"]').getAttribute('content');
const length = metaDesc?.length ?? 0;
// Flag: null (missing), < 70, > 160
```

---

## Check 3 — Heading Hierarchy

**Target:** Exactly one H1. H2–H6 nested logically. Primary keyword in H1. Headings describe content (not decorative).

**What to check:**
- H1 count: 0 = missing; 2+ = duplicate H1 (confuses crawler about page topic)
- H1 matches title tag intent (should target same keyword)
- H2 count: at least 2–3 on long-form content pages
- Skipped levels: H1 → H3 (skipping H2) = broken outline
- Keyword usage: primary keyword in H1, related terms in H2s
- Heading as link bait: H2s should match what users search for (long-tail)
- Decorative headings: logo text or "Welcome" as H1

**Playwright:**
```typescript
const headings = await page.evaluate(() => {
  const tags = ['h1','h2','h3','h4','h5','h6'];
  return tags.flatMap(tag =>
    Array.from(document.querySelectorAll(tag)).map(el => ({
      level: tag,
      text: el.textContent?.trim().slice(0, 100),
    }))
  );
});
const h1s = headings.filter(h => h.level === 'h1');
// Flag: h1s.length !== 1
// Flag: skipped levels
```

---

## Check 4 — Core Web Vitals

**Targets:**
- **LCP** (Largest Contentful Paint): Good < 2.5s | Needs improvement < 4.0s | Poor ≥ 4.0s
- **INP** (Interaction to Next Paint, replaces FID): Good < 200ms | Needs improvement < 500ms | Poor ≥ 500ms
- **CLS** (Cumulative Layout Shift): Good < 0.1 | Needs improvement < 0.25 | Poor ≥ 0.25

**How to measure:**

```bash
# Lighthouse CLI (lab data)
lighthouse https://example.com \
  --only-categories=performance \
  --output json \
  --chrome-flags="--headless" \
  | jq '.categories.performance.score, .audits["largest-contentful-paint"].displayValue, .audits["cumulative-layout-shift"].displayValue'

# PageSpeed Insights API (field + lab data)
curl "https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=https://example.com&strategy=mobile&key=YOUR_KEY" \
  | jq '.loadingExperience.metrics'
```

**Common LCP causes (and fixes):**
| Cause | Fix |
|-------|-----|
| LCP image not preloaded | `<link rel="preload" as="image" href="hero.webp">` |
| LCP image lazy-loaded | Remove `loading="lazy"` from above-fold images |
| Slow server TTFB > 800ms | CDN, edge caching, server-side optimisation |
| Render-blocking CSS | Inline critical CSS, defer non-critical |
| LCP is text (no image) | Ensure web font uses `font-display: swap` |

**Common CLS causes (and fixes):**
| Cause | Fix |
|-------|-----|
| Images without width/height | Add explicit `width` and `height` attributes |
| Dynamic content injection | Reserve space with `min-height` |
| Web font swap | `font-display: optional` or `size-adjust` |
| Ads / embeds | Fixed-size containers |

**Playwright CLS measurement:**
```typescript
const cls = await page.evaluate(() =>
  new Promise(resolve => {
    let score = 0;
    new PerformanceObserver(list => {
      for (const e of list.getEntries())
        if (!(e as any).hadRecentInput) score += (e as any).value;
    }).observe({ type: 'layout-shift', buffered: true });
    setTimeout(() => resolve(score), 5000);
  })
);
// Flag: cls > 0.1
```

---

## Check 5 — Structured Data / Schema.org

**Format:** JSON-LD (preferred by Google — `<script type="application/ld+json">`)

**Schema types to check per page type:**

| Page type | Required schema | Optional schema |
|-----------|----------------|----------------|
| Homepage | `Organization` + `WebSite` + `SearchAction` | `LocalBusiness` (if local) |
| Blog post | `Article` (or `BlogPosting`) | `BreadcrumbList`, `Author`, `FAQPage` |
| Product page | `Product` + `Offer` + `AggregateRating` | `BreadcrumbList`, `Review` |
| FAQ page | `FAQPage` | `BreadcrumbList` |
| How-to guide | `HowTo` | `Article`, `BreadcrumbList` |
| Local business | `LocalBusiness` | `Review`, `OpeningHoursSpecification` |
| Video page | `VideoObject` | `Article` |
| Event page | `Event` | `Offer` |
| Breadcrumb nav | `BreadcrumbList` | — |

**Validation:**
- Google Rich Results Test: `https://search.google.com/test/rich-results?url={URL}`
- Schema Markup Validator: `https://validator.schema.org/`

**Playwright extraction:**
```typescript
const schemas = await page.evaluate(() => {
  return Array.from(
    document.querySelectorAll('script[type="application/ld+json"]')
  ).map(el => {
    try { return JSON.parse(el.textContent || ''); }
    catch { return { error: 'invalid JSON', raw: el.textContent?.slice(0, 100) }; }
  });
});
// Flag: no schemas at all
// Flag: schemas with error (invalid JSON)
// Flag: missing required @type for page type
// Flag: missing required fields (e.g. Product without 'offers', Article without 'datePublished')
```

**Common structured data defects:**
- Missing `datePublished` / `dateModified` on Article (required for news rich result)
- `AggregateRating.ratingCount` is 0 or missing
- `Product.offers.price` is a string not a number
- `LocalBusiness.address` missing `streetAddress`
- Nested JSON-LD invalid — use `@graph` for multiple entities
- Self-referencing `@id` not an absolute URL

---

## Check 6 — Open Graph & Twitter Card

**Required OG tags:**
```html
<meta property="og:title" content="..." />          <!-- same as or variant of <title> -->
<meta property="og:description" content="..." />    <!-- same as or variant of meta description -->
<meta property="og:image" content="https://..." />  <!-- absolute URL, min 1200×630px, < 8MB -->
<meta property="og:url" content="https://..." />    <!-- canonical URL of page -->
<meta property="og:type" content="website" />       <!-- website | article | product -->
<meta property="og:site_name" content="..." />
```

**Required Twitter Card tags:**
```html
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="..." />
<meta name="twitter:description" content="..." />
<meta name="twitter:image" content="https://..." />  <!-- min 800×418px -->
<meta name="twitter:site" content="@handle" />
```

**Playwright check:**
```typescript
const og = {
  title: await page.locator('meta[property="og:title"]').getAttribute('content'),
  description: await page.locator('meta[property="og:description"]').getAttribute('content'),
  image: await page.locator('meta[property="og:image"]').getAttribute('content'),
  url: await page.locator('meta[property="og:url"]').getAttribute('content'),
  type: await page.locator('meta[property="og:type"]').getAttribute('content'),
};
const twitter = {
  card: await page.locator('meta[name="twitter:card"]').getAttribute('content'),
  image: await page.locator('meta[name="twitter:image"]').getAttribute('content'),
};
// Flag: any null value
// Flag: og:image is relative URL (must be absolute)
// Flag: og:url not matching canonical
```

**Validate:** `https://developers.facebook.com/tools/debug/` and `https://cards-dev.twitter.com/validator`

---

## Check 7 — Canonical URLs

**Rules:**
- Every indexable page must have a self-referencing canonical: `<link rel="canonical" href="https://example.com/page/" />`
- Canonical must be absolute URL (not relative)
- Canonical must point to the preferred version (www vs non-www, trailing slash)
- Canonical ≠ noindex on same page (conflicting signals — Google may ignore canonical)
- Canonical must not point to a redirect URL (signal dilution)
- Paginated pages: each page has its own canonical (not page 1 canonical for all)
- Syndicated content: cross-domain canonical pointing to original source

**HTTP-level canonical check:**
```bash
# Check Link: <...>; rel="canonical" HTTP header (used by some sites instead of HTML tag)
curl -sI https://example.com/page | grep -i "link:"
```

**Playwright:**
```typescript
const canonical = await page.locator('link[rel="canonical"]').getAttribute('href');
const currentUrl = page.url();
// Flag: canonical === null (missing)
// Flag: canonical is relative (not starting with 'http')
// Flag: canonical !== canonical of expected URL (e.g. points to a different page)
// Flag: page also has <meta name="robots" content="noindex"> — conflicting signals
```

---

## Check 8 — Robots Meta & X-Robots-Tag

**Robots meta directives:**
```html
<meta name="robots" content="index, follow" />          <!-- default (can omit) -->
<meta name="robots" content="noindex, nofollow" />      <!-- remove from index + don't follow links -->
<meta name="robots" content="noindex, follow" />        <!-- remove from index, still follow links -->
<meta name="googlebot" content="noindex" />             <!-- Google-specific override -->
```

**Checks:**
- No `noindex` on pages that should be indexed (homepage, product pages, blog posts)
- `noindex` present on pages that should NOT be indexed (thank-you pages, admin, staging)
- `nofollow` on internal pages = wasted PageRank
- `X-Robots-Tag: noindex` in HTTP header overrides meta tag (check both)

**Fetch HTTP headers:**
```bash
curl -sI https://example.com/thank-you | grep -i "x-robots-tag"
```

**Playwright:**
```typescript
const robotsMeta = await page.locator('meta[name="robots"], meta[name="googlebot"]')
  .allTextContents();
// Flag: noindex on homepage or important pages
// Flag: noindex AND canonical present (conflicting)
```

---

## Check 9 — robots.txt

**Rules:**
- Must exist at `https://example.com/robots.txt`
- Must NOT block Googlebot from crawling CSS, JavaScript, or images (breaks rendering)
- Must include `Sitemap:` directive pointing to sitemap URL
- `Disallow: /` with no User-agent = blocks everyone (catastrophic)
- `Disallow: /` scoped to `User-agent: *` with separate allowed rules = common mistake

**Fetch and audit:**
```bash
curl -s https://example.com/robots.txt
```

**What to look for:**
```
User-agent: *
Disallow: /wp-admin/        ✅ correct — block admin
Disallow: /cart/            ✅ correct — block cart
Disallow: /checkout/        ✅ correct — block checkout

# BAD patterns:
Disallow: /wp-content/      ❌ blocks CSS/JS — breaks Google rendering
Disallow: /                 ❌ blocks entire site
Disallow: /*.css$           ❌ blocks all CSS
Disallow: /*.js$            ❌ blocks all JavaScript

Sitemap: https://example.com/sitemap.xml  ✅ required
```

**Check Googlebot can access key resources:**
```bash
# Test if specific URL is blocked
curl -s https://example.com/robots.txt | grep -A2 "User-agent: \*"
```

---

## Check 10 — XML Sitemap

**Requirements:**
- Sitemap at `/sitemap.xml` or referenced in `robots.txt`
- All indexable pages included
- NO noindex pages in sitemap (contradictory signal)
- NO redirect URLs in sitemap (only final destination URLs)
- NO broken URLs (4xx) in sitemap
- `<lastmod>` present and accurate (not always the same date for all pages)
- `<loc>` values are absolute URLs, match canonical URLs
- Image sitemap for image-heavy sites
- Video sitemap for video content
- Sitemap index for sites > 50,000 URLs or > 50MB

**Fetch and validate:**
```bash
# Check sitemap exists and is valid XML
curl -s https://example.com/sitemap.xml | xmllint --noout - && echo "Valid XML"

# Count URLs
curl -s https://example.com/sitemap.xml | grep -c "<loc>"

# Check for noindex pages accidentally in sitemap
curl -s https://example.com/sitemap.xml | grep -oP '(?<=<loc>)[^<]+' | while read url; do
  robots=$(curl -s "$url" | grep -oP '(?<=<meta name="robots" content=")[^"]+')
  if echo "$robots" | grep -qi "noindex"; then
    echo "NOINDEX IN SITEMAP: $url"
  fi
done
```

---

## Check 11 — Hreflang (International SEO)

**When to audit:** Site serves multiple languages or regions.

**Requirements:**
- Language tags must be valid BCP 47 codes: `en`, `en-US`, `en-GB`, `fr`, `fr-FR`, `de`, `zh-Hans`
- `x-default` required — points to language-selection page or default language
- Bidirectional pairs required: if `en` page references `fr` page, `fr` page must reference `en` back
- Absolute URLs only
- All hreflang tags on a page must reference ALL language versions (including self)
- Can be in: `<head>` HTML, HTTP `Link` header, or XML sitemap

**Playwright check:**
```typescript
const hreflang = await page.evaluate(() =>
  Array.from(document.querySelectorAll('link[rel="alternate"][hreflang]')).map(el => ({
    lang: el.getAttribute('hreflang'),
    href: el.getAttribute('href'),
  }))
);
const hasXDefault = hreflang.some(h => h.lang === 'x-default');
const hasRelative = hreflang.some(h => !h.href?.startsWith('http'));
// Flag: missing x-default
// Flag: relative href URLs
// Flag: duplicate hreflang values
```

**Common defects:**
- Missing `x-default`
- Using `en-UK` instead of `en-GB` (invalid BCP 47)
- Hreflang only on one version but not the other (broken reciprocal)
- Using hreflang for content differences (not language/region) — wrong use case

---

## Check 12 — URL Structure

**Best practices:**
- Lowercase only: `/blog/my-post` not `/Blog/My-Post`
- Hyphens not underscores: `/my-page` not `/my_page` (Google treats `_` as word joiner)
- Short and descriptive: `/organic-coffee-beans` not `/p?id=1234&category=5`
- No session IDs: `/checkout?sessid=abc123` in canonical = duplicate content
- Trailing slash consistency: choose one (`/page/` or `/page`) and 301 the other
- No special characters: no `%20` spaces, no `&`, no `=` in slugs
- URL depth: ideally < 4 levels: `/blog/2024/organic-coffee` = 3 levels ✅

**Playwright URL audit:**
```typescript
const url = page.url();
const checks = {
  hasUppercase: /[A-Z]/.test(new URL(url).pathname),
  hasUnderscore: /_/.test(new URL(url).pathname),
  hasSessionParam: /sessid|PHPSESSID|JSESSIONID/.test(url),
  depthOver4: (new URL(url).pathname.match(/\//g) || []).length > 4,
};
```

**Static inspection:**
```bash
# Find uppercase in URLs from sitemap
curl -s https://example.com/sitemap.xml | grep -oP '(?<=<loc>)[^<]+' | grep '[A-Z]'

# Find underscores in paths
curl -s https://example.com/sitemap.xml | grep -oP '(?<=<loc>)[^<]+' \
  | grep -oP 'https?://[^/]+\K/[^<]+' | grep '_'
```

---

## Check 13 — Internal Linking

**What to check:**
- **Orphan pages**: pages with 0 internal links pointing to them — Google may not discover or crawl them
- **Link depth**: important pages should be ≤ 3 clicks from homepage
- **Anchor text**: descriptive preferred over "click here" / "read more" / "learn more"
- **Broken internal links**: 404 responses waste crawl budget and hurt UX
- **nofollow on internal links**: wastes PageRank, rarely justified internally
- **Excessive links per page**: > 100–150 links per page dilutes link equity

**Playwright link audit:**
```typescript
const links = await page.evaluate(() =>
  Array.from(document.querySelectorAll('a[href]')).map(a => ({
    href: a.getAttribute('href'),
    text: a.textContent?.trim().slice(0, 60),
    rel: a.getAttribute('rel'),
    isInternal: a.href.startsWith(window.location.origin),
  }))
);

const genericAnchors = links.filter(l =>
  l.isInternal && /^(click here|read more|learn more|here|this|more)$/i.test(l.text || '')
);
const nofollowInternal = links.filter(l => l.isInternal && l.rel?.includes('nofollow'));
// Flag: > 3 generic anchor texts
// Flag: any nofollow internal links (unless deliberate)
```

**Check for broken internal links:**
```bash
# Crawl internal links and check status codes
curl -s https://example.com | grep -oP 'href="(/[^"]+)"' | sed 's/href="//' | sed 's/"//' | \
  while read path; do
    status=$(curl -s -o /dev/null -w "%{http_code}" "https://example.com$path")
    [ "$status" != "200" ] && echo "$status — https://example.com$path"
  done
```

---

## Check 14 — Image SEO

**Checks per image:**

| Check | Target | Command |
|-------|--------|---------|
| Alt text | Descriptive, includes keyword naturally | `img[alt]` must be non-empty for informational images |
| Filename | Descriptive slug: `organic-coffee-beans.jpg` not `IMG_001.jpg` | Inspect `src` attribute |
| File size | < 200KB for most images; < 100KB ideal for hero images | Network tab / response size |
| Format | WebP preferred; AVIF even smaller; avoid JPEG for logos/icons | Check `Content-Type` header |
| Lazy loading | `loading="lazy"` for below-fold images; **NOT** for LCP image | `img[loading]` attribute |
| Dimensions | `width` + `height` attributes prevent CLS | Check both attributes present |
| Responsive images | `srcset` and `sizes` for retina / responsive | Check `srcset` attribute |

**Playwright image audit:**
```typescript
const images = await page.evaluate(() =>
  Array.from(document.images).map(img => ({
    src: img.src,
    alt: img.alt,
    loading: img.loading,
    hasWidth: img.hasAttribute('width'),
    hasHeight: img.hasAttribute('height'),
    hasSrcset: img.hasAttribute('srcset'),
    naturalWidth: img.naturalWidth,
    displayWidth: img.width,
  }))
);

const missingAlt = images.filter(i => !i.alt && i.naturalWidth > 0);
const noDimensions = images.filter(i => !i.hasWidth || !i.hasHeight);
const lazyAboveFold = images.filter(i => i.loading === 'lazy' && i.displayWidth > 0);
// Flag: any image with empty alt (unless aria-hidden decorative)
// Flag: images without width+height (CLS risk)
```

---

## Check 15 — Page Speed & Resource Hints

**Targets:**
- TTFB < 800ms (Good < 200ms)
- Total page size < 2MB (ideal < 1MB)
- Requests < 50 (ideal < 30)
- No render-blocking resources in `<head>`

**Render-blocking check:**
```typescript
// Find render-blocking CSS/JS
const renderBlocking = await page.evaluate(() => {
  const scripts = Array.from(document.scripts)
    .filter(s => s.src && !s.defer && !s.async && !s.type?.includes('module'))
    .map(s => ({ type: 'script', src: s.src }));
  const styles = Array.from(document.styleSheets)
    .filter(s => s.href && !(s.media === 'print'))
    .map(s => ({ type: 'style', href: s.href }));
  return [...scripts, ...styles];
});
```

**Resource hints to check:**
```html
<!-- Preconnect to third-party domains (saves 100–500ms) -->
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://cdn.example.com" crossorigin />

<!-- Preload LCP image (saves 200–1000ms LCP) -->
<link rel="preload" as="image" href="/hero.webp" />

<!-- Preload critical font -->
<link rel="preload" as="font" href="/fonts/inter.woff2" type="font/woff2" crossorigin />
```

**Playwright resource hint check:**
```typescript
const hints = await page.evaluate(() => ({
  preconnect: Array.from(document.querySelectorAll('link[rel="preconnect"]')).map(l => l.href),
  preload: Array.from(document.querySelectorAll('link[rel="preload"]')).map(l => ({
    href: (l as HTMLLinkElement).href,
    as: l.getAttribute('as'),
  })),
}));
// Flag: no preconnect for Google Fonts / analytics
// Flag: no preload for LCP image
```

**Lighthouse CLI for detailed breakdown:**
```bash
lighthouse https://example.com \
  --only-audits=render-blocking-resources,uses-optimized-images,uses-webp-images,uses-rel-preconnect,uses-rel-preload,total-byte-weight \
  --output json | jq '.audits | to_entries[] | select(.value.score < 1) | {key, score: .value.score, displayValue: .value.displayValue}'
```

---

## Check 16 — Mobile-First Indexing

**Google uses mobile version for ALL indexing since 2023.**

**Critical checks:**

| Check | How to verify | Flag if |
|-------|--------------|---------|
| Viewport meta | `<meta name="viewport" content="width=device-width, initial-scale=1">` | Missing or incorrect |
| Content parity | Mobile HTML contains same content as desktop | Mobile hides/lazy-loads key content |
| Mobile usability | No overlapping elements, text readable without zoom | Issues found in Playwright mobile viewport |
| Touch targets | All interactive elements ≥ 44×44px on 390px viewport | Anything < 44×44px |
| Font size inputs | `<input>` font-size ≥ 16px (prevents iOS auto-zoom) | Input font < 16px |
| Intrusive interstitials | No full-screen popups on mobile before content visible | Popup covers content on load |

**Playwright mobile check:**
```typescript
// Switch to mobile viewport
await page.setViewportSize({ width: 390, height: 844 });
await page.emulateMedia({ colorScheme: 'light' });

const viewport = await page.locator('meta[name="viewport"]').getAttribute('content');
// Flag: !viewport?.includes('width=device-width')

const hasHorizontalScroll = await page.evaluate(() =>
  document.body.scrollWidth > window.innerWidth
);
// Flag: hasHorizontalScroll

// Check input font sizes (< 16px triggers iOS zoom)
const smallInputs = await page.evaluate(() =>
  Array.from(document.querySelectorAll('input, select, textarea')).filter(el =>
    parseFloat(getComputedStyle(el).fontSize) < 16
  ).map(el => ({ tag: el.tagName, fontSize: getComputedStyle(el).fontSize }))
);
```

---

## Check 17 — JavaScript SEO

**Google can crawl and render JS, but:**
- Rendering is delayed (second wave — can take days/weeks for new pages)
- JS-only content may not be indexed as reliably as server-rendered HTML
- JS crawling consumes crawl budget faster

**What to check:**

| Issue | Check method | Fix |
|-------|-------------|-----|
| Content only in JS | `curl` URL, check if body text in HTML response | SSR / SSG / prerender |
| Important links only in JS events | Check `<a href>` vs JS `onclick` navigation | Use real `<a href>` links |
| Infinite scroll without pagination | Paginated URLs with page numbers | Add `?page=2` URL structure |
| Dynamic rendering risk | Same content for bots and users? | Avoid Googlebot-only content |

**SSR detection:**
```bash
# Check if content visible in raw HTML (no JS execution)
curl -s https://example.com | grep -c "your-key-content-text"
# 0 = JS-rendered only (SEO risk)
# > 0 = server-rendered (good)
```

**Playwright headless vs source comparison:**
```typescript
// Full page content (with JS)
const renderedText = await page.textContent('body');

// Fetch raw HTML (no JS)
const response = await page.request.fetch(page.url());
const rawHtml = await response.text();

// Check if key content exists in raw HTML
const keyContent = 'product title or heading text';
const inRawHtml = rawHtml.includes(keyContent);
// Flag: !inRawHtml (JS-only content — Googlebot may miss it)
```

---

## Check 18 — Duplicate Content

**Sources of duplicate content:**
- `www` vs `non-www`: `http://www.example.com` and `http://example.com` should 301 redirect to one
- `HTTP` vs `HTTPS`: all HTTP must 301 → HTTPS
- Trailing slash: `/page` vs `/page/` — one must 301 to the other consistently
- URL parameters: `/page?ref=twitter` = duplicate of `/page` — canonical or `<link rel="canonical">` required
- Paginated pages: `/blog/page/2` is not duplicate — each has unique content
- Printer-friendly pages: `/page/print` should have canonical pointing to main URL
- Session IDs in URLs

**Check redirects:**
```bash
# Test www to non-www redirect
curl -sI http://www.example.com | grep -i "location:"

# Test HTTP to HTTPS
curl -sI http://example.com | grep -i "location:"

# Test trailing slash
curl -sI https://example.com/about | grep -i "location:"
```

**URL parameter handling:**
```typescript
// Check if canonical handles param URLs correctly
await page.goto('https://example.com/product?ref=twitter&utm_source=social');
const canonical = await page.locator('link[rel="canonical"]').getAttribute('href');
// Flag: canonical includes utm_source or ref params (should be clean URL)
```

---

## Check 19 — E-E-A-T Signals

**Google's quality rater guidelines focus on Experience, Expertise, Authoritativeness, Trustworthiness.**

**Page-level checks:**

| Signal | How to check | Flag if |
|--------|-------------|---------|
| Author byline | `rel="author"` or visible author name | Missing on articles/blog posts |
| Author bio page | Link to `/author/{name}` page | No author page found |
| Last updated date | `<time datetime="...">` or visible date | Article has no date |
| `datePublished` schema | `Article.datePublished` in JSON-LD | Missing or > 6 months stale |
| About page | `/about` or `/about-us` exists and has real content | 404 or thin content |
| Contact page | `/contact` has email/phone/address | Missing |
| Privacy policy | `/privacy-policy` exists | Missing (also legal requirement) |
| HTTPS | SSL certificate valid, no mixed content | HTTP or certificate expired |
| Reviews / ratings | `AggregateRating` schema on product/service | Missing on product pages |

**Playwright E-E-A-T check:**
```typescript
// Check for About and Contact pages
const aboutExists = await page.request.fetch('/about').then(r => r.status() === 200).catch(() => false);
const contactExists = await page.request.fetch('/contact').then(r => r.status() === 200).catch(() => false);
const privacyExists = await page.request.fetch('/privacy-policy').then(r => r.status() === 200).catch(() => false);

// Check HTTPS
const isHttps = page.url().startsWith('https://');

// Check author on article pages
const authorEl = await page.locator('[rel="author"], .author-name, .byline').first();
const authorVisible = await authorEl.isVisible().catch(() => false);
```

---

## Check 20 — Crawlability & Indexability

**Full indexability pipeline check:**

```
Page should be indexed?
  ├── robots.txt: NOT blocking Googlebot → ✅
  ├── HTTP status: 200 (not 3xx chain, 4xx, 5xx) → ✅
  ├── Meta robots: NOT noindex → ✅
  ├── X-Robots-Tag: NOT noindex → ✅
  ├── Canonical: points to THIS page (not elsewhere) → ✅
  └── URL in sitemap → ✅ (optional but recommended)
```

**Redirect chain check (max 1 hop):**
```bash
# Follow redirects and show the chain
curl -sI -L https://example.com/old-page 2>&1 | grep -E "HTTP/|Location:"
# Flag: more than 1 redirect hop (301 → 301 = chain)
```

**Soft 404 detection:**
```bash
# Check if "not found" pages return 200 status (bad)
curl -s -o /dev/null -w "%{http_code}" https://example.com/definitely-does-not-exist-12345
# Should return 404, not 200
```

**Crawl budget waste patterns:**
- Faceted navigation URLs (`/shoes?color=red&size=10`) without canonical
- Session ID URLs in sitemap
- Pagination beyond page 10 for thin content
- Duplicate parameter variations (`/page?sort=price` + `/page?sort=name`)

**Playwright indexability check:**
```typescript
const checks = {
  status: (await page.request.fetch(page.url())).status(),
  metaRobots: await page.locator('meta[name="robots"]').getAttribute('content'),
  xRobotsTag: (await page.request.fetch(page.url())).headers()['x-robots-tag'],
  canonical: await page.locator('link[rel="canonical"]').getAttribute('href'),
};

const isIndexable =
  checks.status === 200 &&
  !checks.metaRobots?.includes('noindex') &&
  !checks.xRobotsTag?.includes('noindex') &&
  checks.canonical === page.url();
```

---

## Check 21 — Breadcrumbs

**Checks:**
- Visual breadcrumb present on inner pages (not homepage)
- BreadcrumbList JSON-LD matches visual breadcrumb
- Breadcrumb `item.id` URLs are absolute and reachable (200 status)
- Correct position numbering (1, 2, 3… sequential)
- Homepage always position 1 (name: "Home" or brand name)

**Playwright breadcrumb check:**
```typescript
// Visual breadcrumb
const breadcrumbs = await page.locator('[aria-label="breadcrumb"] a, .breadcrumb a, nav.breadcrumbs a')
  .allTextContents();

// Schema breadcrumb
const schemas = await page.evaluate(() =>
  Array.from(document.querySelectorAll('script[type="application/ld+json"]'))
    .map(s => { try { return JSON.parse(s.textContent || ''); } catch { return null; }})
    .filter(Boolean)
);
const breadcrumbSchema = schemas.find(s => s['@type'] === 'BreadcrumbList' ||
  s['@graph']?.some((n: any) => n['@type'] === 'BreadcrumbList'));
// Flag: visual breadcrumb present but no BreadcrumbList schema
// Flag: schema positions not sequential
```

---

## Defect format

```
SEO-DEFECT-[N]
Category: [Check name]
Severity: Critical | Major | Minor | Info
Page: /path (or "sitewide")
Issue: [exact problem with measured values]
Impact: [what this costs in rankings/traffic/crawling]
Fix: [specific, actionable change with code example where relevant]
```

---

## Severity definitions

| Severity | Definition | Examples |
|----------|-----------|---------|
| **Critical** | Prevents indexing or causes major ranking loss | `noindex` on homepage; robots.txt blocking entire site; no HTTPS; sitemap returning 404; redirect loop |
| **Major** | Significantly hurts rankings or crawl efficiency | Missing H1; LCP > 4s; all pages duplicate canonicals; no structured data on product pages; Core Web Vitals failing; JS-only content |
| **Minor** | Ranking improvement opportunity | Title 5 chars too long; meta description missing CTA; alt text missing on 3 images; no preconnect hint |
| **Info** | Best practice improvement | Missing Twitter Card; no `x-default` hreflang when only one language; no breadcrumb schema |

---

## Tools reference

| Tool | Use case | URL / command |
|------|----------|--------------|
| Google Search Console | Real indexing data, crawl errors, Core Web Vitals field data | search.google.com/search-console |
| PageSpeed Insights | CWV lab + field data, actionable Lighthouse audit | pagespeed.web.dev |
| Lighthouse CLI | Automated performance + SEO audit in CI | `lighthouse https://url --output json` |
| Rich Results Test | Validate structured data for rich result eligibility | search.google.com/test/rich-results |
| Schema Markup Validator | Validate schema.org compliance | validator.schema.org |
| Google robots.txt Tester | Test if Googlebot can access a URL | Via Search Console |
| Screaming Frog | Full site crawl: titles, descriptions, canonicals, redirects | screamingfrog.co.uk |
| Ahrefs Site Audit | Technical SEO crawl with priority scores | ahrefs.com |
| Chrome DevTools | Network timing, rendered HTML, coverage | Built-in |

---

## Final report format

```markdown
# SEO Deep QA Report — [site URL]
**Date:** YYYY-MM-DD
**Mode:** [Playwright MCP | Lighthouse CLI | Static]
**Site type:** [blog | e-commerce | SaaS | docs | local business]
**Framework:** [Next.js | WordPress | Astro | custom]
**Pages audited:** N

---

## Critical issues (fix before next deploy)
| # | Defect | Page | Impact |
|---|--------|------|--------|
| 1 | noindex on /products | sitewide | Products not indexed |
| 2 | LCP 5.8s on homepage | / | Core Web Vitals failing |

---

## Audit summary (21 checks)
| # | Category | Status | Issues |
|---|----------|--------|--------|
| 1 | Title tags | ⚠️ | 3 too long, 1 duplicate |
| 2 | Meta descriptions | ⚠️ | 5 missing |
| 3 | Heading hierarchy | ✅ | |
| 4 | Core Web Vitals | ❌ | LCP 5.8s, CLS 0.18 |
| ... | | | |

---

## All defects (severity order)
[SEO-DEFECT-1 through SEO-DEFECT-N]

---

## Priority fix list
| Priority | Defect | Effort | Estimated impact |
|----------|--------|--------|-----------------|
| P1 — Critical | Fix noindex on /products | Low | High — products now crawlable |
| P1 — Critical | LCP optimisation on homepage | Medium | High — CWV pass |
| P2 — Major | Add structured data to product pages | Medium | Rich results in SERP |
| P3 — Minor | Fix 12 title tag lengths | Low | CTR improvement |
```

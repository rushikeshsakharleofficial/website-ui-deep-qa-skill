import fs from 'fs';
import path from 'path';
import { normalizeRoute } from './routes';

// ─── Types ────────────────────────────────────────────────────────────────────

type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';
type Effort = 'XS' | 'S' | 'M' | 'L';

interface FixMeta {
  fix: string;
  effort: Effort;
  wcag?: string;
}

interface NormalizedFinding {
  route: string;
  source: string;
  severity: Severity;
  type: string;
  message: string;
  selector?: string;
  text?: string;
  evidencePath: string;
}

// ─── Fix recommendation map ───────────────────────────────────────────────────
// Maps issue `type` (as emitted by helpers) → { fix, effort, wcag? }

const FIX_RECOMMENDATIONS: Record<string, FixMeta> = {
  // Accessibility
  'missing-accessible-name': {
    fix: 'Add aria-label or visible text to element',
    effort: 'XS',
    wcag: 'WCAG 4.1.2',
  },
  'input-missing-label': {
    fix: 'Add <label for="..."> or aria-label to input field',
    effort: 'XS',
    wcag: 'WCAG 1.3.1',
  },
  'role-button-not-focusable': {
    fix: 'Add tabindex="0" to element with role="button"',
    effort: 'XS',
    wcag: 'WCAG 2.1.1',
  },
  'clickable-without-role': {
    fix: 'Replace div/span with <button> or add role="button" + tabindex="0" + keyboard handler',
    effort: 'S',
    wcag: 'WCAG 4.1.2',
  },
  'duplicate-id': {
    fix: 'Ensure all id attributes are unique within the document',
    effort: 'S',
    wcag: 'WCAG 4.1.1',
  },
  'heading-level-skip': {
    fix: 'Fix heading hierarchy — do not skip levels (e.g. h1 → h3); use h2 between them',
    effort: 'XS',
    wcag: 'WCAG 1.3.1',
  },
  'missing-main-landmark': {
    fix: 'Wrap main page content in <main> element',
    effort: 'XS',
    wcag: 'WCAG 1.3.6',
  },
  'missing-nav-landmark': {
    fix: 'Wrap navigation links in <nav> element',
    effort: 'XS',
    wcag: 'WCAG 1.3.6',
  },
  'missing-header-landmark': {
    fix: 'Wrap site header in <header> element',
    effort: 'XS',
    wcag: 'WCAG 1.3.6',
  },
  'missing-html-lang': {
    fix: 'Add lang attribute to <html> element (e.g. lang="en")',
    effort: 'XS',
    wcag: 'WCAG 3.1.1',
  },
  'poor-color-contrast': {
    fix: 'Increase text/background contrast to meet WCAG AA (4.5:1 normal, 3:1 large text)',
    effort: 'S',
    wcag: 'WCAG 1.4.3',
  },
  'poor-color-contrast-summary': {
    fix: 'Audit and fix all color contrast failures — run full Lighthouse a11y audit',
    effort: 'M',
    wcag: 'WCAG 1.4.3',
  },
  'aria-expanded-no-controls': {
    fix: 'Add aria-controls="<id-of-controlled-element>" to element with aria-expanded',
    effort: 'XS',
    wcag: 'WCAG 4.1.2',
  },
  // Layout
  'horizontal-overflow': {
    fix: 'Remove fixed pixel widths wider than viewport; use max-width: 100% on offending element',
    effort: 'S',
  },
  'negative-left-overflow': {
    fix: 'Check negative margins or absolute positioning pushing element off-screen to the left',
    effort: 'S',
  },
  'fixed-overlay-too-large': {
    fix: 'Reduce fixed/absolute overlay size or add max-height + overflow-y: auto',
    effort: 'S',
  },
  'text-or-content-clipping': {
    fix: 'Add overflow-x: auto to container or increase its min-width',
    effort: 'XS',
  },
  'page-horizontal-scroll': {
    fix: 'Add overflow-x: hidden to body/html; find element wider than viewport',
    effort: 'S',
  },
  // Zoom + scroll
  'scroll-stuck': {
    fix: 'Remove overflow: hidden from html and body elements; check for passive wheel listener overrides',
    effort: 'M',
    wcag: 'WCAG 2.1.1',
  },
  'horizontal-scroll-at-zoom': {
    fix: 'Use clamp(), max-width: 100%, or relative units so content reflows at 320 px (400% zoom)',
    effort: 'M',
    wcag: 'WCAG 1.4.10',
  },
  // Theme comparison
  'element-invisible-in-dark': {
    fix: 'Add dark-mode variant for text color (e.g. Tailwind dark:text-white or CSS prefers-color-scheme override)',
    effort: 'S',
    wcag: 'WCAG 1.4.3',
  },
  'element-invisible-in-dark-summary': {
    fix: 'Systematically audit and fix all hardcoded colors without dark-mode variants',
    effort: 'L',
    wcag: 'WCAG 1.4.3',
  },
  'element-invisible-in-light': {
    fix: 'Add light-mode variant for text color; avoid dark-only color values leaking into light theme',
    effort: 'S',
    wcag: 'WCAG 1.4.3',
  },
  'dark-mode-not-responsive': {
    fix: 'Implement CSS prefers-color-scheme media query support, or ensure localStorage theme initialises before first paint',
    effort: 'L',
  },
  'dark-mode-layout-overflow': {
    fix: 'Check dark-mode specific CSS for wider backgrounds, longer translated labels, or different padding causing overflow',
    effort: 'S',
  },
  'toggle-no-visual-change': {
    fix: 'Verify theme toggle handler applies class/attribute to <html> or <body> and CSS responds to it',
    effort: 'M',
  },
  // Security
  'missing-csp': {
    fix: 'Add Content-Security-Policy header. Start with report-only mode; tighten gradually',
    effort: 'L',
  },
  'missing-x-frame-options': {
    fix: 'Add X-Frame-Options: SAMEORIGIN header to prevent clickjacking',
    effort: 'XS',
  },
  'missing-x-content-type-options': {
    fix: 'Add X-Content-Type-Options: nosniff header',
    effort: 'XS',
  },
  'missing-referrer-policy': {
    fix: 'Add Referrer-Policy: strict-origin-when-cross-origin header',
    effort: 'XS',
  },
  'missing-permissions-policy': {
    fix: 'Add Permissions-Policy header restricting camera, microphone, geolocation',
    effort: 'XS',
  },
  'unsafe-blank-target': {
    fix: 'Add rel="noopener noreferrer" to all a[target="_blank"] links',
    effort: 'XS',
  },
  'sandbox-missing-on-iframe': {
    fix: 'Add sandbox attribute to <iframe> elements; grant only needed permissions',
    effort: 'S',
  },
  'token-in-url': {
    fix: 'Move token from query string to Authorization header or POST body',
    effort: 'M',
  },
  'mixed-content': {
    fix: 'Change all http:// resource URLs to https:// or use protocol-relative //URL',
    effort: 'S',
  },
  'secret-in-html-comment': {
    fix: 'Remove secret from HTML comment; rotate the exposed key immediately',
    effort: 'XS',
  },
  // Forms
  'form-missing-submit': {
    fix: 'Add a <button type="submit"> to the form',
    effort: 'XS',
  },
  'form-action-placeholder': {
    fix: 'Replace action="#" with a real endpoint or form submission handler',
    effort: 'M',
  },
  'password-no-autocomplete': {
    fix: 'Add autocomplete="current-password" or autocomplete="new-password" to password field',
    effort: 'XS',
  },
  'submit-disabled-on-load': {
    fix: 'Only disable submit during active submission; remove disabled state on initial render unless form is intentionally gated',
    effort: 'S',
  },
  // SEO
  'missing-title': {
    fix: 'Add a unique, descriptive <title> element (10–80 characters)',
    effort: 'XS',
  },
  'missing-meta-description': {
    fix: 'Add <meta name="description" content="..."> (50–165 characters)',
    effort: 'XS',
  },
  'missing-canonical': {
    fix: 'Add <link rel="canonical" href="..."> to prevent duplicate-content issues',
    effort: 'XS',
  },
  'missing-og-tags': {
    fix: 'Add Open Graph meta tags: og:title, og:description, og:image',
    effort: 'S',
  },
  'robots-noindex': {
    fix: 'Remove noindex from robots meta on public pages unless intentionally hidden from search',
    effort: 'XS',
  },
  'missing-h1': {
    fix: 'Add a single <h1> as the primary page heading',
    effort: 'XS',
  },
  'missing-favicon': {
    fix: 'Add <link rel="icon" href="/favicon.ico"> and provide favicon file',
    effort: 'XS',
  },
  // Network
  'duplicate-api-calls': {
    fix: 'Deduplicate API calls — check for double useEffect, extra renders, or missing React StrictMode guard',
    effort: 'M',
  },
  'large-payload': {
    fix: 'Enable gzip/brotli compression; paginate large lists; trim unused response fields',
    effort: 'M',
  },
  // Performance
  'poor-lcp': {
    fix: 'Preload largest contentful image; defer non-critical scripts; check server response time',
    effort: 'M',
    wcag: 'Performance best practice',
  },
  'poor-cls': {
    fix: 'Set explicit width/height on images; avoid inserting content above visible area after load',
    effort: 'M',
  },
  'poor-fcp': {
    fix: 'Reduce render-blocking resources; inline critical CSS; use font-display: swap',
    effort: 'M',
  },
  'poor-ttfb': {
    fix: 'Investigate server latency; enable caching; consider CDN or edge delivery',
    effort: 'L',
  },
};

const DEFAULT_FIX: FixMeta = {
  fix: 'Investigate root cause and apply targeted fix. Review element in DevTools.',
  effort: 'M',
};

// ─── Severity ordering ────────────────────────────────────────────────────────

const SEVERITY_ORDER: Record<Severity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
};

const SEVERITY_EMOJI: Record<Severity, string> = {
  critical: '🔴',
  high: '🟠',
  medium: '🟡',
  low: '🔵',
  info: 'ℹ️',
};

const EFFORT_LABEL: Record<Effort, string> = {
  XS: 'XS ~mins',
  S: 'S ~1h',
  M: 'M ~half day',
  L: 'L ~1+ day',
};

// ─── Severity normalization ───────────────────────────────────────────────────

/** Maps accessibility issue types (which carry no severity) to a severity level. */
function a11ySeverity(type: string): Severity {
  const critical: string[] = [];
  const high = [
    'missing-accessible-name', 'input-missing-label', 'role-button-not-focusable',
    'clickable-without-role', 'missing-html-lang', 'poor-color-contrast', 'poor-color-contrast-summary',
  ];
  const medium = [
    'duplicate-id', 'heading-level-skip', 'aria-expanded-no-controls',
  ];
  if (critical.includes(type)) return 'critical';
  if (high.includes(type)) return 'high';
  if (medium.includes(type)) return 'medium';
  return 'low';
}

function webVitalSeverity(rating: string): Severity {
  if (rating === 'poor') return 'medium';
  if (rating === 'needs-improvement') return 'low';
  return 'info';
}

// ─── Artifact readers ─────────────────────────────────────────────────────────

function safeReadJson<T>(filePath: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T;
  } catch {
    return null;
  }
}

function globArtifacts(folder: string, pattern: RegExp): string[] {
  const dir = path.join('qa-artifacts', folder);
  try {
    return fs.readdirSync(dir)
      .filter((f: string) => pattern.test(f))
      .map((f: string) => path.join(dir, f));
  } catch {
    return [];
  }
}

// ─── Ingest functions ─────────────────────────────────────────────────────────

function ingestAccessibility(route: string, routeName: string): NormalizedFinding[] {
  const filePath = path.join('qa-artifacts', 'accessibility', `${routeName}-accessibility.json`);
  const data = safeReadJson<Array<{ type: string; message: string; selector?: string; text?: string }>>(filePath);
  if (!data) return [];
  return data.map(item => ({
    route,
    source: 'accessibility',
    severity: a11ySeverity(item.type),
    type: item.type,
    message: item.message,
    selector: item.selector,
    text: item.text,
    evidencePath: filePath,
  }));
}

function ingestSecurity(route: string, routeName: string): NormalizedFinding[] {
  const filePath = path.join('qa-artifacts', 'security', `${routeName}-security.json`);
  const data = safeReadJson<Array<{ severity?: string; type?: string; message?: string; header?: string }>>(filePath);
  if (!data) return [];
  return data.map(item => ({
    route,
    source: 'security',
    severity: (item.severity as Severity) || 'medium',
    type: item.type || item.header || 'security-finding',
    message: item.message || JSON.stringify(item),
    evidencePath: filePath,
  }));
}

function ingestZoomScroll(route: string, routeName: string): NormalizedFinding[] {
  const filePath = path.join('qa-artifacts', 'zoom-scroll', `${routeName}-zoom-scroll.json`);
  const data = safeReadJson<{ findings: Array<{ severity: string; type: string; message: string; zoom?: number }> }>(filePath);
  if (!data?.findings) return [];
  return data.findings
    .filter(f => f.severity !== 'info')
    .map(item => ({
      route,
      source: 'zoom-scroll',
      severity: item.severity as Severity,
      type: item.type,
      message: item.message,
      evidencePath: filePath,
    }));
}

function ingestThemeComparison(route: string, routeName: string): NormalizedFinding[] {
  const filePath = path.join('qa-artifacts', 'theme-comparison', `${routeName}-theme-comparison.json`);
  const data = safeReadJson<{
    issues: Array<{
      severity: string; source: string; type: string; message: string;
      selector?: string; text?: string;
    }>
  }>(filePath);
  if (!data?.issues) return [];
  return data.issues
    .filter(f => f.severity !== 'info')
    .map(item => ({
      route,
      source: 'theme-comparison',
      severity: item.severity as Severity,
      type: item.type,
      message: item.message,
      selector: item.selector,
      text: item.text,
      evidencePath: filePath,
    }));
}

function ingestLayout(route: string, routeName: string): NormalizedFinding[] {
  const files = globArtifacts('layout', new RegExp(`^${routeName}-layout-scroll-`));
  const findings: NormalizedFinding[] = [];
  for (const filePath of files) {
    const data = safeReadJson<Array<{ type: string; message: string; selector?: string }>>(filePath);
    if (!data) continue;
    for (const item of data) {
      findings.push({
        route,
        source: 'layout',
        severity: 'medium',
        type: item.type,
        message: item.message,
        selector: item.selector,
        evidencePath: filePath,
      });
    }
  }
  return findings;
}

function ingestForms(route: string, routeName: string): NormalizedFinding[] {
  const filePath = path.join('qa-artifacts', 'forms', `${routeName}-forms.json`);
  const data = safeReadJson<Array<{ type?: string; message?: string; severity?: string }>>(filePath);
  if (!data) return [];
  return data.map(item => ({
    route,
    source: 'forms',
    severity: (item.severity as Severity) || 'medium',
    type: item.type || 'form-issue',
    message: item.message || JSON.stringify(item),
    evidencePath: filePath,
  }));
}

function ingestSeo(route: string, routeName: string): NormalizedFinding[] {
  const filePath = path.join('qa-artifacts', 'seo', `${routeName}-seo.json`);
  const data = safeReadJson<Array<{ type?: string; message?: string }>>(filePath);
  if (!data) return [];
  return data.map(item => ({
    route,
    source: 'seo',
    severity: 'low' as Severity,
    type: item.type || 'seo-issue',
    message: item.message || JSON.stringify(item),
    evidencePath: filePath,
  }));
}

function ingestPerformance(route: string, routeName: string): NormalizedFinding[] {
  const filePath = path.join('qa-artifacts', 'performance', `${routeName}-poor-vitals.json`);
  const data = safeReadJson<Array<{ name: string; value: number; rating: string }>>(filePath);
  if (!data) return [];
  return data.map(item => ({
    route,
    source: 'performance',
    severity: webVitalSeverity(item.rating),
    type: `poor-${item.name.toLowerCase()}`,
    message: `${item.name} = ${item.value} (${item.rating})`,
    evidencePath: filePath,
  }));
}

function ingestNetwork(route: string, routeName: string): NormalizedFinding[] {
  const findings: NormalizedFinding[] = [];

  const dupeFile = path.join('qa-artifacts', 'network', `${routeName}-duplicates.json`);
  const dupes = safeReadJson<Array<{ url: string; count: number }>>(dupeFile);
  if (dupes) {
    for (const d of dupes) {
      findings.push({
        route,
        source: 'network',
        severity: 'medium',
        type: 'duplicate-api-calls',
        message: `URL called ${d.count}x: ${d.url}`,
        evidencePath: dupeFile,
      });
    }
  }

  const largeFile = path.join('qa-artifacts', 'network', `${routeName}-large-payloads.json`);
  const large = safeReadJson<Array<{ url: string; size: number }>>(largeFile);
  if (large) {
    for (const l of large) {
      findings.push({
        route,
        source: 'network',
        severity: 'low',
        type: 'large-payload',
        message: `Large response (${(l.size / 1024).toFixed(0)} KB): ${l.url}`,
        evidencePath: largeFile,
      });
    }
  }

  return findings;
}

// ─── Deduplication ────────────────────────────────────────────────────────────

function dedupeFindings(findings: NormalizedFinding[]): NormalizedFinding[] {
  const seen = new Set<string>();
  return findings.filter(f => {
    const key = `${f.source}|${f.route}|${f.type}|${f.selector || ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ─── Markdown generation ──────────────────────────────────────────────────────

function renderFixPlan(allFindings: NormalizedFinding[], generatedAt: string): string {
  const sorted = [...allFindings].sort((a, b) => {
    const sev = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    if (sev !== 0) return sev;
    return a.route.localeCompare(b.route);
  });

  const bySeverity = new Map<Severity, NormalizedFinding[]>();
  for (const f of sorted) {
    if (!bySeverity.has(f.severity)) bySeverity.set(f.severity, []);
    bySeverity.get(f.severity)!.push(f);
  }

  const counts: Record<Severity, number> = {
    critical: bySeverity.get('critical')?.length ?? 0,
    high: bySeverity.get('high')?.length ?? 0,
    medium: bySeverity.get('medium')?.length ?? 0,
    low: bySeverity.get('low')?.length ?? 0,
    info: 0,
  };

  const lines: string[] = [];

  lines.push('# QA Fix Plan');
  lines.push('');
  lines.push(`Generated: ${generatedAt}`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push('| Severity | Count |');
  lines.push('|----------|-------|');
  lines.push(`| 🔴 Critical | ${counts.critical} |`);
  lines.push(`| 🟠 High | ${counts.high} |`);
  lines.push(`| 🟡 Medium | ${counts.medium} |`);
  lines.push(`| 🔵 Low | ${counts.low} |`);
  lines.push(`| **Total** | **${counts.critical + counts.high + counts.medium + counts.low}** |`);
  lines.push('');

  const severities: Severity[] = ['critical', 'high', 'medium', 'low'];
  let defectNum = 0;

  for (const sev of severities) {
    const group = bySeverity.get(sev);
    if (!group || group.length === 0) continue;

    const label = sev.charAt(0).toUpperCase() + sev.slice(1);
    lines.push(`## ${SEVERITY_EMOJI[sev]} ${label} (${group.length})`);
    lines.push('');

    for (const f of group) {
      defectNum++;
      const meta = FIX_RECOMMENDATIONS[f.type] ?? DEFAULT_FIX;
      const routeLabel = f.route === '/' ? '/' : f.route;
      const wcagLine = meta.wcag ? ` · ${meta.wcag}` : '';

      lines.push(`### FIX-${String(defectNum).padStart(3, '0')}: ${f.type}`);
      lines.push('');
      lines.push(`**Route:** \`${routeLabel}\``);
      lines.push(`**Source:** ${f.source}${wcagLine}`);
      lines.push(`**Effort:** ${EFFORT_LABEL[meta.effort]}`);
      if (f.selector) lines.push(`**Element:** \`${f.selector}\``);
      if (f.text) lines.push(`**Text:** "${f.text}"`);
      lines.push('');
      lines.push(`**Finding:** ${f.message}`);
      lines.push('');
      lines.push(`**Fix:** ${meta.fix}`);
      lines.push('');
      lines.push(`**Evidence:** \`${f.evidencePath}\``);
      lines.push('');
      lines.push('---');
      lines.push('');
    }
  }

  if (allFindings.length === 0) {
    lines.push('## ✅ No actionable findings');
    lines.push('');
    lines.push('All artifact checks passed or produced no findings.');
  }

  return lines.join('\n');
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Reads all QA artifacts for the given routes, aggregates findings across every
 * category (accessibility, security, zoom-scroll, theme, layout, forms, SEO,
 * performance, network), deduplicates, sorts by severity, and writes a
 * prioritised fix plan to `qa-artifacts/reports/fix-plan.md`.
 *
 * Must be called AFTER all per-route tests complete (artifacts must be written).
 * Safe to call even if some routes failed mid-test — missing artifact files are
 * silently skipped.
 *
 * @param routes Array of route paths (e.g. ['/', '/about', '/dashboard'])
 */
export function writeFixPlan(routes: string[]): void {
  const allFindings: NormalizedFinding[] = [];

  for (const route of routes) {
    const routeName = normalizeRoute(route);
    allFindings.push(
      ...ingestAccessibility(route, routeName),
      ...ingestSecurity(route, routeName),
      ...ingestZoomScroll(route, routeName),
      ...ingestThemeComparison(route, routeName),
      ...ingestLayout(route, routeName),
      ...ingestForms(route, routeName),
      ...ingestSeo(route, routeName),
      ...ingestPerformance(route, routeName),
      ...ingestNetwork(route, routeName),
    );
  }

  const deduped = dedupeFindings(allFindings);
  const generatedAt = new Date().toISOString();
  const markdown = renderFixPlan(deduped, generatedAt);

  const dir = path.join('qa-artifacts', 'reports');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'fix-plan.md'), markdown, 'utf-8');
}

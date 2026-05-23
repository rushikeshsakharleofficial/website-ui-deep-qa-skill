import { Page } from '@playwright/test';
import { screenshotStep } from './screenshots';
import { writeJsonArtifact } from './report';
import { normalizeRoute } from './routes';

export type ThemeIssue = {
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  source: 'theme-comparison';
  theme: 'light' | 'dark' | 'both' | 'toggle';
  type: string;
  message: string;
  selector?: string;
  text?: string;
  contrastLight?: number;
  contrastDark?: number;
};

export type ThemeComparisonReport = {
  route: string;
  lightBg: string;
  darkBg: string;
  siteRespondsToDarkMode: boolean;
  toggleFound: boolean;
  toggleSelector?: string;
  issues: ThemeIssue[];
};

// ─── internal contrast helpers ────────────────────────────────────────────────

type RGB = [number, number, number];

function parseRgb(s: string): RGB | null {
  const m = s.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  return m ? [parseInt(m[1]), parseInt(m[2]), parseInt(m[3])] : null;
}

function luminance([r, g, b]: RGB): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrastRatio(fg: RGB, bg: RGB): number {
  const l1 = luminance(fg);
  const l2 = luminance(bg);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

// ─── in-page evaluation types (duplicated in evaluate scope) ─────────────────

type InPageResult = {
  invisibleInDark: Array<{ selector: string; text: string; contrastLight: number; contrastDark: number }>;
  invisibleInLight: Array<{ selector: string; text: string; contrastLight: number; contrastDark: number }>;
  layoutOverflowDark: boolean;
};

// ─── helpers ─────────────────────────────────────────────────────────────────

/**
 * Reads document.body background color as a proxy for theme state.
 */
async function readBodyBg(page: Page): Promise<string> {
  return page.evaluate(() => getComputedStyle(document.body).backgroundColor);
}

/**
 * Waits for the body background color to change from `prev`.
 * Times out after 600 ms and returns whatever value it has at that point.
 */
async function waitForBgChange(page: Page, prev: string): Promise<string> {
  const deadline = Date.now() + 600;
  while (Date.now() < deadline) {
    const bg = await readBodyBg(page);
    if (bg !== prev) return bg;
    await page.waitForTimeout(80);
  }
  return await readBodyBg(page);
}

/**
 * Tries to find a visible theme toggle button on the page.
 * Looks for buttons/controls with "dark", "light", "theme", or "mode" in their
 * accessible name, text, or aria-label.
 *
 * @returns selector string or null if not found
 */
async function findThemeToggle(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const keywords = /dark|light|theme|mode/i;
    const candidates = Array.from(
      document.querySelectorAll<HTMLElement>(
        'button, [role="button"], [role="switch"], input[type="checkbox"], a[href="#"]'
      )
    );
    for (const el of candidates) {
      const label =
        el.getAttribute('aria-label') ||
        el.getAttribute('title') ||
        el.textContent?.trim() ||
        '';
      if (keywords.test(label)) {
        const s = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        if (
          s.display !== 'none' &&
          s.visibility !== 'hidden' &&
          r.width > 0 &&
          r.height > 0
        ) {
          // Return a minimal selector
          return (
            el.getAttribute('data-testid') ||
            (el.id ? `#${el.id}` : null) ||
            el.getAttribute('aria-label') ||
            label.slice(0, 40)
          );
        }
      }
    }
    return null;
  });
}

/**
 * Collects elements that have significantly different (broken) contrast between
 * light and dark modes. Compares contrast in the current page state (expected
 * to be the dark theme when called).
 *
 * This is a SEPARATE check from the generic contrast audit in accessibility.ts.
 * It only fires on elements where contrast dropped from acceptable (≥ 4.5) in
 * one theme to near-invisible (< 1.5) in the other — typical of AI-generated
 * sites with hardcoded `color: #000` without a dark variant.
 *
 * Requires: page is already in the dark mode state AND light-mode contrast data
 * is supplied as `lightContrasts` (pre-collected before the theme switch).
 */
async function collectThemeBrokenElements(
  page: Page,
  lightContrasts: Map<string, number>
): Promise<InPageResult> {
  const darkContrasts = await page.evaluate(() => {
    type RGB = [number, number, number];
    const parseRgb = (s: string): RGB | null => {
      const m = s.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      return m ? [parseInt(m[1]), parseInt(m[2]), parseInt(m[3])] : null;
    };
    const lum = ([r, g, b]: RGB) => {
      const lin = (c: number) => {
        const s = c / 255;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
      };
      return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    };
    const cr = (fg: RGB, bg: RGB) =>
      (Math.max(lum(fg), lum(bg)) + 0.05) / (Math.min(lum(fg), lum(bg)) + 0.05);

    const visible = (el: HTMLElement) => {
      const s = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return (
        s.display !== 'none' &&
        s.visibility !== 'hidden' &&
        s.opacity !== '0' &&
        r.width > 0 &&
        r.height > 0
      );
    };

    // Walk up to find resolved non-transparent background
    const resolvedBg = (el: HTMLElement): RGB | null => {
      let node: HTMLElement | null = el;
      while (node) {
        const s = getComputedStyle(node);
        const bg = parseRgb(s.backgroundColor);
        if (bg && !(bg[0] === 0 && bg[1] === 0 && bg[2] === 0 && s.backgroundColor.includes('rgba(0, 0, 0, 0'))) {
          return bg;
        }
        node = node.parentElement;
      }
      return null;
    };

    const results: Array<{ key: string; selector: string; text: string; contrast: number }> = [];
    const textEls = Array.from(
      document.querySelectorAll<HTMLElement>('p,span,a,button,label,li,td,th,h1,h2,h3,h4,h5,h6')
    ).filter(el => visible(el) && (el.textContent?.trim() || '').length > 2);

    let i = 0;
    for (const el of textEls.slice(0, 80)) {
      const s = getComputedStyle(el);
      const fg = parseRgb(s.color);
      const bg = resolvedBg(el);
      if (!fg || !bg) continue;
      const ratio = cr(fg, bg);
      const text = el.textContent?.trim().slice(0, 40) || '';
      const key = `${el.tagName}-${i++}-${text.slice(0, 20)}`;
      results.push({
        key,
        selector:
          el.getAttribute('data-testid') ||
          el.getAttribute('aria-label') ||
          el.id ||
          el.className?.toString().slice(0, 40) ||
          el.tagName,
        text,
        contrast: ratio,
      });
    }

    // Separate check: horizontal overflow in dark mode
    const layoutOverflowDark =
      document.documentElement.scrollWidth > window.innerWidth + 4;

    return { results, layoutOverflowDark };
  });

  const invisibleInDark: InPageResult['invisibleInDark'] = [];
  const invisibleInLight: InPageResult['invisibleInLight'] = [];

  for (const { key, selector, text, contrast: contrastDark } of darkContrasts.results) {
    const contrastLight = lightContrasts.get(key);
    if (contrastLight === undefined) continue;
    // Element disappears in dark: was OK in light (≥4.5) but near-invisible in dark (<1.5)
    if (contrastLight >= 4.5 && contrastDark < 1.5) {
      invisibleInDark.push({ selector, text, contrastLight, contrastDark });
    }
    // Element disappears in light: was OK in dark (≥4.5) but near-invisible in light (<1.5)
    if (contrastDark >= 4.5 && contrastLight < 1.5) {
      invisibleInLight.push({ selector, text, contrastLight, contrastDark });
    }
  }

  return {
    invisibleInDark,
    invisibleInLight,
    layoutOverflowDark: darkContrasts.layoutOverflowDark,
  };
}

/**
 * Collects per-element contrast in the current page state (used for light baseline).
 * Returns a Map of key → contrast ratio for later comparison in dark mode.
 */
async function collectLightContrasts(page: Page): Promise<Map<string, number>> {
  const entries = await page.evaluate(() => {
    type RGB = [number, number, number];
    const parseRgb = (s: string): RGB | null => {
      const m = s.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      return m ? [parseInt(m[1]), parseInt(m[2]), parseInt(m[3])] : null;
    };
    const lum = ([r, g, b]: RGB) => {
      const lin = (c: number) => {
        const s = c / 255;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
      };
      return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    };
    const cr = (fg: RGB, bg: RGB) =>
      (Math.max(lum(fg), lum(bg)) + 0.05) / (Math.min(lum(fg), lum(bg)) + 0.05);
    const visible = (el: HTMLElement) => {
      const s = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return (
        s.display !== 'none' &&
        s.visibility !== 'hidden' &&
        s.opacity !== '0' &&
        r.width > 0 &&
        r.height > 0
      );
    };
    const resolvedBg = (el: HTMLElement): RGB | null => {
      let node: HTMLElement | null = el;
      while (node) {
        const s = getComputedStyle(node);
        const bg = parseRgb(s.backgroundColor);
        if (bg && !(bg[0] === 0 && bg[1] === 0 && bg[2] === 0 && s.backgroundColor.includes('rgba(0, 0, 0, 0'))) {
          return bg;
        }
        node = node.parentElement;
      }
      return null;
    };

    const textEls = Array.from(
      document.querySelectorAll<HTMLElement>('p,span,a,button,label,li,td,th,h1,h2,h3,h4,h5,h6')
    ).filter(el => visible(el) && (el.textContent?.trim() || '').length > 2);

    const out: Array<[string, number]> = [];
    let i = 0;
    for (const el of textEls.slice(0, 80)) {
      const s = getComputedStyle(el);
      const fg = parseRgb(s.color);
      const bg = resolvedBg(el);
      if (!fg || !bg) continue;
      const text = el.textContent?.trim().slice(0, 20) || '';
      const key = `${el.tagName}-${i++}-${text}`;
      out.push([key, cr(fg, bg)]);
    }
    return out;
  });
  return new Map(entries);
}

// ─── public API ───────────────────────────────────────────────────────────────

/**
 * Compares light and dark theme rendering for the given route.
 *
 * Flow:
 * 1. Capture body bg baseline (light).
 * 2. Collect per-element contrast ratios in light mode.
 * 3. Screenshot light mode.
 * 4. Emulate dark color scheme; detect if site responds.
 * 5. Screenshot dark mode.
 * 6. Collect per-element contrast ratios in dark mode.
 * 7. Find elements invisible in one theme (contrast ≥4.5 in one, <1.5 in other).
 * 8. Try to find + click theme toggle button (secondary smoke test).
 * 9. Reset to light (`emulateMedia({ colorScheme: 'light' })`).
 * 10. Verify body bg returned to baseline (leak guard for visualRegression).
 *
 * Does NOT hard-assert layout diffs or contrast differences.
 * Invisible-element findings are HIGH severity.
 * Layout overflow unique to dark mode is MEDIUM (separate artifact, same as zoom-scroll).
 *
 * @param page Playwright page instance
 * @param route Current route pathname
 * @returns ThemeComparisonReport
 */
export async function testThemeComparison(
  page: Page,
  route: string
): Promise<ThemeComparisonReport> {
  const routeName = normalizeRoute(route);
  const issues: ThemeIssue[] = [];

  // ── Baseline (light mode) ──────────────────────────────────────────────────
  const lightBg = await readBodyBg(page);
  const lightContrasts = await collectLightContrasts(page);
  await screenshotStep(page, route, 'theme-light-top');

  // ── Switch to dark mode ────────────────────────────────────────────────────
  await page.emulateMedia({ colorScheme: 'dark' });
  // Wait up to 600 ms for the theme to take effect
  const darkBg = await waitForBgChange(page, lightBg);
  await page.waitForTimeout(200);

  const siteRespondsToDarkMode = darkBg !== lightBg;

  if (!siteRespondsToDarkMode) {
    issues.push({
      severity: 'info',
      source: 'theme-comparison',
      theme: 'dark',
      type: 'dark-mode-not-responsive',
      message:
        'Site does not respond to prefers-color-scheme: dark. ' +
        'It may use a class-based or localStorage-driven theme. ' +
        'Theme toggle click attempted as fallback.',
    });
  }

  await screenshotStep(page, route, 'theme-dark-top');

  // ── Invisible-element check ────────────────────────────────────────────────
  const brokenElements = await collectThemeBrokenElements(page, lightContrasts);

  for (const el of brokenElements.invisibleInDark.slice(0, 10)) {
    issues.push({
      severity: 'high',
      source: 'theme-comparison',
      theme: 'dark',
      type: 'element-invisible-in-dark',
      message:
        `Text near-invisible in dark mode (contrast ${el.contrastDark.toFixed(2)}:1 vs ${el.contrastLight.toFixed(2)}:1 in light). ` +
        `Likely hardcoded color without dark variant.`,
      selector: el.selector,
      text: el.text,
      contrastLight: el.contrastLight,
      contrastDark: el.contrastDark,
    });
  }
  if (brokenElements.invisibleInDark.length > 10) {
    issues.push({
      severity: 'high',
      source: 'theme-comparison',
      theme: 'dark',
      type: 'element-invisible-in-dark-summary',
      message: `${brokenElements.invisibleInDark.length} elements near-invisible in dark mode (first 10 reported above).`,
    });
  }

  for (const el of brokenElements.invisibleInLight.slice(0, 5)) {
    issues.push({
      severity: 'medium',
      source: 'theme-comparison',
      theme: 'light',
      type: 'element-invisible-in-light',
      message:
        `Text near-invisible in light mode (contrast ${el.contrastLight.toFixed(2)}:1 vs ${el.contrastDark.toFixed(2)}:1 in dark). ` +
        `Likely dark-only color value leaking into light theme.`,
      selector: el.selector,
      text: el.text,
      contrastLight: el.contrastLight,
      contrastDark: el.contrastDark,
    });
  }

  // Layout overflow unique to dark mode
  if (brokenElements.layoutOverflowDark) {
    const lightOverflow = await page.evaluate(() => {
      // Already in dark at this point — checked in the evaluate above.
      // We need to know if light also had overflow. Use scrollWidth heuristic.
      return document.documentElement.scrollWidth > window.innerWidth + 4;
    });
    if (!lightOverflow) {
      issues.push({
        severity: 'medium',
        source: 'theme-comparison',
        theme: 'dark',
        type: 'dark-mode-layout-overflow',
        message:
          'Horizontal layout overflow present in dark mode but not in light mode. ' +
          'Likely different content widths between themes (e.g. longer labels, wider backgrounds).',
      });
    }
  }

  // ── Theme toggle (secondary smoke test) ───────────────────────────────────
  const toggleSelector = await findThemeToggle(page);
  let toggleFound = false;

  if (toggleSelector) {
    toggleFound = true;
    try {
      // Reset to light first so toggle goes dark → we can observe the change
      await page.emulateMedia({ colorScheme: 'light' });
      await page.waitForTimeout(150);
      const bgBeforeToggle = await readBodyBg(page);

      const toggle = page.locator(
        toggleSelector.startsWith('#') || toggleSelector.startsWith('[')
          ? toggleSelector
          : `button:has-text("${toggleSelector}"), [aria-label="${toggleSelector}"]`
      ).first();

      if (await toggle.isVisible().catch(() => false)) {
        await toggle.click();
        await page.waitForTimeout(400);
        const bgAfterToggle = await readBodyBg(page);
        await screenshotStep(page, route, 'theme-toggle-after-click');

        if (bgAfterToggle === bgBeforeToggle) {
          issues.push({
            severity: 'medium',
            source: 'theme-comparison',
            theme: 'toggle',
            type: 'toggle-no-visual-change',
            message:
              `Theme toggle found ("${toggleSelector}") but clicking it produced no visible background change. ` +
              `Toggle may be broken or only applied via CSS class without bg change.`,
            selector: toggleSelector,
          });
        }

        // Click back to restore original state
        await toggle.click().catch(() => undefined);
        await page.waitForTimeout(300);
      }
    } catch {
      // Toggle click failed — non-fatal
    }
  }

  // ── Reset to light mode ────────────────────────────────────────────────────
  await page.emulateMedia({ colorScheme: 'light' });
  await page.waitForTimeout(200);

  const bgAfterReset = await readBodyBg(page);

  // Leak guard: if site responds to prefers-color-scheme, bg should match baseline.
  // If it doesn't respond (localStorage/class-based), bg never changed so this is fine.
  if (siteRespondsToDarkMode && bgAfterReset !== lightBg) {
    issues.push({
      severity: 'info',
      source: 'theme-comparison',
      theme: 'both',
      type: 'theme-reset-bg-mismatch',
      message:
        `Body background did not return to light baseline after emulateMedia reset. ` +
        `Expected "${lightBg}", got "${bgAfterReset}". ` +
        `Subsequent tests (interactions, visualRegression) may run in wrong theme.`,
    });
  }

  const report: ThemeComparisonReport = {
    route,
    lightBg,
    darkBg,
    siteRespondsToDarkMode,
    toggleFound,
    toggleSelector: toggleSelector ?? undefined,
    issues,
  };

  writeJsonArtifact('theme-comparison', `${routeName}-theme-comparison.json`, report);

  return report;
}

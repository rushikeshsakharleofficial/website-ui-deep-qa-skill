import { Page } from '@playwright/test';
import { screenshotStep } from './screenshots';
import { writeJsonArtifact } from './report';
import { normalizeRoute } from './routes';

export type EdgeStateFinding = {
  severity: 'high' | 'medium' | 'low' | 'info';
  type: string;
  message: string;
  url?: string;
};

export type EdgeStateReport = {
  route: string;
  findings: EdgeStateFinding[];
  notFoundPageWorks: boolean;
  loadingSpinnerDetected: boolean;
  infiniteSpinnerSuspected: boolean;
};

export async function auditEdgeStates(
  page: Page,
  route: string,
  baseURL: string
): Promise<EdgeStateReport> {
  const routeName = normalizeRoute(route);
  const findings: EdgeStateFinding[] = [];
  let notFoundPageWorks = false;
  let loadingSpinnerDetected = false;
  let infiniteSpinnerSuspected = false;

  // Capture homepage title for 404-fallback comparison
  let homepageTitle = '';
  try {
    await page.goto(baseURL.replace(/\/$/, '') + '/');
    await page.waitForLoadState('domcontentloaded');
    homepageTitle = await page.evaluate(() => document.title);
    // Navigate back to original route before continuing
    await page.goto(route);
    await page.waitForLoadState('domcontentloaded');
  } catch {
    // best-effort; homepageTitle stays empty
  }

  // 1. 404 page test
  const notFoundUrl = baseURL.replace(/\/$/, '') + '/this-route-definitely-does-not-exist-404-test';
  try {
    await page.goto(notFoundUrl);
    await page.waitForTimeout(1000);
    await screenshotStep(page, route, '404-page');

    const { title, bodyText } = await page.evaluate(() => ({
      title: document.title,
      bodyText: (document.body.textContent || '').toLowerCase(),
    }));

    const not404Indicators = ['404', 'not found', 'page not found'];
    const titleLower = title.toLowerCase();
    const contentIndicates404 = not404Indicators.some(
      (indicator) => titleLower.includes(indicator) || bodyText.includes(indicator)
    );

    if (contentIndicates404) {
      notFoundPageWorks = true;
    } else if (homepageTitle && title === homepageTitle) {
      findings.push({
        severity: 'medium',
        type: '404-not-handled',
        message: `App returned same page title as homepage ("${homepageTitle}") for unknown route — may be returning 200 for all routes`,
        url: notFoundUrl,
      });
    }
  } catch {
    // skip 404 check if navigation fails
  }

  // Navigate back to original route
  try {
    await page.goto(route);
    await page.waitForLoadState('domcontentloaded');
  } catch {
    // best-effort restore
  }

  // 2. Infinite spinner detection
  try {
    const spinnerSelector =
      '[class*="spinner" i], [class*="loading" i], [aria-label*="loading" i], [role="progressbar"], .skeleton, [data-loading="true"]';

    loadingSpinnerDetected = await page.evaluate((sel) => {
      const els = Array.from(document.querySelectorAll<HTMLElement>(sel));
      return els.some((el) => {
        const s = getComputedStyle(el);
        return s.display !== 'none' && s.visibility !== 'hidden' && s.opacity !== '0';
      });
    }, spinnerSelector);

    await page.waitForTimeout(3000);

    infiniteSpinnerSuspected = await page.evaluate((sel) => {
      const els = Array.from(document.querySelectorAll<HTMLElement>(sel));
      return els.some((el) => {
        const s = getComputedStyle(el);
        return s.display !== 'none' && s.visibility !== 'hidden' && s.opacity !== '0';
      });
    }, spinnerSelector);

    if (infiniteSpinnerSuspected) {
      findings.push({
        severity: 'high',
        type: 'infinite-spinner',
        message: 'Loading spinner still visible after 3 seconds — suspected stuck/infinite loading state',
      });
    }
  } catch {
    // skip spinner check if it fails
  }

  // 3. Skeleton screens
  try {
    const skeletonSelector = '[class*="skeleton" i], [data-skeleton], [aria-busy="true"]';

    const skeletonInitial = await page.evaluate((sel) => {
      const els = Array.from(document.querySelectorAll<HTMLElement>(sel));
      return els.some((el) => {
        const s = getComputedStyle(el);
        return s.display !== 'none' && s.visibility !== 'hidden';
      });
    }, skeletonSelector);

    if (skeletonInitial) {
      await page.waitForTimeout(3000);

      const skeletonStillVisible = await page.evaluate((sel) => {
        const els = Array.from(document.querySelectorAll<HTMLElement>(sel));
        return els.some((el) => {
          const s = getComputedStyle(el);
          return s.display !== 'none' && s.visibility !== 'hidden';
        });
      }, skeletonSelector);

      if (skeletonStillVisible) {
        findings.push({
          severity: 'medium',
          type: 'skeleton-not-resolved',
          message: 'Skeleton screen still visible after 3 seconds — content may not have loaded',
        });
      }
    }
  } catch {
    // skip skeleton check if it fails
  }

  // 4. Error boundary
  try {
    const errorBoundaryVisible = await page.evaluate(() => {
      const candidates = Array.from(
        document.querySelectorAll<HTMLElement>('[class*="error-boundary" i]')
      );
      const visibleBoundary = candidates.some((el) => {
        const s = getComputedStyle(el);
        return s.display !== 'none' && s.visibility !== 'hidden';
      });

      const bodyText = (document.body.textContent || '').toLowerCase();
      const hasErrorText =
        bodyText.includes('something went wrong') ||
        bodyText.includes('an error occurred');

      return visibleBoundary || hasErrorText;
    });

    if (errorBoundaryVisible) {
      findings.push({
        severity: 'high',
        type: 'error-boundary-visible',
        message: 'Error boundary or crash message detected — a React/component error may have occurred',
      });
    }
  } catch {
    // skip error boundary check if it fails
  }

  // 5. Empty states (informational)
  try {
    const emptyStateDetected = await page.evaluate(() => {
      const candidates = [
        document.querySelector('[class*="empty-state" i]'),
        document.querySelector('[class*="no-results" i]'),
      ];
      const bodyText = (document.body.textContent || '').toLowerCase();
      const hasEmptyText =
        bodyText.includes('no data') ||
        bodyText.includes('no results') ||
        bodyText.includes('nothing here');

      return candidates.some((el) => el !== null) || hasEmptyText;
    });

    if (emptyStateDetected) {
      findings.push({
        severity: 'info',
        type: 'empty-state-detected',
        message: 'Empty state indicator detected on page — verify this is expected for the current data context',
      });
    }
  } catch {
    // skip empty state check if it fails
  }

  const report: EdgeStateReport = {
    route,
    findings,
    notFoundPageWorks,
    loadingSpinnerDetected,
    infiniteSpinnerSuspected,
  };
  writeJsonArtifact('edge-states', `${routeName}-edge-states.json`, report);
  return report;
}

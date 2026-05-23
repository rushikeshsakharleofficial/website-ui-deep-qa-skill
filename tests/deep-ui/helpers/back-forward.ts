import { Page } from '@playwright/test';
import { screenshotStep } from './screenshots';
import { writeJsonArtifact } from './report';
import { normalizeRoute } from './routes';

export type BackForwardFinding = {
  severity: 'high' | 'medium' | 'low' | 'info';
  type: string;
  message: string;
  fromURL?: string;
  toURL?: string;
};

export type BackForwardReport = {
  route: string;
  findings: BackForwardFinding[];
  backWorked: boolean;
  forwardWorked: boolean;
  reloadWorked: boolean;
};

export async function testBackForwardNavigation(
  page: Page,
  route: string,
  baseURL: string
): Promise<BackForwardReport> {
  const routeName = normalizeRoute(route);
  const findings: BackForwardFinding[] = [];
  let backWorked = false;
  let forwardWorked = false;
  let reloadWorked = false;

  const startURL = page.url();
  let afterNavigateURL = startURL;

  // Find first visible internal link via evaluate
  const internalHref = await page.evaluate(() => {
    const anchors = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href]'));
    for (const a of anchors) {
      const href = a.getAttribute('href') || '';
      if (!href || href.startsWith('#') || href.startsWith('javascript:')) continue;
      try {
        const resolved = new URL(href, window.location.origin);
        if (resolved.origin !== window.location.origin) continue;
        const rect = a.getBoundingClientRect();
        const style = getComputedStyle(a);
        const visible =
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          style.opacity !== '0' &&
          rect.width > 0 &&
          rect.height > 0;
        if (visible) return resolved.href;
      } catch {
        // ignore malformed hrefs
      }
    }
    return null;
  });

  if (!internalHref) {
    findings.push({
      severity: 'info',
      type: 'no-internal-link-found',
      message: 'No visible internal link found on page — skipping navigation tests',
    });
    writeJsonArtifact('back-forward', `${routeName}-back-forward.json`, {
      route,
      findings,
      backWorked,
      forwardWorked,
      reloadWorked,
    } satisfies BackForwardReport);
    return { route, findings, backWorked, forwardWorked, reloadWorked };
  }

  // Click the discovered link to exercise client-side router and link handlers
  try {
    const linkLocator = page.locator(`a[href="${internalHref}"], a[href="${new URL(internalHref).pathname}"]`).first();
    await linkLocator.click();
    await page.waitForLoadState('domcontentloaded');
    afterNavigateURL = page.url();
    await screenshotStep(page, route, `${routeName}-after-navigate`);
  } catch (err) {
    findings.push({
      severity: 'high',
      type: 'navigate-to-link-failed',
      message: `Failed to click internal link: ${String(err).slice(0, 120)}`,
      fromURL: startURL,
      toURL: internalHref,
    });
    // Attempt recovery
    try {
      await page.goto(startURL);
      await page.waitForLoadState('domcontentloaded');
    } catch {
      // best-effort
    }
    writeJsonArtifact('back-forward', `${routeName}-back-forward.json`, {
      route,
      findings,
      backWorked,
      forwardWorked,
      reloadWorked,
    } satisfies BackForwardReport);
    return { route, findings, backWorked, forwardWorked, reloadWorked };
  }

  // Back test — attach console listener first
  const consoleErrors: string[] = [];
  const consoleHandler = (msg: { type: () => string; text: () => string }) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  };
  page.on('console', consoleHandler);

  try {
    await page.goBack();
    await page.waitForTimeout(500);
    const afterBackURL = page.url();

    const urlRestoredAfterBack =
      afterBackURL === startURL ||
      afterBackURL.replace(/\/$/, '') === startURL.replace(/\/$/, '');

    if (!urlRestoredAfterBack) {
      findings.push({
        severity: 'high',
        type: 'back-navigation-broken',
        message: `goBack() did not restore original URL. Expected: ${startURL}, got: ${afterBackURL}`,
        fromURL: afterNavigateURL,
        toURL: afterBackURL,
      });
    } else {
      backWorked = true;
    }

    await screenshotStep(page, route, `${routeName}-after-back`);

    // Check page not blank after back
    const bodyTextAfterBack = await page.evaluate(() => document.body?.innerText?.length ?? 0);
    if (bodyTextAfterBack === 0) {
      findings.push({
        severity: 'high',
        type: 'page-blank-after-back',
        message: 'Page body has no text content after goBack()',
        fromURL: afterNavigateURL,
        toURL: afterBackURL,
      });
    }

    if (consoleErrors.length > 0) {
      findings.push({
        severity: 'medium',
        type: 'console-errors-after-back',
        message: `${consoleErrors.length} console error(s) after goBack(): ${consoleErrors[0].slice(0, 120)}`,
      });
    }
  } catch (err) {
    findings.push({
      severity: 'high',
      type: 'back-navigation-error',
      message: `goBack() threw: ${String(err).slice(0, 120)}`,
    });
  } finally {
    page.off('console', consoleHandler);
  }

  // Forward test — navigate back to afterNavigateURL first
  try {
    await page.goForward();
    await page.waitForTimeout(500);
    const afterForwardURL = page.url();

    const urlRestoredAfterForward =
      afterForwardURL === afterNavigateURL ||
      afterForwardURL.replace(/\/$/, '') === afterNavigateURL.replace(/\/$/, '');

    if (!urlRestoredAfterForward) {
      findings.push({
        severity: 'medium',
        type: 'forward-navigation-broken',
        message: `goForward() did not restore navigated URL. Expected: ${afterNavigateURL}, got: ${afterForwardURL}`,
        fromURL: page.url(),
        toURL: afterForwardURL,
      });
    } else {
      forwardWorked = true;
    }

    await screenshotStep(page, route, `${routeName}-after-forward`);
  } catch (err) {
    findings.push({
      severity: 'medium',
      type: 'forward-navigation-error',
      message: `goForward() threw: ${String(err).slice(0, 120)}`,
    });
  }

  // Reload test — navigate to startURL, reload, check
  try {
    await page.goto(startURL);
    await page.waitForLoadState('domcontentloaded');

    const reloadConsoleErrors: string[] = [];
    const reloadConsoleHandler = (msg: { type: () => string; text: () => string }) => {
      if (msg.type() === 'error') reloadConsoleErrors.push(msg.text());
    };
    page.on('console', reloadConsoleHandler);

    try {
      await page.reload();
      await page.waitForLoadState('domcontentloaded');

      const bodyTextAfterReload = await page.evaluate(() => document.body?.innerText?.length ?? 0);
      if (bodyTextAfterReload === 0) {
        findings.push({
          severity: 'high',
          type: 'page-blank-after-reload',
          message: 'Page body has no text content after reload()',
          fromURL: startURL,
        });
      } else {
        reloadWorked = true;
      }

      if (reloadConsoleErrors.length > 0) {
        findings.push({
          severity: 'medium',
          type: 'console-errors-after-reload',
          message: `${reloadConsoleErrors.length} console error(s) after reload(): ${reloadConsoleErrors[0].slice(0, 120)}`,
        });
      }

      await screenshotStep(page, route, `${routeName}-after-reload`);
    } finally {
      page.off('console', reloadConsoleHandler);
    }
  } catch (err) {
    findings.push({
      severity: 'high',
      type: 'reload-error',
      message: `reload() threw: ${String(err).slice(0, 120)}`,
    });
  }

  // Always return to startURL so subsequent tests run on correct route
  try {
    await page.goto(startURL);
    await page.waitForLoadState('domcontentloaded');
  } catch {
    // best-effort
  }

  const report: BackForwardReport = { route, findings, backWorked, forwardWorked, reloadWorked };
  writeJsonArtifact('back-forward', `${routeName}-back-forward.json`, report);
  return report;
}

import { Page } from '@playwright/test';
import { screenshotStep } from './screenshots';
import { writeJsonArtifact } from './report';
import { normalizeRoute } from './routes';

export type ReducedMotionFinding = {
  severity: 'medium' | 'low' | 'info';
  type: string;
  message: string;
  selector?: string;
};

export type ReducedMotionReport = {
  route: string;
  siteRespectsReducedMotion: boolean;
  animatingElements: number;
  findings: ReducedMotionFinding[];
};

function countAnimatingElements(page: Page): Promise<number> {
  return page.evaluate(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>('*'));
    let count = 0;
    for (const el of els) {
      try {
        const s = getComputedStyle(el);
        const hasAnimation = s.animationName !== 'none' && s.animationName !== '';
        const hasTransition = parseFloat(s.transitionDuration) > 0;
        if (hasAnimation || hasTransition) count++;
      } catch (_) {
        // skip
      }
    }
    return count;
  });
}

export async function testReducedMotion(page: Page, route: string): Promise<ReducedMotionReport> {
  const routeName = normalizeRoute(route);
  const findings: ReducedMotionFinding[] = [];

  // Step 1: baseline count in normal mode
  const baselineCount = await countAnimatingElements(page);

  // Step 2: emulate prefers-reduced-motion: reduce
  await page.emulateMedia({ reducedMotion: 'reduce' });

  // Step 3: wait for CSS media query to apply
  await page.waitForTimeout(300);

  // Step 4: screenshot with reduced motion active
  await screenshotStep(page, route, 'reduced-motion-active');

  // Step 5: re-count animating elements under reduced motion
  const reducedCount = await countAnimatingElements(page);

  // Step 5 check: same count and baseline > 0 → does not respect reduced motion
  if (reducedCount === baselineCount && baselineCount > 0) {
    findings.push({
      severity: 'medium',
      type: 'reduced-motion-not-respected',
      message: `Site does not appear to respect prefers-reduced-motion. Animating element count unchanged (${baselineCount}). WCAG 2.3.3 (Animation from Interactions).`,
    });
  }

  // Step 6: check for elements still running animations under reduced-motion
  const stillRunning = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>('*'));
    const running: Array<{ selector: string; animationName: string }> = [];
    for (const el of els.slice(0, 300)) {
      try {
        const s = getComputedStyle(el);
        if (s.animationPlayState === 'running' && s.animationName !== 'none' && s.animationName !== '') {
          const id = el.getAttribute('data-testid') || el.id || el.className?.toString().slice(0, 50) || el.tagName;
          running.push({ selector: id, animationName: s.animationName });
        }
      } catch (_) {
        // skip
      }
    }
    return running;
  });

  for (const item of stillRunning.slice(0, 10)) {
    findings.push({
      severity: 'medium',
      type: 'animation-still-running',
      message: `Element still has animation-play-state: running under prefers-reduced-motion (animation: "${item.animationName}"). WCAG 2.3.3.`,
      selector: item.selector,
    });
  }
  if (stillRunning.length > 10) {
    findings.push({
      severity: 'medium',
      type: 'animation-still-running',
      message: `${stillRunning.length} elements still animating under reduced-motion (showing first 10). WCAG 2.3.3.`,
    });
  }

  // Step 7: info finding if site correctly reduced animations
  if (reducedCount < baselineCount) {
    findings.push({
      severity: 'info',
      type: 'reduced-motion-respected',
      message: `Site reduced animating elements from ${baselineCount} to ${reducedCount} under prefers-reduced-motion.`,
    });
  }

  // Step 8: REQUIRED reset — restore media emulation to no-preference
  await page.emulateMedia({ reducedMotion: 'no-preference' });

  // Step 9: emulateMedia has no getter to verify; wait briefly after reset
  // page.emulateMedia is fire-and-forget applied synchronously by Playwright CDP
  await page.waitForTimeout(200);

  // Step 11: siteRespectsReducedMotion = true if count dropped OR baseline was 0
  const siteRespectsReducedMotion = baselineCount === 0 || reducedCount < baselineCount;

  const report: ReducedMotionReport = {
    route,
    siteRespectsReducedMotion,
    animatingElements: baselineCount,
    findings,
  };

  // Step 10: write artifact
  writeJsonArtifact('reduced-motion', `${routeName}-reduced-motion.json`, report);
  return report;
}

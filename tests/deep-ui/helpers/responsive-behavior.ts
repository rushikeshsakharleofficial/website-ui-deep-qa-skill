import { Page } from '@playwright/test';
import { screenshotStep } from './screenshots';
import { writeJsonArtifact } from './report';
import { normalizeRoute } from './routes';

export type ResponsiveFinding = {
  severity: 'high' | 'medium' | 'low' | 'info';
  type: string;
  message: string;
  viewport?: string;
  selector?: string;
};

export type ResponsiveReport = {
  route: string;
  findings: ResponsiveFinding[];
  viewportsTested: string[];
};

const VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 768, height: 1024 },
  { width: 390, height: 844 },
];

export async function auditResponsiveBehavior(page: Page, route: string): Promise<ResponsiveReport> {
  const routeName = normalizeRoute(route);
  const findings: ResponsiveFinding[] = [];
  const viewportsTested: string[] = [];

  try {
    for (const vp of VIEWPORTS) {
      const vpLabel = `${vp.width}x${vp.height}`;
      try {
        if (page.viewportSize() !== null) {
          await page.setViewportSize(vp);
        }
        await page.waitForTimeout(300);

        viewportsTested.push(vpLabel);

        // 1. Screenshot
        await screenshotStep(page, route, `responsive-${vpLabel}`);

        // 2. Navigation check
        const navResult = await page.evaluate((vpWidth) => {
          const nav = document.querySelector('nav');
          let navVisible = false;
          if (nav) {
            const style = getComputedStyle(nav);
            const rect = nav.getBoundingClientRect();
            navVisible = style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0;
          }

          let hamburgerFound = false;
          if (!navVisible) {
            const hamburgerSelectors = [
              'button[aria-label*="menu" i]',
              '[class*="hamburger" i]',
              '[class*="menu-toggle" i]',
              'button[aria-expanded]',
            ];
            for (const sel of hamburgerSelectors) {
              try {
                const el = document.querySelector(sel);
                if (el) {
                  const style = getComputedStyle(el);
                  if (style.display !== 'none' && style.visibility !== 'hidden') {
                    hamburgerFound = true;
                    break;
                  }
                }
              } catch (_) {}
            }
          }

          return { navVisible, hamburgerFound };
        }, vp.width);

        if (!navResult.navVisible && !navResult.hamburgerFound) {
          if (vp.width <= 430) {
            findings.push({
              severity: 'high',
              type: 'mobile-nav-missing',
              message: `No visible nav or hamburger/menu button found at mobile viewport (${vpLabel})`,
              viewport: vpLabel,
              selector: 'nav',
            });
          } else if (vp.width <= 768) {
            findings.push({
              severity: 'medium',
              type: 'tablet-nav-missing',
              message: `No visible nav or hamburger/menu button found at tablet viewport (${vpLabel})`,
              viewport: vpLabel,
              selector: 'nav',
            });
          }
        }

        // 3. Horizontal overflow
        const hasOverflow = await page.evaluate(() => {
          return document.documentElement.scrollWidth > window.innerWidth + 4;
        });
        if (hasOverflow) {
          findings.push({
            severity: 'medium',
            type: `horizontal-overflow-at-${vp.width}`,
            message: `Horizontal overflow detected at ${vpLabel} (scrollWidth > innerWidth + 4)`,
            viewport: vpLabel,
          });
        }

        // 4. Text readability
        const smallTextCount = await page.evaluate((vpWidth) => {
          const paragraphs = Array.from(document.querySelectorAll<HTMLParagraphElement>('p')).slice(0, 10);
          let count = 0;
          for (const p of paragraphs) {
            try {
              const style = getComputedStyle(p);
              const fontSize = parseFloat(style.fontSize);
              if (!isNaN(fontSize) && fontSize < 12) count++;
            } catch (_) {}
          }
          return count;
        }, vp.width);
        if (smallTextCount > 0) {
          findings.push({
            severity: 'medium',
            type: `text-too-small-at-${vp.width}`,
            message: `${smallTextCount} <p> element(s) have font-size < 12px at viewport ${vpLabel}`,
            viewport: vpLabel,
            selector: 'p',
          });
        }

        // 5. Floating UI covering CTA (mobile only)
        if (vp.width <= 430) {
          const floatingCoversCtaFound = await page.evaluate(() => {
            const fixedElements = Array.from(document.querySelectorAll<HTMLElement>('*')).filter(el => {
              try {
                const style = getComputedStyle(el);
                if (style.position !== 'fixed') return false;
                if (style.display === 'none' || style.visibility === 'hidden') return false;
                const rect = el.getBoundingClientRect();
                return rect.width > 0 && rect.height > 0;
              } catch (_) {
                return false;
              }
            });

            const ctaSelectors = 'button[type="submit"], [class*="cta" i], [class*="primary" i]';
            const ctaButtons = Array.from(document.querySelectorAll<HTMLElement>(ctaSelectors));

            for (const fixed of fixedElements) {
              const fr = fixed.getBoundingClientRect();
              for (const cta of ctaButtons) {
                try {
                  const cr = cta.getBoundingClientRect();
                  if (cr.width === 0 || cr.height === 0) continue;
                  const overlaps =
                    fr.left < cr.right &&
                    fr.right > cr.left &&
                    fr.top < cr.bottom &&
                    fr.bottom > cr.top;
                  if (overlaps) return true;
                } catch (_) {}
              }
            }
            return false;
          });

          if (floatingCoversCtaFound) {
            findings.push({
              severity: 'medium',
              type: 'floating-ui-covers-cta',
              message: `A position:fixed element overlaps a CTA/submit button at mobile viewport (${vpLabel})`,
              viewport: vpLabel,
            });
          }
        }

        // 6. Table overflow (mobile only)
        if (vp.width <= 430) {
          const tableClipped = await page.evaluate(() => {
            const tables = Array.from(document.querySelectorAll<HTMLTableElement>('table'));
            for (const table of tables) {
              try {
                if (table.scrollWidth <= table.clientWidth) continue;
                let parent = table.parentElement;
                while (parent) {
                  const style = getComputedStyle(parent);
                  if (style.overflowX === 'hidden' || style.overflowX === 'clip') {
                    return true;
                  }
                  parent = parent.parentElement;
                }
              } catch (_) {}
            }
            return false;
          });

          if (tableClipped) {
            findings.push({
              severity: 'medium',
              type: 'table-clipped-on-mobile',
              message: `A <table> overflows its container but parent has overflow-x:hidden/clip — table content is clipped at ${vpLabel}`,
              viewport: vpLabel,
              selector: 'table',
            });
          }
        }

        // 7. Image overflow
        const imgOverflowCount = await page.evaluate((vpWidth) => {
          const imgs = Array.from(document.querySelectorAll<HTMLImageElement>('img'));
          let count = 0;
          for (const img of imgs) {
            try {
              const rect = img.getBoundingClientRect();
              if (rect.width > window.innerWidth) count++;
            } catch (_) {}
          }
          return count;
        }, vp.width);
        if (imgOverflowCount > 0) {
          findings.push({
            severity: 'medium',
            type: `image-overflow-at-${vp.width}`,
            message: `${imgOverflowCount} image(s) exceed viewport width at ${vpLabel}`,
            viewport: vpLabel,
            selector: 'img',
          });
        }
      } catch (vpError) {
        findings.push({
          severity: 'info',
          type: 'viewport-check-error',
          message: `Error during responsive checks at ${vpLabel}: ${vpError instanceof Error ? vpError.message : String(vpError)}`,
          viewport: vpLabel,
        });
      }
    }
  } finally {
    // Restore original viewport
    if (page.viewportSize() !== null) {
      await page.setViewportSize({ width: 1440, height: 900 });
    }
    await page.waitForTimeout(300);
  }

  const report: ResponsiveReport = {
    route,
    findings,
    viewportsTested,
  };

  writeJsonArtifact('responsive-behavior', `${routeName}-responsive.json`, report);
  return report;
}

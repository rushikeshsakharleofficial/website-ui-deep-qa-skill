import { Page } from '@playwright/test';
import { screenshotStep } from './screenshots';
import { writeJsonArtifact } from './report';
import { normalizeRoute } from './routes';

export type ContentClippingFinding = {
  severity: 'high' | 'medium' | 'low' | 'info';
  type: string;
  message: string;
  selector?: string;
};

export type ContentClippingReport = {
  route: string;
  findings: ContentClippingFinding[];
};

export async function auditContentClipping(page: Page, route: string): Promise<ContentClippingReport> {
  const routeName = normalizeRoute(route);
  const findings: ContentClippingFinding[] = [];

  try {
    const domFindings = await page.evaluate((): ContentClippingFinding[] => {
      const results: ContentClippingFinding[] = [];

      const selectorFor = (el: Element): string => {
        const h = el as HTMLElement;
        return (
          h.getAttribute('data-testid') ||
          h.getAttribute('aria-label') ||
          h.id ||
          (typeof h.className === 'string' ? h.className.trim().slice(0, 50) : '') ||
          h.tagName.toLowerCase()
        );
      };

      const isVisible = (el: HTMLElement): boolean => {
        const s = getComputedStyle(el);
        return s.display !== 'none' && s.visibility !== 'hidden' && parseFloat(s.opacity) > 0;
      };

      // ── Check 1: elements visually outside viewport ──────────────────────
      const viewportW = window.innerWidth;
      const viewportH = window.innerHeight;
      const clippingEls = Array.from(
        document.querySelectorAll<HTMLElement>(
          'p, h1, h2, h3, h4, h5, h6, button, a, img, section, article, [class*="card" i], [class*="hero" i], nav, footer, header, main'
        )
      ).slice(0, 200);

      let clippingCount = 0;
      for (const el of clippingEls) {
        if (clippingCount >= 10) break;
        if (!isVisible(el)) continue;
        const rect = el.getBoundingClientRect();
        if (rect.width <= 10) continue;
        const sel = selectorFor(el);
        if (rect.right > viewportW + 5) {
          results.push({
            severity: 'high',
            type: 'element-clipped-right',
            message: `Element \`${sel}\` extends ${Math.round(rect.right - viewportW)}px past right edge of viewport`,
            selector: sel,
          });
          clippingCount++;
        } else if (rect.left < -5) {
          results.push({
            severity: 'high',
            type: 'element-clipped-left',
            message: `Element \`${sel}\` extends ${Math.round(Math.abs(rect.left))}px past left edge of viewport`,
            selector: sel,
          });
          clippingCount++;
        } else {
          const pos = getComputedStyle(el).position;
          if (rect.top < -5 && (pos === 'fixed' || pos === 'sticky') && rect.height > 0) {
            results.push({
              severity: 'medium',
              type: 'fixed-element-above-viewport',
              message: `Fixed/sticky element \`${sel}\` is ${Math.round(Math.abs(rect.top))}px above viewport top`,
              selector: sel,
            });
            clippingCount++;
          }
        }
      }

      // ── Check 2: text truncation (ellipsis / line-clamp) ─────────────────
      const textEls = Array.from(
        document.querySelectorAll<HTMLElement>('h1, h2, h3, h4, p, span, a, button, td, th, li')
      );
      let truncCount = 0;
      for (const el of textEls) {
        if (truncCount >= 10) break;
        const s = getComputedStyle(el);
        const sel = selectorFor(el);
        if (s.textOverflow === 'ellipsis' && el.offsetWidth < el.scrollWidth) {
          results.push({
            severity: 'medium',
            type: 'text-truncated',
            message: `Text truncated by ellipsis in \`${sel}\`: '${(el.textContent?.trim() || '').slice(0, 60)}...'`,
            selector: sel,
          });
          truncCount++;
        } else if (
          (s as CSSStyleDeclaration & { webkitLineClamp?: string }).webkitLineClamp &&
          (s as CSSStyleDeclaration & { webkitLineClamp?: string }).webkitLineClamp !== 'none' &&
          el.scrollHeight > el.clientHeight
        ) {
          results.push({
            severity: 'low',
            type: 'text-line-clamped',
            message: `Text line-clamped in \`${sel}\` — content exceeds clamped height (may be intentional)`,
            selector: sel,
          });
          truncCount++;
        }
      }

      // ── Check 3: overflow:hidden containers clipping children ─────────────
      const containers = Array.from(
        document.querySelectorAll<HTMLElement>('div, section, article, aside, nav, main, header, footer')
      ).slice(0, 200);
      let overflowCount = 0;
      for (const container of containers) {
        if (overflowCount >= 8) break;
        if (!isVisible(container)) continue;
        if (container.clientWidth <= 50 || container.clientHeight <= 20) continue;
        const s = getComputedStyle(container);
        const sel = selectorFor(container);
        if (
          (s.overflowX === 'hidden' || s.overflow === 'hidden') &&
          container.scrollWidth > container.clientWidth + 5
        ) {
          const diff = container.scrollWidth - container.clientWidth;
          results.push({
            severity: 'medium',
            type: 'overflow-hidden-clipping',
            message: `Container \`${sel}\` has overflow:hidden but content overflows by ${diff}px (horizontally clipped)`,
            selector: sel,
          });
          overflowCount++;
        } else if (
          (s.overflowY === 'hidden' || s.overflow === 'hidden') &&
          container.scrollHeight > container.clientHeight + 5
        ) {
          const diff = container.scrollHeight - container.clientHeight;
          results.push({
            severity: 'medium',
            type: 'overflow-hidden-clipping-vertical',
            message: `Container \`${sel}\` has overflow:hidden but content overflows by ${diff}px (vertically clipped)`,
            selector: sel,
          });
          overflowCount++;
        }
      }

      // ── Check 4: fixed/sticky header covering content ─────────────────────
      const allEls = Array.from(document.querySelectorAll<HTMLElement>('*'));
      let fixedHeaderHeight = 0;
      for (const el of allEls) {
        const s = getComputedStyle(el);
        if (s.position !== 'fixed' && s.position !== 'sticky') continue;
        const rect = el.getBoundingClientRect();
        if (rect.top < 100 && rect.height > 0 && rect.height > fixedHeaderHeight) {
          fixedHeaderHeight = rect.height;
        }
      }
      if (fixedHeaderHeight > 0) {
        const mainEl = document.querySelector<HTMLElement>('main, [role="main"], #main, #content, .main-content');
        if (mainEl) {
          const mainRect = mainEl.getBoundingClientRect();
          if (mainRect.top < fixedHeaderHeight - 10) {
            results.push({
              severity: 'high',
              type: 'content-hidden-under-header',
              message: `Main content starts at ${Math.round(mainRect.top)}px but fixed header is ${Math.round(fixedHeaderHeight)}px tall — top content may be hidden`,
              selector: selectorFor(mainEl),
            });
          }
        }
        const h1 = document.querySelector<HTMLElement>('h1');
        if (h1) {
          const h1Rect = h1.getBoundingClientRect();
          if (h1Rect.top < fixedHeaderHeight) {
            results.push({
              severity: 'high',
              type: 'content-hidden-under-header',
              message: `First <h1> top is at ${Math.round(h1Rect.top)}px, behind fixed header of ${Math.round(fixedHeaderHeight)}px`,
              selector: selectorFor(h1),
            });
          }
        }
      }

      // ── Check 5: fixed/sticky footer covering content ─────────────────────
      let fixedFooterHeight = 0;
      for (const el of allEls) {
        const s = getComputedStyle(el);
        if (s.position !== 'fixed' && s.position !== 'sticky') continue;
        const rect = el.getBoundingClientRect();
        if (rect.bottom > viewportH - 100 && rect.height > 0 && rect.height > fixedFooterHeight) {
          fixedFooterHeight = rect.height;
        }
      }
      if (fixedFooterHeight > 0) {
        const footerEl = document.querySelector<HTMLElement>('footer, .footer, [role="contentinfo"]');
        if (footerEl) {
          const footerRect = footerEl.getBoundingClientRect();
          if (footerRect.bottom > viewportH - fixedFooterHeight - 10) {
            results.push({
              severity: 'medium',
              type: 'content-hidden-under-footer',
              message: `Fixed footer ${Math.round(fixedFooterHeight)}px tall may cover bottom page content`,
              selector: selectorFor(footerEl),
            });
          }
        }
      }

      // ── Check 6: image object-fit:cover with default object-position ──────
      const imgs = Array.from(document.querySelectorAll<HTMLImageElement>('img'));
      let imgCount = 0;
      for (const img of imgs) {
        if (imgCount >= 10) break;
        const s = getComputedStyle(img);
        if (
          s.objectFit === 'cover' &&
          s.objectPosition === '50% 50%' &&
          img.width > 200 &&
          img.height > 100
        ) {
          results.push({
            severity: 'info',
            type: 'img-cover-default-position',
            message: `Large img uses object-fit:cover with default center crop — consider object-position for important content`,
            selector: selectorFor(img),
          });
          imgCount++;
        }
      }

      // ── Check 7: absolute positioned elements outside parent bounds ───────
      const absoluteEls = Array.from(document.querySelectorAll<HTMLElement>('*'))
        .filter(el => getComputedStyle(el).position === 'absolute')
        .slice(0, 100);
      let absCount = 0;
      for (const el of absoluteEls) {
        if (absCount >= 5) break;
        const parent = el.offsetParent as HTMLElement | null;
        if (!parent) continue;
        const elRect = el.getBoundingClientRect();
        const parentRect = parent.getBoundingClientRect();
        const sel = selectorFor(el);
        if (elRect.right > parentRect.right + 5 || elRect.top < parentRect.top - 5) {
          results.push({
            severity: 'low',
            type: 'absolute-element-outside-parent',
            message: `Absolute element \`${sel}\` extends outside its offset parent bounds`,
            selector: sel,
          });
          absCount++;
        }
      }

      return results;
    });

    findings.push(...domFindings);
  } catch (_err) {
    findings.push({
      severity: 'info',
      type: 'audit-error',
      message: 'content-clipping DOM evaluation failed — page may have restricted context',
    });
  }

  const hasHigh = findings.some(f => f.severity === 'high');
  if (hasHigh) {
    try {
      await screenshotStep(page, route, 'content-clipping-findings');
    } catch (_err) {
      // screenshot failure is non-fatal
    }
  }

  const report: ContentClippingReport = { route, findings };

  try {
    writeJsonArtifact('content-clipping', `${routeName}-content-clipping.json`, report);
  } catch (_err) {
    // artifact write failure is non-fatal
  }

  return report;
}

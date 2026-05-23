import { Page } from '@playwright/test';
import { screenshotStep } from './screenshots';
import { writeJsonArtifact } from './report';
import { normalizeRoute } from './routes';

export type BrokenImageFinding = {
  severity: 'high' | 'medium' | 'low';
  type: string;
  message: string;
  src?: string;
  alt?: string;
  selector?: string;
};

export async function auditBrokenImages(page: Page, route: string): Promise<BrokenImageFinding[]> {
  const routeName = normalizeRoute(route);
  const findings: BrokenImageFinding[] = [];

  const imageFindings = await page.evaluate(() => {
    const results: Array<{
      severity: 'high' | 'medium' | 'low';
      type: string;
      message: string;
      src?: string;
      alt?: string;
      selector?: string;
    }> = [];

    const selectorFor = (el: Element): string => {
      const h = el as HTMLElement;
      return h.getAttribute('data-testid') || h.id || h.className?.toString().slice(0, 50) || h.tagName;
    };

    const imgs = Array.from(document.querySelectorAll<HTMLImageElement>('img')).slice(0, 100);

    for (const img of imgs) {
      try {
        // Empty src → HIGH
        if (img.getAttribute('src') === '' || img.getAttribute('src') === null) {
          results.push({
            severity: 'high',
            type: 'empty-src',
            message: 'Image has empty or missing src attribute',
            src: img.getAttribute('src') ?? undefined,
            alt: img.alt || undefined,
            selector: selectorFor(img),
          });
          continue;
        }

        // naturalWidth === 0 && complete === true → broken src → HIGH
        if (img.complete && img.naturalWidth === 0) {
          results.push({
            severity: 'high',
            type: 'broken-src',
            message: `Image failed to load (naturalWidth=0, complete=true): ${img.src.slice(-80)}`,
            src: img.src,
            alt: img.alt || undefined,
            selector: selectorFor(img),
          });
        }

        // Missing or empty alt (not presentation) → MEDIUM
        const role = img.getAttribute('role');
        const isPresentation = role === 'presentation' || role === 'none';
        if (!isPresentation && (!img.hasAttribute('alt') || img.alt.trim() === '')) {
          results.push({
            severity: 'medium',
            type: 'missing-alt',
            message: `Image missing alt attribute (or empty): ${img.src.slice(-80)}`,
            src: img.src,
            selector: selectorFor(img),
          });
        }
      } catch (_) {
        // skip element on error
      }
    }

    // CSS background-image: check performance entries for zero-transferSize resources
    try {
      const allEls = Array.from(document.querySelectorAll<HTMLElement>('*')).slice(0, 200);
      const resourceEntries = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
      const zeroTransferUrls = new Set(
        resourceEntries
          .filter(e => e.transferSize === 0 && e.initiatorType === 'css')
          .map(e => e.name)
      );

      for (const el of allEls) {
        try {
          const bg = getComputedStyle(el).backgroundImage;
          if (!bg || bg === 'none') continue;
          const urlMatch = bg.match(/url\(["']?([^"')]+)["']?\)/);
          if (!urlMatch) continue;
          const bgUrl = urlMatch[1];
          if (zeroTransferUrls.has(bgUrl)) {
            results.push({
              severity: 'medium',
              type: 'broken-background-image',
              message: `CSS background-image loaded with transferSize=0 (may be broken): ${bgUrl.slice(-80)}`,
              src: bgUrl,
              selector: selectorFor(el),
            });
          }
        } catch (_) {
          // skip element on error
        }
      }
    } catch (_) {
      // performance API unavailable
    }

    // <picture> with no fallback <img> → LOW
    try {
      const pictures = Array.from(document.querySelectorAll<HTMLPictureElement>('picture'));
      for (const pic of pictures) {
        try {
          const fallbackImg = pic.querySelector('img');
          if (!fallbackImg) {
            results.push({
              severity: 'low',
              type: 'picture-no-fallback',
              message: '<picture> element has no fallback <img> child',
              selector: selectorFor(pic),
            });
          }
        } catch (_) {
          // skip element on error
        }
      }
    } catch (_) {
      // skip picture check on error
    }

    return results;
  });

  findings.push(...imageFindings);

  if (findings.some(f => f.severity === 'high')) {
    await screenshotStep(page, route, 'broken-images');
  }

  writeJsonArtifact('broken-images', `${routeName}-broken-images.json`, findings);
  return findings;
}

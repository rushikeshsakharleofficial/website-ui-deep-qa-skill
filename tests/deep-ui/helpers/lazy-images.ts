import { Page } from '@playwright/test';
import { screenshotStep } from './screenshots';
import { writeJsonArtifact } from './report';
import { normalizeRoute } from './routes';

export type LazyImageFinding = {
  severity: 'high' | 'medium' | 'low' | 'info';
  type: string;
  message: string;
  src?: string;
  selector?: string;
};

export type LazyImageReport = {
  route: string;
  totalLazyImages: number;
  loadedAfterScroll: number;
  notLoadedAfterScroll: number;
  findings: LazyImageFinding[];
};

type ImageSnapshot = {
  index: number;
  src: string;
  dataSrc: string;
  selector: string;
};

export async function auditLazyImages(page: Page, route: string): Promise<LazyImageReport> {
  const routeName = normalizeRoute(route);
  const findings: LazyImageFinding[] = [];

  const lazyImages: ImageSnapshot[] = await page.evaluate(() => {
    const imgs = Array.from(document.querySelectorAll<HTMLImageElement>(
      'img[loading="lazy"], img[data-src], img[data-lazy], img[data-original]'
    ));
    return imgs.slice(0, 20).map((img, index) => ({
      index,
      src: img.src || '',
      dataSrc: img.getAttribute('data-src') || img.getAttribute('data-lazy') || img.getAttribute('data-original') || '',
      selector: img.id
        ? `img#${img.id}`
        : img.className
          ? `img.${img.className.trim().split(/\s+/)[0]}`
          : `img:nth-of-type(${index + 1})`,
    }));
  });

  let loadedAfterScroll = 0;
  let notLoadedAfterScroll = 0;

  for (const img of lazyImages) {
    try {
      await page.evaluate((idx: number) => {
        const imgs = Array.from(document.querySelectorAll<HTMLImageElement>(
          'img[loading="lazy"], img[data-src], img[data-lazy], img[data-original]'
        ));
        const el = imgs[idx];
        if (el) el.scrollIntoView({ behavior: 'instant', block: 'center' });
      }, img.index);

      await page.waitForTimeout(800);

      const loaded = await page.evaluate((idx: number) => {
        const imgs = Array.from(document.querySelectorAll<HTMLImageElement>(
          'img[loading="lazy"], img[data-src], img[data-lazy], img[data-original]'
        ));
        const el = imgs[idx];
        if (!el) return false;
        return el.naturalWidth > 0 && el.complete === true;
      }, img.index);

      if (loaded) {
        loadedAfterScroll++;
      } else {
        notLoadedAfterScroll++;
        findings.push({
          severity: 'high',
          type: 'lazy-image-not-loaded',
          message: `Lazy image failed to load after scroll into view`,
          src: img.src || img.dataSrc || undefined,
          selector: img.selector,
        });
      }
    } catch {
      findings.push({
        severity: 'medium',
        type: 'lazy-image-check-error',
        message: `Could not check lazy image at index ${img.index}`,
        selector: img.selector,
      });
    }
  }

  const imagesNotLazyBelowFold = await page.evaluate(() => {
    const viewportHeight = window.innerHeight;
    const imgs = Array.from(document.querySelectorAll<HTMLImageElement>('img'));
    const notLazy = imgs.filter(img => {
      const rect = img.getBoundingClientRect();
      const belowFold = rect.top > viewportHeight;
      const isLazy =
        img.getAttribute('loading') === 'lazy' ||
        img.hasAttribute('data-src') ||
        img.hasAttribute('data-lazy') ||
        img.hasAttribute('data-original');
      return belowFold && !isLazy;
    });
    return notLazy.length;
  });

  if (imagesNotLazyBelowFold > 5) {
    findings.push({
      severity: 'low',
      type: 'images-below-fold-not-lazy',
      message: `${imagesNotLazyBelowFold} images below the fold are eager-loaded (no loading="lazy" or data-src)`,
    });
  }

  await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'instant' }));
  await screenshotStep(page, route, 'scroll-for-lazy-images');
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));

  const report: LazyImageReport = {
    route,
    totalLazyImages: lazyImages.length,
    loadedAfterScroll,
    notLoadedAfterScroll,
    findings,
  };

  writeJsonArtifact('lazy-images', `${routeName}-lazy-images.json`, report);

  return report;
}

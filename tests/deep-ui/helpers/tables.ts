import { Page } from '@playwright/test';
import { screenshotStep } from './screenshots';
import { writeJsonArtifact } from './report';
import { normalizeRoute } from './routes';

export type TableFinding = {
  severity: 'high' | 'medium' | 'low' | 'info';
  type: string;
  message: string;
  tableIndex?: number;
  selector?: string;
};

export type TableReport = {
  route: string;
  tablesFound: number;
  findings: TableFinding[];
};

export async function auditTables(page: Page, route: string): Promise<TableReport> {
  const routeName = normalizeRoute(route);
  const findings: TableFinding[] = [];

  const tablesFound = await page.evaluate(() => {
    return document.querySelectorAll('table, [role="grid"], [role="table"]').length;
  });

  const structuralFindings = await page.evaluate(() => {
    const results: Array<{
      severity: 'high' | 'medium' | 'low' | 'info';
      type: string;
      message: string;
      tableIndex?: number;
      selector?: string;
    }> = [];

    const tables = Array.from(
      document.querySelectorAll<HTMLElement>('table, [role="grid"], [role="table"]')
    ).slice(0, 5);

    tables.forEach((table, tableIndex) => {
      // a. Missing caption or aria-label/aria-labelledby
      const hasCaption = table.querySelector('caption') !== null;
      const hasAriaLabel =
        table.getAttribute('aria-label') ||
        table.getAttribute('aria-labelledby');
      if (!hasCaption && !hasAriaLabel) {
        results.push({
          severity: 'low',
          type: 'table-missing-label',
          message: `Table ${tableIndex} has no <caption> or aria-label/aria-labelledby`,
          tableIndex,
        });
      }

      // b. Missing <th> elements
      const ths = table.querySelectorAll('th');
      if (ths.length === 0) {
        results.push({
          severity: 'medium',
          type: 'table-missing-headers',
          message: `Table ${tableIndex} has no <th> elements (no column headers)`,
          tableIndex,
        });
      }

      // c. <th> elements missing scope attribute
      const thsWithoutScope = Array.from(ths).filter(
        (th) => !th.getAttribute('scope')
      );
      if (thsWithoutScope.length > 0) {
        results.push({
          severity: 'low',
          type: 'table-th-missing-scope',
          message: `Table ${tableIndex} has ${thsWithoutScope.length} <th> element(s) missing scope attribute`,
          tableIndex,
        });
      }

      // d. Empty table body
      const tbody = table.querySelector('tbody');
      if (tbody) {
        const rows = tbody.querySelectorAll('tr');
        const hasContent = Array.from(rows).some((row) => {
          const cells = row.querySelectorAll('td, th');
          return Array.from(cells).some((c) => (c.textContent || '').trim().length > 0);
        });
        if (rows.length === 0 || !hasContent) {
          results.push({
            severity: 'info',
            type: 'table-empty-state',
            message: `Table ${tableIndex} has an empty body (no rows or no cell content)`,
            tableIndex,
          });
        }
      }

      // e. Horizontal overflow
      if (table.scrollWidth > table.clientWidth + 4) {
        results.push({
          severity: 'medium',
          type: 'table-horizontal-overflow',
          message: `Table ${tableIndex} overflows horizontally (scrollWidth ${table.scrollWidth} > clientWidth ${table.clientWidth})`,
          tableIndex,
        });
      }

      // f. Cells with white-space: nowrap
      const tds = Array.from(table.querySelectorAll<HTMLElement>('td'));
      const nowrapCells = tds.filter((td) => {
        return getComputedStyle(td).whiteSpace === 'nowrap';
      });
      if (nowrapCells.length > 0) {
        results.push({
          severity: 'low',
          type: 'table-cell-nowrap',
          message: `Table ${tableIndex} has ${nowrapCells.length} <td> cell(s) with white-space: nowrap`,
          tableIndex,
        });
      }

      // g. Duplicate row data
      const bodyRows = Array.from(table.querySelectorAll('tbody tr')).slice(0, 10);
      const rowKeys = bodyRows.map((row) => {
        const cells = Array.from(row.querySelectorAll('td, th')).slice(0, 3);
        return cells.map((c) => (c.textContent || '').trim()).join('|');
      }).filter((k) => k.length > 0);
      const seen = new Set<string>();
      let hasDuplicates = false;
      for (const key of rowKeys) {
        if (seen.has(key)) {
          hasDuplicates = true;
          break;
        }
        seen.add(key);
      }
      if (hasDuplicates) {
        results.push({
          severity: 'medium',
          type: 'table-duplicate-rows',
          message: `Table ${tableIndex} has duplicate rows (first 3 columns of first 10 rows matched)`,
          tableIndex,
        });
      }
    });

    return results;
  });

  findings.push(...structuralFindings);

  // 3. Sort buttons
  try {
    const sortButton = page.locator('table th button, [role="columnheader"] button, th[aria-sort] button, th[aria-sort]:not(:has(button))').first();
    const sortButtonCount = await sortButton.count();
    if (sortButtonCount > 0 && await sortButton.isVisible() && await sortButton.isEnabled()) {
      await sortButton.click();
      await page.waitForTimeout(400);
      await screenshotStep(page, route, 'table-sort-applied');

      const hasSortAria = await page.evaluate(() => {
        return document.querySelector('th[aria-sort], [role="columnheader"][aria-sort]') !== null;
      });
      if (!hasSortAria) {
        findings.push({
          severity: 'low',
          type: 'table-sort-no-aria',
          message: 'Sort button clicked but no aria-sort attribute found on any column header',
        });
      }

      await sortButton.click();
      await page.waitForTimeout(400);
      await screenshotStep(page, route, 'table-sort-reversed');
    }
  } catch {
    // skip sort interaction if it fails
  }

  // 4. Pagination
  try {
    const pagination = page.locator(
      '[aria-label*="pagination" i], nav[aria-label*="page" i], .pagination, [role="navigation"]'
    ).first();
    if (await pagination.count() > 0 && await pagination.isVisible()) {
      const nextBtn = pagination.locator(
        'button[aria-label*="next" i], a[aria-label*="next" i], [aria-label*="next page" i]'
      ).first();
      if (await nextBtn.count() > 0 && await nextBtn.isVisible() && await nextBtn.isEnabled()) {
        const urlBefore = page.url();
        const contentBefore = await page.evaluate(() => {
          const tbody = document.querySelector('table tbody');
          return tbody ? tbody.textContent : '';
        });
        await nextBtn.click();
        await page.waitForTimeout(500);
        await screenshotStep(page, route, 'table-pagination-next');
        const urlAfter = page.url();
        const contentAfter = await page.evaluate(() => {
          const tbody = document.querySelector('table tbody');
          return tbody ? tbody.textContent : '';
        });
        if (urlBefore === urlAfter && contentBefore === contentAfter) {
          findings.push({
            severity: 'medium',
            type: 'table-pagination-no-change',
            message: 'Clicking "next" pagination button did not change URL or table content',
          });
        }
      }
    }
  } catch {
    // skip pagination interaction if it fails
  }

  // 5. Search/filter input
  try {
    const searchInput = page.locator(
      'input[type="search"], input[placeholder*="search" i], input[placeholder*="filter" i]'
    ).first();
    if (await searchInput.count() > 0 && await searchInput.isVisible()) {
      await searchInput.fill('zzzzz');
      await page.waitForTimeout(400);
      await screenshotStep(page, route, 'table-search-no-results');

      const hasEmptyState = await page.evaluate(() => {
        const candidates = [
          document.querySelector('[class*="empty" i]'),
          document.querySelector('[class*="no-results" i]'),
          document.querySelector('[class*="no-data" i]'),
        ];
        const bodyText = (document.body.textContent || '').toLowerCase();
        return (
          candidates.some((el) => el !== null) ||
          bodyText.includes('no results') ||
          bodyText.includes('no data') ||
          bodyText.includes('nothing found') ||
          bodyText.includes('0 results')
        );
      });

      if (!hasEmptyState) {
        findings.push({
          severity: 'medium',
          type: 'table-no-empty-state',
          message: 'Search with no-match query ("zzzzz") did not show an empty state message',
        });
      }

      await searchInput.fill('');
    }
  } catch {
    // skip search interaction if it fails
  }

  const report: TableReport = { route, tablesFound, findings };
  writeJsonArtifact('tables', `${routeName}-tables.json`, report);
  return report;
}

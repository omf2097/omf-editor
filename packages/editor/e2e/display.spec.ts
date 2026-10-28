import type { Page } from '@playwright/test';
import { test, expect } from './helpers';

// App chrome and display settings (spec 12 §2, §9, §12): minimum text sizes,
// field-name contrast, the text-size and field-name controls, the active
// section, category dot names and the overlay toggles' on state.

/** Font sizes (px) of every rendered text node smaller than `min`, with a sample. */
function smallText(page: Page, min: number): Promise<string[]> {
  return page.evaluate((floor) => {
    const out: string[] = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const text = n.textContent?.trim();
      const el = n.parentElement;
      if (!text || !el || !el.getClientRects().length) continue;
      if (el.closest('.visually-hidden, [aria-hidden="true"]')) continue;
      const px = parseFloat(getComputedStyle(el).fontSize);
      if (px < floor - 0.01)
        out.push(`${px}px ${el.tagName}.${el.className}: ${text.slice(0, 30)}`);
    }
    return out;
  }, min);
}

const AF_ROUTES = [
  '/file',
  '/animations/20',
  '/animations/20/script',
  '/animations/20/sprites',
  '/animations/20/sprites/0/edit',
  '/animations/20/collisions',
  '/palettes',
  '/problems',
  '/reference',
];

test.describe('minimum text sizes', () => {
  for (const route of AF_ROUTES) {
    test(`no text below 12 px on ${route}`, async ({ app, page }) => {
      await app.open('fighter.af', route);
      await app.paletteSource();
      await expect(page.locator('.app-main [data-testid]').first()).toBeVisible();
      expect(await smallText(page, 12)).toEqual([]);
    });
  }

  for (const route of ['/file', '/palettes', '/background']) {
    test(`no text below 12 px on BK ${route}`, async ({ app, page }) => {
      await app.open('arena.bk', route);
      await expect(page.locator('.app-main [data-testid]').first()).toBeVisible();
      expect(await smallText(page, 12)).toEqual([]);
    });
  }

  test('nested .small does not compound; floors follow the text size', async ({ app, page }) => {
    await app.open('fighter.af', '/reference');
    const sizes = () =>
      page.evaluate(() => {
        const px = (sel: string) =>
          [...document.querySelectorAll(sel)].map((e) => parseFloat(getComputedStyle(e).fontSize));
        return { small: [...new Set(px('.small, small'))], code: Math.min(...px('code')) };
      });
    // The reference nav and tables are .small inside .small.
    expect(await sizes()).toEqual({ small: [13], code: 12 });
    await page.getByTestId('text-size.large').click();
    expect(await sizes()).toEqual({ small: [14.625], code: 13.5 });
  });
});

test.describe('display settings', () => {
  test('text size control scales the root font and persists', async ({ app, page }) => {
    await app.open('fighter.af', '/animations/20');
    const root = () => page.evaluate(() => getComputedStyle(document.documentElement).fontSize);
    expect(await root()).toBe('16px');
    await expect(page.getByTestId('text-size.default')).toHaveAttribute('aria-pressed', 'true');
    await page.getByTestId('text-size.large').click();
    expect(await root()).toBe('18px');
    await expect(page.getByTestId('text-size.large')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('text-size.default')).toHaveAttribute('aria-pressed', 'false');
    await page.reload();
    await app.ready();
    expect(await root()).toBe('18px');
    await expect(page.getByTestId('text-size.large')).toHaveAttribute('aria-pressed', 'true');
    await page.getByTestId('text-size.compact').click();
    expect(await root()).toBe('15px');
    await expect(page.getByRole('group', { name: 'Text size' })).toBeVisible();
  });

  test('field names toggle is off by default and persists', async ({ app, page }) => {
    await app.open('fighter.af', '/animations/20');
    const t = page.getByRole('button', { name: 'Show file field names' });
    await expect(t).toHaveAttribute('aria-pressed', 'false');
    await t.click();
    await expect(t).toHaveAttribute('aria-pressed', 'true');
    await expect(t).toHaveClass(/btn-primary/);
    expect(await page.evaluate(() => localStorage.getItem('omf-field-codes'))).toBe('on');
    await page.reload();
    await app.ready();
    await expect(page.getByTestId('field-codes')).toHaveAttribute('aria-pressed', 'true');
  });

  test('file field names have at least 7:1 contrast in both themes', async ({ app, page }) => {
    await app.open('fighter.af', '/file');
    // The names are shown only with the setting on.
    await page.getByTestId('field-codes').click();
    await expect(page.locator('.field-code').first()).toBeVisible();
    const contrast = () =>
      page.evaluate(() => {
        const el = document.querySelector('.field-code')!;
        const rgb = (c: string) => c.match(/[\d.]+/g)!.map(Number);
        const lum = ([r, g, b]: number[]) => {
          const f = (v: number) => {
            v /= 255;
            return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
          };
          return 0.2126 * f(r!) + 0.7152 * f(g!) + 0.0722 * f(b!);
        };
        let bg: Element | null = el;
        let bgc = 'rgba(0, 0, 0, 0)';
        while (bg) {
          bgc = getComputedStyle(bg).backgroundColor;
          if (!/rgba\(.*, 0\)$/.test(bgc)) break;
          bg = bg.parentElement;
        }
        const fg = rgb(getComputedStyle(el).color);
        const [a, b] = [lum(fg), lum(rgb(bgc))].sort((x, y) => y - x);
        return (a! + 0.05) / (b! + 0.05);
      });
    await page.evaluate(() => (document.documentElement.dataset.bsTheme = 'light'));
    expect(await contrast()).toBeGreaterThanOrEqual(7);
    await page.evaluate(() => (document.documentElement.dataset.bsTheme = 'dark'));
    expect(await contrast()).toBeGreaterThanOrEqual(7);
  });
});

test.describe('chrome', () => {
  test('the top bar marks the current section, also on sub-routes', async ({ app, page }) => {
    await app.open('fighter.af', '/animations/20/script');
    const nav = page.getByTestId('nav.animations');
    await expect(nav).toHaveClass(/active/);
    await expect(nav).toHaveAttribute('aria-current', 'page');
    await expect(page.getByTestId('nav.file')).not.toHaveClass(/active/);
    await expect(page.getByTestId('nav.file')).not.toHaveAttribute('aria-current', 'page');
    const bg = (id: string) =>
      page.getByTestId(id).evaluate((e) => getComputedStyle(e).backgroundColor);
    expect(await bg('nav.animations')).not.toBe(await bg('nav.file'));
    await page.getByTestId('nav.file').click();
    await expect(page.getByTestId('nav.file')).toHaveAttribute('aria-current', 'page');
    await expect(nav).not.toHaveClass(/active/);
  });

  test('category dots name their category', async ({ app, page }) => {
    await app.open('fighter.af', '/animations/20');
    const value = await page.getByTestId('anim-category').inputValue();
    const option = await page
      .getByTestId('anim-category')
      .locator(`option[value="${value}"]`)
      .textContent();
    const dot = page.getByTestId('anim-dot.20');
    await expect(dot).toHaveAttribute('role', 'img');
    const label = await dot.getAttribute('aria-label');
    expect(label).toMatch(/^Category: .+ \(\w+\)$/);
    expect(label).toContain(`(${option!.trim().split(' ')[1]})`);
    await expect(dot).toHaveAttribute('title', label!);
  });

  test('overlay toggles show their on state in the accent colour', async ({ app, page }) => {
    await app.open('fighter.af', '/animations/20');
    const bg = page.getByTestId('toggle.bg');
    await expect(bg).toHaveAttribute('aria-pressed', 'true');
    await expect(bg).toHaveClass(/btn-primary/);
    await expect(bg).toHaveAttribute('title', /: on$/);
    await bg.click();
    await expect(bg).toHaveAttribute('aria-pressed', 'false');
    await expect(bg).toHaveClass(/btn-outline-secondary/);
    await expect(bg).not.toHaveClass(/btn-primary/);
    await expect(bg).toHaveAttribute('title', /: off$/);
  });
});

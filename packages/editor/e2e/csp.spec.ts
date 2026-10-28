import { test, expect } from './helpers';

const CSP = "default-src 'self'; img-src 'self' blob: data:; worker-src 'self' blob:";

test('the app works under the strict CSP with no violations', async ({ app, page, baseURL }) => {
  await page.route(`${baseURL}`, async (route) => {
    const res = await route.fetch();
    await route.fulfill({
      response: res,
      headers: { ...res.headers(), 'content-security-policy': CSP },
    });
  });
  const violations: string[] = [];
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) => {
      (window as unknown as { __csp: string[] }).__csp = [
        ...((window as unknown as { __csp?: string[] }).__csp ?? []),
        `${e.violatedDirective} ${e.blockedURI}`,
      ];
    });
  });
  page.on('console', (m) => {
    if (/Content Security Policy/i.test(m.text())) violations.push(m.text());
  });
  await app.open('fighter.af', '/animations/20');
  await app.paletteSource();
  for (const r of [
    '/animations/20/script',
    '/animations/20/sprites',
    '/animations/20/sprites/0/edit',
    '/palettes',
    '/reference',
  ]) {
    // Resolves once the route and its lazy view chunk are in place.
    await app.hooks((h, path: string) => h.navigate(path), r);
  }
  const fromEvents = await page.evaluate(
    () => (window as unknown as { __csp?: string[] }).__csp ?? [],
  );
  expect([...violations, ...fromEvents]).toEqual([]);
});

export const runtime = 'nodejs';

import { existsSync } from 'fs';
import type { Protocol } from 'devtools-protocol';

function findChromePath(): string | null {
  const candidates = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    '/usr/bin/google-chrome',
    '/snap/bin/chromium',
  ];
  return candidates.find(existsSync) ?? null;
}

// Fill an input in a way that triggers React/Vue/etc. controlled input handlers
async function fillInput(page: import('puppeteer-core').Page, selector: string, value: string) {
  await page.evaluate((sel, val) => {
    const el = document.querySelector<HTMLInputElement>(sel);
    if (!el) return;
    const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    if (nativeSetter) nativeSetter.call(el, val);
    else el.value = val;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, selector, value);
}

export async function POST(request: Request) {
  const { baseUrl, username, password } = await request.json().catch(() => ({}));

  if (!baseUrl || !username || !password) {
    return Response.json({ error: 'Missing baseUrl, username, or password' }, { status: 400 });
  }

  const chromePath = findChromePath();
  if (!chromePath) {
    return Response.json({ error: 'Chrome/Chromium not found. Install Google Chrome to enable screenshots.' }, { status: 503 });
  }

  try {
    const puppeteerCore = await import('puppeteer-core');
    const browser = await puppeteerCore.default.launch({
      executablePath: chromePath,
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });

    try {
      const page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 800 });

      await page.goto(baseUrl, { waitUntil: 'networkidle2', timeout: 10000 }).catch(() =>
        page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 8000 })
      );

      // Find username/email field (try specific names first, then generic text)
      const usernameSelector = await page.evaluate(() => {
        const candidates = [
          'input[type="email"]',
          'input[name="email"]',
          'input[name="username"]',
          'input[name="login"]',
          'input[name="identifier"]',
          'input[type="text"]',
        ];
        return candidates.find(sel => document.querySelector(sel)) ?? null;
      });

      if (!usernameSelector) {
        return Response.json({ error: 'No login form found on the page. Navigate to your app\'s sign-in URL.' }, { status: 422 });
      }

      const hasPassword = await page.$('input[type="password"]');
      if (!hasPassword) {
        return Response.json({ error: 'No password field found. The page may not be a login form.' }, { status: 422 });
      }

      await fillInput(page, usernameSelector, username);
      await fillInput(page, 'input[type="password"]', password);

      // Small delay for any form validation
      await new Promise(r => setTimeout(r, 200));

      await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 }).catch(() => {}),
        page.evaluate(() => {
          const btn = document.querySelector<HTMLElement>(
            'button[type="submit"], input[type="submit"], form button:not([type="button"])'
          );
          if (btn) btn.click();
        }),
      ]);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cookies = await page.cookies() as any as Protocol.Network.Cookie[];
      return Response.json({ cookies });
    } finally {
      await browser.close();
    }
  } catch (err) {
    const raw = err instanceof Error ? err.message : 'Login failed';
    const message = raw.includes('ERR_CONNECTION_REFUSED') || raw.includes('ECONNREFUSED')
      ? `Could not connect to ${baseUrl}. Make sure your dev server is running.`
      : raw;
    return Response.json({ error: message }, { status: 500 });
  }
}

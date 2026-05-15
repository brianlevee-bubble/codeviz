export const runtime = 'nodejs';

import path from 'path';
import { writeFile, mkdir } from 'fs/promises';
import { createHash } from 'crypto';
import { existsSync } from 'fs';

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


export async function POST(request: Request) {
  const { routes, projectPath, auth } = await request.json().catch(() => ({}));

  if (!routes || !projectPath) {
    return Response.json({ error: 'Missing routes or projectPath' }, { status: 400 });
  }

  const chromePath = findChromePath();
  if (!chromePath) {
    return Response.json(
      { error: 'Chrome/Chromium not found. Install Google Chrome to enable screenshots.' },
      { status: 503 }
    );
  }

  const encoder = new TextEncoder();
  const projectHash = createHash('md5').update(path.resolve(projectPath)).digest('hex').slice(0, 8);

  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: object) => controller.enqueue(encoder.encode(JSON.stringify(obj) + '\n'));

      let browser: import('puppeteer-core').Browser | null = null;
      try {
        const puppeteerCore = await import('puppeteer-core');
        browser = await puppeteerCore.default.launch({
          executablePath: chromePath,
          headless: true,
          args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
        });

        const page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 800 });

        // ── Auth step ────────────────────────────────────────────────────
        if (auth?.username && auth?.password && auth?.baseUrl) {
          try {
            // Navigate to base URL and let middleware redirect to sign-in
            await page.goto(auth.baseUrl, { waitUntil: 'domcontentloaded', timeout: 12000 });
            await new Promise(r => setTimeout(r, 1500)); // wait for client-side redirects

            // If no login form found, try common sign-in paths
            let usernameSelector: string | null = await page.evaluate(() => {
              const candidates = [
                'input[type="email"]', 'input[name="email"]', 'input[name="username"]',
                'input[name="login"]', 'input[name="identifier"]', 'input[type="text"]',
              ];
              return candidates.find(sel => document.querySelector(sel)) ?? null;
            });

            if (!usernameSelector) {
              const baseOrigin = new URL(auth.baseUrl).origin;
              for (const path of ['/login', '/sign-in', '/signin', '/auth/login', '/auth/sign-in']) {
                await page.goto(baseOrigin + path, { waitUntil: 'domcontentloaded', timeout: 8000 }).catch(() => {});
                await new Promise(r => setTimeout(r, 800));
                usernameSelector = await page.evaluate(() => {
                  const candidates = [
                    'input[type="email"]', 'input[name="email"]', 'input[name="username"]',
                    'input[name="login"]', 'input[name="identifier"]', 'input[type="text"]',
                  ];
                  return candidates.find(sel => document.querySelector(sel)) ?? null;
                });
                if (usernameSelector) break;
              }
            }

            if (!usernameSelector) {
              send({ type: 'auth_error', error: `No login form found at ${page.url()}. Try entering your sign-in URL directly as the base URL.` });
              controller.close();
              return;
            }

            // Fill username
            await page.click(usernameSelector, { clickCount: 3 });
            await page.type(usernameSelector, auth.username, { delay: 40 });

            // Handle two-step flows (email → next → password)
            const hasPasswordNow = await page.$('input[type="password"]');
            if (!hasPasswordNow) {
              await Promise.all([
                page.waitForSelector('input[type="password"]', { timeout: 6000 }).catch(() => {}),
                page.keyboard.press('Enter'),
              ]);
              await new Promise(r => setTimeout(r, 600));
            }

            const passwordField = await page.$('input[type="password"]');
            if (passwordField) {
              await page.click('input[type="password"]', { clickCount: 3 });
              await page.type('input[type="password"]', auth.password, { delay: 40 });
            }

            const loginUrl = page.url();

            // Submit — register waitForNavigation BEFORE clicking to avoid race condition
            const submitBtn = await page.$('button[type="submit"], input[type="submit"], form button:not([type="button"])');
            await Promise.all([
              page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() =>
                page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 8000 }).catch(() => {})
              ),
              submitBtn ? submitBtn.click() : page.keyboard.press('Enter'),
            ]);

            await new Promise(r => setTimeout(r, 1000));

            // Verify we actually left the login page
            const currentUrl = page.url();
            const isStillOnLogin = currentUrl === loginUrl ||
              /sign[_-]?in|log[_-]?in|\/login|\/auth/i.test(new URL(currentUrl).pathname);
            if (isStillOnLogin) {
              send({ type: 'auth_error', error: `Login did not succeed — still on ${currentUrl}. Check your credentials.` });
              controller.close();
              return;
            }
          } catch (err) {
            const msg = err instanceof Error ? err.message : 'Login failed';
            send({ type: 'auth_error', error: msg });
            controller.close();
            return;
          }
        }

        // ── Capture each route ───────────────────────────────────────────
        const captureDir = path.join(process.cwd(), 'public', 'ui-captures', projectHash);
        await mkdir(captureDir, { recursive: true });

        for (const { url, routeId } of routes) {
          try {
            await page.goto(url, { waitUntil: 'networkidle2', timeout: 10000 }).catch(() =>
              page.goto(url, { waitUntil: 'domcontentloaded', timeout: 8000 })
            );
            await new Promise(r => setTimeout(r, 800));

            // If middleware redirected us to a login page, report it as auth failure
            const landedUrl = page.url();
            if (auth && /sign[_-]?in|log[_-]?in|\/login/i.test(new URL(landedUrl).pathname)) {
              send({ type: 'auth_error', error: `Session lost — redirected to ${landedUrl}. Re-capture to retry.` });
              controller.close();
              return;
            }

            const screenshotBuffer = await page.screenshot({ type: 'jpeg', quality: 85 });
            const filePath = path.join(captureDir, `${routeId}.jpg`);
            await writeFile(filePath, screenshotBuffer);

            send({ type: 'done', routeId, url: `/ui-captures/${projectHash}/${routeId}.jpg` });
          } catch (err) {
            const raw = err instanceof Error ? err.message : 'Screenshot failed';
            const msg = raw.includes('ERR_CONNECTION_REFUSED') || raw.includes('ECONNREFUSED')
              ? `Could not connect to ${url}. Make sure your dev server is running.`
              : raw;
            send({ type: 'error', routeId, error: msg });
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Browser launch failed';
        send({ type: 'fatal', error: msg });
      } finally {
        await browser?.close();
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-cache' },
  });
}

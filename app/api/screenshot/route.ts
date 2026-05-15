export const runtime = 'nodejs';

import path from 'path';
import { writeFile, mkdir } from 'fs/promises';
import { createHash } from 'crypto';
import { existsSync } from 'fs';

// Find Chrome/Chromium executable on the system
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
  const { url, routeId, projectPath, cookies } = await request.json().catch(() => ({}));

  if (!url || !routeId || !projectPath) {
    return Response.json({ error: 'Missing url, routeId, or projectPath' }, { status: 400 });
  }

  const chromePath = findChromePath();
  if (!chromePath) {
    return Response.json(
      { error: 'Chrome/Chromium not found. Install Google Chrome to enable screenshots.' },
      { status: 503 }
    );
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

      // Inject session cookies if provided (e.g. from a prior login step)
      if (Array.isArray(cookies) && cookies.length > 0) {
        await page.setCookie(...cookies);
      }

      // Navigate and wait for network to be idle
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 10000 }).catch(() =>
        page.goto(url, { waitUntil: 'domcontentloaded', timeout: 8000 })
      );

      // Wait a beat for any client-side rendering
      await new Promise(r => setTimeout(r, 800));

      const screenshotBuffer = await page.screenshot({ type: 'jpeg', quality: 85 });

      // Save to public/ui-captures/{hash}/{routeId}.jpg
      const projectHash = createHash('md5').update(path.resolve(projectPath)).digest('hex').slice(0, 8);
      const captureDir = path.join(process.cwd(), 'public', 'ui-captures', projectHash);
      await mkdir(captureDir, { recursive: true });

      const filePath = path.join(captureDir, `${routeId}.jpg`);
      await writeFile(filePath, screenshotBuffer);

      const screenshotUrl = `/ui-captures/${projectHash}/${routeId}.jpg`;
      return Response.json({ url: screenshotUrl });
    } finally {
      await browser.close();
    }
  } catch (err) {
    const raw = err instanceof Error ? err.message : 'Screenshot failed';
    const message = raw.includes('ERR_CONNECTION_REFUSED') || raw.includes('ECONNREFUSED')
      ? `Could not connect to ${url}. Make sure your dev server is running.`
      : raw;
    return Response.json({ error: message }, { status: 500 });
  }
}

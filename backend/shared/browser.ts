/**
 * Centralized browser launcher.
 * Uses Camoufox (anti-detection Firefox) when available, falls back to Playwright Chromium.
 * Override with BROWSER_ENGINE=camoufox|chromium to force a specific engine.
 */
import { chromium } from 'playwright';
import { firefox } from 'playwright-core';
import type { Browser, LaunchOptions } from 'playwright';

let camoufoxAvailable: boolean | null = null;

async function checkCamoufox(): Promise<boolean> {
  if (camoufoxAvailable !== null) return camoufoxAvailable;
  try {
    const mod = await import('camoufox-js');
    if (typeof mod.launchOptions !== 'function') {
      console.warn('[browser] camoufox-js imported but launchOptions not found — disabling');
      camoufoxAvailable = false;
    } else {
      camoufoxAvailable = true;
      console.log('[browser] Camoufox available');
    }
  } catch (err) {
    console.warn('[browser] camoufox-js not available, using Chromium:', (err as Error).message);
    camoufoxAvailable = false;
  }
  return camoufoxAvailable;
}

export interface LaunchBrowserOptions {
  headless?: boolean;
  proxy?: { server: string; username?: string; password?: string };
}

export async function launchBrowser(options: LaunchBrowserOptions = {}): Promise<Browser> {
  const headless = options.headless ?? true;
  const engine = process.env.BROWSER_ENGINE?.toLowerCase();

  if (engine === 'chromium') {
    console.log('[browser] Launching Chromium (forced via BROWSER_ENGINE)');
    return chromium.launch({ headless });
  }

  if (engine === 'camoufox') {
    return launchCamoufox(headless, options.proxy);
  }

  const hasCamoufox = await checkCamoufox();
  if (hasCamoufox) {
    try {
      return await launchCamoufox(headless, options.proxy);
    } catch (err) {
      console.warn('Camoufox launch failed, falling back to Chromium:', (err as Error).message);
      return chromium.launch({ headless });
    }
  }

  console.log(`[browser] Launching Chromium fallback (headless=${headless})`);
  return chromium.launch({ headless });
}

async function launchCamoufox(
  headless: boolean,
  proxy?: { server: string; username?: string; password?: string }
): Promise<Browser> {
  const { launchOptions } = await import('camoufox-js');
  const opts = await launchOptions({
    headless,
    ...(proxy && { proxy: proxy.server }),
  });
  console.log(`[browser] Launching Camoufox (headless=${headless})`);
  return firefox.launch(opts as LaunchOptions) as unknown as Browser;
}

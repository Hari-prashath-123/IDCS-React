import { promises as fs } from 'fs';
import { resolve } from 'path';

async function copyRedirects() {
  try {
    const projectRoot = resolve();
    const src = resolve(projectRoot, 'public', '_redirects');
    const destDir = resolve(projectRoot, 'dist');
    const dest = resolve(destDir, '_redirects');

    // Check if source exists
    const data = await fs.readFile(src, 'utf8');
    // Ensure dest dir exists
    await fs.mkdir(destDir, { recursive: true });
    await fs.writeFile(dest, data, 'utf8');
    console.log('copy-redirects: copied public/_redirects -> dist/_redirects');
  } catch (err) {
    console.error('copy-redirects: failed to copy _redirects:', err?.message || err);
    process.exitCode = 0; // don't fail the build; this is best-effort
  }
}

copyRedirects();

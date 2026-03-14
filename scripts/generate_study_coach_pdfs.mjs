#!/usr/bin/env node
import { existsSync } from 'fs';
import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'fs/promises';
import { spawnSync } from 'child_process';
import { tmpdir } from 'os';
import path from 'path';
import { pathToFileURL } from 'url';

const REPO_ROOT = process.cwd();
const TARGET_DIRS = [
  path.join(REPO_ROOT, 'apps', 'dashboard', 'app', 'study-coach', 'htmldocs'),
  path.join(REPO_ROOT, 'apps', 'dashboard', 'app', 'study-coach', 'htmldocstheory'),
  path.join(REPO_ROOT, 'apps', 'dashboard', 'app', 'study-coach', 'htmlreallifequestions'),
];

// Chrome capabil de pagini foarte inalte (aprox 200in). Folosim asta ca sa evitam multipage.
const SINGLE_PAGE_HEIGHT_MM = 5000;

function isHtml(filePath) {
  return filePath.toLowerCase().endsWith('.html');
}

async function walkHtmlFiles(root, current = '') {
  const dir = path.join(root, current);
  const entries = await readdir(dir, { withFileTypes: true });
  const out = [];

  for (const entry of entries) {
    const rel = path.join(current, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await walkHtmlFiles(root, rel)));
      continue;
    }
    if (entry.isFile() && isHtml(entry.name)) out.push(path.join(root, rel));
  }

  return out;
}

function commandExists(cmd) {
  const probe = spawnSync('which', [cmd], { stdio: 'ignore' });
  return probe.status === 0;
}

function resolveChromeBinary() {
  const envBinary = process.env.CHROME_PATH;
  if (envBinary && (existsSync(envBinary) || commandExists(envBinary))) return envBinary;

  const candidates = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    'google-chrome',
    'chromium',
    'chromium-browser',
  ];

  for (const candidate of candidates) {
    if (candidate.startsWith('/') && existsSync(candidate)) return candidate;
    if (!candidate.startsWith('/') && commandExists(candidate)) return candidate;
  }

  return null;
}

function injectSinglePagePrintCss(html) {
  const printCss = `
<style id="study-coach-pdf-print-style">
  @page {
    size: 210mm ${SINGLE_PAGE_HEIGHT_MM}mm;
    margin: 0;
  }

  html, body {
    margin: 0 !important;
    padding: 0 !important;
    width: 100% !important;
  }

  * {
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
    box-sizing: border-box;
  }

  pre, code, table, blockquote, section, article, aside, figure, img {
    break-inside: avoid-page;
    page-break-inside: avoid;
  }
</style>
`;

  if (html.includes('</head>')) return html.replace('</head>', `${printCss}</head>`);
  if (html.includes('<body')) return html.replace('<body', `${printCss}<body`);
  return `${printCss}${html}`;
}

async function createPrintableTempHtml(originalHtmlPath) {
  const source = await readFile(originalHtmlPath, 'utf8');
  const content = injectSinglePagePrintCss(source);

  const dir = await mkdtemp(path.join(tmpdir(), 'study-coach-pdf-'));
  const tempPath = path.join(dir, path.basename(originalHtmlPath));
  await writeFile(tempPath, content, 'utf8');

  return {
    tempPath,
    cleanup: async () => {
      await rm(dir, { recursive: true, force: true });
    },
  };
}

function printPdf(chromeBinary, htmlPath, pdfPath) {
  const htmlUrl = pathToFileURL(htmlPath).href;
  const args = [
    '--headless=new',
    '--disable-gpu',
    '--no-pdf-header-footer',
    '--print-to-pdf-no-header',
    `--print-to-pdf=${pdfPath}`,
    htmlUrl,
  ];

  const proc = spawnSync(chromeBinary, args, { encoding: 'utf8' });
  if (proc.status !== 0) {
    return {
      ok: false,
      error: proc.stderr?.trim() || proc.stdout?.trim() || `Chrome exit code ${proc.status}`,
    };
  }

  return { ok: true };
}

async function main() {
  const asJson = process.argv.includes('--json');
  const chromeBinary = resolveChromeBinary();
  if (!chromeBinary) {
    const error = 'Could not find Chrome/Chromium binary. Set CHROME_PATH or install Chrome.';
    if (asJson) {
      process.stdout.write(JSON.stringify({ ok: false, error }));
      process.exit(1);
    }
    console.error(error);
    process.exit(1);
  }

  const htmlFiles = [];
  for (const dir of TARGET_DIRS) {
    try {
      const info = await stat(dir);
      if (info.isDirectory()) htmlFiles.push(...(await walkHtmlFiles(dir)));
    } catch {
      // ignore missing dirs
    }
  }

  const created = [];
  const skipped = [];
  const failed = [];

  for (const htmlPath of htmlFiles.sort((a, b) => a.localeCompare(b))) {
    const pdfPath = htmlPath.slice(0, -'.html'.length) + '.pdf';
    if (existsSync(pdfPath)) {
      skipped.push(pdfPath);
      continue;
    }

    await mkdir(path.dirname(pdfPath), { recursive: true });

    let printable = null;
    try {
      printable = await createPrintableTempHtml(htmlPath);
      const result = printPdf(chromeBinary, printable.tempPath, pdfPath);
      if (result.ok) {
        created.push(pdfPath);
      } else {
        failed.push({ htmlPath, pdfPath, error: result.error });
      }
    } catch (error) {
      failed.push({
        htmlPath,
        pdfPath,
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      if (printable) await printable.cleanup();
    }
  }

  const summary = {
    ok: failed.length === 0,
    chromeBinary,
    scannedHtmlCount: htmlFiles.length,
    createdCount: created.length,
    skippedCount: skipped.length,
    failedCount: failed.length,
    created,
    skipped,
    failed,
  };

  if (asJson) {
    process.stdout.write(JSON.stringify(summary));
    process.exit(failed.length ? 1 : 0);
  }

  console.log(`Chrome: ${chromeBinary}`);
  console.log(`Scanned HTML: ${summary.scannedHtmlCount}`);
  console.log(`Created PDF: ${summary.createdCount}`);
  console.log(`Skipped (already exists): ${summary.skippedCount}`);
  console.log(`Failed: ${summary.failedCount}`);
  if (failed.length) {
    console.log('Failed files:');
    failed.forEach((item) => console.log(`- ${item.htmlPath} -> ${item.error}`));
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

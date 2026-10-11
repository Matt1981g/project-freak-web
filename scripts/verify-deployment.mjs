#!/usr/bin/env node
/**
 * PF19 post-deployment release health check.
 * Check the served HTML, bundled assets and the release marker before marking a deploy healthy.
 * This verifies publicly reachable assets only; authenticated sync requires a user session.
 */
const base = process.argv[2]
const expected = process.argv[3] ?? 'V19.1'

if (!base || !/^https:\/\//i.test(base)) {
  console.error('Usage: node scripts/verify-deployment.mjs https://example.github.io/project-freak-web/ V19.0')
  process.exit(2)
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const appUrl = new URL(base.endsWith('/') ? base : base + '/')
let lastError

async function verify() {
  const htmlUrl = new URL(appUrl)
  htmlUrl.searchParams.set('pf_health', Date.now().toString())
  const page = await fetch(htmlUrl, { cache: 'no-store', redirect: 'follow' })
  if (!page.ok) throw new Error(`App HTTP ${page.status}: ${htmlUrl}`)
  const html = await page.text()
  if (!/<!doctype html/i.test(html) || !/<div[^>]*id=["']root["']/i.test(html)) {
    throw new Error('Response is not a PF application HTML document')
  }
  const assetPaths = [...html.matchAll(/(?:src|href)=["']([^"']+\.(?:js|css)(?:\?[^"']*)?)["']/gi)]
    .map((m) => m[1])
  if (!assetPaths.some((path) => /\.js(?:\?|$)/i.test(path))) {
    throw new Error('No JavaScript entry bundle is referenced')
  }
  let foundVersion = false
  for (const path of assetPaths) {
    const assetUrl = new URL(path, appUrl)
    if (assetUrl.origin !== appUrl.origin) throw new Error(`Unexpected external asset: ${assetUrl}`)
    assetUrl.searchParams.set('pf_health', Date.now().toString())
    const asset = await fetch(assetUrl, { cache: 'no-store' })
    if (!asset.ok) throw new Error(`Missing build asset (${asset.status}): ${assetUrl}`)
    const body = await asset.text()
    if (/\.js(?:\?|$)/i.test(path) && body.includes(expected)) foundVersion = true
    if (!body.trim()) throw new Error(`Empty build asset: ${assetUrl}`)
  }
  if (!foundVersion) throw new Error(`Expected version ${expected} not found in the served JavaScript bundles`)
  console.log(`PF release health PASS: ${expected}; HTML and ${assetPaths.length} assets checked at ${appUrl}`)
}

for (let attempt = 1; attempt <= 6; attempt += 1) {
  try {
    await verify()
    process.exit(0)
  } catch (err) {
    lastError = err
    console.warn(`Release health check ${attempt}/6: ${err instanceof Error ? err.message : err}`)
    if (attempt < 6) await sleep(5000)
  }
}
console.error(`PF release health FAIL: ${lastError instanceof Error ? lastError.message : lastError}`)
process.exit(1)

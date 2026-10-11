#!/usr/bin/env node
/**
 * PF19 post-deployment release health check.
 * Check the served HTML, bundled assets and the release marker before marking a deploy healthy.
 * This verifies publicly reachable assets only; authenticated sync requires a user session.
 */
const base = process.argv[2]
const package_metadata = JSON.parse(await (await import('node:fs/promises')).readFile(new URL('../package.json', import.meta.url), 'utf8'))
const [major, minor] = package_metadata.version.split('.')
const expected = process.argv[3] ?? `V${major}.${minor}`

if (!base || !/^https:\/\//i.test(base)) {
  console.error('Usage: node scripts/verify-deployment.mjs https://example.github.io/project-freak-web/ V19.0')
  process.exit(2)
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const appUrl = new URL(base.endsWith('/') ? base : base + '/')
let lastError

async function verify() {
  const manifestUrl = new URL('pf-release.json', appUrl)
  manifestUrl.searchParams.set('pf_health', Date.now().toString())
  const manifestResponse = await fetch(manifestUrl, { cache: 'no-store' })
  if (!manifestResponse.ok) {
    throw new Error(`Release manifest HTTP ${manifestResponse.status}: ${manifestUrl}`)
  }
  const manifest = await manifestResponse.json()
  if (
    manifest.format !== 'project-freak-release' ||
    manifest.display_version !== expected ||
    !/^[0-9]+\\.[0-9]+\\.[0-9]+$/.test(manifest.version)
  ) {
    throw new Error(`Release manifest version/format mismatch (wanted ${expected})`)
  }
  const expectedSha = process.env.GITHUB_SHA
  if (expectedSha && manifest.build_sha !== expectedSha) {
    throw new Error(
      `Release commit mismatch: expected ${expectedSha}, served ${manifest.build_sha}`,
    )
  }

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
  let foundBuildSha = false
  for (const path of assetPaths) {
    const assetUrl = new URL(path, appUrl)
    if (assetUrl.origin !== appUrl.origin) throw new Error(`Unexpected external asset: ${assetUrl}`)
    assetUrl.searchParams.set('pf_health', Date.now().toString())
    const asset = await fetch(assetUrl, { cache: 'no-store' })
    if (!asset.ok) throw new Error(`Missing build asset (${asset.status}): ${assetUrl}`)
    const body = await asset.text()
    if (/\.js(?:\?|$)/i.test(path) && body.includes(manifest.build_sha)) foundBuildSha = true
    if (!body.trim()) throw new Error(`Empty build asset: ${assetUrl}`)
  }
  if (!foundBuildSha) throw new Error(`Expected release SHA ${manifest.build_sha} not found in the served JavaScript bundles`)
  console.log(`PF release health PASS: ${expected}; commit ${manifest.build_sha}; manifest, HTML and ${assetPaths.length} assets checked at ${appUrl}`)
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

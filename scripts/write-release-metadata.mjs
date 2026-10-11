#!/usr/bin/env node
/** Build-time release identity, served as a versioned public JSON manifest. */
import { readFile, writeFile } from 'node:fs/promises'

const metadata = JSON.parse(
  await readFile(new URL('../package.json', import.meta.url), 'utf8'),
)
if (!/^\d+\.\d+\.\d+$/.test(metadata.version)) {
  throw new Error('Expected a semantic package version (major.minor.patch).')
}

const [major, minor] = metadata.version.split('.')
const buildSha = process.env.VITE_PF_BUILD_SHA ?? process.env.GITHUB_SHA ?? 'development'
if (buildSha !== 'development' && !/^[0-9a-f]{40}$/.test(buildSha)) {
  throw new Error('Invalid build SHA for release metadata.')
}

const manifest = {
  format: 'project-freak-release',
  version: metadata.version,
  display_version: `V${major}.${minor}`,
  build_sha: buildSha,
}

await writeFile(
  new URL('../public/pf-release.json', import.meta.url),
  JSON.stringify(manifest, null, 2) + '\n',
)
console.log(`PF manifest: ${manifest.display_version} (${manifest.build_sha})`)

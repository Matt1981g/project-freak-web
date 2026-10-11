import package_metadata from '../package.json'

// The package version is the only frontend release-number source.
// Other independently versioned data/backup/Coach/RPC contracts are not replaced.
const [major, minor] = package_metadata.version.split('.')
export const PF_RELEASE_VERSION = `V${major}.${minor}`
export const PF_BUILD_SHA = import.meta.env.VITE_PF_BUILD_SHA || 'development'

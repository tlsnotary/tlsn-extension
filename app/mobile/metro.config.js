const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

// Find the project and workspace directories
const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// 1. Watch all files within the monorepo
config.watchFolders = [...(config.watchFolders || []), monorepoRoot];

// 2. Let Metro know where to resolve packages and in what order
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
];

// 3. Enable package.json "exports" field resolution
config.resolver.unstable_enablePackageExports = true;

// 4. Force resolving these packages from mobile's node_modules to avoid
// duplicate instances. The symlinks in mobile/node_modules (created by
// postinstall) point to the root copies, so no blockList is needed.
// The local Expo modules (tlsn-native, quickjs-native) also need to be
// pinned because Metro's package-exports walk from sibling packages
// (e.g. @tlsn/host-react-native) doesn't find them otherwise.
config.resolver.extraNodeModules = {
  react: path.resolve(projectRoot, 'node_modules/react'),
  'react-native': path.resolve(projectRoot, 'node_modules/react-native'),
  'tlsn-native': path.resolve(projectRoot, 'modules/tlsn-native'),
  'quickjs-native': path.resolve(projectRoot, 'modules/quickjs-native'),
};

module.exports = config;

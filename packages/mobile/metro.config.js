const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

// Find the project and workspace directories
const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// 1. Watch all files within the monorepo
config.watchFolders = [monorepoRoot];

// 2. Let Metro know where to resolve packages and in what order
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
];

// 3. Enable package.json "exports" field resolution
config.resolver.unstable_enablePackageExports = true;

// 4. Force resolving these packages from mobile's node_modules
config.resolver.extraNodeModules = {
  react: path.resolve(projectRoot, 'node_modules/react'),
  'react-native': path.resolve(projectRoot, 'node_modules/react-native'),
};

// 4. Block the root copy of react to avoid duplicate React instances.
// Note: react-native is NOT blocked because it only exists at the root
// and is symlinked into the local node_modules via postinstall.
config.resolver.blockList = [new RegExp(`^${monorepoRoot}/node_modules/react/.*$`)];

module.exports = config;

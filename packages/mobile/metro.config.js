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

// 3. Force resolving these packages from mobile's node_modules
config.resolver.extraNodeModules = {
  'react': path.resolve(projectRoot, 'node_modules/react'),
  'react-native': path.resolve(projectRoot, 'node_modules/react-native'),
};

// 4. Block certain packages from being hoisted from the monorepo root
config.resolver.blockList = [
  // Block react and react-native from monorepo root
  new RegExp(`^${monorepoRoot}/node_modules/react/.*$`),
  new RegExp(`^${monorepoRoot}/node_modules/react-native/.*$`),
];

module.exports = config;

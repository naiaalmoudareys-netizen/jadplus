// Metro (the app bundler) in this pnpm monorepo. Our TypeScript imports its own files as "./x.js" (standard
// ESM TypeScript); Metro is told to resolve those to the ".ts" or ".tsx" source.
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
const resolveDefault = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  const resolve = resolveDefault ?? context.resolveRequest;
  if (moduleName.startsWith('.') && moduleName.endsWith('.js')) {
    for (const ext of ['.ts', '.tsx']) {
      try {
        return resolve(context, moduleName.replace(/\.js$/, ext), platform);
      } catch {
        // Not this extension: try the next, then the normal lookup.
      }
    }
  }
  return resolve(context, moduleName, platform);
};

module.exports = config;

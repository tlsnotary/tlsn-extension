/**
 * Webpack plugin to resolve node: protocol imports to browser polyfills
 * This plugin intercepts imports like 'node:fs', 'node:path', etc. at the
 * NormalModuleFactory level and redirects them to browser-compatible alternatives.
 */
class NodeProtocolResolvePlugin {
  constructor(aliases) {
    this.aliases = aliases || {};
  }

  apply(compiler) {
    compiler.hooks.normalModuleFactory.tap(
      'NodeProtocolResolvePlugin',
      (nmf) => {
        nmf.hooks.beforeResolve.tap(
          'NodeProtocolResolvePlugin',
          (resolveData) => {
            const request = resolveData.request;

            if (request && request.startsWith('node:')) {
              const aliasTarget = this.aliases[request];

              if (aliasTarget) {
                resolveData.request = aliasTarget;
              }
            }

            // Don't return anything - just modify resolveData in place
          },
        );
      },
    );
  }
}

module.exports = NodeProtocolResolvePlugin;

// Do this as the first thing so that any code reading it knows the right env.
process.env.BABEL_ENV = 'production';
process.env.NODE_ENV = 'production';
process.env.ASSET_PATH = '/';

var webpack = require('webpack'),
  path = require('path'),
  fs = require('fs'),
  config = require('../webpack.config'),
  ZipPlugin = require('zip-webpack-plugin');

delete config.chromeExtensionBoilerplate;

config.mode = 'production';

var packageInfo = JSON.parse(fs.readFileSync('package.json', 'utf-8'));

config.plugins = (config.plugins || []).concat(
  new ZipPlugin({
    filename: `${packageInfo.name}-${packageInfo.version}.zip`,
    path: path.join(__dirname, '../', 'zip'),
  }),
);

webpack(config, function (err, stats) {
  if (err) {
    console.error('Webpack error:', err);
    process.exit(1);
  }

  if (stats.hasErrors()) {
    console.error('Build failed with errors:');
    const info = stats.toJson();
    console.error(info.errors.map((e) => e.message).join('\n\n'));
    process.exit(1);
  }

  if (stats.hasWarnings()) {
    console.warn('Build completed with warnings:');
    const info = stats.toJson();
    console.warn(info.warnings.map((w) => w.message).join('\n\n'));
  }

  console.log('Build completed successfully!');
  console.log(`Output: ${path.join(__dirname, '../', 'build')}`);
  console.log(
    `Zip: ${path.join(__dirname, '../', 'zip', `${packageInfo.name}-${packageInfo.version}.zip`)}`,
  );
});

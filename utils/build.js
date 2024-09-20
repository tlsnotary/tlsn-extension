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
    console.error('Webpack build error:', err);
    process.exit(1);
  }

  if (stats.hasErrors()) {
    console.error(
      'Webpack stats errors:',
      stats.toString({
        colors: true,
        errors: true,
        errorDetails: true,
      }),
    );
    process.exit(1);
  }

  console.log('Build completed successfully');
});

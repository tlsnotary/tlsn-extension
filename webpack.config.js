const path = require('path');
const CopyPlugin = require("copy-webpack-plugin");

module.exports = {
  mode: 'development',
  plugins: [
    new CopyPlugin({
      patterns: [
        { from: 'index.html' },
        { from: 'pkg/', to: 'pkg/' },
      ],
    }),
  ],
  // FIXME: this is required to show which library causes
  // "Module not found: Error: Can't resolve 'env'"
  resolve: {
    fallback: {
      "env": false
    },
  },
  entry: {
    bootstrap: path.join(__dirname, 'bootstrap'),
    worker: path.join(__dirname, 'worker.js'),
  },
  devServer: {
    headers: {
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Opener-Policy': 'same-origin',
    }
  }
};

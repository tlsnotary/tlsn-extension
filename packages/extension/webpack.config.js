var webpack = require("webpack"),
  path = require("path"),
  fileSystem = require("fs-extra"),
  env = require("./utils/env"),
  CopyWebpackPlugin = require("copy-webpack-plugin"),
  HtmlWebpackPlugin = require("html-webpack-plugin"),
  TerserPlugin = require("terser-webpack-plugin");
var { CleanWebpackPlugin } = require("clean-webpack-plugin");
var ReactRefreshWebpackPlugin = require("@pmmmwh/react-refresh-webpack-plugin");
var NodeProtocolResolvePlugin = require("./utils/NodeProtocolResolvePlugin");

const ASSET_PATH = process.env.ASSET_PATH || "/";

var alias = {};

// load the secrets
var secretsPath = path.join(__dirname, "secrets." + env.NODE_ENV + ".js");

var fileExtensions = [
  "jpg",
  "jpeg",
  "png",
  "gif",
  "eot",
  "otf",
  "svg",
  "ttf",
  "woff",
  "woff2",
];

if (fileSystem.existsSync(secretsPath)) {
  alias["secrets"] = secretsPath;
}

const isDevelopment = process.env.NODE_ENV !== "production";

var options = {
  mode: process.env.NODE_ENV || "development",
  ignoreWarnings: [
    /Circular dependency between chunks with runtime/,
    /ResizeObserver loop completed with undelivered notifications/,
    /Should not import the named export/,
    /Sass @import rules are deprecated and will be removed in Dart Sass 3.0.0/,
    /Global built-in functions are deprecated and will be removed in Dart Sass 3.0.0./,
    /repetitive deprecation warnings omitted/,
    /Dart Sass 2.0.0/,
    /Critical dependency: the request of a dependency is an expression/,
  ],
  entry: {
    devConsole: path.join(__dirname, "src", "entries", "DevConsole", "index.tsx"),
    confirmPopup: path.join(__dirname, "src", "entries", "ConfirmPopup", "index.tsx"),
    options: path.join(__dirname, "src", "entries", "Options", "index.tsx"),
    background: path.join(__dirname, "src", "entries", "Background", "index.ts"),
    contentScript: path.join(__dirname, "src", "entries", "Content", "index.ts"),
    content: path.join(__dirname, "src", "entries", "Content", "content.ts"),
    offscreen: path.join(__dirname, "src", "entries", "Offscreen", "index.tsx"),
  },
  output: {
    filename: "[name].bundle.js",
    path: path.resolve(__dirname, "build"),
    clean: true,
    publicPath: ASSET_PATH,
    webassemblyModuleFilename: "[hash].wasm",
  },
  experiments: {
    asyncWebAssembly: true,
    syncWebAssembly: true,
  },
  module: {
    rules: [
      {
        // Ignore .d.ts files from node_modules to prevent webpack parse errors
        test: /\.d\.ts$/,
        include: /node_modules/,
        use: 'null-loader',
      },
      {
        // look for .css or .scss files
        test: /\.(css|scss)$/,
        // in the `src` directory
        use: [
          {
            loader: "style-loader",
          },
          {
            loader: "css-loader",
            options: { importLoaders: 1 },
          },
          {
            loader: "postcss-loader",
          },
          {
            loader: "sass-loader",
            options: {
              sourceMap: true,
            },
          },
        ],
      },
      {
        test: new RegExp(".(" + fileExtensions.join("|") + ")$"),
        type: "asset/resource",
        exclude: /node_modules/,
      },
      {
        test: /\.html$/,
        loader: "html-loader",
        exclude: /node_modules/,
      },
      {
        test: /\.(ts|tsx)$/,
        exclude: /node_modules/,
        use: [
          {
            loader: require.resolve("ts-loader"),
            options: {
              transpileOnly: isDevelopment,
              compiler: require.resolve("typescript"),
            },
          },
        ],
      },
      {
        test: /\.(js|jsx)$/,
        use: [
          {
            loader: "source-map-loader",
          },
          {
            loader: require.resolve("babel-loader"),
            options: {
              plugins: [
                isDevelopment && require.resolve("react-refresh/babel"),
              ].filter(Boolean),
            },
          },
        ],
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    alias: {
      ...alias,
      'process': require.resolve('process/browser.js'),
      'buffer': require.resolve('buffer/'),
      'stream': require.resolve('stream-browserify'),
      'path': require.resolve('path-browserify'),
      'events': require.resolve('events/'),
      'fs': path.resolve(__dirname, './src/node-fs-mock.js'),
      'crypto': path.resolve(__dirname, './src/node-crypto-mock.js'),
      'cluster': path.resolve(__dirname, './src/empty-module.js'),
      'url': path.resolve(__dirname, './src/empty-module.js'),
    },
    extensions: fileExtensions
      .map((extension) => "." + extension)
      .concat([".js", ".jsx", ".ts", ".tsx", ".css"]),
    fallback: {
      "fs": path.resolve(__dirname, './src/node-fs-mock.js'),
      "path": require.resolve("path-browserify"),
      "stream": require.resolve("stream-browserify"),
      "crypto": path.resolve(__dirname, './src/node-crypto-mock.js'),
      "buffer": require.resolve("buffer/"),
      "process": require.resolve("process/browser.js"),
      "util": require.resolve("util/"),
      "assert": require.resolve("assert/"),
      "url": path.resolve(__dirname, './src/empty-module.js'),
      "events": require.resolve("events/"),
    }
  },
  plugins: [
    new NodeProtocolResolvePlugin({
      'node:fs': path.resolve(__dirname, './src/node-fs-mock.js'),
      'node:path': require.resolve('path-browserify'),
      'node:stream': require.resolve('stream-browserify'),
      'node:buffer': require.resolve('buffer/'),
      'node:crypto': path.resolve(__dirname, './src/node-crypto-mock.js'),
      'node:events': require.resolve('events/'),
    }),
    isDevelopment && new ReactRefreshWebpackPlugin(),
    new CleanWebpackPlugin({ verbose: false }),
    new webpack.ProgressPlugin(),
    // expose and write the allowed env vars on the compiled bundle
    new webpack.EnvironmentPlugin(["NODE_ENV"]),
    new webpack.ProvidePlugin({
      Buffer: ['buffer', 'Buffer'],
      process: 'process',
    }),
    new webpack.DefinePlugin({
      'process.env': '{}',
      global: 'globalThis',
    }),
    new CopyWebpackPlugin({
      patterns: [
        {
          from: "src/manifest.json",
          to: path.join(__dirname, "build"),
          force: true,
          transform: function (content, path) {
            // generates the manifest file using the package.json informations
            return Buffer.from(
              JSON.stringify({
                description: process.env.npm_package_description,
                version: process.env.npm_package_version,
                ...JSON.parse(content.toString()),
              })
            );
          },
        },
      ],
    }),
    new CopyWebpackPlugin({
      patterns: [
        {
          from: "src/entries/Content/content.styles.css",
          to: path.join(__dirname, "build"),
          force: true,
        },
      ],
    }),
    new CopyWebpackPlugin({
      patterns: [
        {
          from: "src/assets/img/icon-128.png",
          to: path.join(__dirname, "build"),
          force: true,
        },
      ],
    }),
    new CopyWebpackPlugin({
      patterns: [
        {
          from: "src/assets/img/icon-34.png",
          to: path.join(__dirname, "build"),
          force: true,
        },
      ],
    }),
    new CopyWebpackPlugin({
      patterns: [
        {
          from: "../../packages/tlsn-wasm-pkg",
          to: path.join(__dirname, "build"),
          force: true,
        },
      ],
    }),
    new HtmlWebpackPlugin({
      template: path.join(__dirname, "src", "entries", "DevConsole", "index.html"),
      filename: "devConsole.html",
      chunks: ["devConsole"],
      cache: false,
    }),
    new HtmlWebpackPlugin({
      template: path.join(__dirname, "src", "entries", "ConfirmPopup", "index.html"),
      filename: "confirmPopup.html",
      chunks: ["confirmPopup"],
      cache: false,
    }),
    new HtmlWebpackPlugin({
      template: path.join(__dirname, "src", "entries", "Offscreen", "index.html"),
      filename: "offscreen.html",
      chunks: ["offscreen"],
      cache: false,
    }),
    new HtmlWebpackPlugin({
      template: path.join(__dirname, "src", "entries", "Options", "index.html"),
      filename: "options.html",
      chunks: ["options"],
      cache: false,
    }),
  ].filter(Boolean),
  infrastructureLogging: {
    level: "info",
  },
};

if (env.NODE_ENV === "development") {
  options.devtool = "cheap-module-source-map";
} else {
  options.optimization = {
    minimize: true,
    minimizer: [
      new TerserPlugin({
        extractComments: false,
      }),
    ],
  };
}

module.exports = options;
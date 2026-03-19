const path = require('path');
const fs = require('fs');
const webpack = require('webpack');
const { CleanWebpackPlugin } = require('clean-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');

const DIST_DIR = path.resolve(__dirname, 'dist');
const SRC_DIR = path.resolve(__dirname, 'src');
const pkg = require('./package.json');

function createConfig(targetBrowser) {
  const isProd = process.env.NODE_ENV === 'production';
  const isFirefox = targetBrowser === 'firefox';

  return {
    mode: isProd ? 'production' : 'development',
    devtool: isProd ? 'source-map' : 'cheap-module-source-map',
    performance: {
      hints: false,
      maxAssetSize: 1024 * 1024,
      maxEntrypointSize: 1024 * 1024,
    },
    entry: {
      app: path.join(SRC_DIR, 'app', 'main.tsx'),
      background: path.join(SRC_DIR, 'background', 'index.ts'),
      content: path.join(SRC_DIR, 'content', 'index.ts'),
    },
    output: {
      path: DIST_DIR,
      filename: '[name].bundle.js',
      chunkFilename: '[name].chunk.js',
      publicPath: '',
      globalObject: 'globalThis',
      environment: {
        globalThis: true,
      },
      clean: false,
    },
    resolve: {
      extensions: ['.ts', '.tsx', '.js', '.json'],
      alias: {
        '@app': path.join(SRC_DIR, 'app'),
        '@background': path.join(SRC_DIR, 'background'),
        '@content': path.join(SRC_DIR, 'content'),
        '@core': path.join(SRC_DIR, 'core'),
        '@shared': path.join(SRC_DIR, 'shared'),
      },
    },
    module: {
      rules: [
        {
          test: /\.(png|jpe?g|gif|svg|woff2?|ttf|eot)$/i,
          type: 'asset/resource',
          exclude: /node_modules/,
        },
        {
          test: /\.html$/i,
          use: ['html-loader'],
          exclude: /node_modules/,
        },
        {
          test: /\.(ts|tsx|js)$/,
          exclude: /node_modules/,
          use: {
            loader: 'babel-loader',
          },
        },
        {
          test: /\.css$/i,
          use: [MiniCssExtractPlugin.loader, 'css-loader', 'postcss-loader'],
        },
      ],
    },
    optimization: {
      runtimeChunk: false,
      splitChunks: false,
    },
    plugins: [
      new CleanWebpackPlugin({ cleanStaleWebpackAssets: false }),
      new MiniCssExtractPlugin({ filename: '[name].css' }),
      new CopyWebpackPlugin({
        patterns: [
          {
            from: 'src/manifest.base.json',
            to: 'manifest.json',
            transform(content) {
              const manifest = JSON.parse(content.toString());
              manifest.name = pkg.displayName || pkg.name;
              manifest.version = pkg.version;
              manifest.description = pkg.description;
              manifest.author = pkg.author;

              if (isFirefox) {
                if (Array.isArray(manifest.permissions)) {
                  manifest.permissions = manifest.permissions.filter(
                    (permission) => permission !== 'declarativeNetRequestWithHostAccess'
                  );
                }

                manifest.browser_specific_settings = {
                  gecko: {
                    id: 'netsu-panel@saptarshimondal',
                    strict_min_version: '140.0',
                    data_collection_permissions: {
                      required: ['none'],
                    },
                  },
                };

                if (manifest.background && manifest.background.service_worker) {
                  manifest.background = {
                    scripts: [manifest.background.service_worker],
                  };
                }
              }

              return Buffer.from(JSON.stringify(manifest, null, 2));
            },
          },
          { from: 'src/icon', to: 'icon' },
          { from: 'src/assets/models', to: 'models' },
        ],
      }),
      new HtmlWebpackPlugin({
        templateContent: fs.readFileSync(path.join(SRC_DIR, 'app', 'index.html'), 'utf8'),
        filename: 'app.html',
        chunks: ['app'],
        inject: 'body',
        scriptLoading: 'blocking',
        publicPath: './',
      }),
      new webpack.ProvidePlugin({
        browser: 'webextension-polyfill',
      }),
    ],
  };
}

module.exports = createConfig;

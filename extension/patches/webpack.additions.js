/**
 * webpack.additions.js
 *
 * Merge these additions into extension/ui/webpack.config.js.
 * The key change is adding two new entry points and ensuring
 * their output lands in the right directories.
 */

const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');

// ── Helper: your existing config object ──────────────────────────
// Assume your existing config looks roughly like:
//
//   module.exports = {
//     entry: { popup: './src/popup/index.tsx', ... },
//     output: { path: path.resolve(__dirname, '../../dist/ui'), ... },
//     ...
//   };
//
// Apply the following additions:

const ADDITIONS = {

  /* 1. New entry points */
  entry: {
    // ADD these alongside your existing entries (popup, content, etc.):
    newtab:   './src/newtab/index.tsx',
    settings: './src/settings/index.tsx',
  },

  /* 2. Output filename pattern — already correct if you use [name].bundle.js */
  output: {
    filename: '[name].bundle.js',
    // Output directory — adjust to match your existing build output path
    // Bundles will be written to:
    //   dist/newtab/newtab.bundle.js
    //   dist/settings/settings.bundle.js
    // via the HtmlWebpackPlugin chunks config below.
  },

  /* 3. HtmlWebpackPlugin instances for each new page */
  plugins: [
    // ADD these alongside your existing HtmlWebpackPlugin instances:

    new HtmlWebpackPlugin({
      template: path.resolve(__dirname, '../newtab/newtab.html'),
      filename: 'newtab/newtab.html',
      chunks:   ['newtab'],
      // Inject the bundle into the HTML
      inject:   'body',
      // Override the script filename so it matches what newtab.html expects
      scriptLoading: 'defer',
    }),

    new HtmlWebpackPlugin({
      template: path.resolve(__dirname, '../settings/settings.html'),
      filename: 'settings/settings.html',
      chunks:   ['settings'],
      inject:   'body',
      scriptLoading: 'defer',
    }),
  ],

  /* 4. Copy plugin — make sure the HTML templates are also in dist
        (only needed if you're NOT using HtmlWebpackPlugin to generate them) */
  // If you're using CopyWebpackPlugin, add:
  //
  //   new CopyWebpackPlugin({
  //     patterns: [
  //       { from: '../newtab/newtab.html',       to: 'newtab/newtab.html'       },
  //       { from: '../settings/settings.html',   to: 'settings/settings.html'   },
  //     ],
  //   }),
};

/* ── COMPLETE EXAMPLE (replace your entire webpack.config.js) ──── */

module.exports = (env, argv) => {
  const isProd = argv.mode === 'production';

  return {
    mode: isProd ? 'production' : 'development',
    devtool: isProd ? false : 'inline-source-map',

    entry: {
      // ── Existing entries (keep yours) ──
      // popup:          './src/popup/index.tsx',
      // content:        './src/content/index.tsx',

      // ── New entries ──
      newtab:           './src/newtab/index.tsx',
      settings:         './src/settings/index.tsx',
    },

    output: {
      path:       path.resolve(__dirname, '../../dist'),
      filename:   '[name]/[name].bundle.js',
      clean:      false, // don't wipe the whole dist on rebuild
    },

    resolve: {
      extensions: ['.tsx', '.ts', '.js', '.jsx'],
    },

    module: {
      rules: [
        {
          test: /\.[jt]sx?$/,
          exclude: /node_modules/,
          use: {
            loader: 'ts-loader',
            options: { transpileOnly: true },
          },
        },
        {
          test: /\.css$/,
          use: ['style-loader', 'css-loader'],
        },
        {
          test: /\.(png|svg|jpg|gif|woff2?)$/,
          type: 'asset/resource',
        },
      ],
    },

    plugins: [
      // ── Existing plugins (keep yours) ──

      // ── New tab page ──
      new HtmlWebpackPlugin({
        template:      path.resolve(__dirname, '../newtab/newtab.html'),
        filename:      'newtab/newtab.html',
        chunks:        ['newtab'],
        inject:        'body',
        scriptLoading: 'defer',
      }),

      // ── Settings page ──
      new HtmlWebpackPlugin({
        template:      path.resolve(__dirname, '../settings/settings.html'),
        filename:      'settings/settings.html',
        chunks:        ['settings'],
        inject:        'body',
        scriptLoading: 'defer',
      }),
    ],

    optimization: {
      splitChunks: {
        cacheGroups: {
          // Share React between all pages to avoid duplicating it
          react: {
            test:     /[\\/]node_modules[\\/](react|react-dom)[\\/]/,
            name:     'vendor-react',
            chunks:   'all',
            priority: 20,
          },
        },
      },
    },
  };
};

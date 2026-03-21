const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');

module.exports = (env, argv) => {
  const isProduction = argv.mode === 'production';
  
  return {
    entry: {
      popup: './src/popup/simple.tsx',
      offscreen: './src/offscreen/index.js',
      'content-script': './src/content-scripts/character-ui.tsx',
      newtab: './src/newtab/index.tsx',
      settings: './src/settings/index.tsx'
    },
    output: {
      path: path.resolve(__dirname, '../dist'),
      filename: '[name]/[name].bundle.js',
      clean: false
    },
    module: {
      rules: [
        {
          test: /\.tsx?$/,
          use: 'ts-loader',
          exclude: /node_modules/
        },
        {
          test: /\.css$/,
          use: [
            'style-loader',
            'css-loader',
            {
              loader: 'postcss-loader',
              options: {
                postcssOptions: {
                  config: path.resolve(__dirname, 'postcss.config.js')
                }
              }
            }
          ]
        }
      ]
    },
    resolve: {
      extensions: ['.tsx', '.ts', '.js'],
      alias: {
        '@': path.resolve(__dirname, 'src'),
        '@/components': path.resolve(__dirname, 'src/components'),
        '@/lib': path.resolve(__dirname, 'src/lib'),
        '@/hooks': path.resolve(__dirname, 'src/hooks'),
        '@/store': path.resolve(__dirname, 'src/store'),
        '@/types': path.resolve(__dirname, 'src/types')
      }
    },
    plugins: [
      new HtmlWebpackPlugin({
        template: '../popup/popup.html',
        filename: '../popup/popup.html',
        chunks: ['popup'],
        publicPath: './'
      }),
      new HtmlWebpackPlugin({
        template: './src/offscreen/offscreen.html',
        filename: '../offscreen/offscreen.html',
        chunks: ['offscreen'],
        publicPath: './'
      }),
      new HtmlWebpackPlugin({
        template: './src/newtab/newtab.template.html',
        filename: '../newtab/newtab.html',
        chunks: ['newtab'],
        inject: 'body',
        scriptLoading: 'defer',
        minify: false,
        publicPath: '../'
      }),
      new HtmlWebpackPlugin({
        template: './src/settings/settings.template.html',
        filename: '../settings/settings.html',
        chunks: ['settings'],
        inject: 'body',
        scriptLoading: 'defer',
        minify: false,
        publicPath: '../'
      })
    ],
    optimization: {
      splitChunks: {
        chunks: 'all',
        cacheGroups: {
          vendor: {
            test: /[\\/]node_modules[\\/]/,
            name: 'vendors',
            chunks: 'all'
          }
        }
      }
    },
    devtool: isProduction ? false : 'cheap-module-source-map'
  };
};

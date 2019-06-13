require('babel-register');
require('babel-loader');

const webpack = require('webpack');
const path = require('path');

module.exports = {
  mode: 'production',
  target: 'web',
  resolve: {
    modules: [ path.join(__dirname, "node_modules") ]
  },
  entry: './full.js',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'eva.min.js'
  },
  externals: ['node-fetch', 'ws', 'chalk'],
  //optimization: {
  //minimize: false
  //},
  module: {
    rules: [
      {
        test: /\.(js|jsx)$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: ['@babel/preset-env'],
            plugins: ['transform-class-properties']
          }
        }
      }
    ]
  }
};

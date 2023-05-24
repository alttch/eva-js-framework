require('@babel/register');
require('babel-loader');

const webpack = require('webpack');
const path = require('path');

//const MiniCssExtractPlugin = require('mini-css-extract-plugin');

//const TerserJSPlugin = require('terser-webpack-plugin');
//const OptimizeCSSAssetsPlugin = require('optimize-css-assets-webpack-plugin');
//const CssMinimizerPlugin = require("css-minimizer-webpack-plugin");

module.exports = {
  mode: 'production',
  devtool: false,
  target: 'web',
  resolve: {
    modules: [path.join(__dirname, 'node_modules')]
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'eva.min.js'
  },
  externals: ['node-fetch', 'ws', 'chalk'],
  optimization: {
    //minimizer: [new TerserJSPlugin({}), new CssMinimizerPlugin()],
    //minimizer: [new CssMinimizerPlugin()],
  },
  module: {
    rules: [
      {
        test: /\.css$/,
        use: [{ loader: 'style-loader' }, { loader: 'css-loader' }],
      },
      //{
        //test: /\.css$/,
        //use: [
          //{
            //loader: MiniCssExtractPlugin.loader,
            //options: {
              //hmr: process.env.NODE_ENV === 'development'
            //}
          //},
          //'css-loader'
        //]
      //},
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
  },
  plugins: [
    new webpack.IgnorePlugin({
        resourceRegExp: /^\.\/locale$/,
        contextRegExp: /moment$/,
    }),
    //new MiniCssExtractPlugin({
      //filename: '[name].css',
      //chunkFilename: '[id].css'
    //})
  ],
  performance: {
    hints: false,
    maxEntrypointSize: 512000,
    maxAssetSize: 512000
  }
};

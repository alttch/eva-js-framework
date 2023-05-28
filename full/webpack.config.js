require("@babel/register");
require("babel-loader");

const webpack = require("webpack");
const path = require("path");

module.exports = {
  mode: "production",
  devtool: false,
  target: "web",
  resolve: {
    modules: [path.join(__dirname, "node_modules")]
  },
  output: {
    path: path.resolve(__dirname, "dist"),
    filename: "eva.min.js"
  },
  externals: ["node-fetch", "ws", "chalk"],
  module: {
    rules: [
      {
        test: /\.css$/,
        use: [{ loader: "style-loader" }, { loader: "css-loader" }]
      },
      {
        test: /\.(js|jsx)$/,
        exclude: /node_modules/,
        use: {
          loader: "babel-loader",
          options: {
            presets: ["@babel/preset-env"],
            plugins: ["transform-class-properties"]
          }
        }
      }
    ]
  },
  performance: {
    hints: false,
    maxEntrypointSize: 350000,
    maxAssetSize: 350000
  }
};

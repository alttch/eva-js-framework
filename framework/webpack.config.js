require("@babel/register");
require("babel-loader");

const webpack = require("webpack");
const path = require("path");

module.exports = {
  mode: "production",
  target: "web",
  output: {
    path: path.resolve(__dirname, "dist"),
    filename: "eva.framework.min.js"
  },
  externals: ["node-fetch", "ws", "chalk"],
  module: {
    rules: [
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
  }
};

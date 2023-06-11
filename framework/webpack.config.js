import "@babel/register";
import "babel-loader";

import webpack from "webpack";
import * as path from "path";
import { dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default {
  entry: "./src/lib.ts",
  mode: "production",
  target: "web",
  resolve: {
    extensions: [".tsx", ".ts", ".js", ".jsx"]
  },
  output: {
    path: path.resolve(__dirname, "dist"),
    filename: "eva.framework.min.js"
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        loader: "ts-loader",
        //exclude: /node_modules/
        options: { allowTsInNodeModules: true }
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
  }
};

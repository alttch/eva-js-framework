import * as path from 'path';
import { defineConfig } from "vite";

const lib_name = "framework";

export default defineConfig({
  build: {
    lib: {
      entry: path.resolve(__dirname, "src/lib.ts"),
      name: lib_name,
      fileName: (format) => `eva.${lib_name}.${format}.js`
    }
  }
});

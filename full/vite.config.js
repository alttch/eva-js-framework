import * as path from "path";
import { defineConfig } from "vite";

const lib_name = "eva";

export default defineConfig({
  build: {
    lib: {
      entry: path.resolve(__dirname, "src/index.js"),
      name: lib_name,
      fileName: (format) => `${lib_name}.${format}.js`
    }
  },
  rollupOptions: {
    external: ["@eevava-ics/framework", "@eva-ics/toolbox"],
    output: {
      globals: {
        "@eva-ics/framework": "___eva_framework",
        "@eva-ics/toolbox": "___eva_toolbox"
      }
    }
  }
});

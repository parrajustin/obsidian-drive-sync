import { readFileSync } from "fs";

const utilReplacePlugin = {
  name: 'util-replace',
  setup(build) {
    let rawFile = new Uint8Array(readFileSync("./build/util.js"));
    // Intercept import paths called "util"
    build.onResolve({ filter: /^util$/ }, args => {
      // Mark it as external to esbuild's internal resolution
      // and provide a namespace.
      return { path: args.path, namespace: 'util-replace-ns' };
    });

    // When a module in the "os-replace-ns" namespace is loaded,
    // provide our custom mock content.
    build.onLoad({ filter: /^util$/, namespace: 'util-replace-ns' }, () => {
      return {
        contents: rawFile,
        loader: 'js',
      };
    });
  },
};

export default utilReplacePlugin;

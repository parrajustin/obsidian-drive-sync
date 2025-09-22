// esbuild-plugin-os-replace.js

const osReplacePlugin = {
  name: 'os-replace',
  setup(build) {
    // Intercept import paths called "os"
    build.onResolve({ filter: /^os$/ }, args => {
      // Mark it as external to esbuild's internal resolution
      // and provide a namespace.
      return { path: args.path, namespace: 'os-replace-ns' };
    });

    // When a module in the "os-replace-ns" namespace is loaded,
    // provide our custom mock content.
    build.onLoad({ filter: /^os$/, namespace: 'os-replace-ns' }, () => {
      return {
        contents: `
          export default {
            release: () => 'Mocked OS 1.0.0',
          };
          export const release = () => 'Mocked OS 1.0.0';
        `,
        loader: 'js',
      };
    });
  },
};

export default osReplacePlugin;
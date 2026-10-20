import path from "node:path";

function withoutTypeScriptExtension(filePath) {
  return filePath.replace(/\.[cm]?[jt]sx?$/, "");
}

function isInsideDirectory(filePath, directory) {
  const relativePath = path.relative(directory, filePath);

  return (
    relativePath === "" ||
    (!relativePath.startsWith(`..${path.sep}`) &&
      relativePath !== ".." &&
      !path.isAbsolute(relativePath))
  );
}

export default {
  meta: {
    type: "problem",
    docs: {
      description:
        "Restrict imports from each module directory to its one public entry point.",
    },
    schema: [
      {
        type: "object",
        properties: {
          modules: {
            type: "array",
            minItems: 1,
            items: {
              type: "object",
              properties: {
                directory: { type: "string" },
                entry: { type: "string" },
              },
              required: ["directory", "entry"],
              additionalProperties: false,
            },
          },
        },
        required: ["modules"],
        additionalProperties: false,
      },
    ],
    messages: {
      privateModule:
        "Only {{entry}}.ts is public outside {{directory}}. Import from that entry point instead.",
    },
  },

  create(context) {
    const [options] = context.options;
    const importerPath = withoutTypeScriptExtension(context.filename);
    // A module's own files import each other freely; only outsiders are held
    // to the entry.
    const modules = options.modules
      .map(({ directory, entry }) => {
        const moduleDirectory = path.resolve(directory);
        return {
          moduleDirectory,
          entry,
          publicEntry: withoutTypeScriptExtension(
            path.join(moduleDirectory, entry),
          ),
        };
      })
      .filter(
        ({ moduleDirectory }) =>
          !isInsideDirectory(importerPath, moduleDirectory),
      );

    if (modules.length === 0) return {};

    function checkImportSource(sourceNode) {
      if (
        !sourceNode ||
        typeof sourceNode.value !== "string" ||
        !sourceNode.value.startsWith(".")
      )
        return;

      const importedPath = withoutTypeScriptExtension(
        path.resolve(path.dirname(importerPath), sourceNode.value),
      );
      const module = modules.find(({ moduleDirectory }) =>
        isInsideDirectory(importedPath, moduleDirectory),
      );
      if (!module) return;

      const isEntry =
        importedPath === module.publicEntry ||
        // `./storage` resolves to storage/index.ts.
        (module.entry === "index" && importedPath === module.moduleDirectory);
      if (isEntry) return;

      context.report({
        node: sourceNode,
        messageId: "privateModule",
        data: {
          directory: path.basename(module.moduleDirectory),
          entry: module.entry,
        },
      });
    }

    return {
      ImportDeclaration: (node) => checkImportSource(node.source),
      ImportExpression: (node) => checkImportSource(node.source),
      ExportNamedDeclaration: (node) => checkImportSource(node.source),
      ExportAllDeclaration: (node) => checkImportSource(node.source),
    };
  },
};

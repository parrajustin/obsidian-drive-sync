import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import eslintPluginPrettierRecommended from "eslint-plugin-prettier/recommended";
import prettier from "prettier";

const config = tseslint.config({
    files: ["**/*.ts"],
    extends: [
        eslint.configs.recommended,
        ...tseslint.configs.recommended,
        eslintPluginPrettierRecommended,
        ...tseslint.configs.strictTypeChecked,
        ...tseslint.configs.stylisticTypeChecked
    ],
    ignores: ["dist/*", "coverage/*"],
    // This is required, see the docs
    languageOptions: {
        parserOptions: {
            project: true,
            tsconfigRootDir: import.meta.dirname // or import.meta.dirname for ESM
        }
    },
    rules: {
        "max-statements-per-line": ["warn", { max: 1 }],
        "no-nested-ternary": "warn",
        "no-unneeded-ternary": "warn",
        "one-var-declaration-per-line": ["warn", "always"],
        "operator-assignment": ["warn", "always"],
        "operator-linebreak": "off",
        camelcase: ["error", { properties: "always" }],
        "@typescript-eslint/no-unused-vars": [
            "error",
            {
                args: "all",
                argsIgnorePattern: "^_",
                caughtErrors: "all",
                caughtErrorsIgnorePattern: "^_",
                destructuredArrayIgnorePattern: "^_",
                varsIgnorePattern: "^_",
                ignoreRestSiblings: true
            }
        ],
        "@typescript-eslint/explicit-member-accessibility": [
            "error",
            {
                accessibility: "explicit",
                overrides: {
                    accessors: "explicit",
                    constructors: "no-public",
                    methods: "explicit",
                    properties: "off",
                    parameterProperties: "explicit"
                }
            }
        ],
        "@typescript-eslint/member-ordering": "error",
        "@typescript-eslint/naming-convention": [
            "error",
            {
                selector: "default",
                format: ["camelCase"],
                leadingUnderscore: "forbid",
                trailingUnderscore: "forbid"
            },
            {
                selector: "parameter",
                format: ["camelCase"],
                leadingUnderscore: "allow"
            },
            {
                selector: "typeLike",
                format: ["PascalCase"]
            },
            {
                selector: "typeParameter",
                format: ["PascalCase"]
            },
            {
                selector: "import",
                format: ["camelCase", "PascalCase"]
            },
            {
                selector: "enumMember",
                format: ["UPPER_CASE"]
            },
            {
                selector: "variable",
                format: ["camelCase", "UPPER_CASE"],
                leadingUnderscore: "allow",
                trailingUnderscore: "allow"
            },
            {
                selector: ["memberLike"],
                format: ["camelCase"],
                modifiers: ["private"],
                leadingUnderscore: "require"
            },
            {
                selector: ["function"],
                format: ["PascalCase"],
                modifiers: ["global"]
            },
            {
                selector: ["classMethod"],
                format: ["camelCase"]
            }
        ],
        "@typescript-eslint/no-confusing-void-expression": "error",
        "@typescript-eslint/no-confusing-non-null-assertion": "error",
        "@typescript-eslint/no-extraneous-class": "error",
        "@typescript-eslint/no-floating-promises": "error",
        "@typescript-eslint/no-misused-promises": "error",
        "@typescript-eslint/no-for-in-array": "error",
        "@typescript-eslint/no-unnecessary-boolean-literal-compare": "error",
        "@typescript-eslint/strict-boolean-expressions": "error",
        // Note: you must disable the base rule as it can report incorrect errors
        "no-magic-numbers": "off",
        "@typescript-eslint/no-magic-numbers": "off",
        // Note: you must disable the base rule as it can report incorrect errors
        "no-shadow": "off",
        "@typescript-eslint/only-throw-error": "off",
        "@typescript-eslint/no-shadow": "error",
        "@typescript-eslint/switch-exhaustiveness-check": "error",
        "@typescript-eslint/strict-boolean-expressions": "error",
        // Note: you must disable the base rule as it can report incorrect errors
        "no-return-await": "off",
        "no-unused-expressions": "off",
        "@typescript-eslint/no-unused-expressions": "error",
        "@typescript-eslint/return-await": "error",
        "@typescript-eslint/restrict-template-expressions": [
            "error",
            {
                allowNumber: true
            }
        ],
        "@typescript-eslint/restrict-plus-operands": "error",
        "@typescript-eslint/array-type": "error",
        "@typescript-eslint/consistent-type-imports": ["error", {
            "disallowTypeAnnotations": true,
            "fixStyle": 'separate-type-imports',
            "prefer": 'type-imports',
          }],
        "@typescript-eslint/no-non-null-assertion": "off",
        "@typescript-eslint/prefer-string-starts-ends-with": "off",
        "no-console": 1, // Means warning
        "prettier/prettier": 2 // Means error
    }
});

export default config;

import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),

  {
    rules: {
      // "Deliberately unused" needs a way to say so. Three of these are parameters
      // that exist to match a shared signature — every cover() takes `opts` whether
      // that skin uses it or not — and deleting them to satisfy the linter would
      // make the implementations disagree with each other. A leading underscore is
      // the conventional marker; ignoreRestSiblings covers the `const { id: _id,
      // ...rest }` idiom for dropping one key.
      "@typescript-eslint/no-unused-vars": ["error", {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        caughtErrorsIgnorePattern: "^_",
        ignoreRestSiblings: true,
      }],
    },
  },
]);

export default eslintConfig;

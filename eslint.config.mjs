import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/lib/auth/permissions.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "BinaryExpression[operator=/^(===|!==)$/] Literal[value='branch_manager']",
          message: "Do not compare role against 'branch_manager' by string literal outside permissions.ts — use isBranchLocked(role) so cashier/inventory_manager are covered too.",
        },
        {
          selector: "BinaryExpression[operator=/^(===|!==)$/] Literal[value='inventory_manager']",
          message: "Do not compare role against 'inventory_manager' by string literal outside permissions.ts — use isBranchLocked(role).",
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;

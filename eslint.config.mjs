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
    // The native mobile app is a self-contained Expo project with its own
    // toolchain (mobile/eslint.config.js, mobile/tsconfig.json). Keep the
    // web lint pass from reaching into React Native source.
    "mobile/**",
  ]),
]);

export default eslintConfig;

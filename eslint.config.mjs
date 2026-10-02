import { defineConfig } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";
import importX from "eslint-plugin-import-x";

export default defineConfig([
    { ignores: ["PRD/**", ".agents/**", "node_modules/**", "main.js", "obsidian-releases/**"] },
    ...obsidianmd.configs.recommended,
    {
        files: ["src/**/*.ts"],
        languageOptions: {
            parserOptions: {
                project: "./tsconfig.json",
                tsconfigRootDir: import.meta.dirname,
            },
        },
        plugins: { "import-x": importX },
        rules: {
            "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
            "obsidianmd/no-nodejs-modules": "error",
            "import-x/no-nodejs-modules": "error",
        },
    },
]);

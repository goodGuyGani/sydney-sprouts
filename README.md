# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

## Desktop (Tauri)

### Prerequisites

- Install Rust (includes Cargo): [Rust installer](https://www.rust-lang.org/tools/install)

### Dev

```bash
pnpm dev:tauri
```

### Build

```bash
pnpm build:tauri
```

## Mobile (Capacitor) later

This project builds to `dist/`, which is compatible with Capacitor’s `webDir`.

### Android (Capacitor)

```bash
pnpm build:cap:android
pnpm cap:open:android
```

### iOS (Capacitor)

iOS requires macOS/Xcode to generate and open the native project.

```bash
pnpm cap:add:ios
pnpm build:cap:ios
pnpm cap:open:ios
```

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) (or [oxc](https://oxc.rs) when used in [rolldown-vite](https://vite.dev/guide/rolldown)) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## Dataverse Type Generator

Generate TypeScript types from Dataverse tables (similar to Prisma). This tool authenticates with Dataverse, fetches table definitions, and generates TypeScript interfaces.

### Usage

```bash
pnpm generate:types
```

The script will:
1. Authenticate with Dataverse using MSAL
2. Fetch all available tables
3. Display an interactive selection menu (use space to select, enter to confirm)
4. Generate TypeScript types for selected tables
5. Save types to `src/types/dataverse.ts` (or custom path)

### Environment Variables

Optional - the script uses defaults if not set:
- `VITE_MSAL_CLIENT_ID` - Azure AD Client ID
- `VITE_MSAL_AUTHORITY` - Azure AD Authority URL
- `VITE_DATAVERSE_URL` - Dataverse environment URL

### Example Output

```typescript
export interface Account {
  accountid: string
  name?: string | null
  // ... other fields
}
```

## React Compiler

The React Compiler is currently not compatible with SWC. See [this issue](https://github.com/vitejs/vite-plugin-react/issues/428) for tracking the progress.

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

# Image Bulk Downloads Extension Setup Guide

## 1. Project Initialization

```bash
mkdir image-bulk-downloads
cd image-bulk-downloads
npm init -y
git init
echo -e "node_modules\ndist" > .gitignore
```

## 2. Install Dependencies

```bash
npm install react react-dom
npm install -D @types/react @types/react-dom typescript @types/chrome
npm install -D vite @vitejs/plugin-react @crxjs/vite-plugin
npm install -D tailwindcss postcss autoprefixer sass
npm install -D @tailwindcss/forms @heroicons/react
npm install -D eslint @typescript-eslint/eslint-plugin @typescript-eslint/parser
npm install -D eslint-plugin-react eslint-plugin-react-hooks eslint-plugin-import
```

## 3. Configure TypeScript

Create `tsconfig.json` and `tsconfig.node.json` in the project root.

## 4. Configure Vite

Create `vite.config.ts` in the project root.

## 5. Configure Tailwind CSS

Create `tailwind.config.js` and `postcss.config.js` in the project root.

## 6. Configure ESLint

Create `.eslintrc.json` in the project root.

## 7. Create Project Structure

```bash
mkdir -p src/{background,content,popup,styles,types}
touch src/manifest.json
touch src/styles/{main.scss,variables.scss}
touch src/types/index.ts
touch src/background/index.ts
touch src/content/index.ts
touch src/popup/{index.html,index.tsx,App.tsx}
mkdir src/popup/components
touch src/popup/components/{ImageList.tsx,Settings.tsx}
```

## 8. Implement Core Files

Implement `src/manifest.json`, `src/styles/main.scss`, `src/styles/variables.scss`, and `src/types/index.ts`.

## 9. Update package.json Scripts

Add development scripts to `package.json`.

## 10. Build and Run

```bash
npm run build  # To build the extension
npm run dev    # To start the development server
```

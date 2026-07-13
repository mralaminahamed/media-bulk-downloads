// Plain stylesheet side-effect imports (e.g. `import '@/styles/index.scss'`).
declare module '*.scss';
declare module '*.css';

// CSS imported as a raw string (for Shadow DOM injection).
declare module '*.css?inline' {
  const css: string;
  export default css;
}

declare module '*.module.css' {
  const classes: { [key: string]: string };
  export default classes;
}

declare module '*.module.scss' {
  const classes: { [key: string]: string };
  export default classes;
}

declare module '*.module.sass' {
  const classes: { [key: string]: string };
  export default classes;
}

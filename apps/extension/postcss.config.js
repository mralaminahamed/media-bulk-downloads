export default {
  plugins: {
    // Tailwind v4 ships its own PostCSS plugin and handles vendor prefixing
    // internally, so autoprefixer is no longer needed here.
    '@tailwindcss/postcss': {},
  },
}

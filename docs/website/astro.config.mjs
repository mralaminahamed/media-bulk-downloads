// @ts-check
import { defineConfig } from 'astro/config'
import starlight from '@astrojs/starlight'

export default defineConfig({
  site: 'https://mralaminahamed.github.io',
  base: '/media-bulk-downloads',
  integrations: [
    starlight({
      title: 'Media Bulk Downloads',
      tagline: 'Bulk-download images, video & audio from any web page — fast and private.',
      favicon: '/favicon.svg',
      logo: { src: './src/assets/logo.svg', alt: 'Media Bulk Downloads' },
      social: [
        { icon: 'github', label: 'GitHub', href: 'https://github.com/mralaminahamed/media-bulk-downloads' },
      ],
      editLink: {
        baseUrl: 'https://github.com/mralaminahamed/media-bulk-downloads/edit/main/docs/website/',
      },
      lastUpdated: true,
      pagination: true,
      expressiveCode: {
        themes: ['github-dark', 'github-light'],
        styleOverrides: {
          borderRadius: '0.5rem',
          borderWidth: '1px',
        },
      },
      customCss: ['./src/styles/custom.css'],
      sidebar: [
        {
          label: 'Getting Started',
          items: [
            { label: 'Introduction', slug: 'getting-started/introduction' },
            { label: 'Quick Start', slug: 'getting-started/quick-start' },
            { label: 'vs. other tools', slug: 'getting-started/comparison' },
          ],
        },
        {
          label: 'Guides',
          items: [
            { label: 'Download & queue', slug: 'guides/download' },
            { label: 'Download paths', slug: 'guides/download-paths' },
            { label: 'Favourites', slug: 'guides/favourites' },
            { label: 'History', slug: 'guides/history' },
            { label: 'On-page bubble', slug: 'guides/bubble' },
            { label: 'Deep scan', slug: 'guides/deep-scan' },
          ],
        },
        {
          label: 'How it works',
          items: [
            { label: 'Collection pipeline', slug: 'how-it-works/collection-pipeline' },
            { label: 'Resolve originals', slug: 'how-it-works/resolve-originals' },
            { label: 'Architecture', slug: 'how-it-works/architecture' },
            { label: 'Version badge', slug: 'how-it-works/badge' },
          ],
        },
        {
          label: 'Benchmark',
          items: [
            { label: 'Overview', slug: 'benchmark/overview' },
            { label: 'Methodology', slug: 'benchmark/methodology' },
            { label: 'Results', slug: 'benchmark/results' },
            { label: 'Accuracy', slug: 'benchmark/accuracy' },
            { label: 'Performance', slug: 'benchmark/performance' },
            { label: 'Coverage matrix', slug: 'benchmark/coverage-matrix' },
            { label: 'Candidates', slug: 'benchmark/candidates' },
            { label: 'Gaps', slug: 'benchmark/gaps' },
            { label: 'Caveats', slug: 'benchmark/caveats' },
            { label: 'Coverage changelog', slug: 'benchmark/changelog' },
          ],
        },
      ],
    }),
  ],
})

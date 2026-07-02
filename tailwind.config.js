import forms from '@tailwindcss/forms';

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  darkMode: 'media',
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#4F46E5',
          50: '#EBEAFD',
          100: '#D7D5FB',
          200: '#AFABF8',
          300: '#8781F4',
          400: '#5F57F1',
          500: '#4F46E5',
          600: '#2418DC',
          700: '#1C12AA',
          800: '#140D78',
          900: '#0C0846',
        },
        secondary: {
          DEFAULT: '#14B8A6',
          50: '#ACEFE7',
          100: '#9AECE2',
          200: '#76E5D7',
          300: '#52DECC',
          400: '#2ED7C1',
          500: '#14B8A6',
          600: '#0F8A7D',
          700: '#0A5C54',
          800: '#062E2A',
          900: '#010101',
        },
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
      },
    },
  },
  plugins: [forms],
};

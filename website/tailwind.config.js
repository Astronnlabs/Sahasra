/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'media',
  theme: {
    extend: {
      fontFamily: { sans: ['"Inter Variable"', 'Inter', 'system-ui', 'sans-serif'] },
      colors: {
        brand: {
          50: '#f4f0ff',
          100: '#ebe4ff',
          200: '#d6c9ff',
          300: '#b9a2fc',
          400: '#9672f5',
          500: '#7c4ff0',
          600: '#6d3de8',
          700: '#5b2dcc',
          800: '#4b27a6',
          900: '#3e2385',
        },
      },
      boxShadow: {
        card: '0 1px 2px rgb(16 12 40 / 0.04), 0 8px 24px -12px rgb(16 12 40 / 0.12)',
        lift: '0 24px 60px -24px rgb(76 39 166 / 0.35)',
      },
    },
  },
  plugins: [],
};

import type { Config } from 'tailwindcss';
import animate from 'tailwindcss-animate';

const token = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    container: { center: true, padding: '1rem' },
    extend: {
      fontFamily: {
        sans: ['"Inter Variable"', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        background: token('background'),
        foreground: token('foreground'),
        card: token('card'),
        surface: token('surface'),
        border: token('border'),
        input: token('border'),
        ring: token('primary'),
        muted: { DEFAULT: token('surface'), foreground: token('muted-foreground') },
        subtle: token('subtle'),
        primary: {
          DEFAULT: token('primary'),
          hover: token('primary-hover'),
          dark: token('primary-dark'),
          light: token('primary-light'),
          soft: token('primary-soft'),
          foreground: '#ffffff',
        },
        success: { DEFAULT: token('success'), soft: token('success-soft') },
        warning: { DEFAULT: token('warning'), soft: token('warning-soft') },
        danger: { DEFAULT: token('danger'), soft: token('danger-soft') },
        info: { DEFAULT: token('info'), soft: token('info-soft') },
      },
      borderRadius: {
        lg: '0.625rem',
        xl: '0.875rem',
        '2xl': '1.125rem',
      },
      boxShadow: {
        card: '0 1px 2px rgb(23 21 34 / 0.04), 0 1px 1px rgb(23 21 34 / 0.02)',
        pop: '0 12px 32px -8px rgb(45 25 110 / 0.18), 0 2px 6px rgb(23 21 34 / 0.06)',
        primary: '0 6px 16px -6px rgb(109 61 232 / 0.55)',
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
      },
      keyframes: {
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        shimmer: { '100%': { transform: 'translateX(100%)' } },
      },
      animation: {
        'fade-up': 'fade-up 0.35s cubic-bezier(0.2, 0.7, 0.2, 1) both',
        'fade-in': 'fade-in 0.25s ease-out both',
      },
    },
  },
  plugins: [animate],
} satisfies Config;

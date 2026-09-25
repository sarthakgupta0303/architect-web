import type { Config } from 'tailwindcss'

const token = (name: string) => `rgb(var(--color-${name}) / <alpha-value>)`

// Tokens are defined in styles/tokens.css (docs/design-system.md). Never add raw hex values here.
const config: Config = {
  darkMode: 'class',
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './features/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: token('bg'),
        surface: token('surface'),
        'surface-2': token('surface-2'),
        border: token('border'),
        fg: token('fg'),
        muted: token('muted'),
        primary: token('primary'),
        'primary-fg': token('primary-fg'),
        'primary-text': token('primary-text'),
        accent: token('accent'),
        success: token('success'),
        warning: token('warning'),
        danger: token('danger'),
        info: token('info'),
      },
      fontFamily: {
        sans: ['var(--font-sans)'],
        mono: ['var(--font-mono)'],
      },
      borderRadius: { md: '6px', lg: '8px', xl: '14px', '2xl': '20px' },
      boxShadow: {
        popover: '0 8px 30px -8px rgb(0 0 0 / 0.5)',
        glow: '0 20px 60px -20px rgb(var(--color-primary) / 0.45)',
      },
      transitionTimingFunction: { standard: 'var(--ease-standard)' },
      transitionDuration: { 150: '150ms', 200: '200ms', 250: '250ms' },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'slide-in-right': { from: { transform: 'translateX(16px)', opacity: '0' }, to: { transform: 'translateX(0)', opacity: '1' } },
        'scale-in': { from: { transform: 'scale(0.97)', opacity: '0' }, to: { transform: 'scale(1)', opacity: '1' } },
      },
      animation: {
        'fade-in': 'fade-in 200ms var(--ease-standard)',
        'slide-in-right': 'slide-in-right 250ms var(--ease-standard)',
        'scale-in': 'scale-in 200ms var(--ease-standard)',
      },
    },
  },
  plugins: [],
}

export default config

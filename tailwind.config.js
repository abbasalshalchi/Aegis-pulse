/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './app.vue',
    './error.vue',
    './components/**/*.{vue,js}',
    './layouts/**/*.vue',
    './pages/**/*.vue',
    './composables/**/*.{js,ts}',
    './plugins/**/*.{js,ts}',
  ],
  theme: {
    extend: {
      colors: {
        zain: {
          // #F7F7FF — app background in light contexts, body text on dark
          light: { DEFAULT: '#F7F7FF', dim: '#E7E7F2' },
          // #102B30 — dark backgrounds, ink on light surfaces
          dark: { DEFAULT: '#102B30', raised: '#15373E', edge: '#1C454E' },
          // #F2D0A4 — headings / key values on dark backgrounds
          sand: { DEFAULT: '#F2D0A4', dim: '#C9A87E' },
          // #C03221 — alerts, critical highlights
          alert: { DEFAULT: '#C03221', soft: '#D95B4B' },
          // #3F826D — tech lines, patterns, data viz on dark green
          accent: { DEFAULT: '#3F826D', bright: '#5FA98D', deep: '#2C5C4D' },
        },
        // Sensor status colors, derived from the same palette
        status: {
          ok: '#5FA98D',
          warning: '#F2D0A4',
          critical: '#C03221',
        },
      },
      fontFamily: {
        sans: ['Inter', 'Segoe UI', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Cascadia Code', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      boxShadow: {
        overlay: '0 0 0 1px rgba(63, 130, 109, 0.35), 0 8px 24px rgba(9, 24, 27, 0.5)',
      },
      keyframes: {
        'pulse-dot': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.35' },
        },
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'pulse-dot': 'pulse-dot 1.6s ease-in-out infinite',
        'fade-up': 'fade-up 0.45s ease-out both',
      },
    },
  },
  plugins: [],
}

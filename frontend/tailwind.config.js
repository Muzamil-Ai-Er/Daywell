/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink: 'rgb(var(--ink) / <alpha-value>)', muted: 'rgb(var(--muted) / <alpha-value>)',
        line: 'rgb(var(--line) / <alpha-value>)', canvas: 'rgb(var(--canvas) / <alpha-value>)',
        leaf: 'rgb(var(--leaf) / <alpha-value>)', 'leaf-dark': 'rgb(var(--leaf-dark) / <alpha-value>)',
        'leaf-pale': 'rgb(var(--leaf-pale) / <alpha-value>)',
        apricot: 'rgb(var(--apricot) / <alpha-value>)',
        'apricot-pale': 'rgb(var(--apricot-pale) / <alpha-value>)',
        lavender: 'rgb(var(--lavender) / <alpha-value>)',
      },
      fontFamily: { sans: ['Segoe UI', 'Helvetica Neue', 'Arial', 'sans-serif'], display: ['Segoe UI', 'Helvetica Neue', 'Arial', 'sans-serif'] },
      boxShadow: { soft: '0 8px 30px rgba(39, 54, 46, .045)', float: '0 16px 40px rgba(39, 54, 46, .09)' },
      borderRadius: { '4xl': '1.75rem' },
    },
  },
  plugins: [],
}


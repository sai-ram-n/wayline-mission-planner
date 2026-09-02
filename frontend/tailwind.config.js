/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Dark control-room palette: a mission planner is used on a bright map,
        // so the chrome stays dark to keep the map the brightest thing on screen.
        panel: {
          950: '#0b0f14',
          900: '#111820',
          800: '#18212b',
          700: '#222d3a',
          600: '#2f3d4d',
          500: '#3f5165',
        },
        accent: {
          DEFAULT: '#3b9dff',
          muted: '#1e5f9e',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
    },
  },
  plugins: [],
};

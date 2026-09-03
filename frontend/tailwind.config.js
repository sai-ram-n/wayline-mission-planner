/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Dark control-room palette: a mission planner is used on a bright map,
        // so the chrome stays dark to keep the map the brightest thing on screen.
        // Measured from the reference editor (docs/m4td-waypoint-editor.md §10):
        // neutral greys rather than a blue-tinted dark theme.
        panel: {
          950: '#101010',
          900: '#1b1b1b',
          800: '#232323',
          700: '#2f2f2f',
          600: '#3c3c3c',
          500: '#4d4d4d',
        },
        accent: {
          DEFAULT: '#2d8cf0',
          muted: '#1c5c9e',
        },
        // Start marker, active states and success.
        mint: {
          DEFAULT: '#00ee8b',
          dark: '#00b96b',
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

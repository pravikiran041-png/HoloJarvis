/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        space: {
          900: '#0a0a1a',
          800: '#0d0d24',
          700: '#12122e',
          600: '#1a1a3e',
          500: '#252550',
        },
        holo: {
          cyan: '#00d4ff',
          'cyan-dim': '#00a3cc',
          blue: '#3b82f6',
          purple: '#7c3aed',
          violet: '#8b5cf6',
          pink: '#ec4899',
        },
        neon: {
          green: '#00ff88',
          red: '#ff3366',
          orange: '#ff8800',
        },
        glass: {
          white: 'rgba(255, 255, 255, 0.05)',
          border: 'rgba(255, 255, 255, 0.08)',
        },
        text: {
          primary: '#e0e7ff',
          secondary: '#94a3b8',
          dim: '#64748b',
        }
      },
      fontFamily: {
        display: ['Orbitron', 'sans-serif'],
        body: ['Inter', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      }
    },
  },
  plugins: [],
}

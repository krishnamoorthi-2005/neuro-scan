/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      colors: {
        // Bio-Luminescent Palette Mapping
        crust: '#0B1617',     // Neutral (Darkest)
        mantle: '#0F1C1D',    // Neutral slightly lighter
        base: '#132223',      // Base background
        surface0: '#192E2F',  // Card background
        surface1: '#1F393A',  // Hover states
        surface2: '#254546',  // Borders
        overlay0: '#6c7086',
        overlay1: '#7f849c',
        overlay2: '#9399b2',
        text: '#F0FDF8',      // White-ish for text
        subtext0: '#AABFC0',  // Dimmed text
        subtext1: '#C5D8D9',
        teal: '#00E599',      // Primary
        blue: '#00E5FF',      // Secondary
        green: '#A3E635',     // Tertiary
        
        // Semantic overrides
        lavender: '#00E5FF',  // Map to Secondary
        sapphire: '#00E5FF',
        sky: '#00E5FF',
        yellow: '#f9e2af',
        peach: '#fab387',
        maroon: '#eba0ac',
        red: '#f38ba8',
        mauve: '#cba6f7',
        pink: '#f5c2e7',
        flamingo: '#f2cdcd',
        rosewater: '#f5e0dc',
      },
      animation: {
        'spin-slow': 'spin 8s linear infinite',
        'reverse-spin': 'reverse-spin 6s linear infinite',
        'pulse-glow': 'pulse-glow 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
      keyframes: {
        'reverse-spin': {
          from: { transform: 'rotate(360deg)' },
          to: { transform: 'rotate(0deg)' },
        },
        'pulse-glow': {
          '0%, 100%': { opacity: 1, boxShadow: '0 0 15px rgba(0, 229, 153, 0.4)' },
          '50%': { opacity: .7, boxShadow: '0 0 5px rgba(0, 229, 153, 0.1)' },
        }
      }
    },
  },
  plugins: [],
}

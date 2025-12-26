/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Core palette - E-Ink / Paper inspired
        ink: {
          DEFAULT: '#1a1a1a',
          soft: '#2d2d2d',
          muted: '#4a4a4a',
        },
        cream: {
          DEFAULT: '#fdfbf7',
          warm: '#f5f2eb',
          dark: '#e8e4db',
        },

        // Accent - muted, purposeful
        accent: {
          DEFAULT: '#6366f1', // Indigo - for primary actions
          muted: '#818cf8',
          soft: '#c7d2fe',
        },

        // Functional colors
        surface: {
          DEFAULT: '#ffffff',
          elevated: '#fafafa',
          sunken: '#f5f5f1',
        },

        // Status colors - muted, not alarming
        status: {
          success: '#22c55e',
          warning: '#f59e0b',
          error: '#ef4444',
          info: '#3b82f6',
        },

        // Border - neubrutalist when needed
        border: {
          DEFAULT: '#e5e5e5',
          strong: '#1a1a1a',
          muted: '#f0f0f0',
        },

        // Dark mode palette
        dark: {
          bg: '#0f0f0f',
          surface: '#1a1a1a',
          elevated: '#252525',
          border: '#333333',
          text: '#f5f5f1',
          muted: '#a3a3a3',
        },
      },

      fontFamily: {
        // Editorial serif for content
        serif: ['"Cormorant Garamond"', 'Georgia', 'serif'],
        // Clean sans for UI
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        // Monospace for code/technical
        mono: ['"JetBrains Mono"', 'Consolas', 'monospace'],
      },

      fontSize: {
        // Content typography scale
        'content-sm': ['0.9375rem', { lineHeight: '1.6' }],      // 15px
        'content-base': ['1.0625rem', { lineHeight: '1.7' }],   // 17px
        'content-lg': ['1.1875rem', { lineHeight: '1.7' }],     // 19px
        'content-xl': ['1.375rem', { lineHeight: '1.5' }],      // 22px
        'content-2xl': ['1.75rem', { lineHeight: '1.4' }],      // 28px
        'content-3xl': ['2.25rem', { lineHeight: '1.3' }],      // 36px
      },

      spacing: {
        '18': '4.5rem',
        '88': '22rem',
      },

      borderWidth: {
        '3': '3px',
      },

      borderRadius: {
        'sm': '4px',
        'DEFAULT': '6px',
        'md': '8px',
        'lg': '12px',
        'xl': '16px',
        '2xl': '20px',
      },

      boxShadow: {
        // Subtle elevation
        'soft': '0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.06)',
        'medium': '0 4px 6px rgba(0,0,0,0.04), 0 2px 4px rgba(0,0,0,0.06)',
        'elevated': '0 10px 25px rgba(0,0,0,0.06), 0 5px 10px rgba(0,0,0,0.04)',
        // Neubrutalist - for action elements
        'brutal': '4px 4px 0 0 #1a1a1a',
        'brutal-sm': '2px 2px 0 0 #1a1a1a',
        'brutal-hover': '6px 6px 0 0 #1a1a1a',
      },

      animation: {
        'fade-in': 'fadeIn 0.2s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
      },

      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },

      typography: (theme) => ({
        DEFAULT: {
          css: {
            '--tw-prose-body': theme('colors.ink.DEFAULT'),
            '--tw-prose-headings': theme('colors.ink.DEFAULT'),
            '--tw-prose-links': theme('colors.accent.DEFAULT'),
            '--tw-prose-bold': theme('colors.ink.DEFAULT'),
            '--tw-prose-quotes': theme('colors.ink.muted'),
            '--tw-prose-code': theme('colors.ink.DEFAULT'),
            '--tw-prose-pre-bg': theme('colors.cream.warm'),

            fontFamily: theme('fontFamily.serif').join(', '),
            fontSize: '1.0625rem',
            lineHeight: '1.7',

            h1: {
              fontFamily: theme('fontFamily.serif').join(', '),
              fontWeight: '600',
              fontSize: '2.25rem',
            },
            h2: {
              fontFamily: theme('fontFamily.serif').join(', '),
              fontWeight: '600',
              fontSize: '1.75rem',
            },
            h3: {
              fontFamily: theme('fontFamily.serif').join(', '),
              fontWeight: '600',
              fontSize: '1.375rem',
            },
            p: {
              marginTop: '1.25em',
              marginBottom: '1.25em',
            },
            a: {
              textDecoration: 'underline',
              textUnderlineOffset: '2px',
              '&:hover': {
                color: theme('colors.accent.muted'),
              },
            },
            blockquote: {
              fontStyle: 'italic',
              borderLeftWidth: '3px',
              borderLeftColor: theme('colors.accent.DEFAULT'),
              paddingLeft: '1.5rem',
            },
            code: {
              fontFamily: theme('fontFamily.mono').join(', '),
              backgroundColor: theme('colors.cream.warm'),
              padding: '0.2em 0.4em',
              borderRadius: '4px',
              fontSize: '0.9em',
            },
            'pre code': {
              backgroundColor: 'transparent',
              padding: '0',
            },
          },
        },
        // Dark mode prose
        invert: {
          css: {
            '--tw-prose-body': theme('colors.dark.text'),
            '--tw-prose-headings': theme('colors.dark.text'),
            '--tw-prose-links': theme('colors.accent.muted'),
            '--tw-prose-bold': theme('colors.dark.text'),
            '--tw-prose-quotes': theme('colors.dark.muted'),
            '--tw-prose-code': theme('colors.dark.text'),
            '--tw-prose-pre-bg': theme('colors.dark.elevated'),
          },
        },
      }),
    },
  },
  plugins: [],
}

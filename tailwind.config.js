/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './src/renderer/index.html',
    './src/renderer/src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      // ── Fontes ──
      fontFamily: {
        serif:    ['Playfair Display', 'Georgia', 'Times New Roman', 'serif'],
        sans:     ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono:     ['JetBrains Mono', 'Fira Code', 'Cascadia Code', 'monospace'],
      },

      // ── Cores via CSS vars (suportam modo escuro automaticamente) ──
      colors: {
        vault:    'rgb(var(--bg-vault) / <alpha-value>)',
        surface:  'rgb(var(--bg-surface) / <alpha-value>)',
        subtle:   'rgb(var(--bg-subtle) / <alpha-value>)',
        hover:    'rgb(var(--bg-hover) / <alpha-value>)',
        active:   'rgb(var(--bg-active) / <alpha-value>)',

        chr: {
          // Cores de texto
          primary:   'rgb(var(--text-primary) / <alpha-value>)',
          secondary: 'rgb(var(--text-secondary) / <alpha-value>)',
          muted:     'rgb(var(--text-muted) / <alpha-value>)',
          disabled:  'rgb(var(--text-disabled) / <alpha-value>)',
          inverse:   'rgb(var(--text-inverse) / <alpha-value>)',
          link:      'rgb(var(--link) / <alpha-value>)',
          accent:    'rgb(var(--accent) / <alpha-value>)',
          // Aliases de borda — permite border-chr-subtle, border-chr-strong, border-chr
          DEFAULT: 'rgb(var(--border-default) / <alpha-value>)',
          strong:  'rgb(var(--border-strong) / <alpha-value>)',
          subtle:  'rgb(var(--border-subtle) / <alpha-value>)',
          focus:   'rgb(var(--border-focus) / <alpha-value>)',
        },

        border: {
          strong:  'rgb(var(--border-strong) / <alpha-value>)',
          DEFAULT: 'rgb(var(--border-default) / <alpha-value>)',
          subtle:  'rgb(var(--border-subtle) / <alpha-value>)',
          focus:   'rgb(var(--border-focus) / <alpha-value>)',
        },

        timeline: {
          line:      'rgb(var(--timeline-line) / <alpha-value>)',
          tick:      'rgb(var(--timeline-tick) / <alpha-value>)',
          dot:       'rgb(var(--event-dot) / <alpha-value>)',
          chronicle: 'rgb(var(--chronicle-dot) / <alpha-value>)',
        },
      },

      // ── Border radius classico ──
      borderRadius: {
        none: '0',
        sm:   '2px',
        DEFAULT: '3px',
        md:   '3px',
        lg:   '4px',
        full: '9999px',
      },

      // ── Sombras tipograficas (flat) ──
      boxShadow: {
        card:       '2px 2px 0px rgb(226 224 218)',
        'card-dark':'2px 2px 0px rgb(0 0 0 / 0.4)',
        'card-hover':'3px 3px 0px rgb(26 26 24 / 0.15)',
        panel:      '-1px 0px 0px rgb(226 224 218)',
        none:       'none',
      },

      // ── Escala tipografica ──
      fontSize: {
        '2xs': ['10px', { lineHeight: '1.4', letterSpacing: '0.04em' }],
        xs:    ['11px', { lineHeight: '1.5' }],
        sm:    ['13px', { lineHeight: '1.5' }],
        base:  ['15px', { lineHeight: '1.65' }],
        lg:    ['17px', { lineHeight: '1.5' }],
        xl:    ['20px', { lineHeight: '1.4' }],
        '2xl': ['24px', { lineHeight: '1.3' }],
        '3xl': ['30px', { lineHeight: '1.25' }],
        '4xl': ['36px', { lineHeight: '1.2' }],
        display: ['42px', { lineHeight: '1.1', letterSpacing: '-0.02em' }],
      },

      // ── Espacamento extra ──
      spacing: {
        '18': '4.5rem',
        '22': '5.5rem',
        '72': '18rem',
        '80': '20rem',
        '96': '24rem',
      },

      // ── Transicoes ──
      transitionDuration: {
        '150': '150ms',
        '200': '200ms',
        '250': '250ms',
        '300': '300ms',
      },
      transitionTimingFunction: {
        'in-out-smooth': 'cubic-bezier(0.4, 0, 0.2, 1)',
        'out-back': 'cubic-bezier(0.34, 1.56, 0.64, 1)',
      },

      // ── Tamanho do painel lateral ──
      width: {
        'panel-sm': '280px',
        'panel-md': '360px',
        'panel-lg': '480px',
        sidebar:    '220px',
      },

      // ── Z-index semanticos ──
      zIndex: {
        sidebar:  '10',
        topbar:   '20',
        panel:    '30',
        modal:    '50',
        toast:    '60',
        tooltip:  '70',
      },
    },
  },
  plugins: [
    require('tailwindcss-animate'),
  ],
}

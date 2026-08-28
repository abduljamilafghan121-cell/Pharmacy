// Design tokens for PharmaCore.
//
// Every screen reads from getTheme(), so this file is the single source of
// truth for the visual system. Tokens follow a layered-elevation model:
// bg (canvas) -> card (surface) -> cardAlt / hover (raised), plus semantic
// accent colors that carry the pharmacy's green identity.

export function getTheme(dark: boolean) {
  return dark
    ? {
        // Surfaces — deep neutral with a cool green undertone, layered so
        // cards visibly float above the canvas.
        bg: '#0A0E0D',
        sidebar: '#0C1210',
        card: '#111816',
        cardAlt: '#161F1C',
        hover: 'rgba(255,255,255,0.045)',
        border: '#1E2A26',
        borderStrong: '#2A3A34',

        // Text
        text: '#ECF2EF',
        muted: '#7E948B',

        // Accent — emerald, tuned bright enough for dark surfaces
        primary: '#2FBF8F',
        primarySoft: 'rgba(47,191,143,0.13)',
        primaryText: '#7BE3BC',

        // Semantic
        amber: '#E5B567',
        amberBg: 'rgba(229,181,103,0.13)',
        red: '#E8837A',
        redBg: 'rgba(232,131,122,0.13)',
        green: '#54CD8B',
        greenBg: 'rgba(84,205,139,0.13)',

        // Elevation & effects
        shadow: '0 1px 2px rgba(0,0,0,0.4), 0 4px 16px rgba(0,0,0,0.35)',
        shadowLg: '0 8px 40px rgba(0,0,0,0.55), 0 2px 8px rgba(0,0,0,0.4)',
        ring: 'rgba(47,191,143,0.45)',
        glassOverlay: 'rgba(4,8,7,0.6)',
        sidebarBorder: 'rgba(255,255,255,0.06)',
        sidebarActive: 'rgba(47,191,143,0.14)',
        onSidebar: '#DCE9E4',
        onSidebarMuted: '#7FA096',
        gradientAccent:
          'linear-gradient(135deg, rgba(47,191,143,0.22) 0%, rgba(47,178,191,0.08) 50%, transparent 100%)'
      }
    : {
        bg: '#F4F6F5',
        // Light mode gets a fully light chrome too — sidebar and title bar
        // flip with the rest of the UI so no dark regions linger.
        sidebar: '#FFFFFF',
        card: '#FFFFFF',
        cardAlt: '#F7F9F8',
        hover: 'rgba(15,31,27,0.05)',
        border: '#E4E9E6',
        borderStrong: '#CBD5D0',

        text: '#131C18',
        muted: '#68786F',

        primary: '#0E8A64',
        primarySoft: 'rgba(14,138,100,0.09)',
        primaryText: '#0E8A64',

        amber: '#A96A14',
        amberBg: '#FCF1DE',
        red: '#BB4B3E',
        redBg: '#F9E7E3',
        green: '#2F8A58',
        greenBg: '#E3F2E9',

        shadow: '0 1px 2px rgba(16,24,20,0.05), 0 4px 12px rgba(16,24,20,0.06)',
        shadowLg: '0 12px 40px rgba(16,24,20,0.14), 0 2px 8px rgba(16,24,20,0.08)',
        ring: 'rgba(14,138,100,0.35)',
        glassOverlay: 'rgba(15,25,21,0.35)',
        sidebarBorder: '#E7ECE9',
        sidebarActive: 'rgba(14,138,100,0.11)',
        onSidebar: '#182520',
        onSidebarMuted: '#68786F',
        gradientAccent:
          'linear-gradient(135deg, rgba(14,138,100,0.10) 0%, rgba(14,120,138,0.05) 50%, transparent 100%)'
      }
}

export type Theme = ReturnType<typeof getTheme>

export const mono = {
  fontFamily: "ui-monospace, SFMono-Regular, 'Cascadia Code', Menlo, monospace"
}
// Kept as `serif` for backwards compatibility with existing screens, but now
// resolves to the modern display stack — tight-tracked geometric sans reads
// far more current than Georgia in a product UI.
export const serif = {
  fontFamily: "Inter, -apple-system, 'Segoe UI Variable Display', 'Segoe UI', system-ui, sans-serif",
  letterSpacing: '-0.02em'
} as const

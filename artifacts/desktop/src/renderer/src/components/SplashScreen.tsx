import type { ReactElement } from 'react'
import { getTheme, serif } from '../theme'
import { useUiStore } from '../store/uiStore'
import { usePharmacySettings } from '../hooks/usePharmacySettings'

/**
 * Branded, full-screen splash shown while the app boots (auth + first-run
 * check). A modern, centered glass panel with the pharmacy logo, name and an
 * indeterminate progress bar, over a subtly animated ambient background that
 * matches the app theme.
 */
export default function SplashScreen(): ReactElement {
  const { dark } = useUiStore()
  const theme = getTheme(dark)
  const { data: settings } = usePharmacySettings()

  const name = settings?.name?.trim() || 'PharmaCore'
  const logo = settings?.logoUrl?.startsWith('data:image') ? settings.logoUrl : null

  return (
    <div style={{ background: theme.bg }} className="splash-root h-screen w-full relative overflow-hidden">
      {/* Ambient animated orbs */}
      <div aria-hidden className="splash-orb splash-orb-a" style={{ background: theme.gradientAccent }} />
      <div aria-hidden className="splash-orb splash-orb-b" style={{ background: theme.gradientAccent }} />

      {/* Centered glass panel */}
      <div className="relative z-10 h-full w-full flex items-center justify-center p-6">
        <div className="splash-panel" style={{ background: theme.card, border: `1px solid ${theme.borderStrong}`, boxShadow: theme.shadowLg }}>
          {/* Logo / brand mark */}
          <div className="splash-mark-wrap">
            {logo ? (
              <img src={logo} alt={name} className="splash-logo" style={{ animation: 'splashFade 0.7s ease-out both' }} />
            ) : (
              <div className="splash-fallback" style={{ background: theme.primary }}>
                <span style={{ color: '#fff' }}>{name.charAt(0).toUpperCase()}</span>
              </div>
            )}
          </div>

          <div className="splash-divider" style={{ background: theme.border }} />

          <p className="splash-eyebrow" style={{ color: theme.primary }}>
            Pharmacy Management System
          </p>

          <h1 className="splash-headline" style={{ ...serif, color: theme.text }}>
            {name}
          </h1>
          <p className="splash-caption" style={{ color: theme.muted }}>
            Preparing your workspace…
          </p>

          {/* Indeterminate progress bar */}
          <div className="splash-track" style={{ background: theme.border }}>
            <div className="splash-bar" style={{ background: theme.primary }} />
          </div>

          <p className="splash-status" style={{ color: theme.muted }}>
            <span className="splash-dot" style={{ background: theme.primary }} />
            Starting up…
          </p>
        </div>
      </div>

      {/* Footer */}
      <p className="splash-footer" style={{ color: theme.muted }}>
        PharmaCore
      </p>

      <style>{`
        .splash-orb {
          position: absolute;
          border-radius: 999px;
          filter: blur(60px);
          opacity: 0.55;
          width: 480px;
          height: 480px;
        }
        .splash-orb-a { top: -140px; left: -120px; animation: splashDrift 14s ease-in-out infinite; }
        .splash-orb-b { bottom: -160px; right: -120px; animation: splashDrift 18s ease-in-out infinite reverse; }

        .splash-panel {
          width: 340px;
          border-radius: 20px;
          padding: 36px 32px 28px;
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          animation: splashRise 0.6s cubic-bezier(0.22, 1, 0.36, 1) both;
          backdrop-filter: blur(8px);
        }

        .splash-mark-wrap { position: relative; margin-bottom: 20px; }
        .splash-logo { width: 84px; height: 84px; object-fit: contain; }
        .splash-fallback {
          width: 84px;
          height: 84px;
          border-radius: 24px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: ${serif.fontFamily};
          font-size: 40px;
          font-weight: 700;
          box-shadow: 0 10px 30px rgba(0,0,0,0.25);
        }

        .splash-divider { width: 48px; height: 1px; margin-bottom: 18px; border-radius: 1px; }

        .splash-eyebrow {
          font-size: 10.5px;
          font-weight: 700;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          margin-bottom: 7px;
        }
        .splash-headline { font-size: 23px; font-weight: 700; margin: 0 0 5px; }
        .splash-caption { font-size: 13px; margin: 0 0 20px; }

        .splash-track {
          width: 100%;
          height: 5px;
          border-radius: 999px;
          overflow: hidden;
          position: relative;
        }
        .splash-bar {
          position: absolute;
          top: 0;
          left: 0;
          height: 100%;
          width: 40%;
          border-radius: 999px;
          animation: splashBar 1.3s ease-in-out infinite;
        }

        .splash-status {
          margin-top: 14px;
          font-size: 12px;
          display: flex;
          align-items: center;
          gap: 7px;
        }
        .splash-dot {
          width: 6px;
          height: 6px;
          border-radius: 999px;
          animation: splashPulse 1.3s ease-in-out infinite;
        }

        .splash-footer {
          position: absolute;
          bottom: 18px;
          left: 0;
          right: 0;
          text-align: center;
          font-size: 11px;
          letter-spacing: 0.08em;
        }

        @keyframes splashRise {
          from { opacity: 0; transform: translateY(12px) scale(0.97); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes splashFade {
          from { opacity: 0; transform: scale(0.92); }
          to { opacity: 1; transform: scale(1); }
        }
        @keyframes splashBar {
          0% { left: -40%; }
          100% { left: 110%; }
        }
        @keyframes splashPulse {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 1; }
        }
        @keyframes splashDrift {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(40px, 30px) scale(1.15); }
        }
      `}</style>
    </div>
  )
}

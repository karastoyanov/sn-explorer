import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import ThemeToggle from './ThemeToggle'

const NAV_LINKS = [
  { to: '/discovery',             label: 'Overview',              end: true },
  { to: '/discovery/patterns',    label: 'Patterns' },
  { to: '/discovery/classifiers', label: 'Classifiers' },
  { to: '/discovery/stages',      label: 'Discovery Stages' },
  { to: '/discovery/ire',         label: 'IRE & Reconciliation' },
]

function IconChat() {
  return (
    <svg width="13" height="13" viewBox="0 0 12 12" fill="none">
      <path d="M6 1C3.24 1 1 3.05 1 5.55c0 1.16.48 2.2 1.27 2.97L1.75 11l2.3-.72C4.57 10.7 5.27 10.9 6 10.9c2.76 0 5-2.05 5-4.55S8.76 1 6 1z" fill="currentColor"/>
    </svg>
  )
}

function IconHamburger({ open }) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      {open ? (
        <path d="M3 3l12 12M15 3L3 15" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
      ) : (
        <path d="M3 5h12M3 9h12M3 13h12" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
      )}
    </svg>
  )
}

export default function Navbar({ onChatOpen }) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const closeMobile = () => setMobileOpen(false)

  return (
    <>
      <nav className="navbar">
        {/* Brand */}
        <div className="navbar-brand">
          <div className="navbar-logo">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M8 1l6.5 3.75v7.5L8 15.5 1.5 12.25V4.75L8 1z" fill="white" fillOpacity="0.9"/>
            </svg>
          </div>
          <div>
            <div className="navbar-brand-name">SN Explorer</div>
            <div className="navbar-brand-sub">ITOM Discovery</div>
          </div>
        </div>

        {/* Desktop nav links */}
        <div className="navbar-links">
          {NAV_LINKS.map(({ to, label, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) => `navbar-link${isActive ? ' active' : ''}`}
            >
              {label}
            </NavLink>
          ))}

          <div className="navbar-divider" />

          <div className="navbar-soon-item">
            Service Mapping
            <span className="navbar-soon-badge">soon</span>
          </div>
        </div>

        {/* Spacer */}
        <div className="navbar-spacer" />

        {/* AI Assistant button — hidden on mobile via CSS */}
        <button className="navbar-ai-btn" onClick={onChatOpen}>
          <IconChat />
          AI Assistant
        </button>

        <div style={{ width: 8 }} />

        <ThemeToggle />

        {/* Hamburger — hidden on desktop via CSS */}
        <button
          className="navbar-hamburger"
          onClick={() => setMobileOpen(o => !o)}
          aria-label="Toggle navigation"
        >
          <IconHamburger open={mobileOpen} />
        </button>
      </nav>

      {/* Mobile dropdown menu */}
      {mobileOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-30"
            onClick={closeMobile}
          />

          {/* Menu panel */}
          <div className="navbar-mobile-menu">
            {NAV_LINKS.map(({ to, label, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) => `navbar-mobile-link${isActive ? ' active' : ''}`}
                onClick={closeMobile}
              >
                {label}
              </NavLink>
            ))}

            {/* Footer row: Service Mapping (disabled) + AI btn */}
            <div className="navbar-mobile-footer">
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 13, color: '#A8B8B0' }}>Service Mapping</span>
                <span className="navbar-soon-badge">soon</span>
              </div>
              <button
                className="navbar-ai-btn"
                onClick={() => { closeMobile(); onChatOpen() }}
              >
                <IconChat />
                AI Assistant
              </button>
            </div>
          </div>
        </>
      )}
    </>
  )
}

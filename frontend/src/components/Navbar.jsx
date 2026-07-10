import { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import ThemeToggle from './ThemeToggle'

const NAV_GROUPS = [
  {
    id: 'discovery',
    label: 'Discovery',
    basePath: '/discovery',
    links: [
      { to: '/discovery',             label: 'Overview',         end: true },
      { to: '/discovery/patterns',    label: 'Patterns' },
      { to: '/discovery/classifiers', label: 'Classifiers' },
      { to: '/discovery/stages',      label: 'Discovery Stages' },
      { to: '/discovery/credentials', label: 'Credentials' },
      { to: '/discovery/mid-server',  label: 'MID Server' },
      { to: '/discovery/runs',        label: 'Discovery Logs' },
    ],
  },
  {
    id: 'cmdb',
    label: 'CMDB Explorer',
    basePath: '/cmdb',
    links: [
      { to: '/cmdb/ire',           label: 'IRE & Reconciliation' },
      { to: '/cmdb/class-manager', label: 'CMDB Class Manager' },
    ],
  },
]

function IconChat() {
  return (
    <svg width="13" height="13" viewBox="0 0 12 12" fill="none">
      <path d="M6 1C3.24 1 1 3.05 1 5.55c0 1.16.48 2.2 1.27 2.97L1.75 11l2.3-.72C4.57 10.7 5.27 10.9 6 10.9c2.76 0 5-2.05 5-4.55S8.76 1 6 1z" fill="currentColor"/>
    </svg>
  )
}

function IconPulse() {
  return (
    <svg width="16" height="9" viewBox="0 0 16 9" fill="none">
      <path d="M0.5 5H3.5L5 1.5L6.5 7.5L8 0.5L9.5 5H12.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M12.5 5H15.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.45"/>
    </svg>
  )
}

function IconTag() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
      <path d="M2 2h5.5L14 8.5 8.5 14 2 7.5V2z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
      <circle cx="5" cy="5" r="1" fill="currentColor"/>
    </svg>
  )
}

function IconChevron() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
      <path d="M2 4l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
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

function NavDropdown({ group }) {
  const [open, setOpen] = useState(false)
  const location = useLocation()
  const isGroupActive = location.pathname.startsWith(group.basePath)

  return (
    <div
      className="navbar-dropdown"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button className={`navbar-dropdown-trigger${isGroupActive ? ' active' : ''}`}>
        {group.label}
        <span className={`navbar-dropdown-chevron${open ? ' open' : ''}`}>
          <IconChevron />
        </span>
      </button>

      {open && (
        <div className="navbar-dropdown-menu">
          {group.links.map(({ to, label, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) => `navbar-dropdown-item${isActive ? ' active' : ''}`}
              onClick={() => setOpen(false)}
            >
              {label}
            </NavLink>
          ))}
        </div>
      )}
    </div>
  )
}

export default function Navbar({ onChatOpen }) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [mobileExpanded, setMobileExpanded] = useState({})
  const closeMobile = () => setMobileOpen(false)

  const toggleMobileGroup = (id) =>
    setMobileExpanded(prev => ({ ...prev, [id]: !prev[id] }))

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

        {/* Desktop dropdown groups */}
        <div className="navbar-links">
          {NAV_GROUPS.map(group => (
            <NavDropdown key={group.id} group={group} />
          ))}
        </div>

        {/* Spacer */}
        <div className="navbar-spacer" />

        {/* Report Issue button */}
        <a
          className="navbar-report-btn"
          href="https://github.com/karastoyanov/sn-explorer/issues"
          target="_blank"
          rel="noopener noreferrer"
        >
          <span className="navbar-report-pulse" />
          <IconPulse />
          Report Issue
        </a>

        <div style={{ width: 8 }} />

        {/* Release Notes link — hidden on mobile via CSS */}
        <NavLink
          to="/release-notes"
          className={({ isActive }) => `navbar-release-btn${isActive ? ' active' : ''}`}
        >
          <IconTag />
          Release Notes
        </NavLink>

        <div style={{ width: 8 }} />

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
          <div className="fixed inset-0 z-30" onClick={closeMobile} />

          <div className="navbar-mobile-menu">
            {NAV_GROUPS.map(group => (
              <div key={group.id}>
                <button
                  className="navbar-mobile-group-hdr"
                  onClick={() => toggleMobileGroup(group.id)}
                >
                  {group.label}
                  <span className={`navbar-dropdown-chevron${mobileExpanded[group.id] ? ' open' : ''}`}>
                    <IconChevron />
                  </span>
                </button>

                {mobileExpanded[group.id] && group.links.map(({ to, label, end }) => (
                  <NavLink
                    key={to}
                    to={to}
                    end={end}
                    className={({ isActive }) => `navbar-mobile-link navbar-mobile-sublink${isActive ? ' active' : ''}`}
                    onClick={closeMobile}
                  >
                    {label}
                  </NavLink>
                ))}
              </div>
            ))}

            {/* Footer row: Release Notes + AI btn */}
            <div className="navbar-mobile-footer">
              <NavLink
                to="/release-notes"
                className={({ isActive }) => `navbar-release-btn${isActive ? ' active' : ''}`}
                onClick={closeMobile}
              >
                <IconTag />
                Release Notes
              </NavLink>
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

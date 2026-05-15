import { useState, useEffect, useMemo } from 'react'
import { NavLink } from 'react-router-dom'
import { discoveryApi } from '../api/client'
import ThemeToggle from './ThemeToggle'

/* ── Category dot colors (bright for always-dark sidebar) ──────────────────── */

const CATEGORIES = ['All', 'Application', 'Cloud', 'Infrastructure', 'Library', 'Extensions']

const CAT_DOT = {
  Application:    '#34D399',
  Cloud:          '#60A5FA',
  Infrastructure: '#94A3B8',
  Library:        '#A78BFA',
  Extensions:     '#FB923C',
  Other:          '#6B7280',
}

const DT_SYMBOL = {
  'Horizontal': { label: 'H', title: 'Horizontal discovery' },
  'Top-Down':   { label: 'T', title: 'Top-Down discovery'   },
}

/* ── SVG Icons ─────────────────────────────────────────────────────────────── */

function IconOverview() {
  return (
    <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5" fill="none"/>
      <circle cx="8" cy="8" r="2" fill="currentColor"/>
    </svg>
  )
}

function IconStages() {
  return (
    <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M2 8h2m0 0V4m0 4v4m4-8h2m0 0v8m4-4h-2m2 0V6m0 2v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  )
}

function IconIRE() {
  return (
    <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M3 5l5-3 5 3v6l-5 3-5-3V5z" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinejoin="round"/>
    </svg>
  )
}

function IconSearch() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="6.5" cy="6.5" r="5" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M10 10l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  )
}

function IconAI() {
  return (
    <svg viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M6 1C3.24 1 1 3.05 1 5.55c0 1.16.48 2.2 1.27 2.97L1.75 11l2.3-.72C4.57 10.7 5.27 10.9 6 10.9c2.76 0 5-2.05 5-4.55S8.76 1 6 1z" fill="white"/>
    </svg>
  )
}

/* ── Main Sidebar ─────────────────────────────────────────────────────────── */

export default function Sidebar({ onChatOpen }) {
  const [section, setSection] = useState('patterns')

  return (
    <aside className="sbar">

      {/* Brand */}
      <div className="sbar-brand">
        <div className="sbar-logo">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path d="M8 1l6.5 3.75v7.5L8 15.5 1.5 12.25V4.75L8 1z" fill="white" fillOpacity="0.9"/>
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <div className="sbar-brand-name">SN Explorer</div>
          <div className="sbar-brand-sub">ITOM Platform</div>
        </div>
        <ThemeToggle />
      </div>

      {/* Modules */}
      <div className="sbar-section">
        <div className="sbar-label">Modules</div>
        <button className="sbar-module active">
          <span className="sbar-module-dot" />
          Discovery
        </button>
        <button className="sbar-module inactive">
          <span className="sbar-module-dot" />
          Service Mapping
          <span className="sbar-soon">soon</span>
        </button>
      </div>

      <div className="sbar-divider" />

      {/* Navigate */}
      <div className="sbar-section">
        <div className="sbar-label">Navigate</div>
        <NavLink
          to="/discovery"
          end
          className={({ isActive }) => `sbar-nav ${isActive ? 'active' : ''}`}
        >
          <span className="sbar-nav-icon"><IconOverview /></span>
          Overview
        </NavLink>
        <NavLink
          to="/discovery/stages"
          className={({ isActive }) => `sbar-nav ${isActive ? 'active' : ''}`}
        >
          <span className="sbar-nav-icon"><IconStages /></span>
          Discovery Stages
        </NavLink>
        <NavLink
          to="/discovery/ire"
          className={({ isActive }) => `sbar-nav ${isActive ? 'active' : ''}`}
        >
          <span className="sbar-nav-icon"><IconIRE /></span>
          IRE &amp; Reconciliation
        </NavLink>
      </div>

      <div className="sbar-divider" />

      {/* Catalog section label */}
      <div className="sbar-label" style={{ paddingTop: '10px' }}>Catalog</div>

      {/* Tabs */}
      <div className="sbar-tabs">
        <button
          className={`sbar-tab ${section === 'patterns' ? 'active' : ''}`}
          onClick={() => setSection('patterns')}
        >
          Patterns
        </button>
        <button
          className={`sbar-tab ${section === 'classifiers' ? 'active' : ''}`}
          onClick={() => setSection('classifiers')}
        >
          Classifiers
        </button>
      </div>

      {section === 'patterns'    && <PatternsSection />}
      {section === 'classifiers' && <ClassifiersSection />}

      {/* Footer */}
      <div className="sbar-footer">
        <button className="sbar-footer-btn ai" onClick={onChatOpen}>
          <span className="sbar-ai-icon"><IconAI /></span>
          <span>Discovery Assistant</span>
          <span className="sbar-ai-badge">AI</span>
        </button>
        <div className="sbar-footer-btn inactive">
          <span style={{ fontSize: '14px' }}>🗺</span>
          <span>Service Mapping</span>
          <span className="sbar-soon" style={{ marginLeft: 'auto' }}>soon</span>
        </div>
      </div>
    </aside>
  )
}

/* ── Patterns section ─────────────────────────────────────────────────────── */

function PatternsSection() {
  const [patterns, setPatterns]   = useState([])
  const [search, setSearch]       = useState('')
  const [catFilter, setCatFilter] = useState('All')
  const [collapsed, setCollapsed] = useState({})
  const [loading, setLoading]     = useState(true)

  useEffect(() => {
    discoveryApi.getPatterns()
      .then(p => { setPatterns(p); setLoading(false) })
      .catch(console.error)
  }, [])

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    return patterns.filter(p => {
      if (catFilter === 'Extensions') {
        if (!p.isExtensionSection) return false
      } else {
        if (p.isExtensionSection && !q) return false
        if (catFilter !== 'All' && p.category !== catFilter) return false
      }
      if (!q) return true
      return p.name.toLowerCase().includes(q) || (p.mainCi || '').toLowerCase().includes(q)
    })
  }, [patterns, search, catFilter])

  const grouped = useMemo(() =>
    filtered.reduce((acc, p) => {
      const g = p.category || 'Other'
      if (!acc[g]) acc[g] = []
      acc[g].push(p)
      return acc
    }, {}),
    [filtered]
  )

  const groupOrder     = ['Application', 'Cloud', 'Infrastructure', 'Library', 'Other']
  const sortedGroups   = groupOrder.filter(g => grouped[g]?.length > 0)
  const toggleGroup    = g => setCollapsed(prev => ({ ...prev, [g]: !prev[g] }))
  const extensionCount = useMemo(() => patterns.filter(p => p.isExtensionSection).length, [patterns])

  return (
    <>
      {/* Search */}
      <div className="sbar-search-wrap">
        <span className="sbar-search-icon"><IconSearch /></span>
        <input
          type="text"
          className="sbar-search"
          placeholder="Search name or CI class…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* Category filter chips */}
      <div className="sbar-chips">
        {CATEGORIES.map(cat => {
          const isActive = catFilter === cat
          const dot      = CAT_DOT[cat]
          return (
            <button
              key={cat}
              onClick={() => setCatFilter(cat)}
              className={`sbar-chip ${isActive ? 'active' : ''}`}
            >
              {cat === 'All' ? 'All' : (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  <span
                    style={{
                      width: '5px', height: '5px', borderRadius: '50%',
                      background: dot, display: 'inline-block', flexShrink: 0,
                    }}
                  />
                  {cat === 'Extensions' ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                      Ext
                      {extensionCount > 0 && !isActive && (
                        <span style={{ fontSize: '8px', opacity: 0.6 }}>{extensionCount}</span>
                      )}
                    </span>
                  ) : cat}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Pattern list */}
      <div className="sbar-list">
        {loading && (
          <div style={{ padding: '8px 14px', fontSize: '11.5px', color: '#6B7090' }}>Loading patterns…</div>
        )}
        {!loading && sortedGroups.length === 0 && (
          <div style={{ padding: '8px 14px', fontSize: '11.5px', color: '#6B7090' }}>No patterns match</div>
        )}
        {catFilter === 'Extensions' && sortedGroups.map(group => (
          <PatternGroup
            key={group}
            group={group}
            patterns={grouped[group]}
            isCollapsed={!!collapsed[group]}
            onToggle={() => toggleGroup(group)}
            showExtBadge={false}
          />
        ))}
        {catFilter !== 'Extensions' && sortedGroups.map(group => (
          <PatternGroup
            key={group}
            group={group}
            patterns={grouped[group]}
            isCollapsed={!!collapsed[group]}
            onToggle={() => toggleGroup(group)}
            showExtBadge={!!search}
          />
        ))}
      </div>
    </>
  )
}

function PatternGroup({ group, patterns, isCollapsed, onToggle, showExtBadge }) {
  const dot = CAT_DOT[group] || CAT_DOT.Other

  return (
    <div>
      <button className="sbar-group-btn" onClick={onToggle}>
        <span
          style={{
            fontSize: '8px',
            color: '#6B7090',
            transform: isCollapsed ? 'rotate(-90deg)' : 'none',
            transition: 'transform 0.15s',
            display: 'inline-block',
          }}
        >
          ▾
        </span>
        <span
          style={{
            width: '6px', height: '6px', borderRadius: '50%',
            background: dot, flexShrink: 0, display: 'inline-block',
          }}
        />
        {group}
        <span className="sbar-group-count">{patterns.length}</span>
      </button>

      {!isCollapsed && patterns.map(p => {
        const dt   = DT_SYMBOL[p.discoveryType]
        const pdot = p.isExtensionSection ? CAT_DOT.Extensions : dot
        return (
          <NavLink
            key={p.id}
            to={`/discovery/patterns/${p.id}`}
            className={({ isActive }) => `sbar-item ${isActive ? 'active' : ''}`}
            title={`${p.name}${p.mainCi ? `\n${p.mainCi}` : ''}${p.isExtensionSection ? '\n(extension section)' : ''}`}
          >
            <span
              style={{
                width: '6px', height: '6px', borderRadius: '50%',
                background: pdot, flexShrink: 0,
              }}
            />
            <span className="sbar-item-info">
              <span className="sbar-item-name">{p.name}</span>
              {p.mainCi && (
                <span className="sbar-item-ci">{p.mainCi}</span>
              )}
            </span>
            <span className="sbar-item-badges">
              {showExtBadge && p.isExtensionSection && (
                <span className="sbar-ext-badge" title="Extension section">ext</span>
              )}
              {dt && (
                <span className="sbar-dt-badge" title={dt.title}>{dt.label}</span>
              )}
            </span>
          </NavLink>
        )
      })}
    </div>
  )
}

/* ── Classifiers section ──────────────────────────────────────────────────── */

function ClassifiersSection() {
  const [classifiers, setClassifiers] = useState([])
  const [search, setSearch]           = useState('')
  const [loading, setLoading]         = useState(true)

  useEffect(() => {
    discoveryApi.getClassifiers()
      .then(data => { setClassifiers(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    if (!q) return classifiers
    return classifiers.filter(c =>
      c.name.toLowerCase().includes(q) ||
      (c.ciTable || '').toLowerCase().includes(q) ||
      (c.ciTableLabel || '').toLowerCase().includes(q)
    )
  }, [classifiers, search])

  return (
    <>
      {/* Search */}
      <div className="sbar-search-wrap">
        <span className="sbar-search-icon"><IconSearch /></span>
        <input
          type="text"
          className="sbar-search"
          placeholder="Search name or CI table…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* Classifier list */}
      <div className="sbar-list">
        {loading && (
          <div style={{ padding: '8px 14px', fontSize: '11.5px', color: '#6B7090' }}>Loading classifiers…</div>
        )}
        {!loading && filtered.length === 0 && (
          <div style={{ padding: '8px 14px', fontSize: '11.5px', color: '#6B7090' }}>
            {classifiers.length === 0
              ? 'No classifiers found.'
              : 'No classifiers match'}
          </div>
        )}
        {filtered.map(c => (
          <NavLink
            key={c.id}
            to={`/discovery/classifiers/${c.id}`}
            className={({ isActive }) => `sbar-item ${isActive ? 'active' : ''}`}
            title={`${c.name}\n${c.ciTable || ''}`}
          >
            <span
              style={{
                width: '6px', height: '6px', borderRadius: '50%',
                background: c.active === false ? '#3A3F5E' : '#2DD4BF',
                flexShrink: 0,
              }}
            />
            <span className="sbar-item-info">
              <span className="sbar-item-name">{c.name}</span>
              {c.ciTable && (
                <span className="sbar-item-ci">{c.ciTableLabel || c.ciTable}</span>
              )}
            </span>
            <span className="sbar-item-badges">
              {c.criteriaCount > 0 && (
                <span
                  className="sbar-dt-badge"
                  title={`${c.criteriaCount} criteria`}
                  style={{ color: '#4A7060', background: 'rgba(45,212,191,0.08)' }}
                >
                  {c.criteriaCount}
                </span>
              )}
              {c.active === false && (
                <span className="sbar-dt-badge">off</span>
              )}
            </span>
          </NavLink>
        ))}
      </div>
    </>
  )
}

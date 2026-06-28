import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { discoveryApi } from '../../../api/client'

const CATEGORIES = ['All', 'Application', 'Cloud', 'Infrastructure', 'Library', 'Extensions']

const CAT_DOT = {
  Application:    '#34D399',
  Cloud:          '#60A5FA',
  Infrastructure: '#94A3B8',
  Library:        '#A78BFA',
  Extensions:     '#FB923C',
  Other:          '#6B7280',
}

const CAT_BADGE_CLS = {
  Application:    'badge-green',
  Cloud:          'badge-sky',
  Infrastructure: 'badge-slate',
  Library:        'badge-violet',
  Extensions:     'badge-orange',
  Other:          'badge-gray',
}

const DT_BADGE_CLS = {
  Horizontal: 'badge-teal',
  'Top-Down': 'badge-amber',
}

const GROUP_ORDER = ['Application', 'Cloud', 'Infrastructure', 'Library', 'Other']

function IconSearch() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <circle cx="6.5" cy="6.5" r="5" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M10 10l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  )
}

export default function PatternsList() {
  const [patterns, setPatterns]   = useState([])
  const [loading, setLoading]     = useState(true)
  const [search, setSearch]       = useState('')
  const [catFilter, setCatFilter] = useState('All')
  useEffect(() => {
    discoveryApi.getPatterns()
      .then(p => { setPatterns(p); setLoading(false) })
      .catch(err => { console.error(err); setLoading(false) })
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
      const g = p.isExtensionSection ? 'Extensions' : (p.category || 'Other')
      if (!acc[g]) acc[g] = []
      acc[g].push(p)
      return acc
    }, {}),
    [filtered]
  )

  const sortedGroups = useMemo(() => {
    if (catFilter === 'Extensions') {
      return Object.keys(grouped)
    }
    return GROUP_ORDER.filter(g => grouped[g]?.length > 0)
  }, [grouped, catFilter])

  const totalShown = filtered.length
  const extensionCount = useMemo(() => patterns.filter(p => p.isExtensionSection).length, [patterns])

  return (
    <div className="page">
      {/* Header */}
      <div className="page-hdr">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="page-title">Discovery Patterns</h1>
            <p className="page-sub">
              NDL patterns defining how ServiceNow Discovery identifies and populates CMDB CIs
            </p>
          </div>
          {!loading && (
            <span className="badge badge-green shrink-0">
              {patterns.length.toLocaleString()} patterns
            </span>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="page-body">
        <div className="page-inner">

          {/* Search */}
          <div className="page-search-wrap">
            <span className="page-search-icon"><IconSearch /></span>
            <input
              type="text"
              className="page-search"
              placeholder="Search by name or CI class…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          {/* Category filter chips */}
          <div className="filter-chips">
            {CATEGORIES.map(cat => {
              const dot = CAT_DOT[cat]
              const isActive = catFilter === cat
              return (
                <button
                  key={cat}
                  onClick={() => setCatFilter(cat)}
                  className={`filter-chip${isActive ? ' active' : ''}`}
                >
                  {cat !== 'All' && (
                    <span
                      style={{
                        width: 7, height: 7, borderRadius: '50%',
                        background: dot, display: 'inline-block', flexShrink: 0,
                      }}
                    />
                  )}
                  {cat === 'Extensions' ? (
                    <span>
                      Extensions
                      {extensionCount > 0 && (
                        <span style={{ opacity: 0.6, marginLeft: 4, fontSize: 10 }}>
                          {extensionCount}
                        </span>
                      )}
                    </span>
                  ) : cat}
                </button>
              )
            })}
          </div>

          {/* Pattern list */}
          {loading && (
            <div className="card">
              <div className="p-6 text-center text-[13px] text-[#506458] dark:text-[#4A6858]">Loading patterns…</div>
            </div>
          )}

          {!loading && totalShown === 0 && (
            <div className="card">
              <div className="empty-state">
                <div className="empty-icon">🔍</div>
                <div className="empty-title">No patterns match</div>
                <div className="empty-sub">Try a different search term or category filter.</div>
              </div>
            </div>
          )}

          {!loading && sortedGroups.map(group => (
            <div key={group} className="card overflow-hidden">
              {/* Group header */}
              <div className="list-group-hdr">
                <span
                  style={{
                    width: 7, height: 7, borderRadius: '50%',
                    background: CAT_DOT[group] || CAT_DOT.Other,
                    display: 'inline-block', flexShrink: 0,
                  }}
                />
                {group}
                <span className="ml-auto tabular-nums">{grouped[group].length}</span>
              </div>

              {/* Rows */}
              {grouped[group].map(p => {
                const catCls = CAT_BADGE_CLS[p.isExtensionSection ? 'Extensions' : (p.category || 'Other')] || 'badge-gray'
                const dtCls  = DT_BADGE_CLS[p.discoveryType] || 'badge-gray'
                const dot    = p.isExtensionSection ? CAT_DOT.Extensions : (CAT_DOT[p.category] || CAT_DOT.Other)

                return (
                  <Link
                    key={p.id}
                    to={`/discovery/patterns/${p.id}`}
                    className="list-item-card"
                  >
                    {/* Category dot */}
                    <span
                      style={{
                        width: 8, height: 8, borderRadius: '50%',
                        background: dot, flexShrink: 0,
                      }}
                    />

                    {/* Name + CI class */}
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-semibold text-[#131A15] dark:text-[#E0EAE4] truncate">
                        {p.name}
                      </div>
                      {p.mainCi && (
                        <div className="text-[11px] font-mono text-[#0C9248] dark:text-[#17C068] truncate mt-0.5">
                          {p.mainCi}
                        </div>
                      )}
                    </div>

                    {/* Badges */}
                    <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                      <span className={`badge ${catCls}`}>
                        {p.isExtensionSection ? 'Extension' : p.category}
                      </span>
                      {p.discoveryType && (
                        <span className={`badge ${dtCls}`} title={p.discoveryType}>
                          {p.discoveryType === 'Horizontal' ? 'H' : 'T'}
                        </span>
                      )}
                      {p.protocol && (
                        <span className="badge badge-gray">{p.protocol}</span>
                      )}
                      {p.credentialType && (
                        <span className="badge badge-indigo">{p.credentialType}</span>
                      )}
                    </div>
                  </Link>
                )
              })}
            </div>
          ))}

        </div>
      </div>
    </div>
  )
}

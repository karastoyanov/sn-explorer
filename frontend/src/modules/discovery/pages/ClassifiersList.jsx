import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { discoveryApi } from '../../../api/client'

function IconSearch() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <circle cx="6.5" cy="6.5" r="5" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M10 10l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  )
}

export default function ClassifiersList() {
  const [classifiers, setClassifiers] = useState([])
  const [loading, setLoading]         = useState(true)
  const [search, setSearch]           = useState('')

  useEffect(() => {
    discoveryApi.getClassifiers()
      .then(data => { setClassifiers(data); setLoading(false) })
      .catch(err => { console.error(err); setLoading(false) })
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

  const activeCount   = classifiers.filter(c => c.active !== false).length
  const inactiveCount = classifiers.filter(c => c.active === false).length

  return (
    <div className="page">
      {/* Header */}
      <div className="page-hdr">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="page-title">Discovery Classifiers</h1>
            <p className="page-sub">
              Rules that classify discovered hosts and applications into specific CI types in the CMDB
            </p>
          </div>
          {!loading && (
            <div className="flex items-center gap-2 shrink-0">
              <span className="badge badge-teal">{activeCount.toLocaleString()} active</span>
              {inactiveCount > 0 && (
                <span className="badge badge-gray">{inactiveCount} inactive</span>
              )}
            </div>
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
              placeholder="Search by name or CI table…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          {/* List */}
          {loading && (
            <div className="card">
              <div className="p-6 text-center text-[13px] text-[#8EA898] dark:text-[#6A9880]">Loading classifiers…</div>
            </div>
          )}

          {!loading && filtered.length === 0 && (
            <div className="card">
              <div className="empty-state">
                <div className="empty-icon">🔍</div>
                <div className="empty-title">
                  {classifiers.length === 0 ? 'No classifiers found' : 'No classifiers match'}
                </div>
                <div className="empty-sub">
                  {classifiers.length === 0
                    ? 'The API returned no classifier records.'
                    : 'Try a different search term.'}
                </div>
              </div>
            </div>
          )}

          {!loading && filtered.length > 0 && (
            <div className="card overflow-hidden">
              {/* Table header */}
              <div
                className="list-group-hdr"
                style={{ justifyContent: 'space-between' }}
              >
                <span>Classifiers</span>
                <span className="tabular-nums">{filtered.length}</span>
              </div>

              {filtered.map(c => {
                const isActive    = c.active !== false
                const statusColor = isActive ? '#2DD4BF' : '#8EA898'

                return (
                  <Link
                    key={c.id}
                    to={`/discovery/classifiers/${c.id}`}
                    className="list-item-card"
                  >
                    {/* Status dot */}
                    <span
                      style={{
                        width: 8, height: 8, borderRadius: '50%',
                        background: statusColor, flexShrink: 0,
                      }}
                      title={isActive ? 'Active' : 'Inactive'}
                    />

                    {/* Name + CI table */}
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-semibold text-[#131A15] dark:text-[#E0EAE4] truncate">
                        {c.name}
                      </div>
                      {c.ciTable && (
                        <div className="text-[11px] font-mono text-[#0C9248] dark:text-[#17C068] truncate mt-0.5">
                          {c.ciTableLabel || c.ciTable}
                        </div>
                      )}
                    </div>

                    {/* Badges */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      {!isActive && (
                        <span className="badge badge-gray">inactive</span>
                      )}
                      {c.criteriaCount > 0 && (
                        <span
                          className="badge badge-teal"
                          title={`${c.criteriaCount} criteria`}
                        >
                          {c.criteriaCount} criteria
                        </span>
                      )}
                    </div>
                  </Link>
                )
              })}
            </div>
          )}

        </div>
      </div>
    </div>
  )
}

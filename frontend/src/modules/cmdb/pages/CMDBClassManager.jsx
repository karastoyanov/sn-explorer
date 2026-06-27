import { useState, useEffect } from 'react'
import { cmdbApi } from '../../../api/client'

const TABS = ['CI Classes', 'Identifiers', 'Relation Types', 'Reconciliation']

function IconDatabase() {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
      <ellipse cx="16" cy="9" rx="11" ry="4" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M5 9v7c0 2.21 4.93 4 11 4s11-1.79 11-4V9" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M5 16v7c0 2.21 4.93 4 11 4s11-1.79 11-4v-7" stroke="currentColor" strokeWidth="1.5"/>
    </svg>
  )
}

function EmptyState({ tab }) {
  const descriptions = {
    'CI Classes':     'CI class definitions and field inventory from sys_db_object + sys_dictionary.',
    'Identifiers':    'IRE identification rules from cmdb_identifier and cmdb_identifier_entry.',
    'Relation Types': 'Relationship type catalog from cmdb_rel_type.',
    'Reconciliation': 'Reconciliation definitions from cmdb_reconciliation_definition.',
  }
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3">
      <div className="text-[#C8D4CE] dark:text-[#253428]"><IconDatabase /></div>
      <div className="text-[13px] font-semibold text-[#495C52] dark:text-[#607870]">No data loaded</div>
      <div className="text-[12px] text-center max-w-[360px] leading-relaxed text-[#8EA898] dark:text-[#6A9880]">
        {descriptions[tab]}
        <br />
        Run <span className="font-mono text-[11px] text-[#0C9248] dark:text-[#17C068]">extract_cmdb_classes.py</span> against your instance to populate this section.
      </div>
    </div>
  )
}

export default function CMDBClassManager() {
  const [tab, setTab]       = useState('CI Classes')
  const [data, setData]     = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]   = useState(null)

  useEffect(() => {
    cmdbApi.getData()
      .then(d => {
        if (!d.meta && !d.classes?.length) {
          setData(null)
        } else {
          setData(d)
        }
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="page">
        <div className="page-hdr">
          <div className="page-title text-[#8EA898] dark:text-[#6A9880]">Loading…</div>
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      <div className="page-hdr">
        <div>
          <h1 className="page-title">CMDB Class Manager</h1>
          <p className="page-sub">
            CI class hierarchy, identification rules, relation types, and reconciliation configuration
          </p>
        </div>

        <div className="page-tabs">
          {TABS.map((t, i) => {
            const counts = data ? [
              data.classes?.length,
              data.identifiers?.length,
              data.relationTypes?.length,
              data.reconciliationDefinitions?.length,
            ] : []
            return (
              <button key={t} className={`page-tab${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>
                {t}
                {counts[i] != null && (
                  <span className="ml-1.5 text-[10px] font-medium opacity-60">({counts[i].toLocaleString()})</span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      <div className="page-body">
        <div className="page-inner">

          {error && (
            <div className="notice-banner notice-orange">
              <span className="font-semibold">API error:</span> {error}
            </div>
          )}

          {tab === 'CI Classes' && (
            data?.classes?.length
              ? <CIClassesTab classes={data.classes} />
              : <div className="card"><EmptyState tab="CI Classes" /></div>
          )}
          {tab === 'Identifiers' && (
            data?.identifiers?.length
              ? <IdentifiersTab identifiers={data.identifiers} />
              : <div className="card"><EmptyState tab="Identifiers" /></div>
          )}
          {tab === 'Relation Types' && (
            data?.relationTypes?.length
              ? <RelationTypesTab types={data.relationTypes} />
              : <div className="card"><EmptyState tab="Relation Types" /></div>
          )}
          {tab === 'Reconciliation' && (
            data?.reconciliationDefinitions?.length
              ? <ReconciliationTab defs={data.reconciliationDefinitions} />
              : <div className="card"><EmptyState tab="Reconciliation" /></div>
          )}

        </div>
      </div>
    </div>
  )
}

/* ── CI Classes ───────────────────────────────────────────────────────────── */

function CIClassesTab({ classes }) {
  const [search, setSearch] = useState('')

  const filtered = classes.filter(c => {
    const q = search.toLowerCase()
    return !q || c.name?.toLowerCase().includes(q) || c.label?.toLowerCase().includes(q)
  })

  return (
    <div className="card">
      <div className="card-hdr">
        CI Classes
        <div className="ml-auto flex items-center gap-2">
          <div className="page-search-wrap w-52">
            <svg className="page-search-icon" width="13" height="13" viewBox="0 0 13 13" fill="none">
              <circle cx="5.5" cy="5.5" r="4" stroke="currentColor" strokeWidth="1.4"/>
              <path d="M9 9l2.5 2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
            </svg>
            <input className="page-search" placeholder="Filter classes…"
              value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="tbl">
          <thead>
            <tr>
              <th>Table Name</th>
              <th>Label</th>
              <th>Parent Class</th>
              <th>Scope</th>
              <th>Fields</th>
              <th>Flags</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(c => (
              <tr key={c.name}>
                <td><span className="mono">{c.name}</span></td>
                <td className="font-medium">{c.label || '—'}</td>
                <td><span className="mono text-[11px]">{c.superClass || '—'}</span></td>
                <td>{c.scope ? <span className="badge badge-gray">{c.scope}</span> : '—'}</td>
                <td className="tabular-nums text-right pr-4">
                  {c.fieldCount > 0 ? c.fieldCount : <span className="text-[#C8D4CE] dark:text-[#253428]">—</span>}
                </td>
                <td>
                  <div className="flex gap-1 flex-wrap">
                    {c.principalClass && <span className="badge badge-green">Principal</span>}
                    {c.identifierId   && <span className="badge badge-teal">IRE</span>}
                    {c.isExtendable   && <span className="badge badge-gray">Extendable</span>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/* ── Identifiers ──────────────────────────────────────────────────────────── */

function IdentifiersTab({ identifiers }) {
  const [search, setSearch]     = useState('')
  const [expanded, setExpanded] = useState({})

  const toggle = (id) => setExpanded(p => ({ ...p, [id]: !p[id] }))

  const filtered = identifiers.filter(i => {
    const q = search.toLowerCase()
    return !q || i.name?.toLowerCase().includes(q) || i.appliesTo?.toLowerCase().includes(q)
  })

  return (
    <div className="card">
      <div className="card-hdr">
        Identifiers
        <div className="ml-auto page-search-wrap w-56">
          <svg className="page-search-icon" width="13" height="13" viewBox="0 0 13 13" fill="none">
            <circle cx="5.5" cy="5.5" r="4" stroke="currentColor" strokeWidth="1.4"/>
            <path d="M9 9l2.5 2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
          </svg>
          <input className="page-search" placeholder="Filter identifiers…"
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      <div className="card-divider">
        {filtered.map(ident => (
          <div key={ident.id}>
            {/* Header row */}
            <button
              className="list-item-card w-full text-left"
              onClick={() => toggle(ident.id)}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-[13px] text-[#131A15] dark:text-[#E0EAE4]">
                    {ident.name || ident.appliesTo}
                  </span>
                  <span className="mono text-[11px] text-[#8EA898] dark:text-[#6A9880]">
                    {ident.appliesTo}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className={`badge ${ident.independent ? 'badge-amber' : 'badge-teal'}`}>
                    {ident.independent ? 'Independent' : 'Dependent'}
                  </span>
                  <span className={`badge ${ident.active ? 'badge-green' : 'badge-gray'}`}>
                    {ident.active ? 'Active' : 'Inactive'}
                  </span>
                  <span className="text-[11px] text-[#8EA898] dark:text-[#6A9880]">
                    {ident.entries?.length ?? 0} {ident.entries?.length === 1 ? 'entry' : 'entries'}
                  </span>
                </div>
              </div>
              <svg
                width="14" height="14" viewBox="0 0 14 14" fill="none"
                className={`shrink-0 text-[#8EA898] transition-transform ${expanded[ident.id] ? 'rotate-180' : ''}`}
              >
                <path d="M3 5l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </button>

            {/* Expanded entries */}
            {expanded[ident.id] && ident.entries?.length > 0 && (
              <div className="border-t border-[#EBF0EC] dark:border-[#1E3028]">
                {ident.entries.map((entry, i) => (
                  <div key={entry.id}
                    className="px-6 py-3 border-b border-[#F0F4F2] dark:border-[#182419] last:border-b-0 bg-[#FAFBFA] dark:bg-[#10180E]"
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span className="label-xs">Entry {i + 1}</span>
                      <span className="text-[11px] text-[#8EA898] dark:text-[#6A9880]">
                        priority {entry.order ?? '—'}
                      </span>
                      {entry.searchTable && (
                        <span className="mono text-[11px]">→ {entry.searchTable}</span>
                      )}
                      <div className="ml-auto flex gap-1">
                        {entry.allowFallback      && <span className="badge badge-gray">Fallback</span>}
                        {entry.allowNullAttribute  && <span className="badge badge-amber">Null OK</span>}
                        {entry.exactCountMatch     && <span className="badge badge-violet">Exact count</span>}
                      </div>
                    </div>

                    {entry.mainAttributes?.length > 0 && (
                      <div className="mb-1.5">
                        <span className="label-xs mr-2">Main</span>
                        <div className="inline-flex flex-wrap gap-1">
                          {entry.mainAttributes.map(a => (
                            <span key={a} className="badge badge-teal">{a}</span>
                          ))}
                        </div>
                      </div>
                    )}

                    {entry.attributes?.length > 0 && (
                      <div>
                        <span className="label-xs mr-2">Criterion</span>
                        <div className="inline-flex flex-wrap gap-1">
                          {entry.attributes.map(a => (
                            <span key={a} className="badge badge-sky">{a}</span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {expanded[ident.id] && (!ident.entries || ident.entries.length === 0) && (
              <div className="px-6 py-3 text-[12px] text-[#8EA898] dark:text-[#6A9880] bg-[#FAFBFA] dark:bg-[#10180E] border-t border-[#EBF0EC] dark:border-[#1E3028]">
                No entries configured
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── Relation Types ───────────────────────────────────────────────────────── */

function RelationTypesTab({ types }) {
  const [search, setSearch] = useState('')
  const filtered = types.filter(t => {
    const q = search.toLowerCase()
    return !q || t.name?.toLowerCase().includes(q)
      || t.parentDescriptor?.toLowerCase().includes(q)
      || t.childDescriptor?.toLowerCase().includes(q)
  })

  return (
    <div className="card">
      <div className="card-hdr">
        Relation Types
        <div className="ml-auto page-search-wrap w-56">
          <svg className="page-search-icon" width="13" height="13" viewBox="0 0 13 13" fill="none">
            <circle cx="5.5" cy="5.5" r="4" stroke="currentColor" strokeWidth="1.4"/>
            <path d="M9 9l2.5 2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
          </svg>
          <input className="page-search" placeholder="Filter relation types…"
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="tbl">
          <thead>
            <tr>
              <th>Name</th>
              <th>Parent → Child</th>
              <th>Child → Parent</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(t => (
              <tr key={t.id}>
                <td className="font-medium">{t.name || '—'}</td>
                <td><span className="badge badge-sky">{t.parentDescriptor || '—'}</span></td>
                <td><span className="badge badge-indigo">{t.childDescriptor || '—'}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/* ── Reconciliation ───────────────────────────────────────────────────────── */

function ReconciliationTab({ defs }) {
  const [search, setSearch] = useState('')
  const filtered = defs.filter(d => {
    const q = search.toLowerCase()
    return !q || d.appliesTo?.toLowerCase().includes(q)
      || d.name?.toLowerCase().includes(q)
      || d.dataSource?.toLowerCase().includes(q)
  })

  return (
    <div className="card">
      <div className="card-hdr">
        Reconciliation Definitions
        <div className="ml-auto page-search-wrap w-56">
          <svg className="page-search-icon" width="13" height="13" viewBox="0 0 13 13" fill="none">
            <circle cx="5.5" cy="5.5" r="4" stroke="currentColor" strokeWidth="1.4"/>
            <path d="M9 9l2.5 2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
          </svg>
          <input className="page-search" placeholder="Filter definitions…"
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="tbl">
          <thead>
            <tr>
              <th>Name</th>
              <th>Applies To</th>
              <th>Data Source</th>
              <th>Priority</th>
              <th>Attributes</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(d => (
              <tr key={d.id}>
                <td className="font-medium">{d.name || '—'}</td>
                <td><span className="mono text-[11px]">{d.appliesTo || '—'}</span></td>
                <td>{d.dataSource || '—'}</td>
                <td className="tabular-nums">{d.priority ?? '—'}</td>
                <td>
                  <div className="flex flex-wrap gap-1">
                    {d.attributes?.slice(0, 4).map(a => (
                      <span key={a} className="badge badge-gray">{a}</span>
                    ))}
                    {d.attributes?.length > 4 && (
                      <span className="badge badge-gray">+{d.attributes.length - 4}</span>
                    )}
                  </div>
                </td>
                <td>
                  <span className={`badge ${d.active ? 'badge-green' : 'badge-gray'}`}>
                    {d.active ? 'Active' : 'Inactive'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { discoveryApi } from '../../../api/client'
import GraphCanvas from '../../../components/GraphCanvas'

/* ── Constants ──────────────────────────────────────────────────────────────── */

const TABS = ['Overview', 'Tables & Relations', 'NDL', 'Graph', 'Sensors']

const CAT_BADGE = {
  Application:    'badge-green',
  Cloud:          'badge-sky',
  Infrastructure: 'badge-slate',
  Library:        'badge-violet',
  Other:          'badge-gray',
}

const DT_BADGE = {
  Horizontal: 'badge-teal',
  'Top-Down': 'badge-amber',
}

const DEL_BADGE = {
  'Keep':             'badge-gray',
  'Delete':           'badge-red',
  'Mark as Absent':   'badge-amber',
  'Delete Relations': 'badge-orange',
  'Mark as Retired':  'badge-slate',
}

const OP_COLOR = {
  transform:                { dot: '#3b82f6', label: 'Transform',        cls: 'badge-sky' },
  relation_reference:       { dot: '#10b981', label: 'Reference',         cls: 'badge-green' },
  create_relation:          { dot: '#8b5cf6', label: 'Create relation',  cls: 'badge-violet' },
  custom_operation:         { dot: '#d97706', label: 'Custom op',        cls: 'badge-amber' },
  filter:                   { dot: '#0ea5e9', label: 'Filter',           cls: 'badge-sky' },
  merge:                    { dot: '#6366f1', label: 'Merge',            cls: 'badge-indigo' },
  union:                    { dot: '#ec4899', label: 'Union',            cls: 'badge-violet' },
  runcmd_to_var:            { dot: '#64748b', label: 'Run command',      cls: 'badge-slate' },
  parse_xml_file_to_var:    { dot: '#6b7280', label: 'Parse XML',        cls: 'badge-gray' },
  parse_text_file_to_var:   { dot: '#6b7280', label: 'Parse text',       cls: 'badge-gray' },
  parse_url_to_var:         { dot: '#6b7280', label: 'Parse URL',        cls: 'badge-gray' },
  parse_var_to_var:         { dot: '#6b7280', label: 'Parse var',        cls: 'badge-gray' },
  find_registry_val_to_var: { dot: '#6b7280', label: 'Registry lookup',  cls: 'badge-gray' },
  set_attr:                 { dot: '#84cc16', label: 'Set attr',         cls: 'badge-green' },
  match:                    { dot: '#f97316', label: 'Match',            cls: 'badge-orange' },
  if:                       { dot: '#94a3b8', label: 'Condition',        cls: 'badge-slate' },
  change_user:              { dot: '#94a3b8', label: 'Change user',      cls: 'badge-slate' },
  unchange_user:            { dot: '#94a3b8', label: 'Unchange user',    cls: 'badge-slate' },
  put_file:                 { dot: '#94a3b8', label: 'Put file',         cls: 'badge-slate' },
  create_connection:        { dot: '#94a3b8', label: 'Connection',       cls: 'badge-slate' },
}

const TABLE_TYPE_META = {
  cmdb_ci: { badge: 'badge-sky',   label: 'cmdb_ci' },
  cmdb:    { badge: 'badge-teal',  label: 'cmdb' },
  temp:    { badge: 'badge-amber', label: 'temp' },
}

const TABLE_TYPE_BORDER = {
  cmdb_ci: 'border-l-[3px] border-[#60A5FA] dark:border-[#3B82F6]',
  cmdb:    'border-l-[3px] border-[#2DD4BF] dark:border-[#0D9488]',
  temp:    'border-l-[3px] border-[#FCD34D] dark:border-[#D97706]',
}

const TABLE_TYPE_EXPANDED_BG = {
  cmdb_ci: 'bg-blue-50/30 dark:bg-blue-950/10',
  cmdb:    'bg-teal-50/30 dark:bg-teal-950/10',
  temp:    'bg-amber-50/30 dark:bg-amber-950/10',
}

/* ── Utility components ─────────────────────────────────────────────────────── */

function Badge({ children, cls = '' }) {
  return (
    <span className={`badge ${cls}`}>
      {children}
    </span>
  )
}

function Mono({ children, className = '' }) {
  return (
    <span className={`mono ${className}`}>
      {children}
    </span>
  )
}

function Card({ title, count, children, className = '' }) {
  return (
    <div className={`card ${className}`}>
      {title && (
        <div className="card-hdr">
          <span>{title}</span>
          {count !== undefined && (
            <span className="card-count">{count}</span>
          )}
        </div>
      )}
      {children}
    </div>
  )
}

function Empty({ icon = '—', title, detail }) {
  return (
    <div className="empty-state">
      <div className="empty-icon">{icon}</div>
      <div className="empty-title">{title}</div>
      {detail && <div className="empty-sub">{detail}</div>}
    </div>
  )
}

function CopyableId({ id }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(id).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }
  return (
    <button
      onClick={copy}
      title="Copy sys_id"
      className="font-mono text-[12px] text-[#8EA898] dark:text-[#6A9880] hover:text-[#0C9248] dark:hover:text-[#17C068] transition-colors cursor-pointer select-all"
    >
      {copied ? '✓ copied' : id}
    </button>
  )
}

/* ── Skeleton loader ────────────────────────────────────────────────────────── */

function Skeleton() {
  return (
    <div className="p-6 flex flex-col gap-4 animate-pulse">
      <div className="h-6 w-72 bg-[#E0E6E2] dark:bg-[#1E3028] rounded" />
      <div className="h-4 w-48 bg-[#EBF0EC] dark:bg-[#1E3028] rounded" />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-2">
        {[1,2,3,4].map(i => <div key={i} className="h-16 bg-[#EBF0EC] dark:bg-[#182419] rounded-lg" />)}
      </div>
    </div>
  )
}

/* ── Main component ─────────────────────────────────────────────────────────── */

export default function PatternDetail() {
  const { id } = useParams()
  const [pattern, setPattern] = useState(null)
  const [tab, setTab]         = useState('Overview')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    setPattern(null)
    setTab('Overview')
    discoveryApi.getPattern(id)
      .then(d => { setPattern(d); setLoading(false) })
      .catch(err => { console.error(err); setLoading(false) })
  }, [id])

  if (loading) return (
    <div className="page">
      <Skeleton />
    </div>
  )

  if (!pattern) return (
    <div className="page flex items-center justify-center">
      <Empty icon="⚠" title="Pattern not found" detail={`No pattern with id ${id}`} />
    </div>
  )

  const catCls = CAT_BADGE[pattern.category] || CAT_BADGE.Other
  const dtCls  = DT_BADGE[pattern.discoveryType] || DT_BADGE.Horizontal
  const ndl    = pattern.ndl || {}
  const isExt  = pattern.isExtensionSection ?? pattern.isExtension

  const statCards = [
    { label: 'NDL Steps',             value: ndl.steps?.length                           ?? 0 },
    { label: 'Tables Populated',      value: ndl.tablesPopulated?.length                 ?? 0 },
    { label: 'Relations',             value: ndl.relations?.length                       ?? 0 },
    { label: 'Identification Section',value: ndl.identifications?.length                 ?? 0 },
    { label: 'Connection Section',    value: ndl.connections?.length                     ?? 0 },
    { label: 'Extension Section',     value: (pattern.extensionSections || pattern.extensions || []).length ?? 0 },
    { label: 'CI Mappings',           value: pattern.ciMappings?.length                  ?? 0 },
    { label: 'Pre/Post Scripts',      value: pattern.prepostScripts?.length               ?? 0 },
  ]

  return (
    <div className="page">

      {/* ── Header ────────────────────────────────────────────────────────────── */}
      <div className="page-hdr">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: pattern.color }} />
              <h1 className="page-title">
                {pattern.name}
              </h1>
              {!pattern.active && (
                <Badge cls="badge-red">inactive</Badge>
              )}
            </div>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <Badge cls={catCls}>{pattern.category}</Badge>
              <Badge cls={dtCls}>{pattern.discoveryType}</Badge>
              {pattern.mainCi && (
                <span className="text-[11.5px] text-[#8EA898] dark:text-[#6A9880]">
                  main CI: <Mono>{pattern.mainCi}</Mono>
                </span>
              )}
              <CopyableId id={pattern.id} />
            </div>
          </div>

          {/* Tab bar */}
          <div className="page-tabs">
            {TABS.map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`page-tab ${tab === t ? 'active' : ''}`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Tab content ───────────────────────────────────────────────────────── */}
      {tab === 'Graph' ? (
        <GraphCanvas pattern={pattern} />
      ) : (
        <div className="page-body w-full">
          {isExt && (
            <div className="notice-banner notice-orange">
              <span className="text-base">⬡</span>
              <span>
                <strong>Extension section</strong> — this pattern is included as a sub-section inside one or more parent patterns (visible in the parent's <em>Extension Sections</em> list).
              </span>
            </div>
          )}
          {pattern.category === 'Library' && !isExt && (
            <div className="notice-banner notice-violet">
              <span className="text-base">⬢</span>
              <span>
                <strong>Shared Library</strong> — this is a reusable NDL library included by other patterns via their Extension or Identification sections.
              </span>
            </div>
          )}
          {tab === 'Overview'           && <OverviewTab         pattern={pattern} statCards={statCards} />}
          {tab === 'Tables & Relations' && <TablesRelationsTab  pattern={pattern} />}
          {tab === 'NDL'                && <NdlStepsTab         pattern={pattern} />}
          {tab === 'Sensors'            && <SensorsTab          pattern={pattern} />}
        </div>
      )}
    </div>
  )
}

/* ══ OVERVIEW ════════════════════════════════════════════════════════════════ */

const STRATEGY_LABEL = {
  NONE:           'None',
  LISTENING_PORT: 'Listening port',
  PROCESS_NAME:   'Process name',
  PROCESS:        'Process',
}

const ENTRY_POINT_LABEL = {
  '*':            'Any',
  LISTENING_PORT: 'Listening port',
  PROCESS:        'Process',
}

function IdentificationRow({ label, children }) {
  return (
    <div className="info-row">
      <span className="info-key">{label}</span>
      <span className="info-val">{children}</span>
    </div>
  )
}

const CONN_TYPE_LABEL = {
  APPLICATION_FLOW: 'App flow',
  INCLUSION:        'Inclusion',
  TRAFFIC:          'Traffic',
}

const CONN_TYPE_CLS = {
  APPLICATION_FLOW: 'badge-sky',
  INCLUSION:        'badge-violet',
  TRAFFIC:          'badge-teal',
}

function OverviewTab({ pattern, statCards }) {
  const ciMappings      = pattern.ciMappings || []
  const extensions      = pattern.extensionSections || pattern.extensions || []
  const identifications = pattern.ndl?.identifications || []
  const connections     = pattern.ndl?.connections || []

  return (
    <div className="page-inner">

      {/* Stat strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {statCards.map(({ label, value }) => (
          <div key={label} className="stat-tile">
            <div className={`stat-val ${value === 0 ? 'zero' : ''}`}>{value}</div>
            <div className="stat-lbl">{label}</div>
          </div>
        ))}
      </div>

      {/* Description */}
      {pattern.description && (
        <Card title="Description">
          <p className="px-4 py-3 text-[13px] text-[#2A3A30] dark:text-[#93B5A5] leading-relaxed">
            {pattern.description}
          </p>
        </Card>
      )}

      {/* Identification Sections */}
      {identifications.length > 0 && (
        <Card title="Identification Sections" count={identifications.length}>
          <div className="card-divider divide-y">
            {identifications.map((ident, idx) => (
              <div key={idx} className="px-4 py-3 flex flex-col gap-0">
                {identifications.length > 1 && (
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[#0C9248] dark:text-[#17C068] text-[11px]">◈</span>
                    <span className="text-[12px] font-semibold text-[#131A15] dark:text-[#E0EAE4]">
                      {ident.name || `Section ${idx + 1}`}
                    </span>
                  </div>
                )}
                {ident.name && identifications.length === 1 && (
                  <IdentificationRow label="Name">{ident.name}</IdentificationRow>
                )}
                {ident.entryPointType && (
                  <IdentificationRow label="Entry point">
                    <span>{ENTRY_POINT_LABEL[ident.entryPointType] || ident.entryPointType}</span>
                    {ident.entryPointType !== (ENTRY_POINT_LABEL[ident.entryPointType] || '') && (
                      <span className="ml-1.5 font-mono text-[11px] text-[#8EA898] dark:text-[#6A9880]">({ident.entryPointType})</span>
                    )}
                  </IdentificationRow>
                )}
                {ident.processStrategy && (
                  <IdentificationRow label="Process search">
                    {STRATEGY_LABEL[ident.processStrategy] || ident.processStrategy}
                  </IdentificationRow>
                )}
                {ident.appliesToFamily && (
                  <IdentificationRow label="Applies to">
                    <Mono>{ident.appliesToFamily}</Mono>
                  </IdentificationRow>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Connections */}
      {connections.length > 0 && (
        <Card title="Connection Sections" count={connections.length}>
          <div className="card-divider divide-y">
            {connections.map((conn, ci) => (
              <div key={ci} className="px-4 py-3 flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-semibold text-[#131A15] dark:text-[#E0EAE4]">
                    {conn.name || `Connection ${ci + 1}`}
                  </span>
                  <span className="text-[10.5px] text-[#8EA898] dark:text-[#6A9880]">
                    {conn.stepCount} step{conn.stepCount !== 1 ? 's' : ''}
                  </span>
                </div>
                {conn.createConnections?.map((cc, j) => {
                  const typeCls   = CONN_TYPE_CLS[cc.connectionType] || 'badge-gray'
                  const typeLabel = CONN_TYPE_LABEL[cc.connectionType] || cc.connectionType
                  const staticAttrs = Object.entries(cc.attributes || {}).filter(([, v]) => v && !v.startsWith('$') && !v.startsWith('<'))
                  return (
                    <div key={j} className="flex flex-wrap items-start gap-2 pl-3 border-l-2 border-[#EBF0EC] dark:border-[#1E3028]">
                      <Badge cls={typeCls}>{typeLabel}</Badge>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px]">
                        <span className="text-[#8EA898] dark:text-[#6A9880]">→</span>
                        <Mono>{cc.targetCiType}</Mono>
                        {cc.entryPointType && (
                          <>
                            <span className="text-[#C8D4CE] dark:text-[#1E3028]">via</span>
                            <Mono>{cc.entryPointType}</Mono>
                          </>
                        )}
                        {staticAttrs.length > 0 && (
                          <span className="text-[#8EA898] dark:text-[#6A9880]">
                            · {staticAttrs.map(([k, v]) => `${k}=${v}`).join(', ')}
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Extension sections this pattern uses */}
      {extensions.length > 0 && (
        <Card title="Extension Sections" count={extensions.length}>
          <div className="card-divider divide-y">
            {extensions.map((e, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-2.5 border-l-2 border-transparent hover:border-orange-300 dark:hover:border-orange-700 transition-colors">
                <span className="text-orange-400 dark:text-orange-500 text-[11px] shrink-0">⬡</span>
                <span className="flex-1 text-[12.5px] text-orange-700 dark:text-orange-300">
                  {e.patternName || e.name || e.extension?.display_value || '—'}
                </span>
                {e.order !== undefined && e.order !== '' && (
                  <span className="text-[10.5px] text-orange-400 dark:text-orange-500">order {e.order}</span>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* CI Mappings */}
      <Card title="CI Mappings" count={ciMappings.length}>
        {ciMappings.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>CI Type</th>
                  <th className="w-24">Main CI</th>
                  <th>Deletion Strategy</th>
                </tr>
              </thead>
              <tbody>
                {ciMappings.map((ci, i) => {
                  const delLabel = ci.deletionStrategyLabel || ci.deletionStrategy || '—'
                  const delCls   = DEL_BADGE[delLabel] || 'badge-gray'
                  return (
                    <tr
                      key={ci.ciType + i}
                      className={ci.isMainCi ? 'bg-[#E6F6ED]/50 dark:bg-[rgba(23,192,104,0.06)]' : ''}
                    >
                      <td>
                        <div className="flex items-center gap-2">
                          <Mono>{ci.ciType || '—'}</Mono>
                          {ci.ciType?.startsWith('cmdb_ci_') && (
                            <span className="text-[9.5px] text-[#8EA898] dark:text-[#6A9880] px-1 py-0.5 bg-[#EBF0EC] dark:bg-[#182419] rounded">CMDB</span>
                          )}
                        </div>
                      </td>
                      <td>
                        {ci.isMainCi
                          ? <Badge cls="badge-indigo">main</Badge>
                          : <span className="text-[#C8D4CE] dark:text-[#1E3028]">—</span>
                        }
                      </td>
                      <td>
                        <Badge cls={delCls}>{delLabel}</Badge>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty icon="⬡" title="No CI mappings" detail="No sa_ci_to_pattern records for this pattern." />
        )}
      </Card>

      {/* Discovery probes (if any) */}
      {(pattern.discoveryProbes || []).length > 0 && (
        <Card title="Discovery Probes" count={pattern.discoveryProbes.length}>
          <div className="card-divider divide-y">
            {pattern.discoveryProbes.map((p, i) => {
              const name       = typeof p === 'string' ? p : (p.name || '—')
              const classifier = typeof p === 'object' ? (p.classifier || '') : ''
              const phase      = typeof p === 'object' ? (p.phase || '') : ''
              return (
                <div key={i} className="flex items-center gap-3 px-4 py-2.5">
                  <div className="flex-1 min-w-0">
                    <div className="text-[12.5px] font-medium text-[#131A15] dark:text-[#E0EAE4]">{name}</div>
                    {classifier && (
                      <div className="text-[11px] text-[#8EA898] dark:text-[#6A9880] mt-0.5">
                        Classifier: <Mono>{classifier}</Mono>
                      </div>
                    )}
                  </div>
                  {phase && (
                    <Badge cls="badge-teal shrink-0">{phase}</Badge>
                  )}
                </div>
              )
            })}
          </div>
        </Card>
      )}

    </div>
  )
}

/* ══ TABLES & RELATIONS ══════════════════════════════════════════════════════ */

function TablesRelationsTab({ pattern }) {
  const ndl    = pattern.ndl || {}
  const tables = ndl.tablesPopulated || []
  const rels   = ndl.relations       || []

  const [expandedTables, setExpandedTables] = useState(() => new Set())

  const toggleTable  = i => setExpandedTables(prev => {
    const next = new Set(prev)
    next.has(i) ? next.delete(i) : next.add(i)
    return next
  })

  const expandAll   = () => setExpandedTables(new Set(tables.map((_, i) => i)))
  const collapseAll = () => setExpandedTables(new Set())

  return (
    <div className="page-inner">

      {/* Tables Populated */}
      <Card title="Tables Populated" count={tables.length}>
        {tables.length === 0 ? (
          <Empty icon="🗄" title="No tables" detail="NDL parsing found no table writes for this pattern." />
        ) : (
          <>
            <div className="expand-bar">
              <button onClick={expandAll}   className="btn-ghost">expand all</button>
              <span className="text-[#C8D4CE] dark:text-[#1E3028]">·</span>
              <button onClick={collapseAll} className="btn-ghost-muted">collapse all</button>
            </div>
            <div className="p-3 flex flex-col gap-2">
              {tables.map((t, i) => {
                const isOpen     = expandedTables.has(i)
                const ttMeta     = TABLE_TYPE_META[t.tableType] || TABLE_TYPE_META.temp
                const borderCls  = TABLE_TYPE_BORDER[t.tableType]     || 'border-l-[3px] border-[#D4D1CA] dark:border-[#363A52]'
                const expandedBg = TABLE_TYPE_EXPANDED_BG[t.tableType] || 'bg-[#F9FAF9] dark:bg-[#182419]/40'
                const columns    = t.columns || t.explicitFields || []
                return (
                  <div key={t.table + i} className={`rounded-lg overflow-hidden border border-[#E0E6E2] dark:border-[#1E3028] ${borderCls}`}>
                    <button
                      onClick={() => toggleTable(i)}
                      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-[#F9FAF9] dark:hover:bg-white/[0.02] transition-colors text-left bg-white dark:bg-[#141E18]"
                    >
                      <span
                        className="text-[9px] text-[#8EA898] dark:text-[#6A9880]"
                        style={{
                          display: 'inline-block',
                          transform: isOpen ? 'none' : 'rotate(-90deg)',
                          transition: 'transform 0.15s',
                        }}
                      >▾</span>
                      <span className="text-[10.5px] text-[#8EA898] dark:text-[#6A9880] tabular-nums w-5 shrink-0 font-mono">{i + 1}.</span>
                      <Mono>{t.table}</Mono>
                      <Badge cls={ttMeta.badge}>{ttMeta.label}</Badge>
                      <span className="ml-auto text-[11px] text-[#8EA898] dark:text-[#6A9880] tabular-nums">
                        {columns.length} col{columns.length !== 1 ? 's' : ''}
                      </span>
                    </button>
                    {isOpen && (
                      <div className={`px-4 pb-3 pt-2.5 flex flex-col gap-2.5 ${expandedBg} border-t border-[#E0E6E2] dark:border-[#1E3028]`}>
                        {columns.length > 0 && (
                          <div>
                            <div className="label-xs mb-1.5">Columns</div>
                            <div className="flex flex-wrap gap-1.5">
                              {columns.map(f => (
                                <span
                                  key={f}
                                  className="font-mono text-[11px] px-2 py-0.5 bg-white dark:bg-[#141E18] border border-[#E0E6E2] dark:border-[#1E3028] rounded text-[#0C9248] dark:text-[#17C068]"
                                >
                                  {f}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                        {t.sourceTables?.length > 0 && (
                          <div>
                            <div className="label-xs mb-1.5">Source tables</div>
                            <div className="flex flex-wrap gap-1.5">
                              {t.sourceTables.map(s => (
                                <Mono key={s}>{s}</Mono>
                              ))}
                            </div>
                          </div>
                        )}
                        {!columns.length && !t.sourceTables?.length && (
                          <div className="text-[12px] text-[#8EA898] dark:text-[#6A9880]">No column detail available.</div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </>
        )}
      </Card>

      {/* Relations */}
      {rels.length > 0 && (
        <Card title="Relations" count={rels.length}>
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  {['Operation', 'Table 1', 'Key 1', 'Table 2', 'Key 2', 'Rel Type', 'Result'].map(h => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rels.map((r, i) => {
                  const opMeta = (r.type === 'relation_reference' && !r.refField)
                    ? { label: 'Relation', cls: 'badge-violet' }
                    : (OP_COLOR[r.type] || OP_COLOR.transform)
                  return (
                    <tr key={i}>
                      <td className="whitespace-nowrap">
                        <Badge cls={opMeta.cls}>{opMeta.label}</Badge>
                      </td>
                      <td><Mono>{r.table1 || '—'}</Mono></td>
                      <td className="text-[#8EA898] dark:text-[#6A9880]">{r.key1 || '—'}</td>
                      <td><Mono>{r.table2 || '—'}</Mono></td>
                      <td className="text-[#8EA898] dark:text-[#6A9880]">{r.key2 || '—'}</td>
                      <td className="text-[#131A15] dark:text-[#E0EAE4] font-medium">{r.relationshipType || r.relType || '—'}</td>
                      <td><Mono>{r.resultTable || '—'}</Mono></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

    </div>
  )
}

/* ══ NDL STEPS ═══════════════════════════════════════════════════════════════ */

function NdlStepsTab({ pattern }) {
  const ndl   = pattern.ndl || {}
  const steps = ndl.steps   || []

  const [expandedSteps, setExpandedSteps] = useState(() => new Set())

  const toggleStep       = i => setExpandedSteps(prev => {
    const next = new Set(prev)
    next.has(i) ? next.delete(i) : next.add(i)
    return next
  })
  const expandAllSteps   = () => setExpandedSteps(new Set(steps.map((_, i) => i)))
  const collapseAllSteps = () => setExpandedSteps(new Set())

  return (
    <div className="page-inner">

      <Card title="NDL Steps" count={steps.length}>
        {steps.length === 0 ? (
          <Empty icon="📋" title="No steps" detail="The NDL parser found no step blocks." />
        ) : (
          <>
            <div className="expand-bar">
              <button onClick={expandAllSteps}   className="btn-ghost">expand all</button>
              <span className="text-[#C8D4CE] dark:text-[#1E3028]">·</span>
              <button onClick={collapseAllSteps} className="btn-ghost-muted">collapse all</button>
            </div>
            <div className="card-divider divide-y">
              {steps.map((step, i) => {
                const isOpen  = expandedSteps.has(i)
                const opCount = step.operations?.length || 0
                return (
                  <div key={i}>
                    <button
                      onClick={() => toggleStep(i)}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[#F9FAF9] dark:hover:bg-white/[0.02] transition-colors text-left"
                    >
                      <span
                        className="text-[9px] text-[#8EA898] dark:text-[#6A9880]"
                        style={{
                          display: 'inline-block',
                          transform: isOpen ? 'none' : 'rotate(-90deg)',
                          transition: 'transform 0.15s',
                        }}
                      >▾</span>
                      <span className="text-[11px] text-[#8EA898] dark:text-[#6A9880] tabular-nums w-5 shrink-0">{i + 1}.</span>
                      <span className="text-[13px] font-medium text-[#131A15] dark:text-[#E0EAE4] flex-1 min-w-0 truncate">
                        {step.name || `Step ${i + 1}`}
                      </span>
                      {opCount > 0 ? (
                        <div className="flex items-center gap-1 shrink-0">
                          {[...new Set(step.operations.map(o => o.type))].map(t => (
                            <span key={t} className="w-2 h-2 rounded-full" style={{ background: OP_COLOR[t]?.dot }} title={OP_COLOR[t]?.label} />
                          ))}
                          <span className="text-[10.5px] text-[#8EA898] dark:text-[#6A9880] ml-1">{opCount} op{opCount !== 1 ? 's' : ''}</span>
                        </div>
                      ) : (
                        <span className="text-[10.5px] text-[#C8D4CE] dark:text-[#1E3028] shrink-0">no ops</span>
                      )}
                    </button>
                    {isOpen && opCount > 0 && (
                      <div className="px-4 pb-3 flex flex-col gap-2 bg-[#F9FAF9] dark:bg-[#182419]/40">
                        {step.operations.map((op, j) => (
                          <StepOperation key={j} op={op} />
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </>
        )}
      </Card>

    </div>
  )
}

function OpDetail({ op }) {
  const g     = 'text-[#8EA898] dark:text-[#6A9880]'
  const arrow = <span className={g}>→</span>
  const plus  = <span className={g}>+</span>

  if (op.type === 'transform') return (
    <div className="flex flex-wrap items-center gap-1.5 text-[11.5px] text-[#2A3A30] dark:text-[#93B5A5] mt-1">
      {op.srcTable && <><Mono>{op.srcTable}</Mono>{arrow}</>}
      {op.targetTable && <Mono>{op.targetTable}</Mono>}
      {op.setFields?.length > 0 && (
        <span className={g}>· {op.setFields.join(', ')}</span>
      )}
    </div>
  )

  if (op.type === 'relation_reference' || op.type === 'create_relation') return (
    <div className="flex flex-wrap items-center gap-1.5 text-[11.5px] mt-1">
      {op.table1 && <Mono>{op.table1}</Mono>}
      {op.key1 && <span className={g}>({op.key1})</span>}
      {plus}
      {op.table2 && <Mono>{op.table2}</Mono>}
      {op.key2 && <span className={g}>({op.key2})</span>}
      {op.relType && <>{arrow}<span className="text-[#0C9248] dark:text-[#17C068] font-medium">{op.relType}</span></>}
      {op.resultTable && <>{arrow}<Mono>{op.resultTable}</Mono></>}
    </div>
  )

  if (op.type === 'custom_operation') return (
    <div className="flex flex-wrap items-center gap-1.5 text-[11.5px] mt-1 text-[#2A3A30] dark:text-[#93B5A5]">
      {op.targetTable && <><span className={g}>target:</span><Mono>{op.targetTable}</Mono></>}
    </div>
  )

  if (op.type === 'filter') return (
    <div className="flex flex-wrap items-center gap-1.5 text-[11.5px] mt-1 text-[#2A3A30] dark:text-[#93B5A5]">
      {op.srcTable && <><Mono>{op.srcTable}</Mono>{arrow}</>}
      {op.targetTable && <Mono>{op.targetTable}</Mono>}
    </div>
  )

  if (op.type === 'merge' || op.type === 'union') return (
    <div className="flex flex-wrap items-center gap-1.5 text-[11.5px] mt-1 text-[#2A3A30] dark:text-[#93B5A5]">
      {op.table1 && <Mono>{op.table1}</Mono>}
      {plus}
      {op.table2 && <Mono>{op.table2}</Mono>}
      {op.resultTable && <>{arrow}<Mono>{op.resultTable}</Mono></>}
    </div>
  )

  if (op.type === 'set_attr') return (
    <div className="flex flex-wrap items-center gap-1.5 text-[11.5px] mt-1 text-[#2A3A30] dark:text-[#93B5A5]">
      {op.attr && <Mono>{op.attr}</Mono>}
    </div>
  )

  if (op.type === 'match') return (
    <div className="flex flex-wrap items-center gap-1.5 text-[11.5px] mt-1 text-[#2A3A30] dark:text-[#93B5A5]">
      {op.srcTable && <><Mono>{op.srcTable}</Mono>{arrow}</>}
      {op.targetTable && <Mono>{op.targetTable}</Mono>}
    </div>
  )

  if (op.type === 'runcmd_to_var' && op.command) return (
    <div className="text-[11px] mt-1 font-mono text-[#8EA898] dark:text-[#6A9880] truncate">{op.command}</div>
  )

  if (op.srcVar || op.srcTable) return (
    <div className="flex flex-wrap items-center gap-1.5 text-[11.5px] mt-1 text-[#2A3A30] dark:text-[#93B5A5]">
      {(op.srcVar || op.srcTable) && <Mono>{op.srcVar || op.srcTable}</Mono>}
    </div>
  )

  return null
}

function StepOperation({ op }) {
  const meta = OP_COLOR[op.type] || { dot: '#94a3b8', label: op.type, cls: 'badge-slate' }

  return (
    <div className="flex gap-3 text-[12px]">
      <span className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{ background: meta.dot }} />
      <div className="flex-1 min-w-0">
        <Badge cls={`${meta.cls} mb-1`}>{meta.label}</Badge>
        <OpDetail op={op} />
      </div>
    </div>
  )
}

/* ══ SENSORS ═════════════════════════════════════════════════════════════════ */

function SensorsTab({ pattern }) {
  const scripts = pattern.prepostScripts || []
  const pre     = scripts.filter(s => s.phase === 'pre')
  const post    = scripts.filter(s => s.phase === 'post')
  const other   = scripts.filter(s => s.phase !== 'pre' && s.phase !== 'post')

  if (scripts.length === 0) {
    return (
      <div className="page-inner">
        <Card>
          <Empty
            icon="📡"
            title="No sensor scripts"
            detail="This pattern has no pre/post sensor scripts (sa_pattern_prepost_script records)."
          />
        </Card>
      </div>
    )
  }

  return (
    <div className="page-inner">
      {pre.length > 0 && (
        <ScriptGroup
          title="Pre-sensors"
          subtitle="Modify the discovery payload before it is processed by the Identification Engine (IRE)"
          scripts={pre}
          phaseColor="badge-red"
          phaseLabel="pre"
        />
      )}
      {post.length > 0 && (
        <ScriptGroup
          title="Post-sensors"
          subtitle="Act on IRE results — update CIs, add missing attributes, handle edge cases"
          scripts={post}
          phaseColor="badge-green"
          phaseLabel="post"
        />
      )}
      {other.length > 0 && (
        <ScriptGroup
          title="Other scripts"
          subtitle=""
          scripts={other}
          phaseColor="badge-gray"
          phaseLabel=""
        />
      )}
    </div>
  )
}

function ScriptGroup({ title, subtitle, scripts, phaseColor, phaseLabel }) {
  return (
    <Card title={title} count={scripts.length}>
      {subtitle && (
        <div className="px-4 py-2 text-[11.5px] text-[#2A3A30] dark:text-[#93B5A5] border-b border-[#E0E6E2] dark:border-[#1E3028] bg-[#F9FAF9] dark:bg-[#182419]/40">
          {subtitle}
        </div>
      )}
      <div className="card-divider divide-y">
        {scripts.map((s, i) => (
          <ScriptCard key={i} script={s} phaseColor={phaseColor} phaseLabel={phaseLabel} />
        ))}
      </div>
    </Card>
  )
}

function ScriptCard({ script: s, phaseColor, phaseLabel }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div>
      <div className="flex items-center gap-3 px-4 py-3">
        <Badge cls={phaseColor}>{phaseLabel || s.phase}</Badge>
        <span className="text-[13px] font-semibold text-[#131A15] dark:text-[#E0EAE4] flex-1 min-w-0 truncate">
          {s.name || 'Unnamed script'}
        </span>
        <div className="flex items-center gap-2 shrink-0">
          {!s.active && <Badge cls="badge-gray">inactive</Badge>}
          {s.executionLabel && (
            <span className="text-[10.5px] text-[#8EA898] dark:text-[#6A9880]">
              {s.executionLabel}
            </span>
          )}
          <span className="text-[10.5px] text-[#8EA898] dark:text-[#6A9880]">order {s.order}</span>
          <button
            onClick={() => setExpanded(e => !e)}
            className="btn-ghost"
          >
            {expanded ? 'hide' : 'show'}
          </button>
        </div>
      </div>
      {expanded && s.script && (
        <div className="px-4 pb-4">
          <pre className="code-pre">{s.script}</pre>
        </div>
      )}
      {expanded && !s.script && (
        <div className="px-4 pb-4 text-[12px] text-[#8EA898] dark:text-[#6A9880]">No script body.</div>
      )}
    </div>
  )
}

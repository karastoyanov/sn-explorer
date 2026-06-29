import { useState, useEffect } from 'react'
import { discoveryApi } from '../../../api/client'

/* ── Status colour map ────────────────────────────────────────────────────── */
const MID_STATUS_BADGE = {
  Up:        'badge-green',
  Down:      'badge-red',
  Upgrading: 'badge-amber',
  Testing:   'badge-sky',
  Stopped:   'badge-slate',
  Purged:    'badge-slate',
}
const RUN_STATE_BADGE = {
  Complete:    'badge-green',
  'Completed': 'badge-green',
  Running:     'badge-sky',
  'In Progress': 'badge-sky',
  Cancelled:   'badge-slate',
  Error:       'badge-red',
  Partial:     'badge-amber',
}
const CI_STATE_BADGE = {
  Created:  'badge-teal',
  Updated:  'badge-sky',
  Deleted:  'badge-red',
  Unchanged:'badge-slate',
}

const MID_STATUS_DOT = {
  Up:        '#16A34A',
  Down:      '#DC2626',
  Upgrading: '#D97706',
  Testing:   '#0EA5E9',
  Stopped:   '#6B7280',
  Purged:    '#6B7280',
}

/* ── CI table → human label ───────────────────────────────────────────────── */
const CI_TABLE_LABEL = {
  cmdb_ci_linux_server:     'Linux Server',
  cmdb_ci_win_server:       'Windows Server',
  cmdb_ci_solaris_server:   'Solaris Server',
  cmdb_ci_app_server_tomcat:'Tomcat',
  cmdb_ci_app_server_jboss: 'JBoss',
  cmdb_ci_web_server_apache:'Apache',
  cmdb_ci_web_server_iis:   'IIS',
  cmdb_ci_computer:         'Computer',
  cmdb_ci_network_adapter:  'Network Adapter',
  cmdb_ci_ip_address:       'IP Address',
  cmdb_ci_db_ora:           'Oracle DB',
  cmdb_ci_db_mssql:         'MSSQL DB',
  cmdb_ci_db_mysql:         'MySQL DB',
}

const CI_TABLE_COLOR = {
  cmdb_ci_linux_server:      '#34D399',
  cmdb_ci_win_server:        '#60A5FA',
  cmdb_ci_solaris_server:    '#A78BFA',
  cmdb_ci_app_server_tomcat: '#FB923C',
  cmdb_ci_app_server_jboss:  '#F472B6',
  cmdb_ci_web_server_apache: '#FCD34D',
  cmdb_ci_web_server_iis:    '#93C5FD',
  cmdb_ci_computer:          '#6EE7B7',
  cmdb_ci_network_adapter:   '#94A3B8',
  cmdb_ci_ip_address:        '#CBD5E1',
  cmdb_ci_db_ora:            '#F87171',
  cmdb_ci_db_mssql:          '#7DD3FC',
  cmdb_ci_db_mysql:          '#86EFAC',
}

/* ── Field label prettifier ───────────────────────────────────────────────── */
const FIELD_LABELS = {
  host_name:         'Hostname',
  fqdn:              'FQDN',
  os:                'OS',
  os_version:        'OS Version',
  os_service_pack:   'Service Pack',
  cpu_count:         'CPU Count',
  cpu_speed:         'CPU Speed',
  cpu_type:          'CPU Type',
  ram:               'RAM (MB)',
  disk_space:        'Disk (GB)',
  running_processes: 'Processes',
  version:           'Version',
  install_directory: 'Install Dir',
  config_file:       'Config File',
  jvm_type:          'JVM Type',
  jvm_version:       'JVM Version',
  mac_address:       'MAC Address',
  netmask:           'Netmask',
  ip_default_gateway:'Gateway',
  ip_address:        'IP Address',
  nic:               'NIC',
  port:              'Port',
}

function fieldLabel(key) {
  return FIELD_LABELS[key] || key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

/* ── Sub-components ───────────────────────────────────────────────────────── */

function StatBox({ label, value, accent }) {
  return (
    <div className="flex flex-col items-center justify-center py-4 px-3 rounded-xl bg-[#F6FAF8] dark:bg-[rgba(255,255,255,0.03)] border border-[#E0EAE4] dark:border-[#1A2C22]">
      <span
        className="text-[22px] font-bold tabular-nums leading-none mb-1"
        style={{ color: accent || '#0A8040' }}
      >
        {value ?? '—'}
      </span>
      <span className="text-[10.5px] uppercase tracking-wide text-[#506458] dark:text-[#4A6858] font-medium text-center">{label}</span>
    </div>
  )
}

function MidServerCard({ data }) {
  const dot   = MID_STATUS_DOT[data.status] || '#6B7280'
  const badge = MID_STATUS_BADGE[data.status] || 'badge-slate'

  return (
    <div className="card p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full" style={{ background: dot }} />
          <h3 className="text-[13.5px] font-semibold text-[#111A14] dark:text-[#E2ECE6]">{data.name}</h3>
        </div>
        <div className="flex items-center gap-1.5">
          <span className={`badge ${badge}`}>{data.status || 'Unknown'}</span>
          {data.validated && <span className="badge badge-teal">Validated</span>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-[12px]">
        {[
          ['IP Address',    data.ipAddress],
          ['Hostname',      data.hostName],
          ['Version',       data.version],
          ['Pool',          data.pool],
          ['Started',       data.started],
          ['Last Refreshed',data.lastRefreshed],
        ].map(([label, val]) => val ? (
          <div key={label} className="flex gap-2">
            <span className="text-[#506458] dark:text-[#4A6858] shrink-0 w-24">{label}</span>
            <span className="text-[#1E3028] dark:text-[#A8C4B8] font-medium truncate">{val}</span>
          </div>
        ) : null)}
      </div>
    </div>
  )
}

function ScheduleCard({ data }) {
  return (
    <div className="card p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[13.5px] font-semibold text-[#111A14] dark:text-[#E2ECE6]">{data.name}</h3>
        <div className="flex items-center gap-1.5">
          <span className={`badge ${data.active ? 'badge-green' : 'badge-slate'}`}>
            {data.active ? 'Active' : 'Inactive'}
          </span>
          {data.discoveryType && <span className="badge badge-indigo">{data.discoveryType}</span>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-[12px]">
        {[
          ['Run Time',  data.runTime],
          ['MID Server',data.midServer],
          ['Discover',  data.discover],
        ].map(([label, val]) => val ? (
          <div key={label} className="flex gap-2">
            <span className="text-[#506458] dark:text-[#4A6858] shrink-0 w-20">{label}</span>
            <span className="text-[#1E3028] dark:text-[#A8C4B8] font-medium">{val}</span>
          </div>
        ) : null)}
      </div>

      {data.ipRanges?.length > 0 && (
        <div>
          <div className="label-xs mb-1.5">IP Ranges ({data.ipRanges.length})</div>
          <div className="flex flex-wrap gap-1.5">
            {data.ipRanges.map((r, i) => (
              <span key={i} className="mono text-[11px] px-2 py-0.5 rounded bg-[#E8F2EC] dark:bg-[rgba(23,192,104,0.08)] text-[#0A5A30] dark:text-[#3DC878]">
                {r.range || r.name}
                {r.type && r.type !== r.range && (
                  <span className="opacity-60 ml-1">({r.type})</span>
                )}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function RunSummaryCard({ data }) {
  const badge = RUN_STATE_BADGE[data.state] || 'badge-slate'

  return (
    <div className="card p-5 flex flex-col gap-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <span className="mono text-[15px] font-bold text-[#111A14] dark:text-[#E2ECE6]">{data.number}</span>
          <span className={`badge ${badge}`}>{data.state}</span>
          {data.phase && data.phase !== data.state && (
            <span className="text-[11.5px] text-[#506458] dark:text-[#4A6858]">Phase: {data.phase}</span>
          )}
        </div>
        <div className="text-[11.5px] text-[#506458] dark:text-[#4A6858] tabular-nums">
          {data.startTime && <span>{data.startTime}</span>}
          {data.startTime && data.endTime && <span className="mx-1 opacity-50">→</span>}
          {data.endTime && <span>{data.endTime}</span>}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <StatBox label="Started"   value={data.started}   accent="#0A8040" />
        <StatBox label="Completed" value={data.completed} accent="#0891B2" />
        <StatBox label="Progress"  value={data.progress != null ? `${data.progress}%` : '—'} accent="#7C3AED" />
        <StatBox label="Discover"  value={data.discover}  accent="#506458" />
      </div>
    </div>
  )
}

function CICard({ ci }) {
  const [expanded, setExpanded] = useState(false)
  const tableLabel = CI_TABLE_LABEL[ci.ciTable] || ci.ciTable
  const dotColor   = CI_TABLE_COLOR[ci.ciTable] || '#94A3B8'
  const stateBadge = CI_STATE_BADGE[ci.state] || 'badge-slate'
  const details    = ci.classDetails || {}
  const relations  = ci.relations || []

  return (
    <div className="card overflow-hidden">
      <button
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-[#F0F5F2] dark:hover:bg-white/[0.025] transition-colors"
        onClick={() => setExpanded(e => !e)}
      >
        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: dotColor }} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[13px] font-semibold text-[#111A14] dark:text-[#E2ECE6] truncate">{ci.name || ci.sysId}</span>
            <span className={`badge ${stateBadge}`}>{ci.state}</span>
          </div>
          <div className="flex items-center gap-3 mt-0.5 text-[11.5px] text-[#506458] dark:text-[#4A6858]">
            <span className="font-medium" style={{ color: dotColor }}>{tableLabel}</span>
            {ci.ipAddress && <span className="mono">{ci.ipAddress}</span>}
            {ci.fqdn && ci.fqdn !== ci.ipAddress && <span className="mono opacity-70">{ci.fqdn}</span>}
          </div>
        </div>
        <span
          className="text-[11px] text-[#506458] dark:text-[#4A6858] shrink-0 transition-transform duration-150"
          style={{ transform: expanded ? 'rotate(180deg)' : 'none', display: 'inline-block' }}
        >
          ▾
        </span>
      </button>

      {expanded && (
        <div className="border-t border-[#E6EDEA] dark:border-[#1A2C22] px-4 pt-3 pb-4 flex flex-col gap-4">

          {/* Base attributes */}
          <div>
            <div className="label-xs mb-2">Base Attributes</div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-1.5 text-[12px]">
              {[
                ['CI Table',        ci.ciTable],
                ['Install Status',  ci.installStatus],
                ['Discovery Source',ci.discoverySource],
                ['Last Discovered', ci.lastDiscovered],
                ['Serial Number',   ci.serialNumber],
                ['Manufacturer',    ci.manufacturer],
                ['Model',           ci.model],
                ['Location',        ci.location],
                ['Asset Tag',       ci.assetTag],
              ].filter(([, v]) => v).map(([label, val]) => (
                <div key={label} className="flex flex-col gap-0.5">
                  <span className="text-[10.5px] uppercase tracking-wide text-[#506458] dark:text-[#4A6858]">{label}</span>
                  <span className="text-[#1E3028] dark:text-[#A8C4B8] font-medium">{val}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Class-specific details */}
          {Object.keys(details).length > 0 && (
            <div>
              <div className="label-xs mb-2">
                {tableLabel} Details
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-1.5 text-[12px]">
                {Object.entries(details).map(([key, val]) => (
                  <div key={key} className="flex flex-col gap-0.5">
                    <span className="text-[10.5px] uppercase tracking-wide text-[#506458] dark:text-[#4A6858]">{fieldLabel(key)}</span>
                    <span className="text-[#1E3028] dark:text-[#A8C4B8] font-medium truncate" title={val}>{val}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Relations */}
          {relations.length > 0 && (
            <div>
              <div className="label-xs mb-2">Relations ({relations.length})</div>
              <div className="flex flex-col gap-1.5">
                {relations.map((rel, i) => (
                  <div key={i} className="flex items-center gap-2 text-[12px]">
                    <span
                      className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                      style={{
                        background: rel.direction === 'outbound'
                          ? 'rgba(10,128,64,0.12)'
                          : 'rgba(124,58,237,0.12)',
                        color: rel.direction === 'outbound'
                          ? '#0A5A2C'
                          : '#5B1ED9',
                      }}
                    >
                      {rel.direction === 'outbound' ? '→' : '←'} {rel.relType}
                    </span>
                    <span className="text-[#1E3028] dark:text-[#A8C4B8] font-medium truncate">{rel.ciName || rel.ciSysId}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function stripHtml(raw) {
  if (!raw) return ''
  const tmp = document.createElement('div')
  tmp.innerHTML = raw
  return tmp.textContent || tmp.innerText || ''
}

function LogPanel({ logs }) {
  const [open, setOpen]     = useState(false)
  const [search, setSearch] = useState('')
  if (!logs?.length) return null

  const levelColor = {
    Error:   '#FCA5A5',
    Warning: '#FCD34D',
    Info:    '#A8C4B8',
    Debug:   '#4A6858',
  }

  const q        = search.trim().toLowerCase()
  const filtered = q
    ? logs.filter(l =>
        stripHtml(l.message).toLowerCase().includes(q) ||
        l.source?.toLowerCase().includes(q) ||
        l.level?.toLowerCase().includes(q)
      )
    : logs

  return (
    <div className="card overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-5 py-3 hover:bg-[#F0F5F2] dark:hover:bg-white/[0.025] transition-colors"
        onClick={() => setOpen(o => !o)}
      >
        <span className="text-[12.5px] font-semibold text-[#111A14] dark:text-[#E2ECE6]">
          Discovery Log Messages ({logs.length})
        </span>
        <span
          className="text-[11px] text-[#506458] transition-transform duration-150"
          style={{ transform: open ? 'rotate(180deg)' : 'none', display: 'inline-block' }}
        >
          ▾
        </span>
      </button>

      {open && (
        <>
          {/* Search bar */}
          <div className="px-4 py-2 border-t border-[#E6EDEA] dark:border-[#1A2C22] flex items-center gap-2">
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" className="text-[#7A9A8C] dark:text-[#3A5848] shrink-0">
              <circle cx="6.5" cy="6.5" r="5" stroke="currentColor" strokeWidth="1.5"/>
              <path d="M10 10l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Filter by message, source or level…"
              className="flex-1 bg-transparent text-[12px] text-[#1E3028] dark:text-[#A8C4B8] placeholder-[#7A9A8C] dark:placeholder-[#3A5848] outline-none"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="text-[11px] text-[#506458] dark:text-[#4A6858] hover:text-[#1E3028] dark:hover:text-[#A8C4B8]"
              >
                ✕
              </button>
            )}
            {q && (
              <span className="text-[10.5px] text-[#506458] dark:text-[#4A6858] shrink-0">
                {filtered.length} / {logs.length}
              </span>
            )}
          </div>

          {/* Log rows */}
          <div className="overflow-auto max-h-72">
            {filtered.length === 0 && (
              <div className="px-5 py-3 text-[12px] text-[#506458] dark:text-[#4A6858]">No messages match.</div>
            )}
            {filtered.map((log, i) => (
              <div
                key={i}
                className="flex gap-3 px-5 py-1.5 border-b border-[#EBF0EC] dark:border-[#1A2C22] last:border-0 text-[11.5px]"
              >
                <span
                  className="shrink-0 font-medium w-14"
                  style={{ color: levelColor[log.level] || '#A8C4B8' }}
                >
                  {log.level}
                </span>
                <span className="text-[#506458] dark:text-[#4A6858] shrink-0 w-32 tabular-nums">
                  {log.timestamp?.slice(0, 19)}
                </span>
                <span className="text-[#1E3028] dark:text-[#A8C4B8]">{stripHtml(log.message)}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

/* ── Page ─────────────────────────────────────────────────────────────────── */

export default function DiscoveryRunsPage() {
  const [data, setData]       = useState(null)
  const [error, setError]     = useState(null)
  const [tableFilter, setTableFilter] = useState('All')

  useEffect(() => {
    discoveryApi.getRuns()
      .then(setData)
      .catch(err => setError(err.message))
  }, [])

  if (error) {
    return (
      <div className="page">
        <div className="page-hdr"><h1 className="page-title">Discovery Logs</h1></div>
        <div className="page-body"><div className="page-inner">
          <div className="card p-5">
            <div className="label-xs text-[#831414] mb-1">Error loading data</div>
            <p className="text-[12.5px] text-[#1E3028] dark:text-[#A8C4B8]">{error}</p>
            <p className="text-[12px] text-[#506458] dark:text-[#4A6858] mt-2">
              Run: <span className="mono">python scripts/extract_discovery_logs.py --url ... --user ...</span>
            </p>
          </div>
        </div></div>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="page">
        <div className="page-hdr"><h1 className="page-title">Discovery Logs</h1></div>
        <div className="page-body"><div className="page-inner">
          <div className="text-[13px] text-[#506458] dark:text-[#4A6858]">Loading…</div>
        </div></div>
      </div>
    )
  }

  const { meta, midServer, schedule, latestRun } = data
  const cis = latestRun?.discoveredCIs || []

  const byTable     = cis.reduce((acc, ci) => {
    const t = ci.ciTable || 'cmdb_ci'
    if (!acc[t]) acc[t] = []
    acc[t].push(ci)
    return acc
  }, {})

  const filteredCIs = tableFilter === 'All' ? cis : cis.filter(ci => (ci.ciTable || 'cmdb_ci') === tableFilter)

  const noData = !midServer?.found && !schedule?.found
  // reset filter if data changes and current filter no longer exists
  if (tableFilter !== 'All' && cis.length > 0 && !byTable[tableFilter]) setTableFilter('All')

  if (noData) {
    return (
      <div className="page">
        <div className="page-hdr"><h1 className="page-title">Discovery Logs</h1></div>
        <div className="page-body"><div className="page-inner">
          <div className="card p-5 flex flex-col gap-2">
            <div className="label-xs">No data found</div>
            <p className="text-[12.5px] text-[#1E3028] dark:text-[#A8C4B8]">
              The sync file is missing or empty. Run the extraction script to populate it.
            </p>
            <p className="mono text-[11.5px] text-[#506458] dark:text-[#4A6858] mt-1">
              python scripts/extract_discovery_logs.py --url https://&lt;instance&gt;.service-now.com --user admin
            </p>
          </div>
        </div></div>
      </div>
    )
  }


  return (
    <div className="page">
      <div className="page-hdr">
        <h1 className="page-title">Discovery Logs</h1>
        <p className="page-sub">
          {meta?.scheduleName} · {meta?.midServerName}
          {meta?.extractedAt && (
            <span className="ml-2 opacity-60">
              synced {meta.extractedAt.slice(0, 10)}
            </span>
          )}
        </p>
      </div>

      <div className="page-body">
        <div className="page-inner">

          {/* MID Server + Schedule */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {midServer?.found !== false && <MidServerCard data={midServer} />}
            {schedule?.found  !== false && <ScheduleCard  data={schedule} />}
          </div>

          {/* Latest Run Summary */}
          {latestRun?.found !== false && latestRun?.number && (
            <RunSummaryCard data={latestRun} />
          )}

          {/* Discovered CIs */}
          {cis.length > 0 && (
            <div className="flex flex-col gap-3">
              {/* Filter bar */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="label-xs shrink-0">Filter:</span>
                <button
                  onClick={() => setTableFilter('All')}
                  className={`text-[11.5px] px-2.5 py-1 rounded-full border font-medium transition-colors duration-100 ${
                    tableFilter === 'All'
                      ? 'bg-[#111A14] dark:bg-[#E2ECE6] text-[#F2F4F3] dark:text-[#111A14] border-transparent'
                      : 'border-[#D8E2DC] dark:border-[#1A2C22] text-[#506458] dark:text-[#4A6858] hover:border-[#A0B8A8] dark:hover:border-[#2A3E34]'
                  }`}
                >
                  All ({cis.length})
                </button>
                {Object.entries(byTable).map(([table, items]) => {
                  const isActive = tableFilter === table
                  const color    = CI_TABLE_COLOR[table] || '#94A3B8'
                  return (
                    <button
                      key={table}
                      onClick={() => setTableFilter(isActive ? 'All' : table)}
                      className={`flex items-center gap-1.5 text-[11.5px] px-2.5 py-1 rounded-full border font-medium transition-colors duration-100 ${
                        isActive
                          ? 'border-transparent text-[#111A14] dark:text-[#0B1410]'
                          : 'border-[#D8E2DC] dark:border-[#1A2C22] text-[#506458] dark:text-[#4A6858] hover:border-[#A0B8A8] dark:hover:border-[#2A3E34]'
                      }`}
                      style={isActive ? { background: color } : {}}
                    >
                      <span
                        className="w-1.5 h-1.5 rounded-full shrink-0"
                        style={{ background: isActive ? 'rgba(0,0,0,0.35)' : color }}
                      />
                      {CI_TABLE_LABEL[table] || table} ({items.length})
                    </button>
                  )
                })}
              </div>

              {/* CI list */}
              <div className="flex flex-col gap-2">
                {filteredCIs.map((ci, i) => (
                  <CICard key={ci.sysId || i} ci={ci} />
                ))}
              </div>
            </div>
          )}

          {cis.length === 0 && latestRun?.found !== false && latestRun?.number && (
            <div className="card p-5">
              <div className="label-xs mb-1">No CIs in this run</div>
              <p className="text-[12.5px] text-[#506458] dark:text-[#4A6858]">
                The <span className="mono">discovery_log_ci</span> table returned no records for{' '}
                <span className="mono">{latestRun.number}</span>.
                This can happen when the run has not completed yet, or when the table name differs
                on your instance. Check your instance's Discovery Status record directly.
              </p>
            </div>
          )}

          {/* Log Messages */}
          <LogPanel logs={latestRun?.logs} />

        </div>
      </div>
    </div>
  )
}

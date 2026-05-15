import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { discoveryApi } from '../../../api/client'

const CAT_META = {
  Application:    { color: '#34D399', icon: '⬡' },
  Cloud:          { color: '#60A5FA', icon: '☁' },
  Infrastructure: { color: '#94A3B8', icon: '◉' },
  Library:        { color: '#A78BFA', icon: '⬢' },
  Other:          { color: '#6B7280', icon: '○' },
}

const DT_META = {
  Horizontal: { color: '#0d9488', bg: 'bg-teal-50 dark:bg-teal-950/40',   text: 'text-teal-700 dark:text-teal-300',   border: 'border-teal-200 dark:border-teal-800/60' },
  'Top-Down': { color: '#d97706', bg: 'bg-amber-50 dark:bg-amber-950/40', text: 'text-amber-700 dark:text-amber-300', border: 'border-amber-200 dark:border-amber-800/60' },
}

function StatBar({ value, max, color }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  return (
    <div className="h-1.5 rounded-full bg-[#DCF0E6] dark:bg-[#1E3028] overflow-hidden">
      <div
        className="h-full rounded-full transition-all duration-700"
        style={{ width: `${pct}%`, background: color }}
      />
    </div>
  )
}

export default function Welcome() {
  const [stats, setStats] = useState(null)

  useEffect(() => {
    discoveryApi.getStats().then(setStats).catch(console.error)
  }, [])

  const byCategory    = stats?.byCategory     || {}
  const byDiscovery   = stats?.byDiscoveryType || {}
  const totalPatterns = stats?.totalPatterns   || 0
  const maxCat        = Math.max(...Object.values(byCategory), 1)

  return (
    <div className="page">

      {/* Header */}
      <div className="page-hdr">
        <h1 className="page-title">ServiceNow Discovery Explorer</h1>
        <p className="page-sub">
          Reference for Discovery &amp; Service Mapping patterns — NDL structure, CI relationships, sensors, and more
        </p>
      </div>

      {/* Content */}
      <div className="page-body">
        <div className="page-inner">

          {/* Hero stat */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <div className="col-span-2 sm:col-span-1 bg-gradient-to-br from-[#0C9248] to-[#17C068] rounded-xl p-5 text-white flex flex-col justify-between">
              <div className="text-[11px] font-semibold uppercase tracking-widest opacity-80">Total Patterns</div>
              <div>
                <div className="text-5xl font-bold mt-2">
                  {totalPatterns > 0 ? totalPatterns.toLocaleString() : '—'}
                </div>
                <div className="text-[12px] opacity-70 mt-1">across all scopes and types</div>
              </div>
            </div>

            {/* Discovery type breakdown */}
            <div className="col-span-2 grid grid-cols-2 gap-3 sm:gap-4">
              {Object.entries(byDiscovery).map(([dt, count]) => {
                const m = DT_META[dt] || DT_META['Horizontal']
                return (
                  <div key={dt} className={`rounded-xl border p-4 ${m.bg} ${m.border}`}>
                    <div className={`text-[10px] font-semibold uppercase tracking-widest ${m.text} opacity-70`}>
                      {dt} Discovery
                    </div>
                    <div className={`text-3xl font-bold mt-1 ${m.text}`}>{count.toLocaleString()}</div>
                    <div className={`text-[11px] mt-1 ${m.text} opacity-60`}>
                      {totalPatterns > 0 ? Math.round((count / totalPatterns) * 100) : 0}% of patterns
                    </div>
                  </div>
                )
              })}
              {Object.keys(byDiscovery).length === 0 && [1, 2].map(i => (
                <div key={i} className="rounded-xl border border-[#E0E6E2] dark:border-[#1E3028] p-4 animate-pulse bg-[#E6F6ED] dark:bg-[#182419]" />
              ))}
            </div>
          </div>

          {/* By category */}
          <div className="card">
            <div className="card-hdr">Patterns by Type</div>
            <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
              {Object.entries(CAT_META).filter(([cat]) => byCategory[cat] > 0).map(([cat, m]) => {
                const count = byCategory[cat] || 0
                return (
                  <div key={cat} className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-base" style={{ color: m.color }}>{m.icon}</span>
                        <span className="text-[13px] font-medium text-[#131A15] dark:text-[#E0EAE4]">{cat}</span>
                      </div>
                      <span className="text-[13px] font-semibold text-[#131A15] dark:text-[#E0EAE4]">{count.toLocaleString()}</span>
                    </div>
                    <StatBar value={count} max={maxCat} color={m.color} />
                  </div>
                )
              })}
              {Object.keys(byCategory).length === 0 && (
                <div className="col-span-2 py-6 text-center text-[13px] text-[#8EA898] dark:text-[#6A9880]">Loading…</div>
              )}
            </div>
          </div>

          {/* Concept cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              {
                title: 'Horizontal Discovery',
                desc:  'Scans and identifies host-level infrastructure CIs — servers, network devices, cloud instances, containers. Runs first and provides the foundation for vertical patterns.',
                pill: { label: 'Infrastructure · Cloud · Network', cls: 'bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300' },
              },
              {
                title: 'Vertical (Application) Discovery',
                desc:  'Runs on top of an identified host to discover application-layer CIs — databases, web servers, middleware, app servers. Requires a horizontal pattern to have run first.',
                pill: { label: 'Application · DB · Web · Middleware', cls: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300' },
              },
              {
                title: 'NDL — Neebula Discovery Language',
                desc:  'The DSL that defines what a pattern does: which temp tables to populate, what transform steps write to CMDB, how relations between CIs are created.',
                pill: { label: 'Steps · Transforms · Relations', cls: 'bg-violet-50 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300' },
              },
              {
                title: 'Pre / Post Sensor Scripts',
                desc:  'JavaScript that fires around the IRE (Identification & Reconciliation Engine). Pre-sensors modify the discovery payload before IRE processes it; post-sensors act on IRE results.',
                pill: { label: 'Pre-sensor · IRE · Post-sensor', cls: 'bg-[#E6F6ED] dark:bg-[rgba(23,192,104,0.12)] text-[#0C9248] dark:text-[#17C068]' },
              },
            ].map(({ title, desc, pill }) => (
              <div key={title} className="card p-4 flex flex-col gap-2">
                <div className="text-[13px] font-semibold text-[#131A15] dark:text-[#E0EAE4]">{title}</div>
                <p className="text-[12.5px] text-[#2A3A30] dark:text-[#93B5A5] leading-relaxed flex-1">{desc}</p>
                <span className={`self-start text-[11px] font-medium px-2 py-0.5 rounded-full ${pill.cls}`}>{pill.label}</span>
              </div>
            ))}
          </div>

          {/* How to use */}
          <div className="card">
            <div className="card-hdr">How to use this Explorer</div>
            <div>
              {[
                ['Top navbar',      'Navigate between Overview, Patterns, Classifiers, Discovery Stages, and IRE & Reconciliation'],
                ['Overview tab',    'Quick stats, the CI mappings table showing which CI types are managed and their deletion strategies'],
                ['NDL tab',         'Tables Populated — which CMDB tables get written and which fields; NDL Steps — the operations in each step; Relations — create_relation and relation_reference calls'],
                ['Sensors tab',     'Pre-sensor and Post-sensor JavaScript scripts with full code bodies'],
                ['Config tab',      'Trigger rules (parent/child), extensions, launch parameters, and tracked file definitions'],
              ].map(([label, desc], i, arr) => (
                <div
                  key={label}
                  className={`info-row ${i === arr.length - 1 ? 'border-b-0' : ''}`}
                >
                  <span className="info-key">{label}</span>
                  <span className="info-val text-[#2A3A30] dark:text-[#93B5A5]">{desc}</span>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}

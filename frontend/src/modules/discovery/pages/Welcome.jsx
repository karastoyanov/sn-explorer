import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { discoveryApi } from '../../../api/client'

function IconApp({ color }) {
  return <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="1" y="1" width="14" height="10" rx="2" stroke={color} strokeWidth="1.4"/><path d="M5 14h6M8 11v3" stroke={color} strokeWidth="1.4" strokeLinecap="round"/></svg>
}
function IconCloud({ color }) {
  return <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M4 11a3 3 0 1 1 .5-5.95A4 4 0 1 1 12 8.5a2.5 2.5 0 0 1-.5 4.95" stroke={color} strokeWidth="1.4" strokeLinecap="round"/><path d="M4 11h8" stroke={color} strokeWidth="1.4" strokeLinecap="round"/></svg>
}
function IconInfra({ color }) {
  return <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="1" y="2" width="14" height="4" rx="1" stroke={color} strokeWidth="1.4"/><rect x="1" y="9" width="14" height="4" rx="1" stroke={color} strokeWidth="1.4"/><circle cx="12.5" cy="4" r="1" fill={color}/><circle cx="12.5" cy="11" r="1" fill={color}/></svg>
}
function IconLibrary({ color }) {
  return <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="2" y="2" width="3" height="12" rx="1" stroke={color} strokeWidth="1.4"/><rect x="6.5" y="2" width="3" height="12" rx="1" stroke={color} strokeWidth="1.4"/><path d="M11 3.5l3 9.5" stroke={color} strokeWidth="1.4" strokeLinecap="round"/></svg>
}
function IconOther({ color }) {
  return <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6" stroke={color} strokeWidth="1.4"/><circle cx="8" cy="8" r="2" fill={color}/></svg>
}

const CAT_META = {
  Application:    { color: '#34D399', Icon: IconApp },
  Cloud:          { color: '#60A5FA', Icon: IconCloud },
  Infrastructure: { color: '#94A3B8', Icon: IconInfra },
  Library:        { color: '#A78BFA', Icon: IconLibrary },
  Other:          { color: '#6B7280', Icon: IconOther },
}

const DT_META = {
  Horizontal: { color: '#0d9488', bg: 'bg-teal-50 dark:bg-teal-950/40',   text: 'text-teal-700 dark:text-teal-300',   border: 'border-teal-200 dark:border-teal-800/60' },
  'Top-Down': { color: '#d97706', bg: 'bg-amber-50 dark:bg-amber-950/40', text: 'text-amber-700 dark:text-amber-300', border: 'border-amber-200 dark:border-amber-800/60' },
}

function StatBar({ value, max, color }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  return (
    <div className="h-1.5 rounded-full bg-[#DCF0E6] dark:bg-[#1A2C22] overflow-hidden">
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
                <div key={i} className="rounded-xl border border-[#D8E2DC] dark:border-[#1A2C22] p-4 animate-pulse bg-[#E6F6ED] dark:bg-[#172018]" />
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
                        <m.Icon color={m.color} />
                        <span className="text-[13px] font-medium text-[#131A15] dark:text-[#E0EAE4]">{cat}</span>
                      </div>
                      <span className="text-[13px] font-semibold text-[#131A15] dark:text-[#E0EAE4]">{count.toLocaleString()}</span>
                    </div>
                    <StatBar value={count} max={maxCat} color={m.color} />
                  </div>
                )
              })}
              {Object.keys(byCategory).length === 0 && (
                <div className="col-span-2 py-6 text-center text-[13px] text-[#506458] dark:text-[#4A6858]">Loading…</div>
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
                title: 'Top-Down Discovery',
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
                <p className="text-[12.5px] text-[#1E3028] dark:text-[#A8C4B8] leading-relaxed flex-1">{desc}</p>
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
                  <span className="info-val text-[#1E3028] dark:text-[#A8C4B8]">{desc}</span>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}

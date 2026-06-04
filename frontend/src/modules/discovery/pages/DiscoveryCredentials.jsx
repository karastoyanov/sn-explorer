import { useState, useEffect } from 'react'
import { discoveryApi } from '../../../api/client'

const BADGE_COLOR = {
  teal:  '#0D9488',
  sky:   '#0EA5E9',
  amber: '#D97706',
  green: '#16A34A',
  gray:  '#6B7280',
}

export default function DiscoveryCredentials() {
  const [data, setData]     = useState(null)
  const [active, setActive] = useState(null)

  useEffect(() => {
    discoveryApi.getCredentials()
      .then((d) => { setData(d); setActive(d.credentialTypes[0]) })
      .catch(console.error)
  }, [])

  if (!data) {
    return (
      <div className="page">
        <div className="page-hdr">
          <h1 className="page-title">Discovery Credentials</h1>
        </div>
        <div className="page-body">
          <div className="page-inner">
            <div className="text-[13px] text-[#8EA898] dark:text-[#6A9880]">Loading…</div>
          </div>
        </div>
      </div>
    )
  }

  const { overview, credentialTypes } = data

  return (
    <div className="page">
      <div className="page-hdr">
        <h1 className="page-title">Discovery Credentials</h1>
        <p className="page-sub">{overview.summary}</p>
      </div>

      <div className="page-body">
        <div className="page-inner">

          <OverviewStrip overview={overview} />

          {/* Credential type selector */}
          <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-2 mb-4">
            {credentialTypes.map((ct) => (
              <TypeCard
                key={ct.id}
                ct={ct}
                isActive={active?.id === ct.id}
                onClick={() => setActive(ct)}
              />
            ))}
          </div>

          {active && <CredentialDetail ct={active} />}

        </div>
      </div>
    </div>
  )
}

function OverviewStrip({ overview }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-5">
      <div className="card p-4">
        <div className="label-xs mb-1.5">How It Works</div>
        <p className="text-[12.5px] text-[#2A3A30] dark:text-[#93B5A5] leading-relaxed">{overview.flow}</p>
      </div>

      <div className="card p-4">
        <div className="label-xs mb-1.5">Credential Affinity</div>
        <p className="text-[12.5px] text-[#2A3A30] dark:text-[#93B5A5] leading-relaxed">{overview.credentialAffinity}</p>
        <div className="mt-2">
          <span className="label-xs">Storage table: </span>
          <span className="mono text-[11px] text-[#2A3A30] dark:text-[#93B5A5]">{overview.storageTable}</span>
        </div>
      </div>

      <div className="card p-4">
        <div className="label-xs mb-2">Best Practices</div>
        <ul className="space-y-1.5">
          {overview.notes.map((n, i) => (
            <li key={i} className="flex items-start gap-1.5 text-[12px] text-[#2A3A30] dark:text-[#93B5A5] leading-relaxed">
              <span className="text-[#8EA898] dark:text-[#5EDC9A] shrink-0 mt-0.5">•</span>
              {n}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

function TypeCard({ ct, isActive, onClick }) {
  const color = BADGE_COLOR[ct.badge] || '#6B7280'
  return (
    <button
      onClick={onClick}
      className={`text-left rounded-xl p-3 transition-all duration-150 w-full
        bg-white dark:bg-[#141E18]
        ${isActive
          ? ''
          : 'border border-[#E0E6E2] dark:border-[#1E3028] hover:border-[#9DDCBA] dark:hover:border-[rgba(23,192,104,0.3)] hover:shadow-sm'
        }`}
      style={isActive ? { boxShadow: `0 0 0 2px ${color}` } : {}}
    >
      <span className={`badge badge-${ct.badge} mb-1.5 block w-fit text-[10px]`}>{ct.shortName}</span>
      <span className="text-[11.5px] font-medium text-[#131A15] dark:text-[#E0EAE4] leading-tight block">{ct.name}</span>
    </button>
  )
}

function CredentialDetail({ ct }) {
  const color = BADGE_COLOR[ct.badge] || '#6B7280'

  return (
    <div className="card">
      {/* Header */}
      <div
        className="flex items-start gap-3 px-5 py-4 border-b border-[#E0E6E2] dark:border-[#1E3028]"
        style={{ background: `${color}12` }}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1.5">
            <h2 className="text-[15px] font-semibold text-[#131A15] dark:text-[#E0EAE4]">{ct.name}</h2>
            <span className={`badge badge-${ct.badge}`}>{ct.shortName}</span>
            {ct.protocols.map((p) => (
              <span key={p} className="badge badge-slate">{p}</span>
            ))}
            {ct.ports.map((p) => (
              <span key={p} className="mono text-[11px] text-[#8EA898] dark:text-[#6A9880]">:{p}</span>
            ))}
          </div>
          <p className="text-[12.5px] text-[#2A3A30] dark:text-[#93B5A5] leading-relaxed">{ct.description}</p>
        </div>
      </div>

      {/* Two-column body */}
      <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-[#EBF0EC] dark:divide-[#1E3028]">

        {/* Fields table */}
        <div className="p-5">
          <div className="label-xs mb-3">Configuration Fields</div>
          <table className="tbl w-full">
            <thead>
              <tr>
                <th>Field</th>
                <th>Req.</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              {ct.fields.map((f) => (
                <tr key={f.name}>
                  <td className="align-top">
                    <span className="mono">{f.name}</span>
                  </td>
                  <td className="align-top whitespace-nowrap">
                    {f.required
                      ? <span className="badge badge-orange">Yes</span>
                      : <span className="badge badge-gray">No</span>
                    }
                  </td>
                  <td className="text-[11.5px] text-[#8EA898] dark:text-[#6A9880] align-top">
                    {f.description}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Right column */}
        <div className="p-5 flex flex-col gap-4">

          {/* Used for */}
          <div>
            <div className="label-xs mb-2">Used For</div>
            <div className="flex flex-wrap gap-1.5">
              {ct.usedFor.map((u, i) => (
                <span key={i} className="badge badge-gray">{u}</span>
              ))}
            </div>
          </div>

          {/* CI types */}
          <div>
            <div className="label-xs mb-2">CI Table Types</div>
            <div className="flex flex-col gap-0.5">
              {ct.ciTypes.map((c) => (
                <span key={c} className="mono text-[11px] text-[#2A3A30] dark:text-[#93B5A5]">{c}</span>
              ))}
            </div>
          </div>

          {/* Required permissions */}
          <div>
            <div className="label-xs mb-2">Required Permissions</div>
            <ul className="space-y-1">
              {ct.requiredPermissions.map((p, i) => (
                <li key={i} className="flex items-start gap-1.5 text-[12px] text-[#2A3A30] dark:text-[#93B5A5]">
                  <span className="text-[#8EA898] dark:text-[#5EDC9A] shrink-0 mt-0.5">•</span>
                  {p}
                </li>
              ))}
            </ul>
          </div>

          {/* Notes */}
          {ct.notes.length > 0 && (
            <div>
              <div className="label-xs mb-2">Notes</div>
              <ul className="space-y-1">
                {ct.notes.map((n, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-[12px] text-[#2A3A30] dark:text-[#93B5A5]">
                    <span className="text-[#8EA898] dark:text-[#5EDC9A] shrink-0 mt-0.5">→</span>
                    {n}
                  </li>
                ))}
              </ul>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}

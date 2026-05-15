import { useState, useEffect } from 'react'
import { discoveryApi } from '../../../api/client'

export default function IREPage() {
  const [data, setData] = useState(null)

  useEffect(() => {
    discoveryApi.getIre().then(setData).catch(console.error)
  }, [])

  if (!data) {
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
      {/* Header */}
      <div className="page-hdr">
        <h1 className="page-title">IRE &amp; Reconciliation</h1>
        <p className="page-sub">
          How the Identification and Reconciliation Engine deduplicates CIs and resolves attribute conflicts
        </p>
      </div>

      <div className="page-body">
        <div className="page-inner">

          {/* Overview */}
          <div className="card">
            <div className="card-hdr">{data.overview.title}</div>
            <div className="p-4 text-[13px] text-[#2A3A30] dark:text-[#93B5A5] leading-relaxed space-y-3">
              <p>{data.overview.summary}</p>
              <div>
                <div className="label-xs mb-2">Who calls IRE</div>
                <div className="flex flex-wrap gap-2">
                  {data.overview.callers.map((c) => (
                    <span key={c} className="badge badge-gray">{c}</span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Identification */}
          <div className="card">
            <div className="card-hdr">{data.identification.title}</div>
            <p className="px-4 pt-3 pb-2 text-[13px] text-[#2A3A30] dark:text-[#93B5A5] leading-relaxed">
              {data.identification.description}
            </p>

            {/* Outcomes */}
            <div className="px-4 pb-4 flex flex-col gap-2.5">
              {data.identification.outcomes.map((o) => (
                <div key={o.label} className="flex items-start gap-3 bg-[#F9FAF9] dark:bg-[#182419] rounded-lg p-3 border border-[#E0E6E2] dark:border-[#1E3028]">
                  <span className={`badge badge-${o.badge} shrink-0 mt-0.5`}>{o.label}</span>
                  <span className="text-[12.5px] text-[#2A3A30] dark:text-[#93B5A5] leading-relaxed">{o.description}</span>
                </div>
              ))}
            </div>

            {/* Identification attributes */}
            <div className="border-t border-[#E0E6E2] dark:border-[#1E3028]">
              <div className="px-4 pt-3 pb-1 label-xs">Common identification attributes</div>
              <div className="divide-y divide-[#EBF0EC] dark:divide-[#1E3028]">
                {data.identification.ruleAttributes.map((a) => (
                  <div key={a.attribute} className="flex items-baseline gap-3 px-4 py-2 text-[13px]">
                    <span className="mono min-w-[180px] shrink-0">{a.attribute}</span>
                    <span className="text-[12px] text-[#8EA898] dark:text-[#6A9880] leading-snug">{a.note}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Reconciliation */}
          <div className="card">
            <div className="card-hdr">{data.reconciliation.title}</div>
            <p className="px-4 pt-3 pb-3 text-[13px] text-[#2A3A30] dark:text-[#93B5A5] leading-relaxed">
              {data.reconciliation.description}
            </p>

            <div className="border-t border-[#E0E6E2] dark:border-[#1E3028]">
              <div className="px-4 pt-3 pb-1 label-xs">Default precedence order (highest → lowest)</div>
              <div className="divide-y divide-[#EBF0EC] dark:divide-[#1E3028]">
                {data.reconciliation.precedenceExamples.map((s) => (
                  <div key={s.source} className="flex items-start gap-3 px-4 py-2.5 text-[13px]">
                    <span className="w-5 h-5 rounded-full bg-[#E6F6ED] dark:bg-[rgba(23,192,104,0.12)] text-[#0C9248] dark:text-[#17C068] flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                      {s.rank}
                    </span>
                    <div>
                      <span className="font-medium text-[#131A15] dark:text-[#E0EAE4]">{s.source}</span>
                      <span className="ml-2 text-[12px] text-[#8EA898] dark:text-[#6A9880]">{s.note}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="px-4 py-3 bg-[#FEF3C7]/40 dark:bg-[rgba(146,64,14,0.12)] border-t border-[#FCD34D]/30 dark:border-[rgba(252,211,77,0.15)] text-[12.5px] text-[#92400E] dark:text-[#FCD34D] leading-relaxed">
              <span className="font-semibold text-[#92400E] dark:text-[#FCD34D] uppercase tracking-wider text-[11px] mr-2">Note</span>
              {data.reconciliation.staleness}
            </div>
          </div>

          {/* Tables */}
          <div className="card">
            <div className="card-hdr">
              Tables involved
              <span className="card-count">{data.tables.length}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Table</th>
                    <th>Role</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {data.tables.map((t) => {
                    const roleCls = t.role === 'Data' ? 'badge-green'
                      : t.role === 'Configuration' ? 'badge-sky'
                      : 'badge-gray'
                    return (
                      <tr key={t.name}>
                        <td><span className="mono">{t.name}</span></td>
                        <td><span className={`badge ${roleCls}`}>{t.role}</span></td>
                        <td className="text-[12px] text-[#8EA898] dark:text-[#6A9880]">{t.note}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Tips */}
          <div className="card">
            <div className="card-hdr">Key tips</div>
            <div className="divide-y divide-[#EBF0EC] dark:divide-[#1E3028]">
              {data.tips.map((tip) => (
                <div key={tip.heading} className="px-4 py-3 flex gap-3">
                  <div className="flex-1">
                    <div className="text-[12.5px] font-semibold text-[#131A15] dark:text-[#E0EAE4] mb-0.5">{tip.heading}</div>
                    <div className="text-[12.5px] text-[#8EA898] dark:text-[#6A9880] leading-relaxed">{tip.body}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}

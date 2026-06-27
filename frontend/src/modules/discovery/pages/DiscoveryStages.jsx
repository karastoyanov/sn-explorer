import { useState, useEffect } from 'react'
import { discoveryApi } from '../../../api/client'

export default function DiscoveryStages() {
  const [stages, setStages] = useState([])
  const [active, setActive] = useState(null)

  useEffect(() => {
    discoveryApi.getStages().then((data) => {
      setStages(data)
      setActive(data[0])
    }).catch(console.error)
  }, [])

  if (!stages.length) {
    return (
      <div className="page">
        <div className="page-hdr">
          <h1 className="page-title">Discovery Stages</h1>
        </div>
        <div className="page-body">
          <div className="page-inner">
            <div className="text-[13px] text-[#506458] dark:text-[#4A6858]">Loading…</div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      {/* Header */}
      <div className="page-hdr">
        <h1 className="page-title">Discovery Stages</h1>
        <p className="page-sub">
          The four PCIE phases every Discovery run goes through — from initial scan to CMDB population
        </p>
      </div>

      {/* Scrollable content */}
      <div className="page-body">
        <div className="page-inner">

          {/* Pipeline */}
          <div className="flex items-stretch overflow-x-auto p-0.5">
            {stages.map((stage, idx) => (
              <div key={stage.id} className="flex items-center flex-1 min-w-[140px]">

                {/* SVG chevron connector */}
                {idx > 0 && (
                  <div className="shrink-0 w-7 flex items-center justify-center">
                    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                      <path
                        d="M6 3.5l6 5.5-6 5.5"
                        className="stroke-[#C4D9CC] dark:stroke-[#2A4238]"
                        strokeWidth="1.75"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                )}

                {/* Stage card */}
                <div
                  className={`flex-1 min-w-0 rounded-xl overflow-hidden cursor-pointer select-none transition-all duration-150
                    ${active?.id === stage.id
                      ? ''
                      : 'border border-[#D8E2DC] dark:border-[#1A2C22] hover:border-[#9DDCBA] dark:hover:border-[rgba(23,192,104,0.3)] hover:shadow-sm'
                    }`}
                  style={active?.id === stage.id ? { boxShadow: `0 0 0 2px ${stage.color}` } : {}}
                  onClick={() => setActive(stage)}
                >
                  {/* Tinted header strip */}
                  <div
                    className="px-3 pt-3 pb-2.5 flex items-center gap-2.5"
                    style={{ background: `${stage.color}18` }}
                  >
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[11px] font-bold shrink-0"
                      style={{ background: stage.color }}
                    >
                      {stage.order}
                    </div>
                    <span className="text-[13px] font-semibold text-[#131A15] dark:text-[#E0EAE4] leading-tight">
                      {stage.name}
                    </span>
                  </div>

                  {/* Description */}
                  <div className="bg-white dark:bg-[#141E18] px-3 py-2.5 border-t border-[#D8E2DC] dark:border-[#1A2C22]">
                    <p className="text-[11px] text-[#506458] dark:text-[#4A6858] leading-relaxed">
                      {stage.description.split('.')[0]}.
                    </p>
                  </div>
                </div>

              </div>
            ))}
          </div>

          {/* Stage detail */}
          {active && <StageDetail stage={active} />}

        </div>
      </div>
    </div>
  )
}

function StageDetail({ stage }) {
  return (
    <div className="card">
      {/* Detail header */}
      <div className="flex items-start gap-4 px-5 py-4 border-b border-[#D8E2DC] dark:border-[#1A2C22] bg-[#F5F8F6] dark:bg-[#172018]">
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center text-white text-[15px] font-bold shrink-0 mt-0.5"
          style={{ background: stage.color }}
        >
          {stage.order}
        </div>
        <div>
          <h2 className="text-[15px] font-semibold text-[#131A15] dark:text-[#E0EAE4]">{stage.name}</h2>
          <p className="text-[12.5px] text-[#1E3028] dark:text-[#A8C4B8] mt-0.5 leading-relaxed">
            {stage.description}
          </p>
        </div>
      </div>

      {/* Two-column body */}
      <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-[#E6EDEA] dark:divide-[#1A2C22]">

        {/* Steps */}
        <div className="p-5">
          <div className="label-xs mb-3">Steps in this phase</div>
          <div className="flex flex-col gap-2.5">
            {stage.steps.map((step, i) => (
              <div key={i} className="flex items-start gap-2.5 text-[13px] text-[#1E3028] dark:text-[#A8C4B8]">
                <div className="w-5 h-5 rounded-full bg-[#E4EDEA] dark:bg-[#1A2C22] text-[#506458] dark:text-[#4A6858] flex items-center justify-center text-[10px] font-semibold shrink-0 mt-0.5">
                  {i + 1}
                </div>
                <span className="leading-relaxed">{step}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Tables + MID Server role */}
        <div className="p-5">
          <div className="label-xs mb-3">Tables involved</div>
          <div className="space-y-0">
            {stage.tables.map((t) => (
              <div key={t.name} className="flex items-baseline gap-2 py-1.5 border-b border-[#EBF0EC] dark:border-[#1A2C22] last:border-0">
                <span className="mono min-w-[170px] shrink-0">{t.name}</span>
                <span className="text-[11.5px] text-[#506458] dark:text-[#4A6858] leading-snug">{t.note}</span>
              </div>
            ))}
          </div>

          {stage.midServerRole && (
            <div className="mt-4">
              <div className="label-xs mb-2">MID Server role</div>
              <div className="bg-[#F4F5F4] dark:bg-[#0D1410] rounded-lg p-3 text-[12.5px] text-[#1E3028] dark:text-[#A8C4B8] leading-relaxed">
                {stage.midServerRole}
              </div>
            </div>
          )}
        </div>

      </div>

      {/* Output banner */}
      <div className="flex items-baseline gap-2 px-5 py-3 bg-[#D1FAE5]/40 dark:bg-[rgba(6,95,70,0.15)] border-t border-[#6EE7B7]/30 dark:border-[rgba(110,231,183,0.15)]">
        <span className="text-[11px] font-semibold text-[#065F46] dark:text-[#6EE7B7] uppercase tracking-wider shrink-0">
          Output
        </span>
        <span className="text-[12.5px] text-[#065F46] dark:text-[#6EE7B7]">{stage.output}</span>
      </div>

      {/* Tip banner */}
      {stage.tip && (
        <div className="flex gap-2.5 px-5 py-3 bg-[#FEF3C7]/40 dark:bg-[rgba(146,64,14,0.12)] border-t border-[#FCD34D]/30 dark:border-[rgba(252,211,77,0.15)]">
          <span className="text-[11px] font-semibold text-[#92400E] dark:text-[#FCD34D] uppercase tracking-wider shrink-0 mt-0.5">
            Tip
          </span>
          <span className="text-[12.5px] text-[#92400E] dark:text-[#FCD34D] leading-relaxed">{stage.tip}</span>
        </div>
      )}
    </div>
  )
}

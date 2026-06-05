import { useState, useEffect } from 'react'
import { discoveryApi } from '../../../api/client'

const SECTIONS = [
  { id: 'overview',       label: 'Overview' },
  { id: 'capabilities',   label: 'Capabilities' },
  { id: 'platforms',      label: 'Requirements' },
  { id: 'network',        label: 'Network & Ports' },
  { id: 'security',       label: 'Security' },
  { id: 'configuration',  label: 'Configuration' },
  { id: 'states',         label: 'MID States' },
  { id: 'clustering',     label: 'Clustering' },
  { id: 'lifecycle',      label: 'Lifecycle' },
  { id: 'troubleshooting',label: 'Troubleshooting' },
]

const STATE_COLORS = {
  green: '#16A34A', red: '#DC2626', amber: '#D97706',
  sky: '#0EA5E9', slate: '#6B7280',
}

export default function MIDServerPage() {
  const [data, setData]           = useState(null)
  const [activeId, setActiveId]   = useState('overview')

  useEffect(() => {
    discoveryApi.getMidServer()
      .then(setData)
      .catch(console.error)
  }, [])

  if (!data) {
    return (
      <div className="page">
        <div className="page-hdr"><h1 className="page-title">MID Server</h1></div>
        <div className="page-body"><div className="page-inner">
          <div className="text-[13px] text-[#8EA898] dark:text-[#6A9880]">Loading…</div>
        </div></div>
      </div>
    )
  }

  const section = SECTIONS.find(s => s.id === activeId)

  return (
    <div className="page">
      <div className="page-hdr">
        <h1 className="page-title">MID Server</h1>
        <p className="page-sub">{data.overview.fullName} — {data.overview.summary.slice(0, 120)}…</p>
      </div>

      <div className="page-body">
        <div className="page-inner">

          {/* Section tab strip */}
          <div className="flex gap-0 border-b border-[#E0E6E2] dark:border-[#1E3028] mb-5 overflow-x-auto">
            {SECTIONS.map(({ id, label }) => (
              <button
                key={id}
                onClick={() => setActiveId(id)}
                className={`px-3.5 py-2.5 text-[12.5px] font-medium whitespace-nowrap border-b-2 transition-colors duration-100
                  ${activeId === id
                    ? 'text-[#0C9248] dark:text-[#17C068] border-[#0C9248] dark:border-[#17C068]'
                    : 'text-[#8EA898] dark:text-[#6A9880] border-transparent hover:text-[#2A3A30] dark:hover:text-[#C0D8CC]'
                  }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Section content */}
          {activeId === 'overview'       && <OverviewSection data={data.overview} />}
          {activeId === 'capabilities'   && <CapabilitiesSection items={data.capabilities} />}
          {activeId === 'platforms'      && <PlatformsSection data={data.platforms} />}
          {activeId === 'network'        && <NetworkSection data={data.network} />}
          {activeId === 'security'       && <SecuritySection data={data.security} />}
          {activeId === 'configuration'  && <ConfigSection data={data.configuration} />}
          {activeId === 'states'         && <StatesSection states={data.states} />}
          {activeId === 'clustering'     && <ClusteringSection data={data.clustering} />}
          {activeId === 'lifecycle'      && <LifecycleSection data={data.lifecycle} />}
          {activeId === 'troubleshooting'&& <TroubleshootingSection items={data.troubleshooting} />}

        </div>
      </div>
    </div>
  )
}

/* ── Overview ─────────────────────────────────────────────────────────────── */
function OverviewSection({ data }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="card p-5">
        <div className="label-xs mb-2">What is the MID Server?</div>
        <p className="text-[13px] text-[#2A3A30] dark:text-[#93B5A5] leading-relaxed mb-3">{data.summary}</p>
        <p className="text-[12.5px] text-[#2A3A30] dark:text-[#93B5A5] leading-relaxed">{data.eccModel}</p>
      </div>
      <div className="card p-5">
        <div className="label-xs mb-3">Key Facts</div>
        <ul className="flex flex-col gap-2">
          {data.keyFacts.map((f, i) => (
            <li key={i} className="flex items-start gap-2.5 text-[12.5px] text-[#2A3A30] dark:text-[#93B5A5]">
              <span className="w-5 h-5 rounded-full bg-[#D6F5E3] dark:bg-[rgba(20,102,64,0.25)] text-[#146640] dark:text-[#5EDC9A] flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">{i + 1}</span>
              {f}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

/* ── Capabilities ─────────────────────────────────────────────────────────── */
function CapabilitiesSection({ items }) {
  const [active, setActive] = useState(items[0])
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div className="flex flex-col gap-1.5">
        {items.map((cap) => (
          <button
            key={cap.id}
            onClick={() => setActive(cap)}
            className={`text-left px-3.5 py-2.5 rounded-lg text-[12.5px] font-medium transition-colors duration-100
              ${active?.id === cap.id
                ? 'bg-[#D6F5E3] dark:bg-[rgba(20,102,64,0.2)] text-[#146640] dark:text-[#5EDC9A]'
                : 'text-[#495C52] dark:text-[#607870] hover:bg-[#F4F7F5] dark:hover:bg-white/[0.03]'
              }`}
          >
            <span className={`badge badge-${cap.badge} mr-2`}>{cap.name.split(' ')[0]}</span>
            {cap.name}
          </button>
        ))}
      </div>
      {active && (
        <div className="md:col-span-2 card p-5">
          <div className="flex items-center gap-2 mb-3">
            <span className={`badge badge-${active.badge}`}>{active.name}</span>
          </div>
          <p className="text-[13px] text-[#2A3A30] dark:text-[#93B5A5] leading-relaxed mb-4">{active.description}</p>
          <div className="label-xs mb-2">How it works</div>
          <ul className="flex flex-col gap-1.5">
            {active.details.map((d, i) => (
              <li key={i} className="flex items-start gap-2 text-[12.5px] text-[#2A3A30] dark:text-[#93B5A5]">
                <span className="text-[#8EA898] dark:text-[#5EDC9A] shrink-0 mt-0.5">•</span>
                {d}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

/* ── Platforms / Requirements ─────────────────────────────────────────────── */
function PlatformsSection({ data }) {
  return (
    <div className="flex flex-col gap-4">
      {/* OS table */}
      <div className="card p-5">
        <div className="label-xs mb-3">Supported Operating Systems</div>
        <table className="tbl w-full">
          <thead><tr><th>OS</th><th>Supported Versions</th><th>Notes</th></tr></thead>
          <tbody>
            {data.operatingSystems.map((os) => (
              <tr key={os.name}>
                <td className="font-medium">{os.name}</td>
                <td>{os.versions.join(', ')}</td>
                <td className="text-[11.5px] text-[#8EA898] dark:text-[#6A9880]">{os.notes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Hardware + Java */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="card p-5">
          <div className="label-xs mb-3">Hardware Requirements</div>
          {[
            { label: 'CPU',    value: data.hardware.cpu },
            { label: 'Memory', value: data.hardware.memory },
            { label: 'Disk',   value: data.hardware.disk },
          ].map(({ label, value }) => (
            <div key={label} className="flex gap-3 py-2 border-b border-[#EBF0EC] dark:border-[#1E3028] last:border-0">
              <span className="label-xs w-14 shrink-0 mt-0.5">{label}</span>
              <span className="text-[12.5px] text-[#2A3A30] dark:text-[#93B5A5]">{value}</span>
            </div>
          ))}
          <p className="text-[11.5px] text-[#8EA898] dark:text-[#6A9880] mt-3 leading-relaxed">{data.hardware.notes}</p>
        </div>
        <div className="card p-5">
          <div className="label-xs mb-3">Java Runtime</div>
          <p className="text-[12.5px] text-[#2A3A30] dark:text-[#93B5A5] mb-2">{data.java.version}</p>
          <p className="text-[12px] text-[#8EA898] dark:text-[#6A9880] leading-relaxed">{data.java.notes}</p>
        </div>
      </div>
    </div>
  )
}

/* ── Network & Ports ──────────────────────────────────────────────────────── */
function NetworkSection({ data }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="card p-4">
        <div className="flex gap-2 items-start">
          <span className="badge badge-green mt-0.5">Outbound only</span>
          <p className="text-[12.5px] text-[#2A3A30] dark:text-[#93B5A5] leading-relaxed">{data.summary}</p>
        </div>
      </div>

      {/* Instance connection */}
      <div className="card p-5">
        <div className="label-xs mb-3">Connection to ServiceNow Instance</div>
        <table className="tbl w-full">
          <thead><tr><th>Port</th><th>Protocol</th><th>Destination</th><th>Purpose</th></tr></thead>
          <tbody>
            {data.outboundToInstance.map((r, i) => (
              <tr key={i}>
                <td><span className="mono">{r.port}</span></td>
                <td>{r.protocol}</td>
                <td><span className="mono text-[11px]">{r.destination}</span></td>
                <td className="text-[11.5px] text-[#8EA898] dark:text-[#6A9880]">{r.purpose}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Target ports */}
      <div className="card p-5">
        <div className="label-xs mb-3">Outbound Ports to Discovery Targets</div>
        <table className="tbl w-full">
          <thead><tr><th>Port</th><th>Protocol</th><th>Purpose</th></tr></thead>
          <tbody>
            {data.outboundToTargets.map((r, i) => (
              <tr key={i}>
                <td><span className="mono">{r.port}</span></td>
                <td className="whitespace-nowrap">{r.protocol}</td>
                <td className="text-[11.5px] text-[#8EA898] dark:text-[#6A9880]">{r.purpose}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card p-4">
        <div className="label-xs mb-1.5">Proxy Support</div>
        <p className="text-[12.5px] text-[#2A3A30] dark:text-[#93B5A5] leading-relaxed">{data.proxySupport}</p>
      </div>
    </div>
  )
}

/* ── Security ─────────────────────────────────────────────────────────────── */
function SecuritySection({ data }) {
  const fields = [
    { label: 'Communication',       value: data.communication },
    { label: 'Instance Account',    value: data.instanceAccount },
    { label: 'Credential Storage',  value: data.credentialStorage },
    { label: 'OS Service Account',  value: data.serviceAccount },
  ]
  return (
    <div className="flex flex-col gap-4">
      <div className="card divide-y divide-[#EBF0EC] dark:divide-[#1E3028]">
        {fields.map(({ label, value }) => (
          <div key={label} className="flex gap-4 px-5 py-3.5">
            <span className="label-xs w-36 shrink-0 mt-0.5">{label}</span>
            <p className="text-[12.5px] text-[#2A3A30] dark:text-[#93B5A5] leading-relaxed">{value}</p>
          </div>
        ))}
      </div>
      <div className="card p-5">
        <div className="label-xs mb-3">Security Best Practices</div>
        <ul className="flex flex-col gap-2">
          {data.notes.map((n, i) => (
            <li key={i} className="flex items-start gap-2 text-[12.5px] text-[#2A3A30] dark:text-[#93B5A5]">
              <span className="text-[#8EA898] dark:text-[#5EDC9A] shrink-0 mt-0.5">→</span>
              {n}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

/* ── Configuration ────────────────────────────────────────────────────────── */
function ConfigSection({ data }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="card p-4">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="label-xs">Config file:</span>
          <span className="mono text-[12px] text-[#2A3A30] dark:text-[#93B5A5]">{data.configFile}</span>
          <span className="label-xs ml-2">Location:</span>
          <span className="mono text-[12px] text-[#2A3A30] dark:text-[#93B5A5]">{data.location}</span>
        </div>
        <p className="text-[12px] text-[#8EA898] dark:text-[#6A9880] mt-2">{data.description}</p>
      </div>
      <div className="card p-5">
        <div className="label-xs mb-3">Parameters</div>
        <div className="overflow-x-auto">
          <table className="tbl w-full">
            <thead>
              <tr><th>Parameter</th><th>Req.</th><th>Default</th><th>Description</th></tr>
            </thead>
            <tbody>
              {data.parameters.map((p) => (
                <tr key={p.name}>
                  <td className="align-top"><span className="mono">{p.name}</span></td>
                  <td className="align-top whitespace-nowrap">
                    {p.required
                      ? <span className="badge badge-orange">Yes</span>
                      : <span className="badge badge-gray">No</span>}
                  </td>
                  <td className="align-top">
                    {p.default ? <span className="mono text-[11px]">{p.default}</span> : <span className="text-[#C4D4CC]">—</span>}
                  </td>
                  <td className="text-[11.5px] text-[#8EA898] dark:text-[#6A9880] align-top">{p.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

/* ── States ───────────────────────────────────────────────────────────────── */
function StatesSection({ states }) {
  const [active, setActive] = useState(states[0])
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        {states.map((s) => (
          <button
            key={s.id}
            onClick={() => setActive(s)}
            className={`px-3.5 py-2 rounded-xl text-[12.5px] font-medium transition-all duration-100
              ${active?.id === s.id ? 'ring-2' : 'border border-[#E0E6E2] dark:border-[#1E3028] hover:shadow-sm'}`}
            style={active?.id === s.id ? { boxShadow: `0 0 0 2px ${s.color}` } : {}}
          >
            <span className={`badge badge-${s.badge} mr-1.5`}>{s.name}</span>
          </button>
        ))}
      </div>
      {active && (
        <div className="card p-5">
          <div className="flex items-center gap-2.5 mb-3">
            <div className="w-3 h-3 rounded-full" style={{ background: active.color }} />
            <h3 className="text-[14px] font-semibold text-[#131A15] dark:text-[#E0EAE4]">{active.name}</h3>
            <span className={`badge badge-${active.badge}`}>{active.name}</span>
          </div>
          <p className="text-[13px] text-[#2A3A30] dark:text-[#93B5A5] leading-relaxed">{active.description}</p>
        </div>
      )}
      <div className="card p-5">
        <div className="label-xs mb-3">All States at a Glance</div>
        <div className="flex flex-col divide-y divide-[#EBF0EC] dark:divide-[#1E3028]">
          {states.map((s) => (
            <div key={s.id} className="flex items-start gap-3 py-2.5">
              <div className="w-2.5 h-2.5 rounded-full mt-1 shrink-0" style={{ background: s.color }} />
              <span className="text-[12.5px] font-medium text-[#2A3A30] dark:text-[#93B5A5] w-20 shrink-0">{s.name}</span>
              <span className="text-[12px] text-[#8EA898] dark:text-[#6A9880] leading-relaxed">{s.description}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ── Clustering ───────────────────────────────────────────────────────────── */
function ClusteringSection({ data }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="card p-5">
        <div className="label-xs mb-2">Overview</div>
        <p className="text-[13px] text-[#2A3A30] dark:text-[#93B5A5] leading-relaxed">{data.summary}</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="card p-5">
          <div className="label-xs mb-2">MID Server Affinity</div>
          <p className="text-[12.5px] text-[#2A3A30] dark:text-[#93B5A5] leading-relaxed mb-2">{data.affinity.description}</p>
          <span className="label-xs">Table: </span>
          <span className="mono text-[11px] text-[#2A3A30] dark:text-[#93B5A5]">{data.affinity.table}</span>
        </div>
        <div className="card p-5">
          <div className="label-xs mb-2">MID Server Pools</div>
          <p className="text-[12.5px] text-[#2A3A30] dark:text-[#93B5A5] leading-relaxed mb-3">{data.pool.description}</p>
          <div className="label-xs mb-2">High Availability Behaviour</div>
          <p className="text-[12.5px] text-[#2A3A30] dark:text-[#93B5A5] leading-relaxed">{data.ha}</p>
        </div>
      </div>
      <div className="card p-5">
        <div className="label-xs mb-3">Deployment Recommendations</div>
        <ul className="flex flex-col gap-2">
          {data.notes.map((n, i) => (
            <li key={i} className="flex items-start gap-2 text-[12.5px] text-[#2A3A30] dark:text-[#93B5A5]">
              <span className="text-[#8EA898] dark:text-[#5EDC9A] shrink-0 mt-0.5">•</span>
              {n}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

/* ── Lifecycle ────────────────────────────────────────────────────────────── */
function LifecycleSection({ data }) {
  const [active, setActive] = useState('installation')
  const phases = [
    { id: 'installation', label: 'Installation' },
    { id: 'upgrade',      label: 'Upgrade' },
    { id: 'validation',   label: 'Validation' },
  ]
  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-1">
        {phases.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setActive(id)}
            className={`px-3.5 py-2 rounded-lg text-[12.5px] font-medium transition-colors duration-100
              ${active === id
                ? 'bg-[#D6F5E3] dark:bg-[rgba(20,102,64,0.2)] text-[#146640] dark:text-[#5EDC9A]'
                : 'text-[#8EA898] dark:text-[#6A9880] hover:bg-[#F4F7F5] dark:hover:bg-white/[0.03]'
              }`}
          >
            {label}
          </button>
        ))}
      </div>

      {active === 'installation' && (
        <div className="card p-5">
          <div className="label-xs mb-3">Installation Steps</div>
          <div className="flex flex-col gap-3">
            {data.installation.steps.map((step, i) => (
              <div key={i} className="flex items-start gap-3 text-[12.5px] text-[#2A3A30] dark:text-[#93B5A5]">
                <div className="w-5 h-5 rounded-full bg-[#EBF0EC] dark:bg-[#1E3028] text-[#8EA898] dark:text-[#6A9880] flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">{i + 1}</div>
                <span className="leading-relaxed">{step}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {active === 'upgrade' && (
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-3">
            <div className="label-xs">Method</div>
            <span className="badge badge-sky">{data.upgrade.method}</span>
          </div>
          <p className="text-[12.5px] text-[#2A3A30] dark:text-[#93B5A5] leading-relaxed mb-4">{data.upgrade.description}</p>
          <div className="label-xs mb-2">Notes</div>
          <ul className="flex flex-col gap-1.5">
            {data.upgrade.notes.map((n, i) => (
              <li key={i} className="flex items-start gap-2 text-[12px] text-[#2A3A30] dark:text-[#93B5A5]">
                <span className="text-[#8EA898] dark:text-[#5EDC9A] shrink-0">→</span>
                {n}
              </li>
            ))}
          </ul>
        </div>
      )}

      {active === 'validation' && (
        <div className="card p-5">
          <p className="text-[12.5px] text-[#2A3A30] dark:text-[#93B5A5] leading-relaxed mb-4">{data.validation.description}</p>
          <div className="label-xs mb-3">Validation Steps</div>
          <div className="flex flex-col gap-2.5">
            {data.validation.steps.map((step, i) => (
              <div key={i} className="flex items-start gap-3 text-[12.5px] text-[#2A3A30] dark:text-[#93B5A5]">
                <div className="w-5 h-5 rounded-full bg-[#EBF0EC] dark:bg-[#1E3028] text-[#8EA898] dark:text-[#6A9880] flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">{i + 1}</div>
                <span className="leading-relaxed">{step}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/* ── Troubleshooting ──────────────────────────────────────────────────────── */
function TroubleshootingSection({ items }) {
  const [active, setActive] = useState(0)
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div className="flex flex-col gap-1">
        {items.map((item, i) => (
          <button
            key={i}
            onClick={() => setActive(i)}
            className={`text-left px-3.5 py-2.5 rounded-lg text-[12px] transition-colors duration-100
              ${active === i
                ? 'bg-[#FEE2E2] dark:bg-[rgba(153,27,27,0.15)] text-[#991B1B] dark:text-[#FCA5A5]'
                : 'text-[#495C52] dark:text-[#607870] hover:bg-[#F4F7F5] dark:hover:bg-white/[0.03]'
              }`}
          >
            {item.symptom}
          </button>
        ))}
      </div>
      {items[active] && (
        <div className="md:col-span-2 card p-5 flex flex-col gap-4">
          <div>
            <div className="label-xs mb-1.5">Symptom</div>
            <p className="text-[13px] font-medium text-[#991B1B] dark:text-[#FCA5A5]">{items[active].symptom}</p>
          </div>
          <div>
            <div className="label-xs mb-2">Possible Causes</div>
            <ul className="flex flex-col gap-1.5">
              {items[active].causes.map((c, i) => (
                <li key={i} className="flex items-start gap-2 text-[12.5px] text-[#2A3A30] dark:text-[#93B5A5]">
                  <span className="text-[#8EA898] dark:text-[#6A9880] shrink-0">•</span>
                  {c}
                </li>
              ))}
            </ul>
          </div>
          <div className="bg-[#D6F5E3]/40 dark:bg-[rgba(20,102,64,0.1)] rounded-lg p-3.5 border border-[#6EE7B7]/30 dark:border-[rgba(110,231,183,0.15)]">
            <div className="label-xs text-[#065F46] dark:text-[#6EE7B7] mb-1.5">Resolution</div>
            <p className="text-[12.5px] text-[#065F46] dark:text-[#6EE7B7] leading-relaxed">{items[active].resolution}</p>
          </div>
        </div>
      )}
    </div>
  )
}

import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { discoveryApi } from '../../../api/client'

const TABS = ['Criteria', 'Script']

const TYPE_COLOR = {
  'CIM/WBEM':   'badge-teal',
  'SSH':         'badge-green',
  'WMI':         'badge-sky',
  'SNMP':        'badge-violet',
  'PowerShell':  'badge-sky',
  'Script':      'badge-amber',
  'TCP':         'badge-orange',
  'JDBC':        'badge-indigo',
  'Generic':     'badge-gray',
}

function typeColor(type) {
  return TYPE_COLOR[type] || 'badge-gray'
}

function CiTableBadge({ table, label }) {
  if (!table) return null
  return (
    <span className="mono px-2 py-0.5 rounded border border-[#9DDCBA] dark:border-[rgba(23,192,104,0.25)] bg-[#E6F6ED] dark:bg-[rgba(23,192,104,0.1)]">
      {label && label !== table ? label : table}
    </span>
  )
}

function TypeBadge({ type }) {
  if (!type) return null
  return (
    <span className={`badge ${typeColor(type)}`}>{type}</span>
  )
}

export default function ClassifierDetail() {
  const { id } = useParams()
  const [clf, setClf]         = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)
  const [tab, setTab]         = useState('Criteria')

  useEffect(() => {
    setLoading(true)
    setError(null)
    discoveryApi.getClassifier(id)
      .then(data => { setClf(data); setLoading(false) })
      .catch(err => { setError(err.message); setLoading(false) })
  }, [id])

  if (loading) return (
    <div className="page flex items-center justify-center text-[#8EA898] dark:text-[#6A9880] text-sm">
      Loading classifier…
    </div>
  )

  if (error) return (
    <div className="page flex items-center justify-center text-red-500 text-sm">{error}</div>
  )

  if (!clf) return null

  const criteria = clf.criteria || []

  return (
    <div className="page">
      {/* Header */}
      <div className="page-hdr pb-0">
        <div className="flex items-start gap-3 mb-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className="label-xs">Classifier</span>
              {clf.active === false && (
                <span className="badge badge-amber">inactive</span>
              )}
              {clf.type && <TypeBadge type={clf.type} />}
              {clf.matchCriteria && (
                <span className="text-[10.5px] px-2 py-0.5 rounded-full border font-medium bg-white dark:bg-[#182419] text-[#2A3A30] dark:text-[#93B5A5] border-[#E0E6E2] dark:border-[#1E3028]">
                  match: <span className="font-semibold text-[#131A15] dark:text-[#E0EAE4]">{clf.matchCriteria}</span>
                </span>
              )}
            </div>
            <h1 className="page-title text-xl">{clf.name}</h1>
            <div className="mt-1.5 flex items-center gap-2 flex-wrap">
              <span className="text-[12px] text-[#8EA898] dark:text-[#6A9880]">→</span>
              <CiTableBadge table={clf.ciTable} label={clf.ciTableLabel} />
              {/* {(!clf.ciTableLabel || clf.ciTableLabel === clf.ciTable) && clf.ciTable && (
                <span className="mono">{clf.ciTable}</span>
              )} */}
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-2xl font-bold text-[#131A15] dark:text-[#E0EAE4] tabular-nums">
              {criteria.length}
            </div>
            <div className="label-xs">
              {criteria.length === 1 ? 'criterion' : 'criteria'}
            </div>
          </div>
        </div>

        {/* Tabs — underline style */}
        <div className="flex gap-0 -mb-px">
          {TABS.map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={[
                'px-4 py-2 text-[13px] font-medium border-b-2 transition-colors duration-100 cursor-pointer',
                tab === t
                  ? 'border-[#0C9248] dark:border-[#17C068] text-[#0C9248] dark:text-[#17C068]'
                  : 'border-transparent text-[#8EA898] dark:text-[#6A9880] hover:text-[#131A15] dark:hover:text-[#E0EAE4]',
              ].join(' ')}
              style={{ fontFamily: 'inherit' }}
            >
              {t}
              {t === 'Criteria' && criteria.length > 0 && (
                <span className="ml-1.5 text-[11px] text-[#D4D1CA] dark:text-[#363A52] tabular-nums">
                  ({criteria.length})
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Body */}
      <div className="page-body">
        <div className="page-inner">
          {tab === 'Criteria' && (
            <CriteriaTab criteria={criteria} classifierType={clf.type} />
          )}
          {tab === 'Script' && (
            <ScriptTab script={clf.script} />
          )}
        </div>
      </div>
    </div>
  )
}

/* ── Criteria tab ─────────────────────────────────────────────────────────── */

function CriteriaTab({ criteria, classifierType }) {
  if (criteria.length === 0) {
    return (
      <div className="card">
        <div className="card-hdr">Classification Criteria</div>
        <div className="px-4 py-6 text-[12px] text-[#8EA898] dark:text-[#6A9880] text-center">
          No criteria defined for this classifier.
        </div>
      </div>
    )
  }

  return (
    <div className="card">
      <div className="card-hdr">
        <span>Classification Criteria</span>
        <span className="card-count">{criteria.length} {criteria.length === 1 ? 'rule' : 'rules'}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="tbl">
          <thead>
            <tr>
              <th>Name</th>
              <th>Criterion</th>
              <th className="whitespace-nowrap">Operator</th>
              <th>Value</th>
              <th className="text-right w-14">Order</th>
            </tr>
          </thead>
          <tbody>
            {criteria.map((c, i) => (
              <tr key={c.id || i}>
                <td className="whitespace-nowrap">
                  {c.name
                    ? <span className="font-medium text-[#131A15] dark:text-[#E0EAE4]">{c.name}</span>
                    : <span className="text-[#D4D1CA] dark:text-[#363A52]">—</span>}
                </td>
                <td>
                  {c.criterion
                    ? <span className="mono break-all">{c.criterion}</span>
                    : <span className="text-[#D4D1CA] dark:text-[#363A52]">—</span>}
                </td>
                <td className="whitespace-nowrap">
                  {c.operator
                    ? <span className="font-mono text-[11.5px] text-[#0C9248] dark:text-[#17C068]">{c.operator}</span>
                    : <span className="text-[#D4D1CA] dark:text-[#363A52]">—</span>}
                </td>
                <td>
                  {c.value
                    ? <span className="font-mono text-[11.5px] text-[#131A15] dark:text-[#B8CEC4] break-all">{c.value}</span>
                    : <span className="text-[#D4D1CA] dark:text-[#363A52]">—</span>}
                </td>
                <td className="text-right text-[#8EA898] dark:text-[#6A9880] tabular-nums">
                  {c.order ?? '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/* ── Script tab ───────────────────────────────────────────────────────────── */

function ScriptTab({ script }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(script || '').then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <div className="card">
      <div className="card-hdr">
        <span>Classification Script</span>
        {script && (
          <button
            onClick={handleCopy}
            className="ml-auto text-[11px] px-2 py-0.5 rounded border border-[#E0E6E2] dark:border-[#1E3028] text-[#8EA898] dark:text-[#6A9880] hover:bg-[#EBF0EC] dark:hover:bg-white/5 transition-colors cursor-pointer"
            style={{ fontFamily: 'inherit' }}
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
        )}
      </div>
      {script ? (
        <div className="p-4">
          <pre className="code-pre">{script}</pre>
        </div>
      ) : (
        <div className="px-4 py-6 text-[12px] text-[#8EA898] dark:text-[#6A9880] text-center">
          No script defined for this classifier.
        </div>
      )}
    </div>
  )
}

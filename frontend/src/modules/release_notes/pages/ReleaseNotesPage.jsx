import { useState, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { releaseNotesApi } from '../../../api/client'
import { MD_COMPONENTS } from '../../../components/markdown'

function formatDate(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
}

function formatTimestamp(iso) {
  if (!iso) return null
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

export default function ReleaseNotesPage() {
  const [releases,    setReleases]    = useState(null)
  const [lastFetched, setLastFetched] = useState(null)
  const [error,       setError]       = useState(null)
  const [activeTag,   setActiveTag]   = useState(null)

  useEffect(() => {
    releaseNotesApi.getAll()
      .then(data => {
        const list = data.releases || []
        setReleases(list)
        setLastFetched(data.lastFetched)
        setError(data.error || null)
        if (list.length) setActiveTag(list[0].tagName)
      })
      .catch(e => setError(e.message))
  }, [])

  if (releases === null) {
    return (
      <div className="page">
        <div className="page-hdr"><h1 className="page-title">Release Notes</h1></div>
        <div className="page-body"><div className="page-inner">
          <div className="text-[13px] text-[#506458] dark:text-[#4A6858]">Loading…</div>
        </div></div>
      </div>
    )
  }

  const active = releases.find(r => r.tagName === activeTag)

  return (
    <div className="page">
      <div className="page-hdr">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="page-title">Release Notes</h1>
            <p className="page-sub">Changelog for sn-explorer, synced hourly from GitHub</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {releases.length > 0 && <span className="badge badge-green">{releases.length} releases</span>}
            {lastFetched && (
              <span className="text-[11px] text-[#506458] dark:text-[#4A6858] whitespace-nowrap">
                Synced {formatTimestamp(lastFetched)}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="page-body">
        <div className="page-inner">

          {error && releases.length === 0 && (
            <div className="card p-6 text-center text-[12.5px] text-red-500 dark:text-red-400">
              Couldn't load release notes: {error}
            </div>
          )}

          {releases.length === 0 && !error && (
            <div className="card">
              <div className="empty-state">
                <div className="empty-icon">🏷️</div>
                <div className="empty-title">No releases published yet</div>
                <div className="empty-sub">Check back after the next sn-explorer release.</div>
              </div>
            </div>
          )}

          {releases.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-5 items-start">

              {/* Version list */}
              <div className="card overflow-hidden lg:sticky lg:top-5">
                <div className="list-group-hdr" style={{ justifyContent: 'space-between' }}>
                  <span>Versions</span>
                  <span className="tabular-nums">{releases.length}</span>
                </div>
                <div className="flex flex-col">
                  {releases.map((r, i) => (
                    <button
                      key={r.tagName}
                      onClick={() => setActiveTag(r.tagName)}
                      className={`text-left px-4 py-3 border-b border-[#E6EDEA] dark:border-[#1A2C22] last:border-0 transition-colors duration-100
                        ${activeTag === r.tagName
                          ? 'bg-[#D6F5E3] dark:bg-[rgba(20,102,64,0.2)]'
                          : 'hover:bg-[#F0F5F2] dark:hover:bg-white/[0.03]'
                        }`}
                    >
                      <div className="flex items-center gap-1.5 flex-wrap mb-1">
                        <span className="mono">{r.tagName}</span>
                        {i === 0 && <span className="badge badge-green">Latest</span>}
                        {r.prerelease && <span className="badge badge-amber">Pre-release</span>}
                      </div>
                      <div className="text-[11px] text-[#506458] dark:text-[#4A6858]">{formatDate(r.publishedAt)}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Detail */}
              {active && (
                <div className="card p-6">
                  <div className="flex items-start justify-between gap-3 flex-wrap mb-1">
                    <h2 className="text-[18px] font-bold text-[#131A15] dark:text-[#E0EAE4]">
                      {active.name}
                    </h2>
                    <a
                      href={active.htmlUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[11.5px] text-[#0C9248] dark:text-[#17C068] hover:underline shrink-0 mt-1"
                    >
                      View on GitHub ↗
                    </a>
                  </div>
                  <div className="flex items-center gap-2 mb-5">
                    <span className="text-[11.5px] text-[#506458] dark:text-[#4A6858]">{formatDate(active.publishedAt)}</span>
                    {active.prerelease && <span className="badge badge-amber">Pre-release</span>}
                  </div>

                  {active.body ? (
                    <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD_COMPONENTS}>
                      {active.body}
                    </ReactMarkdown>
                  ) : (
                    <p className="text-[12.5px] text-[#506458] dark:text-[#4A6858] italic">No description provided.</p>
                  )}
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  )
}

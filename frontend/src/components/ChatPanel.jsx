import { useState, useRef, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { chatApi } from '../api/client'
import { MD_COMPONENTS } from './markdown'

// ── Constants ─────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'sn_explorer_openai_key'

const STARTERS = [
  'Which patterns cover Windows servers?',
  'What happens during the L2 discovery stage?',
  'How does IRE identification work?',
  "What's the difference between Horizontal and Top-Down patterns?",
  'Which patterns use WMI protocol?',
  'What credential types are used by Linux patterns?',
]

// ── Icons ─────────────────────────────────────────────────────────────────────

function IconChat() {
  return (
    <svg width="13" height="13" viewBox="0 0 12 12" fill="none">
      <path d="M6 1C3.24 1 1 3.05 1 5.55c0 1.16.48 2.2 1.27 2.97L1.75 11l2.3-.72C4.57 10.7 5.27 10.9 6 10.9c2.76 0 5-2.05 5-4.55S8.76 1 6 1z" fill="currentColor"/>
    </svg>
  )
}

function IconKey() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <circle cx="6" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.4"/>
      <path d="M9 8h5M12 6.5V8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
    </svg>
  )
}

function IconClose() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
    </svg>
  )
}

function IconSend() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
      <path d="M13.5 7.5L1.5 13l2-5.5L1.5 2l12 5.5z" fill="currentColor"/>
    </svg>
  )
}

// ── API key form ──────────────────────────────────────────────────────────────

function KeySetupScreen({ onSave }) {
  const [value, setValue] = useState('')
  const [error, setError] = useState('')
  const [show,  setShow]  = useState(false)
  const inputRef = useRef(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  function handleSave() {
    const key = value.trim()
    if (!key) { setError('Please enter your API key.'); return }
    if (!key.startsWith('sk-')) { setError('OpenAI keys start with "sk-".'); return }
    onSave(key)
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 py-8 gap-5 bg-[#F4F5F4] dark:bg-[#0D1410]">

      {/* Icon */}
      <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#0C9248] to-[#17C068] flex items-center justify-center shadow-sm">
        <svg width="22" height="22" viewBox="0 0 16 16" fill="none">
          <circle cx="6" cy="8" r="3.5" stroke="white" strokeWidth="1.5"/>
          <path d="M9 8h5M12 6.5V8" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      </div>

      {/* Text */}
      <div className="text-center max-w-[280px]">
        <div className="text-[14px] font-semibold text-[#131A15] dark:text-[#E0EAE4] mb-1.5">
          Enter your OpenAI API key
        </div>
        <p className="text-[12px] text-[#506458] dark:text-[#4A6858] leading-relaxed">
          Your key is stored only in <strong className="text-[#3E5448] dark:text-[#A8C4B8]">this browser</strong> and is never sent to our servers or shared with anyone else.
        </p>
      </div>

      {/* Input */}
      <div className="w-full max-w-[300px] flex flex-col gap-2">
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type={show ? 'text' : 'password'}
            value={value}
            onChange={e => { setValue(e.target.value); setError('') }}
            onKeyDown={e => e.key === 'Enter' && handleSave()}
            placeholder="sk-..."
            className="flex-1 px-3 py-2 text-[13px] bg-white dark:bg-[#141E18] border border-[#D8E2DC] dark:border-[#1A2C22] rounded-xl text-[#131A15] dark:text-[#E0EAE4] placeholder:text-[#C4D9CC] dark:placeholder:text-[#2E4238] outline-none focus:border-[#0C9248] dark:focus:border-[#17C068] transition-colors"
          />
          <button
            onClick={() => setShow(v => !v)}
            className="px-2.5 py-2 rounded-xl border border-[#D8E2DC] dark:border-[#1A2C22] text-[11px] text-[#506458] dark:text-[#4A6858] bg-white dark:bg-[#141E18] hover:border-[#9DDCBA] dark:hover:border-[rgba(23,192,104,0.3)] transition-colors cursor-pointer"
          >
            {show ? 'Hide' : 'Show'}
          </button>
        </div>

        {error && (
          <p className="text-[11.5px] text-red-500 dark:text-red-400">{error}</p>
        )}

        <button
          onClick={handleSave}
          className="w-full py-2 rounded-xl bg-[#0C9248] hover:bg-[#0A7A3C] text-white text-[13px] font-semibold transition-colors cursor-pointer"
        >
          Save key &amp; continue
        </button>
      </div>

      {/* External link */}
      <a
        href="https://platform.openai.com/api-keys"
        target="_blank"
        rel="noreferrer"
        className="text-[11.5px] text-[#0C9248] dark:text-[#17C068] hover:opacity-75 transition-opacity"
      >
        Don't have a key? Get one at platform.openai.com →
      </a>
    </div>
  )
}

// ── Inline key-change form (shown from header button) ─────────────────────────

function KeyChangeBar({ onUpdate, onRemove, onCancel }) {
  const [value, setValue] = useState('')
  const [error, setError] = useState('')
  const [show,  setShow]  = useState(false)

  function handleUpdate() {
    const key = value.trim()
    if (!key) { setError('Key cannot be empty.'); return }
    if (!key.startsWith('sk-')) { setError('OpenAI keys start with "sk-".'); return }
    onUpdate(key)
  }

  return (
    <div className="shrink-0 px-4 py-3 border-b border-[#D8E2DC] dark:border-[#1A2C22] bg-[#F9FAF9] dark:bg-[#172018]">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-[#506458] dark:text-[#4A6858] mb-2">
        Change API key
      </div>
      <div className="flex gap-2 mb-2">
        <input
          autoFocus
          type={show ? 'text' : 'password'}
          value={value}
          onChange={e => { setValue(e.target.value); setError('') }}
          onKeyDown={e => e.key === 'Enter' && handleUpdate()}
          placeholder="sk-..."
          className="flex-1 px-2.5 py-1.5 text-[12px] bg-white dark:bg-[#141E18] border border-[#D8E2DC] dark:border-[#1A2C22] rounded-lg text-[#131A15] dark:text-[#E0EAE4] placeholder:text-[#C4D9CC] dark:placeholder:text-[#2E4238] outline-none focus:border-[#0C9248] dark:focus:border-[#17C068] transition-colors"
        />
        <button
          onClick={() => setShow(v => !v)}
          className="px-2 py-1.5 rounded-lg border border-[#D8E2DC] dark:border-[#1A2C22] text-[11px] text-[#506458] dark:text-[#4A6858] bg-white dark:bg-[#141E18] hover:border-[#9DDCBA] transition-colors cursor-pointer"
        >
          {show ? 'Hide' : 'Show'}
        </button>
      </div>
      {error && <p className="text-[11px] text-red-500 dark:text-red-400 mb-2">{error}</p>}
      <div className="flex gap-2">
        <button
          onClick={handleUpdate}
          className="px-3 py-1.5 rounded-lg bg-[#0C9248] text-white text-[12px] font-semibold hover:bg-[#0A7A3C] transition-colors cursor-pointer"
        >
          Update
        </button>
        <button
          onClick={onRemove}
          className="px-3 py-1.5 rounded-lg border border-[#D8E2DC] dark:border-[#1A2C22] text-[12px] text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors cursor-pointer"
        >
          Remove key
        </button>
        <button
          onClick={onCancel}
          className="ml-auto px-3 py-1.5 rounded-lg text-[12px] text-[#506458] dark:text-[#4A6858] hover:text-[#3E5448] dark:hover:text-[#A8C4B8] transition-colors cursor-pointer"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ChatPanel({ open, onClose }) {
  const [apiKey,       setApiKey]       = useState(() => sessionStorage.getItem(STORAGE_KEY) || '')
  const [showKeyBar,   setShowKeyBar]   = useState(false)
  const [messages,     setMessages]     = useState([])
  const [input,        setInput]        = useState('')
  const [loading,      setLoading]      = useState(false)
  const bottomRef = useRef(null)
  const inputRef  = useRef(null)

  useEffect(() => {
    if (open && apiKey) setTimeout(() => inputRef.current?.focus(), 50)
  }, [open, apiKey])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  function persistKey(key) {
    sessionStorage.setItem(STORAGE_KEY, key)
    setApiKey(key)
    setShowKeyBar(false)
  }

  function removeKey() {
    sessionStorage.removeItem(STORAGE_KEY)
    setApiKey('')
    setMessages([])
    setShowKeyBar(false)
  }

  async function send(text) {
    const question = (text ?? input).trim()
    if (!question || loading) return

    const userMsg     = { role: 'user', content: question }
    const nextHistory = [...messages, userMsg]
    setMessages([...nextHistory, { role: 'assistant', content: '' }])
    setInput('')
    setLoading(true)

    try {
      const { system } = await chatApi.getContext(question, nextHistory)
      await chatApi.stream(apiKey, system, nextHistory, chunk => {
        setMessages(prev => {
          const updated = [...prev]
          updated[updated.length - 1] = {
            role:    'assistant',
            content: updated[updated.length - 1].content + chunk,
          }
          return updated
        })
      })
    } catch (e) {
      setMessages(prev => {
        const updated = [...prev]
        updated[updated.length - 1] = {
          role:    'assistant',
          content: `Something went wrong: ${e.message}`,
        }
        return updated
      })
    } finally {
      setLoading(false)
    }
  }

  if (!open) return null

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/25 dark:bg-black/50 z-40" onClick={onClose} />

      {/* Drawer */}
      <div className="fixed right-0 top-0 bottom-0 w-full sm:w-[420px] z-50 flex flex-col bg-white dark:bg-[#141E18] border-l border-[#D8E2DC] dark:border-[#1A2C22] shadow-2xl">

        {/* Header */}
        <div className="flex items-center gap-2.5 px-4 py-3 border-b border-[#D8E2DC] dark:border-[#1A2C22] shrink-0">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#0C9248] to-[#17C068] flex items-center justify-center shrink-0">
            <IconChat />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-semibold text-[#131A15] dark:text-[#E0EAE4] leading-none">
              Discovery Assistant
            </div>
            <div className="text-[10.5px] text-[#506458] dark:text-[#4A6858] mt-0.5">
              Patterns · Stages · IRE
            </div>
          </div>

          {/* Key management — only when key is set */}
          {apiKey && (
            <button
              onClick={() => setShowKeyBar(v => !v)}
              title="Manage API key"
              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                showKeyBar
                  ? 'bg-[#E6F6ED] dark:bg-[rgba(23,192,104,0.1)] text-[#0C9248] dark:text-[#17C068]'
                  : 'text-[#506458] dark:text-[#4A6858] hover:bg-[#EBF0EC] dark:hover:bg-white/[0.05]'
              }`}
            >
              <IconKey />
            </button>
          )}

          {messages.length > 0 && (
            <button
              onClick={() => setMessages([])}
              className="text-[11px] px-2 py-1 rounded text-[#506458] dark:text-[#4A6858] hover:bg-[#E6F6ED] dark:hover:bg-[rgba(23,192,104,0.06)] cursor-pointer transition-colors"
            >
              Clear
            </button>
          )}

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#506458] dark:text-[#4A6858] hover:bg-[#E6F6ED] dark:hover:bg-[rgba(23,192,104,0.06)] cursor-pointer transition-colors"
            aria-label="Close"
          >
            <IconClose />
          </button>
        </div>

        {/* Inline key change bar */}
        {apiKey && showKeyBar && (
          <KeyChangeBar
            onUpdate={persistKey}
            onRemove={removeKey}
            onCancel={() => setShowKeyBar(false)}
          />
        )}

        {/* No key set — show full setup screen */}
        {!apiKey ? (
          <KeySetupScreen onSave={persistKey} />
        ) : (
          <>
            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 bg-[#F4F5F4] dark:bg-[#0D1410]">
              {messages.length === 0 && (
                <div className="space-y-3">
                  <p className="text-[12px] text-[#506458] dark:text-[#4A6858] leading-relaxed">
                    Ask anything about ServiceNow Discovery — patterns, stages, IRE rules, probes, classifiers, credentials.
                  </p>
                  <div className="space-y-1.5">
                    {STARTERS.map(s => (
                      <button
                        key={s}
                        onClick={() => send(s)}
                        className="w-full text-left text-[12px] px-3 py-2 rounded-lg bg-white dark:bg-[#172018] border border-[#D8E2DC] dark:border-[#1A2C22] text-[#1E3028] dark:text-[#A8C4B8] hover:border-[#0C9248] dark:hover:border-[#17C068] hover:bg-[#E6F6ED] dark:hover:bg-[rgba(23,192,104,0.08)] cursor-pointer transition-colors"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  {msg.role === 'user' ? (
                    <div
                      className="max-w-[88%] rounded-2xl rounded-br-sm px-3.5 py-2.5 text-[13px] leading-relaxed bg-[#0C9248] text-white"
                      style={{ wordBreak: 'break-word' }}
                    >
                      {msg.content}
                    </div>
                  ) : (
                    <div className="max-w-[88%] rounded-2xl rounded-bl-sm px-3.5 py-2.5 bg-white dark:bg-[#172018] text-[#131A15] dark:text-[#E0EAE4]">
                      {msg.content ? (
                        <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD_COMPONENTS}>
                          {msg.content}
                        </ReactMarkdown>
                      ) : (
                        loading && i === messages.length - 1
                          ? <span className="inline-block w-1.5 h-4 bg-current rounded-sm animate-pulse" />
                          : null
                      )}
                    </div>
                  )}
                </div>
              ))}
              <div ref={bottomRef} />
            </div>

            {/* Input */}
            <div className="border-t border-[#D8E2DC] dark:border-[#1A2C22] p-3 shrink-0 bg-white dark:bg-[#141E18]">
              <div className="flex gap-2 items-end">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
                  }}
                  placeholder="Ask about patterns, stages, IRE…"
                  rows={1}
                  disabled={loading}
                  className="flex-1 px-3 py-2 text-[13px] bg-[#F4F5F4] dark:bg-[#0D1410] border border-[#D8E2DC] dark:border-[#1A2C22] rounded-xl text-[#131A15] dark:text-[#E0EAE4] placeholder:text-[#506458] dark:placeholder:text-[#4A6858] outline-none focus:border-[#0C9248] dark:focus:border-[#17C068] disabled:opacity-60 transition-colors resize-none"
                  style={{ minHeight: '38px', maxHeight: '120px', overflowY: 'auto' }}
                />
                <button
                  onClick={() => send()}
                  disabled={!input.trim() || loading}
                  className="shrink-0 w-9 h-9 flex items-center justify-center rounded-xl bg-[#0C9248] hover:bg-[#0A7A3C] text-white disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
                  aria-label="Send"
                >
                  <IconSend />
                </button>
              </div>
              <p className="text-[10px] text-[#B8D8C6] dark:text-[#1E3028] mt-1.5 text-center select-none">
                Enter to send · Shift+Enter for new line
              </p>
            </div>
          </>
        )}

      </div>
    </>
  )
}

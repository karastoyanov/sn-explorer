import { useState, useRef, useEffect } from 'react'
import { chatApi } from '../api/client'

const STARTERS = [
  'Which patterns cover Windows servers?',
  'What happens during the L2 discovery stage?',
  'How does IRE identification work?',
  "What's the difference between Horizontal and Top-Down patterns?",
  'Which patterns use WMI protocol?',
  'What credential types are used by Linux patterns?',
]

export default function ChatPanel({ open, onClose }) {
  const [messages, setMessages] = useState([])
  const [input, setInput]       = useState('')
  const [loading, setLoading]   = useState(false)
  const bottomRef = useRef(null)
  const inputRef  = useRef(null)

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50)
  }, [open])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function send(text) {
    const question = (text ?? input).trim()
    if (!question || loading) return

    const userMsg     = { role: 'user', content: question }
    const nextHistory = [...messages, userMsg]
    setMessages([...nextHistory, { role: 'assistant', content: '' }])
    setInput('')
    setLoading(true)

    try {
      await chatApi.stream(nextHistory, chunk => {
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
          content: `Sorry, something went wrong: ${e.message}. Make sure ANTHROPIC_API_KEY is set in your .env file.`,
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
      <div
        className="fixed inset-0 bg-black/25 dark:bg-black/50 z-40"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="fixed right-0 top-0 bottom-0 w-full sm:w-[420px] z-50 flex flex-col bg-white dark:bg-[#141E18] border-l border-[#E0E6E2] dark:border-[#1E3028] shadow-2xl">

        {/* Header */}
        <div className="flex items-center gap-2.5 px-4 py-3 border-b border-[#E0E6E2] dark:border-[#1E3028] shrink-0">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#0C9248] to-[#17C068] flex items-center justify-center shrink-0">
            <svg width="14" height="14" viewBox="0 0 12 12" fill="none">
              <path d="M6 1C3.24 1 1 3.05 1 5.55c0 1.16.48 2.2 1.27 2.97L1.75 11l2.3-.72C4.57 10.7 5.27 10.9 6 10.9c2.76 0 5-2.05 5-4.55S8.76 1 6 1z" fill="white"/>
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-semibold text-[#131A15] dark:text-[#E0EAE4] leading-none">
              Discovery Assistant
            </div>
            <div className="text-[10.5px] text-[#8EA898] dark:text-[#6A9880] mt-0.5">
              Patterns · Stages · IRE
            </div>
          </div>
          {messages.length > 0 && (
            <button
              onClick={() => setMessages([])}
              className="text-[11px] px-2 py-1 rounded text-[#8EA898] dark:text-[#6A9880] hover:bg-[#E6F6ED] dark:hover:bg-[rgba(23,192,104,0.06)] cursor-pointer transition-colors"
            >
              Clear
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#8EA898] dark:text-[#6A9880] hover:bg-[#E6F6ED] dark:hover:bg-[rgba(23,192,104,0.06)] cursor-pointer transition-colors"
            aria-label="Close"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 bg-[#F4F5F4] dark:bg-[#0D1410]">
          {messages.length === 0 && (
            <div className="space-y-3">
              <p className="text-[12px] text-[#8EA898] dark:text-[#6A9880] leading-relaxed">
                Ask anything about ServiceNow Discovery — patterns, stages, IRE rules, probes, classifiers, credentials.
              </p>
              <div className="space-y-1.5">
                {STARTERS.map(s => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="w-full text-left text-[12px] px-3 py-2 rounded-lg bg-white dark:bg-[#182419] border border-[#E0E6E2] dark:border-[#1E3028] text-[#2A3A30] dark:text-[#93B5A5] hover:border-[#0C9248] dark:hover:border-[#17C068] hover:bg-[#E6F6ED] dark:hover:bg-[rgba(23,192,104,0.08)] cursor-pointer transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={[
                  'max-w-[88%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed',
                  msg.role === 'user'
                    ? 'bg-[#0C9248] text-white rounded-br-sm'
                    : 'bg-white dark:bg-[#182419] text-[#131A15] dark:text-[#E0EAE4] rounded-bl-sm',
                ].join(' ')}
                style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
              >
                {msg.content || (
                  loading && i === messages.length - 1
                    ? <span className="inline-block w-1.5 h-4 bg-current rounded-sm animate-pulse" />
                    : null
                )}
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="border-t border-[#E0E6E2] dark:border-[#1E3028] p-3 shrink-0 bg-white dark:bg-[#141E18]">
          <div className="flex gap-2 items-end">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  send()
                }
              }}
              placeholder="Ask about patterns, stages, IRE…"
              rows={1}
              disabled={loading}
              className="flex-1 px-3 py-2 text-[13px] bg-[#F4F5F4] dark:bg-[#0D1410] border border-[#E0E6E2] dark:border-[#1E3028] rounded-xl text-[#131A15] dark:text-[#E0EAE4] placeholder:text-[#8EA898] dark:placeholder:text-[#6A9880] outline-none focus:border-[#0C9248] dark:focus:border-[#17C068] disabled:opacity-60 transition-colors resize-none"
              style={{ minHeight: '38px', maxHeight: '120px', overflowY: 'auto' }}
            />
            <button
              onClick={() => send()}
              disabled={!input.trim() || loading}
              className="shrink-0 w-9 h-9 flex items-center justify-center rounded-xl bg-[#0C9248] hover:bg-[#0C9248] text-white disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
              aria-label="Send"
            >
              <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
                <path d="M13.5 7.5L1.5 13l2-5.5L1.5 2l12 5.5z" fill="currentColor"/>
              </svg>
            </button>
          </div>
          <p className="text-[10px] text-[#B8D8C6] dark:text-[#1E3028] mt-1.5 text-center select-none">
            Enter to send · Shift+Enter for new line
          </p>
        </div>
      </div>
    </>
  )
}

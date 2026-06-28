async function get(path) {
  const res = await fetch(`/api${path}`)
  if (!res.ok) throw new Error(`API ${res.status}: ${path}`)
  return res.json()
}

export const discoveryApi = {
  getStats:    ()              => get('/discovery/stats'),
  getPatterns: (q = '', cat = '') => {
    const params = new URLSearchParams()
    if (q)   params.set('q', q)
    if (cat) params.set('category', cat)
    const qs = params.toString()
    return get(`/discovery/patterns${qs ? `?${qs}` : ''}`)
  },
  getPattern: (id)            => get(`/discovery/patterns/${id}`),
  getStages:  ()              => get('/discovery/stages'),
  getIre:     ()              => get('/discovery/ire'),
  getClassifiers: (q = '') => {
    const params = new URLSearchParams()
    if (q) params.set('q', q)
    const qs = params.toString()
    return get(`/discovery/classifiers${qs ? `?${qs}` : ''}`)
  },
  getClassifier: (id) => get(`/discovery/classifiers/${id}`),
  getCredentials: () => get('/discovery/credentials'),
  getMidServer:   () => get('/discovery/mid-server'),
}

export const cmdbApi = {
  getData:   (includeFields = false) => get(`/cmdb/data${includeFields ? '?fields=true' : ''}`),
  getStatus: () => get('/cmdb/status'),
}

export const modulesApi = {
  getAll: () => get('/modules'),
}

export const chatApi = {
  /**
   * Fetch RAG-enriched system prompt from the backend (no API key involved).
   * Passes full message history so the backend can use prior turns for retrieval.
   */
  async getContext(query, messages = []) {
    const res = await fetch('/api/discovery/chat/context', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ query, messages }),
    })
    if (!res.ok) throw new Error(`Failed to load context (${res.status})`)
    return res.json()  // { system: string }
  },

  /**
   * Call OpenAI's chat completions API directly from the browser.
   * The API key is provided by the caller and never sent to our backend.
   */
  async stream(apiKey, systemPrompt, messages, onChunk) {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model:      'gpt-4o-mini',
        max_tokens: 1024,
        stream:     true,
        messages:   [{ role: 'system', content: systemPrompt }, ...messages],
      }),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.error?.message || `OpenAI error ${res.status}`)
    }

    const reader  = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer    = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop()

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        const payload = line.slice(6)
        if (payload === '[DONE]') return
        try {
          const content = JSON.parse(payload).choices?.[0]?.delta?.content
          if (content) onChunk(content)
        } catch {}
      }
    }
  },
}

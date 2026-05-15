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
}

export const modulesApi = {
  getAll: () => get('/modules'),
}

export const chatApi = {
  async stream(messages, onChunk) {
    const res = await fetch('/api/discovery/chat', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ messages }),
    })
    if (!res.ok) throw new Error(`API ${res.status}: /discovery/chat`)

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
          const parsed = JSON.parse(payload)
          if (parsed.error) throw new Error(parsed.error)
          if (parsed.text)  onChunk(parsed.text)
        } catch (e) {
          if (e.message !== 'Unexpected token') throw e
        }
      }
    }
  },
}

;(function () {
  const MOSCOW_TIMEZONE = 'Europe/Moscow'
  const FIRST_VISIT_KEY = 'gadaelka_first_visit'
  const SOURCE_KEY = 'gadaelka_source'
  const FLUSH_INTERVAL_MS = 30000
  const VALID_PAGES = new Set(['compatibility', 'tarot', 'numerology', 'dreambook'])
  const VALID_TIERS = new Set(['free', 'paid'])
  const VALID_EVENTS = new Set([
    'session_start',
    'page_view',
    'reading_complete',
    'payment_init',
    'share',
    'session_end',
  ])

  const state = {
    started: false,
    ended: false,
    startedAtMs: 0,
    isNewUser: false,
    source: 'direct',
    lastPage: '',
    pagesVisited: new Set(),
    buffer: [],
    flushTimer: 0,
  }

  function backendUrl() {
    if (typeof window.API_URL === 'string' && window.API_URL.trim()) {
      return window.API_URL.trim()
    }
    return 'https://functions.yandexcloud.net/d4evrag730e6sqoil00l'
  }

  function getMoscowParts(date) {
    const formatter = new Intl.DateTimeFormat('sv-SE', {
      timeZone: MOSCOW_TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    })

    const mapped = {}
    formatter.formatToParts(date).forEach((part) => {
      if (part.type !== 'literal') mapped[part.type] = part.value
    })
    return mapped
  }

  function toMoscowIso(date) {
    const parts = getMoscowParts(date)
    const ms = String(date.getMilliseconds()).padStart(3, '0')
    return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}.${ms}+03:00`
  }

  function getUserId() {
    const raw = window.currentUser?.id
    const value = raw === undefined || raw === null ? '' : String(raw).trim()
    return value || 'anonymous'
  }

  function getSourceFromUrl() {
    try {
      const params = new URLSearchParams(window.location.search || '')
      const value = String(params.get('source') || '').trim()
      return value || ''
    } catch (_e) {
      return ''
    }
  }

  function resolveSource() {
    const fromUrl = getSourceFromUrl()
    if (fromUrl) {
      try {
        sessionStorage.setItem(SOURCE_KEY, fromUrl)
      } catch (_e) {
        // ignore
      }
      return fromUrl
    }

    try {
      const saved = String(sessionStorage.getItem(SOURCE_KEY) || '').trim()
      if (saved) return saved
    } catch (_e) {
      // ignore
    }

    return 'direct'
  }

  function resolveIsNewUser() {
    try {
      const seen = localStorage.getItem(FIRST_VISIT_KEY) === '1'
      if (!seen) localStorage.setItem(FIRST_VISIT_KEY, '1')
      return !seen
    } catch (_e) {
      return false
    }
  }

  function sanitizeEvent(rawEvent) {
    if (!rawEvent || typeof rawEvent !== 'object') return null
    const eventType = String(rawEvent.event_type || '').trim()
    if (!VALID_EVENTS.has(eventType)) return null

    const base = {
      event_type: eventType,
      user_id: getUserId(),
      timestamp: toMoscowIso(new Date()),
      source: state.source || 'direct',
      is_max: !!window.IS_MAX,
    }

    if (eventType === 'session_start') {
      base.referrer = String(document.referrer || '').trim()
      base.is_new_user = !!state.isNewUser
    }

    if (eventType === 'page_view') {
      const page = String(rawEvent.page || '').trim()
      if (!VALID_PAGES.has(page)) return null
      base.page = page
    }

    if (eventType === 'reading_complete') {
      const instrument = String(rawEvent.instrument || '').trim()
      const tier = String(rawEvent.tier || '').trim()
      if (!VALID_PAGES.has(instrument) || !VALID_TIERS.has(tier)) return null
      base.instrument = instrument
      base.tier = tier
    }

    if (eventType === 'payment_init' || eventType === 'share') {
      const instrument = String(rawEvent.instrument || '').trim()
      if (!VALID_PAGES.has(instrument)) return null
      base.instrument = instrument
    }

    if (eventType === 'session_end') {
      base.duration_seconds = Math.max(0, Math.round((Date.now() - state.startedAtMs) / 1000))
      base.pages_visited = Array.from(state.pagesVisited)
    }

    return base
  }

  function enqueue(rawEvent) {
    const event = sanitizeEvent(rawEvent)
    if (!event) return
    state.buffer.push(event)
  }

  async function flush(options) {
    const opts = options || {}
    const useBeacon = opts.useBeacon === true

    if (!state.buffer.length) return

    const events = state.buffer.slice()
    state.buffer.length = 0

    const payload = JSON.stringify({
      action: 'track',
      events,
    })

    if (useBeacon && navigator.sendBeacon) {
      try {
        const ok = navigator.sendBeacon(
          backendUrl(),
          new Blob([payload], { type: 'application/json' }),
        )
        if (ok) return
      } catch (_e) {
        // fallback to fetch below
      }
    }

    try {
      const response = await fetch(backendUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        keepalive: useBeacon,
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
    } catch (error) {
      state.buffer.unshift(...events)
      console.warn('[analytics] send failed', error)
    }
  }

  function endSession(useBeacon) {
    if (!state.started || state.ended) return
    state.ended = true
    enqueue({ event_type: 'session_end' })
    void flush({ useBeacon })
    if (state.flushTimer) {
      clearInterval(state.flushTimer)
      state.flushTimer = 0
    }
  }

  function init() {
    if (state.started) return
    state.started = true
    state.startedAtMs = Date.now()
    state.isNewUser = resolveIsNewUser()
    state.source = resolveSource()

    enqueue({ event_type: 'session_start' })

    state.flushTimer = window.setInterval(() => {
      void flush()
    }, FLUSH_INTERVAL_MS)

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        endSession(true)
      }
    })

    window.addEventListener('beforeunload', () => {
      endSession(true)
    })
  }

  function trackPageView(page) {
    const normalizedPage = String(page || '').trim()
    if (!VALID_PAGES.has(normalizedPage)) return
    if (state.lastPage === normalizedPage) return
    state.lastPage = normalizedPage
    state.pagesVisited.add(normalizedPage)
    enqueue({ event_type: 'page_view', page: normalizedPage })
  }

  function trackReadingComplete(instrument, tier) {
    enqueue({
      event_type: 'reading_complete',
      instrument: String(instrument || '').trim(),
      tier: String(tier || '').trim(),
    })
  }

  function trackPaymentInit(instrument) {
    enqueue({
      event_type: 'payment_init',
      instrument: String(instrument || '').trim(),
    })
  }

  function trackShare(instrument) {
    enqueue({
      event_type: 'share',
      instrument: String(instrument || '').trim(),
    })
  }

  window.analytics = {
    init,
    flush,
    trackPageView,
    trackReadingComplete,
    trackPaymentInit,
    trackShare,
  }
})()

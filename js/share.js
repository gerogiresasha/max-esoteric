;(function () {
  const SHARE_CONFIG = {
    compatibility: { emoji: '♾', title: 'Совместимость', subtitle: 'Астрологический расклад' },
    tarot: { emoji: '✦', title: 'Карта дня', subtitle: 'Таро' },
    numerology: { emoji: '◈', title: 'Расшифровка имени', subtitle: 'Нумерология' },
    dreambook: { emoji: '◑', title: 'Сонник', subtitle: 'Толкование сна' },
  }

  const CANVAS_SIZE = 1080
  const SHARE_MODAL_ID = 'share-result-modal'

  function clampText(input, maxChars) {
    const raw = String(input || '').trim()
    if (!raw) return ''
    if (raw.length <= maxChars) return raw
    return `${raw.slice(0, maxChars).replace(/\s+$/g, '')}...`
  }

  function buildShareText(config, text, opts) {
    const options = opts || {}
    const previewRaw = String(text || '').replace(/\s+/g, ' ').trim()
    const preview = clampText(previewRaw, 120) || '...'
    const link = typeof APP_LINK === 'string' ? APP_LINK : ''
    const includeLink = options.includeLink !== false
    const base = `${config.emoji} ${config.title}\n${preview}`.trim()
    if (!includeLink || !link) return base
    return `${base}\n\n${link}`.trim()
  }

  function seedFromString(str) {
    // Simple deterministic hash -> 32-bit unsigned
    let h = 2166136261
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i)
      h = Math.imul(h, 16777619)
    }
    return h >>> 0
  }

  function makeLcg(seed) {
    let state = (seed >>> 0) || 1
    return function random() {
      // LCG: Numerical Recipes
      state = (Math.imul(1664525, state) + 1013904223) >>> 0
      return state / 4294967296
    }
  }

  function wrapText(ctx, text, x, y, maxWidth, lineHeight, maxLines) {
    const words = String(text || '')
      .replace(/\s+/g, ' ')
      .trim()
      .split(' ')
      .filter(Boolean)

    if (!words.length) return

    const lines = []
    let current = ''
    let truncated = false

    function pushLine(line) {
      if (lines.length < maxLines) lines.push(line)
    }

    function breakLongWord(word) {
      let part = ''
      for (let i = 0; i < word.length; i++) {
        const next = part + word[i]
        if (ctx.measureText(next).width > maxWidth && part) {
          pushLine(part)
          part = word[i]
          if (lines.length >= maxLines) return ''
        } else {
          part = next
        }
      }
      return part
    }

    for (let i = 0; i < words.length; i++) {
      const w = words[i]
      const test = current ? `${current} ${w}` : w
      if (ctx.measureText(test).width <= maxWidth) {
        current = test
        continue
      }

      if (current) pushLine(current)
      current = ''
      if (lines.length >= maxLines) break

      if (ctx.measureText(w).width > maxWidth) {
        current = breakLongWord(w)
      } else {
        current = w
      }

      if (lines.length >= maxLines) break
    }

    if (lines.length < maxLines && current) pushLine(current)

    truncated = truncated || lines.length >= maxLines
    if (!truncated && lines.length) {
      const consumed = lines.join(' ').trim()
      const original = String(text || '').replace(/\s+/g, ' ').trim()
      truncated = consumed.length < original.length
    }

    if (truncated && lines.length) {
      const lastIdx = Math.min(lines.length, maxLines) - 1
      let last = lines[lastIdx]
      const ell = '...'
      if (!String(last || '').endsWith(ell)) {
        while (last && ctx.measureText(`${last}${ell}`).width > maxWidth) {
          last = last.slice(0, -1).replace(/\s+$/g, '')
        }
        lines[lastIdx] = `${last || ''}${ell}`.trim()
      }
      lines.length = Math.min(lines.length, maxLines)
    }

    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], x, y + i * lineHeight)
    }
  }

  function loadFonts() {
    if (!document.fonts || !document.fonts.check || !document.fonts.load) return Promise.resolve()

	    const checks = [
	      '600 32px Montserrat',
	      '400 26px Montserrat',
	      '600 24px Montserrat',
	      '400 18px Montserrat',
	    ]

    const allReady = checks.every((f) => document.fonts.check(f))
    if (allReady) return Promise.resolve()

    return Promise.all(checks.map((f) => document.fonts.load(f))).then(() => undefined)
  }

  function drawCard(instrument, text) {
    const cfg = SHARE_CONFIG[instrument]
    const canvas = document.createElement('canvas')
    canvas.width = CANVAS_SIZE
    canvas.height = CANVAS_SIZE

    const ctx = canvas.getContext('2d')
    if (!ctx) return { canvas, dataUrl: '' }

    // 1) Background gradient
    const bg = ctx.createLinearGradient(0, 0, 0, CANVAS_SIZE)
    bg.addColorStop(0, '#1a0533')
    bg.addColorStop(1, '#0d0d1a')
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE)

    // 2) Decorative stars (seeded)
    const seed = seedFromString(`${instrument}:${String(text || '').length}`)
    const rnd = makeLcg(seed)
    const starsCount = 40 + Math.floor(rnd() * 21)
    for (let i = 0; i < starsCount; i++) {
      const x = Math.floor(rnd() * CANVAS_SIZE)
      const y = Math.floor(rnd() * CANVAS_SIZE)
      const r = 1 + rnd() * 2
      const a = 0.3 + rnd() * 0.4
      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.fillStyle = `rgba(255,255,255,${a.toFixed(3)})`
      ctx.fill()
    }

    // 3) Frame
    ctx.save()
    ctx.globalAlpha = 0.4
    ctx.strokeStyle = '#c9a84c'
    ctx.lineWidth = 1
    ctx.strokeRect(24, 24, CANVAS_SIZE - 48, CANVAS_SIZE - 48)
    ctx.restore()

    // 4) Top block
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'

    ctx.fillStyle = '#c9a84c'
    ctx.font = '56px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",system-ui,sans-serif'
    ctx.fillText(cfg.emoji, 540, 64)

	    ctx.fillStyle = '#f0e6d3'
	    ctx.font = '600 32px Montserrat, sans-serif'
	    ctx.fillText(cfg.title, 540, 64 + 56 + 16)

	    ctx.fillStyle = '#9b8aa0'
	    ctx.font = '400 20px Montserrat, sans-serif'
	    ctx.fillText(cfg.subtitle, 540, 64 + 56 + 16 + 32 + 8)

    // 5) Divider
    ctx.save()
    ctx.globalAlpha = 0.3
    ctx.strokeStyle = '#c9a84c'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(120, 280)
    ctx.lineTo(960, 280)
    ctx.stroke()
    ctx.restore()

    // 6) Main text
    const textClamped = clampText(text, 500)
    ctx.textAlign = 'left'
	    ctx.textBaseline = 'top'
	    ctx.fillStyle = '#e8ddd0'
	    ctx.font = 'italic 400 26px Montserrat, sans-serif'
	    wrapText(ctx, textClamped, 64, 310, 952, 42, 12)

    // 7) Bottom divider
    ctx.save()
    ctx.globalAlpha = 0.3
    ctx.strokeStyle = '#c9a84c'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(120, 850)
    ctx.lineTo(960, 850)
    ctx.stroke()
    ctx.restore()

    // 8) Footer
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'

	    ctx.fillStyle = '#c9a84c'
	    ctx.font = '600 24px Montserrat, sans-serif'
	    ctx.fillText('✦ Гадалка в Max', 540, 880)

	    ctx.fillStyle = '#9b8aa0'
	    ctx.font = '400 18px Montserrat, sans-serif'
	    ctx.fillText(typeof APP_LINK === 'string' ? APP_LINK : '', 540, 880 + 24 + 12)

    const dataUrl = canvas.toDataURL('image/png')
    return { canvas, dataUrl }
  }

  function downloadDataUrl(dataUrl) {
    const a = document.createElement('a')
    a.href = dataUrl
    a.download = 'gadalka-rasklad.png'
    document.body.appendChild(a)
    a.click()
    a.remove()
  }

  function openExternal(url) {
    if (!url) return
    try {
      if (typeof WebApp !== 'undefined' && WebApp) {
        if (typeof WebApp.openLink === 'function') {
          WebApp.openLink(url)
          return
        }
        if (typeof WebApp.openUrl === 'function') {
          WebApp.openUrl(url)
          return
        }
      }
    } catch (_e) {
      // ignore
    }
    try {
      const win = window.open(url, '_blank', 'noopener,noreferrer')
      if (win) return
    } catch (_e) {
      // ignore
    }
    window.location.href = url
  }

  function buildTelegramShareUrl(url, text) {
    const u = typeof url === 'string' ? url : ''
    const t = String(text || '')
    const qs = []
    if (u) qs.push(`url=${encodeURIComponent(u)}`)
    if (t) qs.push(`text=${encodeURIComponent(t)}`)
    return `https://t.me/share/url?${qs.join('&')}`.replace(/\?$/, '')
  }

  function buildVkShareUrl(url, title, description) {
    const u = typeof url === 'string' ? url : ''
    const t = String(title || '')
    const d = String(description || '')
    const qs = []
    if (u) qs.push(`url=${encodeURIComponent(u)}`)
    if (t) qs.push(`title=${encodeURIComponent(t)}`)
    if (d) qs.push(`description=${encodeURIComponent(d)}`)
    return `https://vk.com/share.php?${qs.join('&')}`.replace(/\?$/, '')
  }

  async function copyText(text) {
    const value = String(text || '')
    if (!value) return false
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        await navigator.clipboard.writeText(value)
        return true
      }
    } catch (_e) {
      // fall through
    }

    try {
      const ta = document.createElement('textarea')
      ta.value = value
      ta.setAttribute('readonly', 'true')
      ta.style.position = 'fixed'
      ta.style.left = '-9999px'
      ta.style.top = '-9999px'
      document.body.appendChild(ta)
      ta.select()
      const ok = document.execCommand('copy')
      ta.remove()
      return !!ok
    } catch (_e) {
      return false
    }
  }

  function closeShareModal(overlay) {
    if (!overlay) return
    try {
      overlay.classList.remove('share-open')
      setTimeout(() => overlay.remove(), 180)
    } catch (_e) {
      overlay.remove()
    }
  }

  function showShareModal(opts) {
    const instrument = opts && opts.instrument
    const cfg = SHARE_CONFIG[instrument]
    if (!cfg) return

    const text = opts && opts.text
    const shareTextWithLink = opts && opts.shareTextWithLink
    const shareTextNoLink = opts && opts.shareTextNoLink
    const dataUrl = opts && opts.dataUrl

    const prev = document.getElementById(SHARE_MODAL_ID)
    if (prev) prev.remove()

    const overlay = document.createElement('div')
    overlay.id = SHARE_MODAL_ID
    overlay.className = 'share-overlay'
    overlay.setAttribute('role', 'dialog')
    overlay.setAttribute('aria-modal', 'true')

    const preview = clampText(String(text || '').replace(/\s+/g, ' ').trim(), 240)
    const appLink = typeof APP_LINK === 'string' ? APP_LINK : ''

    overlay.innerHTML = `
      <div class="share-card">
        <div class="share-head">
          <div class="share-title"></div>
          <button class="share-close" type="button" aria-label="Закрыть">✕</button>
        </div>
        <div class="share-preview" aria-label="Текст для шаринга"></div>
        <div class="stack">
          <div class="grid-2">
            <button class="btn-secondary" type="button" data-share-telegram>Telegram</button>
            <button class="btn-secondary" type="button" data-share-vk>ВК</button>
          </div>
          <button class="btn-secondary" type="button" data-share-copy>Скопировать текст</button>
          <button class="btn-secondary" type="button" data-share-download>Скачать карточку</button>
          <button class="btn-primary" type="button" data-share-max style="display:none;">Отправить в чат Max</button>
          <small class="share-hint">Подсказка: чтобы прикрепить картинку в соцсети - скачай карточку и добавь ее как фото.</small>
        </div>
      </div>
    `

    const titleEl = overlay.querySelector('.share-title')
    if (titleEl) titleEl.textContent = `${cfg.emoji} ${cfg.title}`
    const previewEl = overlay.querySelector('.share-preview')
    if (previewEl) previewEl.textContent = preview || '...'

    function isMaxShareAvailable() {
      try {
        return (
          typeof IS_MAX === 'boolean' &&
          IS_MAX &&
          typeof WebApp !== 'undefined' &&
          WebApp &&
          typeof WebApp.shareMaxContent === 'function'
        )
      } catch (_e) {
        return false
      }
    }

    const maxBtn = overlay.querySelector('[data-share-max]')
    if (maxBtn && isMaxShareAvailable()) {
      maxBtn.style.display = 'inline-flex'
      maxBtn.addEventListener('click', function () {
        try {
          WebApp.shareMaxContent({ image: dataUrl, text: shareTextWithLink, link: appLink })
        } catch (_e) {
          try {
            WebApp.shareMaxContent({ text: shareTextWithLink, link: appLink })
          } catch (_e2) {
            if (dataUrl) downloadDataUrl(dataUrl)
          }
        }
        closeShareModal(overlay)
      })
    }

    const closeBtn = overlay.querySelector('.share-close')
    if (closeBtn) closeBtn.addEventListener('click', () => closeShareModal(overlay))
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeShareModal(overlay)
    })

    const tgBtn = overlay.querySelector('[data-share-telegram]')
    if (tgBtn) {
      tgBtn.addEventListener('click', function () {
        const url = buildTelegramShareUrl(appLink, shareTextNoLink)
        openExternal(url)
        closeShareModal(overlay)
      })
    }

    const vkBtn = overlay.querySelector('[data-share-vk]')
    if (vkBtn) {
      vkBtn.addEventListener('click', function () {
        const title = `${cfg.emoji} ${cfg.title}`
        const desc = clampText(String(text || '').replace(/\s+/g, ' ').trim(), 240)
        const url = buildVkShareUrl(appLink, title, desc)
        openExternal(url)
        closeShareModal(overlay)
      })
    }

    const copyBtn = overlay.querySelector('[data-share-copy]')
    if (copyBtn) {
      copyBtn.addEventListener('click', async function () {
        const ok = await copyText(shareTextWithLink)
        if (ok) {
          copyBtn.textContent = 'Скопировано'
          setTimeout(() => {
            copyBtn.textContent = 'Скопировать текст'
          }, 1200)
        } else {
          alert('Не получилось скопировать. Можно выделить и скопировать вручную.')
        }
      })
    }

    const dlBtn = overlay.querySelector('[data-share-download]')
    if (dlBtn) {
      dlBtn.addEventListener('click', function () {
        if (dataUrl) downloadDataUrl(dataUrl)
        closeShareModal(overlay)
      })
    }

    document.body.appendChild(overlay)
    requestAnimationFrame(() => overlay.classList.add('share-open'))
  }

  window.shareResult = async function shareResult(instrument, text) {
    const cfg = SHARE_CONFIG[instrument]
    if (!cfg) {
      console.warn('[share] Unknown instrument:', instrument)
      return
    }

    try {
      if (window.analytics && typeof window.analytics.trackShare === 'function') {
        window.analytics.trackShare(instrument)
      }
    } catch (_e) {
      // ignore analytics errors
    }

    await loadFonts()
    const shareTextWithLink = buildShareText(cfg, text, { includeLink: true })
    const shareTextNoLink = buildShareText(cfg, text, { includeLink: false })
    const { dataUrl } = drawCard(instrument, text)

    showShareModal({ instrument, text, dataUrl, shareTextWithLink, shareTextNoLink })
  }
})()

;(function () {
  const SHARE_CONFIG = {
    compatibility: { emoji: '♾', title: 'Совместимость', subtitle: 'Астрологический расклад' },
    tarot: { emoji: '✦', title: 'Карта дня', subtitle: 'Таро' },
    numerology: { emoji: '◈', title: 'Расшифровка имени', subtitle: 'Нумерология' },
    dreambook: { emoji: '◑', title: 'Сонник', subtitle: 'Толкование сна' },
  }

  const CANVAS_SIZE = 1080

  function clampText(input, maxChars) {
    const raw = String(input || '').trim()
    if (!raw) return ''
    if (raw.length <= maxChars) return raw
    return `${raw.slice(0, maxChars).replace(/\s+$/g, '')}...`
  }

  function buildShareText(config, text) {
    const previewRaw = String(text || '').replace(/\s+/g, ' ').trim()
    const preview = clampText(previewRaw, 120) || '...'
    const link = typeof APP_LINK === 'string' ? APP_LINK : ''
    return `${config.emoji} ${config.title}\n${preview}\n\n${link}`.trim()
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

  window.shareResult = async function shareResult(instrument, text) {
    const cfg = SHARE_CONFIG[instrument]
    if (!cfg) {
      console.warn('[share] Unknown instrument:', instrument)
      return
    }

    await loadFonts()
    const shareText = buildShareText(cfg, text)
    const { dataUrl } = drawCard(instrument, text)

    if (typeof IS_MAX === 'boolean' && IS_MAX) {
      try {
        if (typeof WebApp !== 'undefined' && WebApp && typeof WebApp.shareMaxContent === 'function') {
          try {
            WebApp.shareMaxContent({ image: dataUrl, text: shareText, link: APP_LINK })
            return
          } catch (_e) {
            WebApp.shareMaxContent({ text: shareText, link: APP_LINK })
            return
          }
        }
      } catch (_e) {
        // fall through to download
      }
      downloadDataUrl(dataUrl)
      return
    }

    downloadDataUrl(dataUrl)
    alert('Карточка сохранена. В Max она отправляется напрямую в чат.')
  }
})()

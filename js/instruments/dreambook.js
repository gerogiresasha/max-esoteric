;(function () {
  let latestResultText = ''

  function loaderHtml() {
    return `<div class="loader" role="status" aria-label="Загрузка"><span></span><span></span><span></span></div>`
  }

  function updateCounter(textarea, counter) {
    const value = textarea.value || ''
    if (value.length > 1000) textarea.value = value.slice(0, 1000)
    counter.textContent = `${textarea.value.length} / 1000`
  }

  async function requestDream(tier) {
    const inputEl = document.getElementById('dream-input')
    const counterEl = document.getElementById('dream-counter')
    const freeBtn = document.getElementById('dream-btn-free')
    const paidBtn = document.getElementById('dream-btn-paid')
    const resultBlock = document.getElementById('dream-result-block')
    const badge = document.getElementById('dream-tier')
    const resultText = document.getElementById('dream-result-text')

    const dream = (inputEl.value || '').trim()
    if (!dream) {
      inputEl.classList.remove('shake')
      void inputEl.offsetWidth
      inputEl.classList.add('shake')
      setTimeout(() => inputEl.classList.remove('shake'), 420)
      updateCounter(inputEl, counterEl)
      return
    }

    resultBlock.style.display = 'block'
    resultBlock.classList.remove('fade-in-up')
    void resultBlock.offsetWidth
    resultBlock.classList.add('fade-in-up')
    resultText.innerHTML = loaderHtml()
    freeBtn.disabled = true
    if (paidBtn) paidBtn.disabled = true
    const shareBtnEl = document.getElementById('dream-btn-share')
    if (shareBtnEl) {
      shareBtnEl.style.display = 'none'
      shareBtnEl.disabled = true
    }

    try {
      const text = await window.callOracle('dreambook', tier, { dream })
      resultText.textContent = text
      latestResultText = text

      if (tier === 'free') {
        badge.className = 'tier-badge free'
        badge.textContent = 'Краткий расклад'
        paidBtn.style.display = 'inline-flex'
        paidBtn.disabled = false
      } else {
        badge.className = 'tier-badge paid'
        badge.textContent = 'Полный расклад'
        paidBtn.style.display = 'none'
      }

      const shareBtn = document.getElementById('dream-btn-share')
      if (shareBtn) {
        shareBtn.style.display = 'inline-flex'
        shareBtn.disabled = false
      }
    } catch (_e) {
      latestResultText = ''
      window.showError(resultText, 'Не удалось получить расклад. Попробуй еще раз.')
      if (tier === 'free') paidBtn.style.display = 'none'
      const shareBtn = document.getElementById('dream-btn-share')
      if (shareBtn) shareBtn.style.display = 'none'
    } finally {
      freeBtn.disabled = false
      if (tier === 'free' && paidBtn.style.display !== 'none') paidBtn.disabled = false
    }
  }

  function initDreambook() {
    const screen = document.getElementById('screen-dreambook')
    if (!screen) return

    screen.innerHTML = `
      <div class="screen-header">
        <div class="screen-title">Сонник</div>
        <div class="screen-subtitle">Послание из глубин психики</div>
        <div class="screen-accent" aria-hidden="true"></div>
      </div>
      <div class="screen-content">
        <div class="card">
          <div class="stack">
            <textarea id="dream-input" class="input-field" placeholder="Опиши свой сон..." maxlength="1000"></textarea>
            <div class="counter"><span id="dream-counter">0 / 1000</span></div>
            <button class="btn-primary" type="button" id="dream-btn-free">Истолковать сон</button>
          </div>
        </div>

        <div class="spacer-20" aria-hidden="true"></div>

        <div id="dream-result-block" class="card" style="display:none;">
          <div class="stack">
	            <div id="dream-tier" class="tier-badge free">Краткий расклад</div>
	            <div id="dream-result-text" class="result-block"></div>
	            <button class="btn-secondary" type="button" id="dream-btn-paid" style="display:none;">Получить полный расклад</button>
	            <button class="btn-secondary" type="button" id="dream-btn-share" style="display:none;">Поделиться результатом</button>
	            <small style="color: var(--text-muted); font-size: 12px;">Полный анализ с рекомендациями</small>
	          </div>
	        </div>
      </div>
    `

    const inputEl = document.getElementById('dream-input')
    const counterEl = document.getElementById('dream-counter')
    const freeBtn = document.getElementById('dream-btn-free')
    const paidBtn = document.getElementById('dream-btn-paid')
    const shareBtn = document.getElementById('dream-btn-share')

    updateCounter(inputEl, counterEl)
    inputEl.addEventListener('input', () => updateCounter(inputEl, counterEl))

    if (freeBtn) freeBtn.addEventListener('click', () => requestDream('free'))
    if (paidBtn) paidBtn.addEventListener('click', () => window.showPaymentModal('dreambook', () => requestDream('paid')))

    if (shareBtn) {
      shareBtn.addEventListener('click', function () {
        window.shareResult('dreambook', latestResultText)
      })
    }
  }

  window.initDreambook = initDreambook
})()

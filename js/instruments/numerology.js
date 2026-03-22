;(function () {
  let latestResultText = ''

  function loaderHtml() {
    return `<div class="loader" role="status" aria-label="Загрузка"><span></span><span></span><span></span></div>`
  }

  function shakeIfEmpty(input) {
    const isEmpty = !String(input.value || '').trim()
    if (!isEmpty) return false
    input.classList.remove('shake')
    void input.offsetWidth
    input.classList.add('shake')
    setTimeout(() => input.classList.remove('shake'), 420)
    return true
  }

  function isValidDate(dateStr) {
    const date = new Date(dateStr)
    if (isNaN(date.getTime())) return false
    const year = date.getFullYear()
    if (year < 1900 || year > new Date().getFullYear()) return false
    return date <= new Date()
  }

  function clearFieldError(input) {
    if (!input) return
    const next = input.nextElementSibling
    if (next && next.classList && next.classList.contains('field-error')) next.remove()
  }

  function showFieldError(input, message) {
    if (!input) return
    clearFieldError(input)
    const p = document.createElement('p')
    p.className = 'field-error'
    p.textContent = message
    input.insertAdjacentElement('afterend', p)
  }

  function setDateConstraints(dateInput) {
    if (!dateInput) return
    const today = new Date()
    const minDate = '1900-01-01'
    const maxDate = today.toISOString().split('T')[0]
    dateInput.setAttribute('min', minDate)
    dateInput.setAttribute('max', maxDate)
  }

  async function requestNumerology(tier) {
    const nameEl = document.getElementById('num-name')
    const dateEl = document.getElementById('num-date')
    const freeBtn = document.getElementById('num-btn-free')
    const paidBtn = document.getElementById('num-btn-paid')
    const resultBlock = document.getElementById('num-result-block')
    const badge = document.getElementById('num-tier')
    const resultText = document.getElementById('num-result-text')

    const hasErrors = shakeIfEmpty(nameEl)
    if (hasErrors) return

    const name = nameEl.value.trim()
    const date = dateEl.value || ''

    clearFieldError(dateEl)
    if (date && !isValidDate(date)) {
      showFieldError(dateEl, 'Введи корректную дату')
      return
    }

    resultBlock.style.display = 'block'
    resultBlock.classList.remove('fade-in-up')
    void resultBlock.offsetWidth
    resultBlock.classList.add('fade-in-up')
    resultText.innerHTML = loaderHtml()
    freeBtn.disabled = true
    if (paidBtn) paidBtn.disabled = true
    const shareBtnEl = document.getElementById('num-btn-share')
    if (shareBtnEl) {
      shareBtnEl.style.display = 'none'
      shareBtnEl.disabled = true
    }

    try {
      const text = await window.callOracle('numerology', tier, { name, date })
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

      const shareBtn = document.getElementById('num-btn-share')
      if (shareBtn) {
        shareBtn.style.display = 'inline-flex'
        shareBtn.disabled = false
      }
    } catch (_e) {
      latestResultText = ''
      window.showError(resultText, 'Не удалось получить расклад. Попробуй еще раз.')
      if (tier === 'free') paidBtn.style.display = 'none'
      const shareBtn = document.getElementById('num-btn-share')
      if (shareBtn) shareBtn.style.display = 'none'
    } finally {
      freeBtn.disabled = false
      if (tier === 'free' && paidBtn.style.display !== 'none') paidBtn.disabled = false
    }
  }

  function initNumerology() {
    const screen = document.getElementById('screen-numerology')
    if (!screen) return

    screen.innerHTML = `
      <div class="screen-header">
        <div class="screen-title">Расшифровка имени</div>
        <div class="screen-subtitle">Числа раскрывают характер</div>
        <div class="screen-accent" aria-hidden="true"></div>
      </div>
      <div class="screen-content">
        <div class="card">
	          <div class="stack">
	            <input class="input-field" type="text" placeholder="Твое имя" id="num-name" autocomplete="name" />
	            <div style="font-size: 12px; color: var(--text-secondary);">Дата рождения (необязательно)</div>
	            <input class="input-field" type="date" id="num-date" min="1900-01-01" />
	            <button class="btn-primary" type="button" id="num-btn-free">Расшифровать имя</button>
	          </div>
	        </div>

        <div class="spacer-20" aria-hidden="true"></div>

        <div id="num-result-block" class="card" style="display:none;">
          <div class="stack">
	            <div id="num-tier" class="tier-badge free">Краткий расклад</div>
	            <div id="num-result-text" class="result-block"></div>
	            <button class="btn-secondary" type="button" id="num-btn-paid" style="display:none;">Получить полный расклад</button>
	            <button class="btn-secondary" type="button" id="num-btn-share" style="display:none;">Поделиться результатом</button>
	            <small style="color: var(--text-muted); font-size: 12px;">Полный анализ с рекомендациями</small>
	          </div>
	        </div>
      </div>
    `

	    const freeBtn = document.getElementById('num-btn-free')
	    const paidBtn = document.getElementById('num-btn-paid')
	    const shareBtn = document.getElementById('num-btn-share')
	    const dateEl = document.getElementById('num-date')

	    setDateConstraints(dateEl)
	    if (dateEl) {
	      dateEl.addEventListener('input', () => clearFieldError(dateEl))
	      dateEl.addEventListener('change', () => clearFieldError(dateEl))
	    }

	    if (freeBtn) freeBtn.addEventListener('click', () => requestNumerology('free'))
	    if (paidBtn) paidBtn.addEventListener('click', () => window.showPaymentModal('numerology', () => requestNumerology('paid')))

    if (shareBtn) {
      shareBtn.addEventListener('click', function () {
        window.shareResult('numerology', latestResultText)
      })
    }
  }

  window.initNumerology = initNumerology
})()

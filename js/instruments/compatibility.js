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

  async function requestCompatibility(tier) {
    const name1El = document.getElementById('comp-name1')
    const date1El = document.getElementById('comp-date1')
    const name2El = document.getElementById('comp-name2')
    const date2El = document.getElementById('comp-date2')
    const resultBlock = document.getElementById('comp-result-block')
    const badge = document.getElementById('comp-tier')
    const resultText = document.getElementById('comp-result-text')
    const paidBtn = document.getElementById('comp-btn-paid')
    const freeBtn = document.getElementById('comp-btn-free')

    const hasErrors =
      shakeIfEmpty(name1El) ||
      shakeIfEmpty(date1El) ||
      shakeIfEmpty(name2El) ||
      shakeIfEmpty(date2El)
    if (hasErrors) return

    clearFieldError(date1El)
    clearFieldError(date2El)
    if (!isValidDate(date1El.value)) {
      showFieldError(date1El, 'Введи корректную дату')
      return
    }
    if (!isValidDate(date2El.value)) {
      showFieldError(date2El, 'Введи корректную дату')
      return
    }

    const name1 = name1El.value.trim()
    const date1 = date1El.value
    const name2 = name2El.value.trim()
    const date2 = date2El.value

    resultBlock.style.display = 'block'
    resultBlock.classList.remove('fade-in-up')
    void resultBlock.offsetWidth
    resultBlock.classList.add('fade-in-up')
    resultText.innerHTML = loaderHtml()

    freeBtn.disabled = true
    if (paidBtn) paidBtn.disabled = true
    const shareBtnEl = document.getElementById('comp-btn-share')
    if (shareBtnEl) {
      shareBtnEl.style.display = 'none'
      shareBtnEl.disabled = true
    }

    try {
      const text = await window.callOracle('compatibility', tier, { name1, date1, name2, date2 })
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

      const shareBtn = document.getElementById('comp-btn-share')
      if (shareBtn) {
        shareBtn.style.display = 'inline-flex'
        shareBtn.disabled = false
      }
    } catch (_e) {
      latestResultText = ''
      window.showError(resultText, 'Не удалось получить расклад. Попробуй еще раз.')
      if (tier === 'free') {
        paidBtn.style.display = 'none'
      }
      const shareBtn = document.getElementById('comp-btn-share')
      if (shareBtn) shareBtn.style.display = 'none'
    } finally {
      freeBtn.disabled = false
      if (tier === 'free' && paidBtn.style.display !== 'none') paidBtn.disabled = false
    }
  }

  function initCompatibility() {
    const screen = document.getElementById('screen-compatibility')
    if (!screen) return

    screen.innerHTML = `
      <div class="screen-header">
        <div class="screen-title">Совместимость</div>
        <div class="screen-subtitle">Анализ двух людей по датам рождения</div>
        <div class="screen-accent" aria-hidden="true"></div>
      </div>
      <div class="screen-content">
        <div class="card">
	          <div class="stack">
	            <div class="section-label">Первый человек</div>
	            <input class="input-field" type="text" placeholder="Имя" id="comp-name1" autocomplete="name" />
	            <input class="input-field" type="date" id="comp-date1" min="1900-01-01" />
	
	            <div class="infinity-divider" aria-hidden="true">♾</div>
	
	            <div class="section-label">Второй человек</div>
	            <input class="input-field" type="text" placeholder="Имя" id="comp-name2" autocomplete="name" />
	            <input class="input-field" type="date" id="comp-date2" min="1900-01-01" />

            <div class="spacer-20" aria-hidden="true"></div>
            <button class="btn-primary" type="button" id="comp-btn-free">Узнать совместимость</button>
          </div>
        </div>

        <div class="spacer-20" aria-hidden="true"></div>

        <div id="comp-result-block" class="card" style="display:none;">
          <div class="stack">
	            <div id="comp-tier" class="tier-badge free">Краткий расклад</div>
	            <div id="comp-result-text" class="result-block"></div>
	            <button class="btn-secondary" type="button" id="comp-btn-paid" style="display:none;">Получить полный расклад</button>
	            <button class="btn-secondary" type="button" id="comp-btn-share" style="display:none;">Поделиться результатом</button>
	            <small style="color: var(--text-muted); font-size: 12px;">Полный анализ с рекомендациями</small>
	          </div>
	        </div>
      </div>
    `

	    const freeBtn = document.getElementById('comp-btn-free')
	    const paidBtn = document.getElementById('comp-btn-paid')
	    const shareBtn = document.getElementById('comp-btn-share')
	    const date1El = document.getElementById('comp-date1')
	    const date2El = document.getElementById('comp-date2')

	    setDateConstraints(date1El)
	    setDateConstraints(date2El)
	    if (date1El) {
	      date1El.addEventListener('input', () => clearFieldError(date1El))
	      date1El.addEventListener('change', () => clearFieldError(date1El))
	    }
	    if (date2El) {
	      date2El.addEventListener('input', () => clearFieldError(date2El))
	      date2El.addEventListener('change', () => clearFieldError(date2El))
	    }
	    if (freeBtn) freeBtn.addEventListener('click', () => requestCompatibility('free'))
	    if (paidBtn) {
	      paidBtn.addEventListener('click', () => {
	        window.showPaymentModal('compatibility', () => requestCompatibility('paid'))
      })
    }

    if (shareBtn) {
      shareBtn.addEventListener('click', function () {
        window.shareResult('compatibility', latestResultText)
      })
    }
  }

  window.initCompatibility = initCompatibility
})()

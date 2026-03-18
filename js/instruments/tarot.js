;(function () {
  const ARCANA = [
    'Шут',
    'Маг',
    'Жрица',
    'Императрица',
    'Император',
    'Иерофант',
    'Влюбленные',
    'Колесница',
    'Сила',
    'Отшельник',
    'Колесо Фортуны',
    'Справедливость',
    'Повешенный',
    'Смерть',
    'Умеренность',
    'Дьявол',
    'Башня',
    'Звезда',
    'Луна',
    'Солнце',
    'Суд',
    'Мир',
  ]

  let selectedCard = ''

  function loaderHtml() {
    return `<div class="loader" role="status" aria-label="Загрузка"><span></span><span></span><span></span></div>`
  }

  function pickCard() {
    const idx = Math.floor(Math.random() * ARCANA.length)
    return ARCANA[idx]
  }

  function flipAndSetCard(cardEl, card) {
    cardEl.classList.remove('flip')
    void cardEl.offsetWidth
    cardEl.classList.add('flip')
    setTimeout(() => {
      cardEl.innerHTML = `<div class="card-name">${card}</div>`
    }, 320)
    setTimeout(() => {
      cardEl.classList.remove('flip')
    }, 650)
  }

  async function requestTarot(tier) {
    const questionEl = document.getElementById('tarot-question')
    const cardEl = document.getElementById('tarot-card')
    const freeBtn = document.getElementById('tarot-btn-free')
    const paidBtn = document.getElementById('tarot-btn-paid')
    const resultBlock = document.getElementById('tarot-result-block')
    const badge = document.getElementById('tarot-tier')
    const resultText = document.getElementById('tarot-result-text')

    if (!selectedCard) {
      selectedCard = pickCard()
      flipAndSetCard(cardEl, selectedCard)
    }

    const question = (questionEl.value || '').trim()

    resultBlock.style.display = 'block'
    resultBlock.classList.remove('fade-in-up')
    void resultBlock.offsetWidth
    resultBlock.classList.add('fade-in-up')
    resultText.innerHTML = loaderHtml()
    freeBtn.disabled = true
    if (paidBtn) paidBtn.disabled = true

    try {
      const text = await window.callOracle('tarot', tier, { card: selectedCard, question: question || '' })
      resultText.textContent = text

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
    } catch (_e) {
      window.showError(resultText, 'Не удалось получить расклад. Попробуй еще раз.')
      if (tier === 'free') paidBtn.style.display = 'none'
    } finally {
      freeBtn.disabled = false
      if (tier === 'free' && paidBtn.style.display !== 'none') paidBtn.disabled = false
    }
  }

  function initTarot() {
    const screen = document.getElementById('screen-tarot')
    if (!screen) return

    screen.innerHTML = `
      <div class="screen-header">
        <div class="screen-title">Карта дня</div>
        <div class="screen-subtitle">Послание именно для тебя</div>
        <div class="screen-accent" aria-hidden="true"></div>
      </div>
      <div class="screen-content">
        <div class="card">
          <div class="stack">
            <div id="tarot-card" class="card-placeholder" aria-label="Карта">
              <span class="card-symbol" aria-hidden="true">✦</span>
            </div>
            <input class="input-field" type="text" placeholder="Вопрос дня (необязательно)" id="tarot-question" />
            <div class="spacer-20" aria-hidden="true"></div>
            <button class="btn-primary" type="button" id="tarot-btn-free">Открыть карту</button>
          </div>
        </div>

        <div class="spacer-20" aria-hidden="true"></div>

        <div id="tarot-result-block" class="card" style="display:none;">
          <div class="stack">
            <div id="tarot-tier" class="tier-badge free">Краткий расклад</div>
            <div id="tarot-result-text" class="result-block"></div>
            <div class="divider"></div>
            <button class="btn-secondary" type="button" id="tarot-btn-paid" style="display:none;">Получить полный расклад</button>
            <small style="color: var(--text-muted); font-size: 12px;">Полный анализ с рекомендациями</small>
          </div>
        </div>
      </div>
    `

    const freeBtn = document.getElementById('tarot-btn-free')
    const paidBtn = document.getElementById('tarot-btn-paid')
    const cardEl = document.getElementById('tarot-card')

    selectedCard = ''
    if (cardEl) {
      cardEl.innerHTML = `<span class="card-symbol" aria-hidden="true">✦</span>`
    }

    if (freeBtn) {
      freeBtn.addEventListener('click', () => {
        selectedCard = pickCard()
        flipAndSetCard(cardEl, selectedCard)
        requestTarot('free')
      })
    }

    if (paidBtn) paidBtn.addEventListener('click', () => requestTarot('paid'))
  }

  window.initTarot = initTarot
})()

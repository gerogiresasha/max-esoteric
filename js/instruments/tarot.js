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

  const ARCANA_IMAGES = {
    'Шут': 'assets/tarot/шут.jpg',
    'Маг': 'assets/tarot/маг.jpg',
    'Жрица': 'assets/tarot/жрица.jpg',
    'Императрица': 'assets/tarot/императрица.jpg',
    'Император': 'assets/tarot/император.jpg',
    'Иерофант': 'assets/tarot/иерофант.jpg',
    'Влюбленные': 'assets/tarot/влюбленные.jpg',
    'Колесница': 'assets/tarot/колесница.jpg',
    'Сила': 'assets/tarot/сила.jpg',
    'Отшельник': 'assets/tarot/отшельник.jpg',
    'Колесо Фортуны': 'assets/tarot/колесо фортуны.jpg',
    'Справедливость': 'assets/tarot/справедливость.jpg',
    'Повешенный': 'assets/tarot/повешенный.jpg',
    'Смерть': 'assets/tarot/смерть.jpg',
    'Умеренность': 'assets/tarot/умеренность.jpg',
    'Дьявол': 'assets/tarot/дьявол.jpg',
    'Башня': 'assets/tarot/башня.jpg',
    'Звезда': 'assets/tarot/звезда.jpg',
    'Луна': 'assets/tarot/луна.jpg',
    'Солнце': 'assets/tarot/солнце.jpg',
    'Суд': 'assets/tarot/суд.jpg',
    'Мир': 'assets/tarot/мир.jpg',
  }

  let selectedCard = ''
  let latestResultText = ''

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
	      const imgSrc = ARCANA_IMAGES[card]
	      if (imgSrc) {
	        cardEl.classList.add('has-card')
	        cardEl.innerHTML = `<img class="tarot-card-img" src="${imgSrc}" alt="${card}" /><p class="card-name">${card}</p>`
	      } else {
	        cardEl.classList.remove('has-card')
	        cardEl.innerHTML = `<div class="card-name">${card}</div>`
	      }
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
    const shareBtnEl = document.getElementById('tarot-btn-share')
    if (shareBtnEl) {
      shareBtnEl.style.display = 'none'
      shareBtnEl.disabled = true
    }

    try {
      const text = await window.callOracle('tarot', tier, { card: selectedCard, question: question || '' })
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

      const shareBtn = document.getElementById('tarot-btn-share')
      if (shareBtn) {
        shareBtn.style.display = 'inline-flex'
        console.log('share button shown', shareBtn)
        shareBtn.disabled = false
      }
    } catch (_e) {
      latestResultText = ''
      window.showError(resultText, 'Не удалось получить расклад. Попробуй еще раз.')
      if (tier === 'free') paidBtn.style.display = 'none'
      const shareBtn = document.getElementById('tarot-btn-share')
      if (shareBtn) shareBtn.style.display = 'none'
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
	              <span class="card-placeholder-icon" aria-hidden="true">?</span>
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
	            <button class="btn-secondary" type="button" id="tarot-btn-paid" style="display:none;">Получить полный расклад</button>
	            <button class="btn-secondary" type="button" id="tarot-btn-share" style="display:none;">Поделиться результатом</button>
	            <small style="color: var(--text-muted); font-size: 12px;">Полный анализ с рекомендациями</small>
	          </div>
	        </div>
      </div>
    `

    const freeBtn = document.getElementById('tarot-btn-free')
    const paidBtn = document.getElementById('tarot-btn-paid')
    const cardEl = document.getElementById('tarot-card')
    const shareBtn = document.getElementById('tarot-btn-share')

	    selectedCard = ''
	    if (cardEl) {
	      cardEl.classList.remove('has-card')
	      cardEl.innerHTML = `<span class="card-placeholder-icon" aria-hidden="true">?</span>`
	    }

    if (freeBtn) {
      freeBtn.addEventListener('click', () => {
        selectedCard = pickCard()
        flipAndSetCard(cardEl, selectedCard)
        requestTarot('free')
      })
    }

    if (paidBtn) paidBtn.addEventListener('click', () => window.showPaymentModal('tarot', () => requestTarot('paid')))

    if (shareBtn) {
      shareBtn.addEventListener('click', function () {
        window.shareResult('tarot', latestResultText)
      })
    }
  }

  window.initTarot = initTarot
})()

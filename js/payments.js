;(function () {
  const PRICES = {
    compatibility: { amount: 149, label: 'Полный расклад совместимости' },
    tarot: { amount: 99, label: 'Расклад из 3 карт' },
    numerology: { amount: 99, label: 'Полный нумерологический портрет' },
    dreambook: { amount: 99, label: 'Развернутый анализ сна' },
  }

  const DEFAULT_FEATURES = [
    '✓ Полный развернутый текст 400-600 слов',
    '✓ Персональный анализ под твои данные',
    '✓ Практические рекомендации',
  ]

  const FEATURES = {
    compatibility: [
      '✓ Где между вами настоящее напряжение',
      '✓ Паттерн который повторяется — и откуда он',
      '✓ Что сказать и сделать чтобы стало лучше',
    ],
    tarot: [
      '✓ Что карта говорит именно про твой сегодняшний день',
      '✓ На что обратить внимание — и чего избежать',
      '✓ Одно конкретное действие на сегодня',
    ],
    numerology: [
      '✓ Какой отпечаток твое имя оставляет на характере',
      '✓ Скрытый талант и главная ловушка твоего числа',
      '✓ Как использовать это осознанно',
    ],
    dreambook: [
      '✓ Что твоя психика пытается тебе сказать',
      '✓ Связь сна с тем что происходит в жизни прямо сейчас',
      '✓ На что обратить внимание в ближайшие дни',
    ],
  }

  const STYLE_ID = 'sbp-modal-styles'
  const MODAL_ID = 'sbp-payment-modal'

  function rub(amount) {
    const value = Number(amount) || 0
    return `${value} ₽`
  }

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return
    const style = document.createElement('style')
    style.id = STYLE_ID
    style.textContent = `
      .sbp-overlay{
        position: fixed;
        inset: 0;
        z-index: 1000;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 16px;
        background: rgba(0,0,0,0.7);
        -webkit-backdrop-filter: blur(4px);
        backdrop-filter: blur(4px);
        opacity: 0;
        transition: opacity 0.25s ease;
      }
      .sbp-card{
        max-width: 360px;
        width: 90%;
        margin: auto;
        background: var(--card-bg, var(--bg-card, #131313));
        border: 1px solid var(--border-color, var(--border, rgba(255,255,255,0.12)));
        border-radius: 16px;
        padding: 24px;
        color: var(--text-primary, rgba(255,255,255,0.92));
        box-shadow: 0 20px 60px rgba(0,0,0,0.55);
        opacity: 0;
        transform: translateY(10px);
        transition: opacity 0.25s ease, transform 0.25s ease;
      }
      .sbp-overlay.sbp-open{ opacity: 1; }
      .sbp-overlay.sbp-open .sbp-card{
        opacity: 1;
        transform: translateY(0);
      }
      .sbp-icon{
        width: 44px;
        height: 44px;
        border-radius: 14px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        background: rgba(201,168,76,0.12);
        color: var(--accent-gold, #c9a84c);
        border: 1px solid rgba(201,168,76,0.28);
        margin-bottom: 12px;
        font-size: 18px;
        line-height: 1;
      }
      .sbp-title{
        font-family: var(--font-title, inherit);
        font-size: 18px;
        font-weight: 700;
        margin: 0 0 12px 0;
      }
      .sbp-price{
        font-size: 32px;
        font-weight: 700;
        letter-spacing: 0.2px;
        margin: 0;
        color: var(--accent-gold, #c9a84c);
      }
      .sbp-sub{
        margin: 6px 0 16px 0;
        color: var(--text-muted, rgba(255,255,255,0.65));
        font-size: 12px;
      }
      .sbp-features{
        margin: 0 0 18px 0;
        padding: 0;
        list-style: none;
        color: var(--text-secondary, rgba(255,255,255,0.78));
        font-size: 13px;
        line-height: 1.35;
      }
      .sbp-features li{ margin: 6px 0; }
      .sbp-actions{
        display: grid;
        gap: 10px;
        margin-top: 10px;
      }
	      .sbp-card .btn-ghost{
	        width:100%;
	        padding:16px;
	        background:transparent;
	        border-radius:var(--radius-sm, 8px);
	        border:1px solid var(--border, rgba(201,168,76,0.2));
	        color:var(--text-primary, rgba(255,255,255,0.92));
	        font-family:var(--font-ui, 'Montserrat', sans-serif);
	        font-weight:600;
	        font-size:15px;
	        letter-spacing:0.5px;
	        cursor:pointer;
	        transition:all 0.2s ease;
	      }
      .sbp-card .btn-ghost:hover{
        background:rgba(255,255,255,0.04);
        transform:translateY(-1px);
      }
      .sbp-card .btn-ghost:active{ transform:translateY(0); }
      .sbp-card .btn-ghost:disabled{
        opacity:0.5;
        cursor:not-allowed;
        transform:none;
      }
      .sbp-disclaimer{
        margin-top: 14px;
        font-size: 11px;
        color: var(--text-muted, rgba(255,255,255,0.60));
        text-align: center;
      }
    `
    document.head.appendChild(style)
  }

  function closeModal(overlay) {
    if (!overlay || overlay.__sbpClosing) return
    overlay.__sbpClosing = true
    overlay.classList.remove('sbp-open')
    setTimeout(() => {
      try {
        overlay.remove()
      } catch (_e) {
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay)
      }
    }, 260)
  }

  window.showPaymentModal = function showPaymentModal(instrument, onSuccess) {
    ensureStyles()

    const price = PRICES[instrument]
    if (!price) {
      console.warn('[payments] Unknown instrument:', instrument)
      return
    }

    const features = FEATURES[instrument] || DEFAULT_FEATURES

    const prev = document.getElementById(MODAL_ID)
    if (prev) prev.remove()

    const overlay = document.createElement('div')
    overlay.id = MODAL_ID
    overlay.className = 'sbp-overlay'
    overlay.setAttribute('role', 'dialog')
    overlay.setAttribute('aria-modal', 'true')

    const titleId = `sbp-title-${Date.now()}`
    overlay.setAttribute('aria-labelledby', titleId)

    overlay.innerHTML = `
      <div class="sbp-card" role="document">
        <div class="sbp-icon" aria-hidden="true">✦</div>
	        <div class="sbp-title" id="${titleId}">${price.label}</div>
	        <p class="sbp-price">${rub(price.amount)}</p>
	        <div class="sbp-sub">разовый платеж</div>
	        <ul class="sbp-features"></ul>
	        <div class="sbp-actions">
	          <button type="button" class="btn-primary" data-sbp-pay>Оплатить ${rub(price.amount)}</button>
	          <button type="button" class="btn-ghost" data-sbp-cancel>Отмена</button>
	        </div>
	        <div class="sbp-disclaimer">Безопасная оплата через Систему быстрых платежей</div>
	      </div>
	    `

	    const featuresList = overlay.querySelector('.sbp-features')
	    if (featuresList) {
	      featuresList.innerHTML = ''
	      features.forEach((line) => {
	        const li = document.createElement('li')
	        li.textContent = line
	        featuresList.appendChild(li)
	      })
	    }

	    document.body.appendChild(overlay)

    const payBtn = overlay.querySelector('[data-sbp-pay]')
    const cancelBtn = overlay.querySelector('[data-sbp-cancel]')

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal(overlay)
    })

    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => {
        closeModal(overlay)
      })
    }

    if (payBtn) {
      payBtn.addEventListener('click', async () => {
        if (payBtn.disabled) return
        payBtn.disabled = true
        if (cancelBtn) cancelBtn.disabled = true
        payBtn.textContent = 'Создаем платеж...'

        const userId = window.currentUser?.id || 'anonymous'
        const BACKEND = 'https://functions.yandexcloud.net/d4evrag730e6sqoil00l'

        let paymentId
        let confirmationWindow

        try {
          // 1. Создать платеж
          const createResp = await fetch(BACKEND, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'create-payment', instrument, userId }),
          })
          const createData = await createResp.json()
          if (!createData.success || !createData.paymentId || !createData.confirmationUrl) {
            throw new Error(createData.error || 'Ошибка создания платежа')
          }

          paymentId = createData.paymentId

          // 2. Открыть страницу оплаты СБП
          confirmationWindow = window.open(createData.confirmationUrl, '_blank')
          payBtn.textContent = 'Ожидаем оплату...'

          // 3. Поллинг статуса каждые 3 секунды, максимум 10 минут
          let attempts = 0
          const MAX_ATTEMPTS = 200

          await new Promise((resolve, reject) => {
            const interval = setInterval(async () => {
              attempts++
              if (attempts > MAX_ATTEMPTS) {
                clearInterval(interval)
                reject(new Error('Время ожидания оплаты истекло'))
                return
              }
              try {
                const statusResp = await fetch(BACKEND, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ action: 'payment-status', paymentId }),
                })
                const statusData = await statusResp.json()
                if (statusData.status === 'succeeded') {
                  clearInterval(interval)
                  resolve()
                } else if (statusData.status === 'canceled') {
                  clearInterval(interval)
                  reject(new Error('Платеж отменен'))
                }
              } catch (_e) {
                // сетевая ошибка при поллинге - продолжаем
              }
            }, 3000)
          })

          // 4. Успех
          if (confirmationWindow && !confirmationWindow.closed) {
            try { confirmationWindow.close() } catch (_e) {}
          }
          if (typeof onSuccess === 'function') onSuccess()
          closeModal(overlay)

        } catch (err) {
          // Показать ошибку пользователю
          payBtn.disabled = false
          if (cancelBtn) cancelBtn.disabled = false
          payBtn.textContent = `Оплатить ${rub(price.amount)}`

          const errText = err?.message || 'Ошибка оплаты'
          const existingErr = overlay.querySelector('.sbp-error')
          if (existingErr) existingErr.remove()
          const errEl = document.createElement('p')
          errEl.className = 'sbp-error'
          errEl.style.cssText = 'color:#e07070;font-size:13px;margin:8px 0 0;text-align:center'
          errEl.textContent = errText
          overlay.querySelector('.sbp-actions').after(errEl)
        }
      })
    }

    requestAnimationFrame(() => {
      overlay.classList.add('sbp-open')
    })
  }
})()

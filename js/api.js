const API_URL = 'https://functions.yandexcloud.net/d4evrag730e6sqoil00l'

async function callOracle(instrument, tier, data) {
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ instrument, tier, data }),
  })

  const result = await response.json().catch(() => ({}))

  if (!response.ok || !result.success) {
    throw new Error(result.error || 'Ошибка сервера')
  }

  return result.text
}

window.callOracle = callOracle

function showError(container, message) {
  container.innerHTML = `<div class="error-msg">${message}</div>`
}

window.showError = showError

const SCREENS = ['compatibility', 'tarot', 'numerology', 'dreambook']
let currentScreen = 'compatibility'

let currentUser = null

function initMaxBridge() {
  if (IS_MAX) {
    try {
      WebApp.ready()
    } catch (_e) {
      // ignore
    }

    const user = WebApp.initDataUnsafe?.user || null
    currentUser = {
      id: user?.id || '',
      first_name: user?.first_name || '',
      last_name: user?.last_name || '',
      username: user?.username || '',
      gender: user?.gender,
      sex: user?.sex,
    }

    if (WebApp.BackButton) {
      try {
        WebApp.BackButton.show()
      } catch (_e) {
        // ignore
      }

      try {
        WebApp.BackButton.onClick(() => {
          showScreen('compatibility')
        })
      } catch (_e) {
        // ignore
      }
    }
  } else {
    currentUser = { id: 'test_user', first_name: 'Тест', last_name: '', username: 'testuser' }
  }

  window.currentUser = currentUser
}

initMaxBridge()
if (window.analytics && typeof window.analytics.init === 'function') {
  window.analytics.init()
}

function showWelcomeOverlay() {
  const key = 'oracle_welcome_dismissed_v1'
  try {
    if (localStorage.getItem(key) === '1') return
  } catch (_e) {
    // ignore (private mode / blocked storage)
  }

  const overlay = document.createElement('div')
  overlay.className = 'welcome-overlay'
  overlay.setAttribute('role', 'dialog')
  overlay.setAttribute('aria-modal', 'true')

  const card = document.createElement('div')
  card.className = 'welcome-card'
  card.setAttribute('role', 'document')

  const title = document.createElement('div')
  title.className = 'welcome-title'
  const name = String(currentUser?.first_name || '').trim()
  title.textContent = name ? `Привет, ${name}` : 'Привет'

  const text = document.createElement('div')
  text.className = 'welcome-text'
  text.textContent =
    'Чтобы прикоснуться к правде, выбери раздел снизу и нажми кнопку — я дам расклад.'

  const btn = document.createElement('button')
  btn.type = 'button'
  btn.className = 'btn-primary'
  btn.textContent = 'Начать'

  function close() {
    try {
      localStorage.setItem(key, '1')
    } catch (_e) {
      // ignore
    }
    try {
      overlay.remove()
    } catch (_e) {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay)
    }
  }

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close()
  })
  btn.addEventListener('click', close)

  card.appendChild(title)
  card.appendChild(text)
  card.appendChild(btn)
  overlay.appendChild(card)
  document.body.appendChild(overlay)
}

function showScreen(name) {
  if (!SCREENS.includes(name)) return

  document.querySelectorAll('.screen').forEach((screen) => {
    screen.classList.remove('active')
  })

  const active = document.getElementById(`screen-${name}`)
  if (active) active.classList.add('active')

  document.querySelectorAll('.nav-item').forEach((item) => {
    const isActive = item.dataset.screen === name
    item.classList.toggle('active', isActive)
    item.setAttribute('aria-current', isActive ? 'page' : 'false')
  })

  currentScreen = name

  try {
    if (window.analytics && typeof window.analytics.trackPageView === 'function') {
      window.analytics.trackPageView(name)
    }
  } catch (_e) {
    // ignore analytics errors
  }
}

function iconImg(name) {
  const icons = {
    compatibility: 'assets/icons/icon-compatibility.webp',
    tarot: 'assets/icons/icon-tarot.webp',
    numerology: 'assets/icons/icon-numerology.webp',
    dreambook: 'assets/icons/icon-dreams.webp',
  }
  const src = icons[name]
  return src ? `<img class="nav-icon" src="${src}" width="24" height="24" alt="" aria-hidden="true" />` : ''
}

function titleFor(name) {
  const titles = {
    compatibility: 'Совместимость',
    tarot: 'Карта дня',
    numerology: 'Имя',
    dreambook: 'Сонник',
  }
  return titles[name] || name
}

function renderApp() {
  const app = document.getElementById('app')
  if (!app) return

  app.innerHTML = `
    <div class="screens"></div>
  `

  const screensRoot = app.querySelector('.screens')

  SCREENS.forEach((name) => {
    const screen = document.createElement('div')
    screen.className = 'screen'
    screen.id = `screen-${name}`
    screen.dataset.tool = name === 'dreambook' ? 'dreams' : name
    screensRoot.appendChild(screen)
  })

  const nav = document.createElement('nav')
  nav.className = 'nav-bar'
  nav.setAttribute('role', 'navigation')
  nav.setAttribute('aria-label', 'Навигация')

  SCREENS.forEach((name) => {
    const item = document.createElement('button')
    item.type = 'button'
    item.className = 'nav-item'
    item.dataset.screen = name
    item.setAttribute('aria-label', titleFor(name))
    item.innerHTML = `${iconImg(name)}<span>${titleFor(name)}</span>`
    item.addEventListener('click', () => showScreen(name))
    nav.appendChild(item)
  })

  app.appendChild(nav)
}

document.addEventListener('DOMContentLoaded', () => {
  renderApp()
  showWelcomeOverlay()
  if (typeof window.initCompatibility === 'function') window.initCompatibility()
  if (typeof window.initTarot === 'function') window.initTarot()
  if (typeof window.initNumerology === 'function') window.initNumerology()
  if (typeof window.initDreambook === 'function') window.initDreambook()
  showScreen('compatibility')
})

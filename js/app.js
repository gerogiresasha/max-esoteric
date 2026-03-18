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
}

function iconSvg(name) {
  if (name === 'compatibility') {
    return `
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="10" cy="12" r="6.5" stroke="currentColor" stroke-width="1.6"></circle>
        <circle cx="14" cy="12" r="6.5" stroke="currentColor" stroke-width="1.6"></circle>
      </svg>
    `
  }

  if (name === 'tarot') {
    return `
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="6.2" y="4.8" width="11.6" height="14.4" rx="2.2" stroke="currentColor" stroke-width="1.6"></rect>
        <path d="M12 8.1l.9 1.9 2 .3-1.5 1.4.4 2-1.8-1-1.8 1 .4-2-1.5-1.4 2-.3.9-1.9z" fill="currentColor"></path>
      </svg>
    `
  }

  if (name === 'numerology') {
    return `
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M7 18V6l10 12V6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></path>
        <circle cx="18.2" cy="16.6" r="2" stroke="currentColor" stroke-width="1.6"></circle>
      </svg>
    `
  }

  return `
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M15.7 14.3a6.6 6.6 0 0 1-8.5-7.9 7.1 7.1 0 1 0 8.5 7.9z" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"></path>
      <path d="M7.1 15.6c.9-1.4 2.4-2.2 4.2-2.2 1.8 0 3.3.8 4.2 2.2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"></path>
    </svg>
  `
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
    item.innerHTML = `${iconSvg(name)}<span>${titleFor(name)}</span>`
    item.addEventListener('click', () => showScreen(name))
    nav.appendChild(item)
  })

  app.appendChild(nav)
}

document.addEventListener('DOMContentLoaded', () => {
  renderApp()
  if (typeof window.initCompatibility === 'function') window.initCompatibility()
  if (typeof window.initTarot === 'function') window.initTarot()
  if (typeof window.initNumerology === 'function') window.initNumerology()
  if (typeof window.initDreambook === 'function') window.initDreambook()
  showScreen('compatibility')
})

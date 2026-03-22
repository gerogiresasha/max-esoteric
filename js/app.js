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
  if (typeof window.initCompatibility === 'function') window.initCompatibility()
  if (typeof window.initTarot === 'function') window.initTarot()
  if (typeof window.initNumerology === 'function') window.initNumerology()
  if (typeof window.initDreambook === 'function') window.initDreambook()
  showScreen('compatibility')
})

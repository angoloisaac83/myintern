'use client'

import { useLayoutEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { Moon, Sun } from 'lucide-react'

type Theme = 'light' | 'dark'

const THEME_STORAGE_KEY = 'pathway-theme'

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark')
  document.documentElement.style.colorScheme = theme

  document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => {
    meta.setAttribute('content', theme === 'dark' ? '#0c1116' : '#fcf9f0')
  })
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('dark')
  const [ripple, setRipple] = useState<{ x: number; y: number; theme: Theme } | null>(null)

  useLayoutEffect(() => {
    try {
      const savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY)
      const initialTheme = savedTheme === 'light' ? 'light' : 'dark'
      setTheme(initialTheme)
      applyTheme(initialTheme)
    } catch (error) {
      console.error('Unable to read the saved color theme.', error)
      applyTheme('dark')
    }

    const syncTheme = (event: StorageEvent) => {
      if (event.key !== THEME_STORAGE_KEY) return
      const nextTheme = event.newValue === 'light' ? 'light' : 'dark'
      setTheme(nextTheme)
      applyTheme(nextTheme)
    }

    window.addEventListener('storage', syncTheme)
    return () => window.removeEventListener('storage', syncTheme)
  }, [])

  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark'
    const button = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const rect = button?.getBoundingClientRect()
    const x = rect ? rect.left + rect.width / 2 : window.innerWidth / 2
    const y = rect ? rect.top + rect.height / 2 : window.innerHeight / 2
    setRipple({ x, y, theme: nextTheme })
    document.documentElement.classList.add('theme-animating')
    setTheme(nextTheme)
    applyTheme(nextTheme)

    window.setTimeout(() => {
      document.documentElement.classList.remove('theme-animating')
      setRipple(null)
    }, 1050)

    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme)
    } catch (error) {
      console.error('Unable to save the selected color theme.', error)
    }
  }

  return (
    <button
      type="button"
      role="switch"
      aria-label="Dark theme"
      aria-checked={theme === 'dark'}
      title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
      onClick={toggleTheme}
      className="theme-toggle inline-flex h-10 items-center justify-center gap-2 rounded-full border border-border bg-card px-2.5 text-sm font-medium text-foreground shadow-sm transition-all hover:border-primary/30 hover:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      <span aria-hidden="true" className={`relative flex h-6 w-11 items-center rounded-full p-0.5 transition-colors ${theme === 'dark' ? 'bg-[#163e31]' : 'bg-[#e8eee4]'}`}>
        <span className={`flex size-5 items-center justify-center rounded-full bg-card text-foreground shadow-sm transition-all duration-500 ${theme === 'dark' ? 'translate-x-5 rotate-[360deg] scale-110' : 'translate-x-0 rotate-0 scale-100'}`}>
          {theme === 'dark' ? <Moon className="size-3 transition-transform duration-500" /> : <Sun className="size-3 text-amber-600 transition-transform duration-500" />}
        </span>
      </span>
      <span className="hidden sm:inline">{theme === 'dark' ? 'Dark' : 'Light'}</span>
      {ripple && <span aria-hidden="true" className={`theme-ripple ${ripple.theme === 'dark' ? 'theme-ripple-dark' : 'theme-ripple-light'}`} style={{ '--ripple-x': `${ripple.x}px`, '--ripple-y': `${ripple.y}px` } as CSSProperties} />}
    </button>
  )
}

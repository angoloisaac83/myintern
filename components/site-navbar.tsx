'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { onAuthStateChanged, signOut } from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import { getFirebaseAuth, getFirebaseDb } from '@/lib/firebase'
import { ChevronRight, LogOut, Menu, Sparkles, X } from 'lucide-react'
import { ThemeToggle } from '@/components/theme-toggle'

const links = [
  { href: '/', label: 'Placements' },
  { href: '/company', label: 'Employers' },
  { href: '/settings', label: 'Profile' },
  { href: '/admin', label: 'Coordinator' },
]
const adminSections = ['Overview', 'Students', 'Organizations', 'Roles', 'Allocations', 'Reports']

export function SiteNavbar() {
  const pathname = usePathname()
  const [menuOpen, setMenuOpen] = useState(false)
  const [accountType, setAccountType] = useState<string | null>(null)
  const [signedIn, setSignedIn] = useState(false)
  const [authChecked, setAuthChecked] = useState(false)

  useEffect(() => onAuthStateChanged(getFirebaseAuth(), async (user) => {
    setSignedIn(Boolean(user))
    if (!user) { setAccountType(null); setAuthChecked(true); return }
    try {
      const profile = await getDoc(doc(getFirebaseDb(), 'users', user.uid))
      setAccountType(profile.exists() ? String(profile.data().type ?? 'student') : 'student')
    } catch { setAccountType('student') }
    finally { setAuthChecked(true) }
  }), [])

  if (pathname === '/') return null

  const visibleLinks = !authChecked ? [] : accountType === 'admin'
    ? links.filter(({ href }) => href === '/admin')
    : accountType === 'company'
      ? links.filter(({ href }) => href === '/company' || href === '/settings')
      : signedIn
        ? links.filter(({ href }) => href === '/' || href === '/settings')
        : links.filter(({ href }) => href === '/' || href === '/company')

  const handleSignOut = async () => {
    await signOut(getFirebaseAuth())
    setMenuOpen(false)
  }

  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-card/95 backdrop-blur">
      <div className="relative mx-auto flex min-h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-5 lg:px-8">
        <Link href="/" className="flex shrink-0 items-center gap-3" aria-label="Pathway home">
          <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Sparkles className="size-4" aria-hidden="true" />
          </span>
          <span className="font-serif text-lg font-bold tracking-tight">pathway</span>
        </Link>
        <nav className="hidden items-center gap-6 md:flex" aria-label="Main navigation">
          {visibleLinks.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              aria-current={pathname === href ? 'page' : undefined}
              className={`text-sm font-medium transition-colors ${
                pathname === href ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          {signedIn && <button type="button" onClick={handleSignOut} className="hidden items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm font-semibold text-muted-foreground hover:bg-secondary md:inline-flex"><LogOut className="size-4" /> Sign out</button>}
          <ThemeToggle />
          <button type="button" aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'} aria-expanded={menuOpen} aria-controls="site-mobile-menu" onClick={() => setMenuOpen((open) => !open)} className="flex size-10 items-center justify-center rounded-xl border border-border bg-card text-foreground shadow-sm transition hover:bg-secondary md:hidden">
            {menuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </div>
      {menuOpen && <nav id="site-mobile-menu" className="absolute left-0 right-0 top-full z-50 border-b border-border bg-card p-3 shadow-xl md:hidden" aria-label="Mobile navigation">
        <div className="mx-auto max-w-7xl space-y-1">
          <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Pages</p>
          {visibleLinks.map(({ href, label }) => <Link key={href} href={href} onClick={() => setMenuOpen(false)} aria-current={pathname === href ? 'page' : undefined} className={`flex items-center justify-between rounded-xl px-3 py-3 text-sm font-semibold ${pathname === href ? 'bg-primary/10 text-primary' : 'text-foreground hover:bg-secondary'}`}>{label}<ChevronRight className="size-4 text-muted-foreground" /></Link>)}
          {accountType === 'admin' && <><Link href="/admin/analytics" onClick={() => setMenuOpen(false)} className="flex items-center justify-between rounded-xl px-3 py-3 text-sm font-semibold text-foreground hover:bg-secondary">Allocation analytics<ChevronRight className="size-4 text-muted-foreground" /></Link><Link href="/admin/organizations" onClick={() => setMenuOpen(false)} className="flex items-center justify-between rounded-xl px-3 py-3 text-sm font-semibold text-foreground hover:bg-secondary">Organizations<ChevronRight className="size-4 text-muted-foreground" /></Link><Link href="/admin/reports" onClick={() => setMenuOpen(false)} className="flex items-center justify-between rounded-xl px-3 py-3 text-sm font-semibold text-foreground hover:bg-secondary">Reports<ChevronRight className="size-4 text-muted-foreground" /></Link>}
          {pathname === '/admin' && accountType === 'admin' && <div className="mt-2 border-t border-border pt-2"><p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Coordinator sections</p>{adminSections.map((section) => <button key={section} type="button" onClick={() => { window.dispatchEvent(new CustomEvent('pathway-admin-tab', { detail: section })); setMenuOpen(false) }} className="flex w-full items-center justify-between rounded-xl px-3 py-3 text-left text-sm font-semibold text-foreground hover:bg-secondary">{section}<ChevronRight className="size-4 text-muted-foreground" /></button>)}</div>}
          {signedIn && <button type="button" onClick={handleSignOut} className="mt-2 flex w-full items-center gap-3 rounded-xl border-t border-border px-3 py-4 text-left text-sm font-semibold text-rose-600"><LogOut className="size-4" /> Sign out</button>}
        </div>
      </nav>}
    </header>
  )
}

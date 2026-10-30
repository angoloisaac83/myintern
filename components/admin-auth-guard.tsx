'use client'

import Link from 'next/link'
import { useEffect, useState, type ReactNode } from 'react'
import { doc, getDoc } from 'firebase/firestore'
import { onAuthStateChanged } from 'firebase/auth'
import { ShieldCheck } from 'lucide-react'
import { getFirebaseAuth, getFirebaseDb } from '@/lib/firebase'

export function AdminAuthGuard({ children }: { children: ReactNode }) {
  const [state, setState] = useState<'loading' | 'signed-out' | 'denied' | 'allowed'>('loading')

  useEffect(() => onAuthStateChanged(getFirebaseAuth(), async (user) => {
    if (!user) { setState('signed-out'); return }
    const profile = await getDoc(doc(getFirebaseDb(), 'users', user.uid))
    setState(profile.exists() && profile.data().type === 'admin' ? 'allowed' : 'denied')
  }), [])

  if (state === 'loading') return <main className="grid min-h-screen place-items-center bg-background px-5 text-foreground"><p className="text-sm text-muted-foreground">Checking administrator access…</p></main>
  if (state !== 'allowed') return <main className="grid min-h-screen place-items-center bg-background px-5 text-foreground"><div className="w-full max-w-md rounded-3xl border border-border bg-card p-8 text-center shadow-sm"><div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary"><ShieldCheck className="size-6" /></div><h1 className="mt-5 text-2xl font-bold">Administrator access required</h1><p className="mt-2 text-sm text-muted-foreground">Sign in with a coordinator account to view this workspace.</p><Link href="/admin" className="mt-6 inline-flex h-11 items-center rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground">Go to coordinator sign in</Link></div></main>
  return children
}

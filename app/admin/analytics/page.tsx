'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { collection, getDocs } from 'firebase/firestore'
import { BarChart3, ChevronLeft, ClipboardCheck, Target, Users } from 'lucide-react'
import { getFirebaseDb } from '@/lib/firebase'

type Allocation = { id: string; studentId?: string; company?: string; role?: string; score?: number; status?: string }
type Vacancy = { id: string; company?: string; role?: string; status?: string; capacity?: number }

export default function AnalyticsPage() {
  const [allocations, setAllocations] = useState<Allocation[]>([])
  const [vacancies, setVacancies] = useState<Vacancy[]>([])
  const [students, setStudents] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      getDocs(collection(getFirebaseDb(), 'allocations')),
      getDocs(collection(getFirebaseDb(), 'internships')),
      getDocs(collection(getFirebaseDb(), 'studentProfiles')),
    ]).then(([allocationSnap, vacancySnap, studentSnap]) => {
      setAllocations(allocationSnap.docs.map((item) => ({ id: item.id, ...(item.data() as Omit<Allocation, 'id'>) })))
      setVacancies(vacancySnap.docs.map((item) => ({ id: item.id, ...(item.data() as Omit<Vacancy, 'id'>) })))
      setStudents(studentSnap.size)
    }).finally(() => setLoading(false))
  }, [])

  const average = useMemo(() => allocations.length ? Math.round(allocations.reduce((sum, item) => sum + (item.score ?? 0), 0) / allocations.length) : 0, [allocations])
  const companyData = useMemo(() => Object.entries(allocations.reduce<Record<string, number>>((result, item) => { const key = item.company || 'Unassigned'; result[key] = (result[key] || 0) + 1; return result }, {})).sort(([, a], [, b]) => b - a), [allocations])
  const maxCompany = Math.max(1, ...companyData.map(([, value]) => value))
  const placementRate = students ? Math.round((allocations.length / students) * 100) : 0

  return <main className="min-h-screen bg-background text-foreground"><div className="mx-auto max-w-7xl px-5 py-8 lg:px-8">
    <Link href="/admin" className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground"><ChevronLeft className="size-4" /> Back to coordinator dashboard</Link>
    <header className="mt-6 flex flex-col gap-5 rounded-[2rem] border border-border bg-card p-6 shadow-sm md:flex-row md:items-end md:justify-between"><div><p className="text-sm font-semibold uppercase tracking-[0.2em] text-primary">Decision intelligence</p><h1 className="mt-3 text-4xl font-bold tracking-tight">Allocation analytics</h1><p className="mt-2 max-w-2xl text-sm text-muted-foreground">Monitor access, match quality, and employer demand across the placement cycle.</p></div><div className="rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm"><span className="text-muted-foreground">Model threshold</span><strong className="ml-2 text-primary">60%</strong></div></header>
    {loading ? <p className="mt-8 text-sm text-muted-foreground">Loading live analytics…</p> : <>
      <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{[{ icon: Users, label: 'Students in system', value: students }, { icon: ClipboardCheck, label: 'Placements made', value: allocations.length }, { icon: Target, label: 'Placement rate', value: `${placementRate}%` }, { icon: BarChart3, label: 'Average match score', value: `${average}%` }].map(({ icon: Icon, label, value }) => <div key={label} className="rounded-3xl border border-border bg-card p-5"><div className="flex size-10 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Icon className="size-5" /></div><p className="mt-5 text-sm text-muted-foreground">{label}</p><p className="mt-1 text-3xl font-bold">{value}</p></div>)}</section>
      <section className="mt-6 grid gap-6 lg:grid-cols-[1.15fr_.85fr]"><div className="rounded-3xl border border-border bg-card p-6"><div className="flex items-start justify-between"><div><h2 className="text-xl font-bold">Placements by employer</h2><p className="mt-1 text-sm text-muted-foreground">Where successful allocations are landing.</p></div><BarChart3 className="size-5 text-primary" /></div><div className="mt-7 space-y-5">{companyData.map(([company, value]) => <div key={company}><div className="mb-2 flex justify-between text-sm"><span className="font-medium">{company}</span><span className="text-muted-foreground">{value} placement{value === 1 ? '' : 's'}</span></div><div className="h-3 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${(value / maxCompany) * 100}%` }} /></div></div>)}{!companyData.length && <p className="text-sm text-muted-foreground">Analytics will populate after the first allocation.</p>}</div></div><div className="rounded-3xl border border-border bg-card p-6"><h2 className="text-xl font-bold">Match quality distribution</h2><p className="mt-1 text-sm text-muted-foreground">Scores from the weighted allocation model.</p><div className="mt-7 space-y-4">{['90–100%', '80–89%', '70–79%', '60–69%'].map((bucket) => { const [min, max] = bucket.replace('%', '').split('–').map(Number); const count = allocations.filter((item) => (item.score ?? 0) >= min && (item.score ?? 0) <= max).length; return <div key={bucket} className="flex items-center gap-3"><span className="w-16 text-xs text-muted-foreground">{bucket}</span><div className="h-9 flex-1 rounded-xl bg-muted"><div className="h-full rounded-xl bg-primary/80" style={{ width: `${allocations.length ? Math.max(count ? 8 : 0, (count / allocations.length) * 100) : 0}%` }} /></div><span className="w-6 text-right text-sm font-semibold">{count}</span></div> })}</div></div></section>
      <section className="mt-6 rounded-3xl border border-border bg-card p-6"><h2 className="text-xl font-bold">Capacity snapshot</h2><div className="mt-5 grid gap-3 md:grid-cols-3"><div className="rounded-2xl bg-muted/50 p-4"><p className="text-sm text-muted-foreground">Open vacancies</p><p className="mt-1 text-2xl font-bold">{vacancies.filter((item) => item.status !== 'closed').length}</p></div><div className="rounded-2xl bg-muted/50 p-4"><p className="text-sm text-muted-foreground">Total available seats</p><p className="mt-1 text-2xl font-bold">{vacancies.filter((item) => item.status !== 'closed').reduce((sum, item) => sum + (item.capacity ?? 1), 0)}</p></div><div className="rounded-2xl bg-muted/50 p-4"><p className="text-sm text-muted-foreground">Unallocated students</p><p className="mt-1 text-2xl font-bold">{Math.max(0, students - allocations.length)}</p></div></div></section>
    </>}
  </div></main>
}

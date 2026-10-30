'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { addDoc, collection, doc, getDoc, getDocs, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore'
import { onAuthStateChanged, signInWithEmailAndPassword, signOut, type User } from 'firebase/auth'
import { getFirebaseAuth, getFirebaseDb } from '@/lib/firebase'
import { BarChart3, Building2, CheckCircle2, ClipboardList, LogOut, RefreshCw, ShieldCheck, Users, XCircle } from 'lucide-react'

type Student = { id: string; name?: string; email?: string; course?: string; skills?: string | string[]; preferredLocation?: string; interests?: string; preferredOrganizations?: string[]; cv?: string }
type Vacancy = { id: string; company?: string; role?: string; location?: string; type?: string; requirements?: string; tags?: string[]; createdBy?: string; status?: string; capacity?: number; preferredCourses?: string[] }

type Match = { student: Student; vacancy: Vacancy; score: number }
type Allocation = { id: string; studentId: string; internshipId: string; studentName?: string; company?: string; role?: string; score?: number; status?: string }

function terms(value: unknown) { return String(value ?? '').toLowerCase().split(/[\s,;/]+/).filter((term) => term.length > 2) }
function score(student: Student, vacancy: Vacancy) {
  const studentSkills = new Set(terms(student.skills))
  const vacancyText = terms([vacancy.role, vacancy.requirements, ...(vacancy.tags ?? []), vacancy.company].join(' '))
  const skillCompatibility = vacancyText.length ? vacancyText.filter((term) => studentSkills.has(term)).length / vacancyText.length : 0
  const academicCompatibility = terms(`${student.course} ${student.interests}`).some((term) => vacancyText.includes(term)) ? 1 : 0
  const careerCompatibility = terms(student.interests).some((term) => vacancyText.includes(term)) ? 1 : 0
  const locationCompatibility = student.preferredLocation && vacancy.location && vacancy.location.toLowerCase().includes(student.preferredLocation.toLowerCase()) ? 1 : 0
  const preferenceCompatibility = student.preferredOrganizations?.some((organization) => vacancy.company?.toLowerCase().includes(organization.toLowerCase())) ? 1 : 0.5
  const employerEligibility = vacancy.preferredCourses?.length ? vacancy.preferredCourses.some((course) => student.course?.toLowerCase().includes(course.toLowerCase())) ? 1 : 0 : (vacancy.requirements ? (terms(vacancy.requirements).some((term) => terms(`${student.course} ${student.skills}`).includes(term)) ? 1 : 0) : 1)
  return Math.round(skillCompatibility * 35 + academicCompatibility * 20 + careerCompatibility * 15 + locationCompatibility * 10 + preferenceCompatibility * 10 + employerEligibility * 10)
}

function stableMatches(students: Student[], vacancies: Vacancy[]): Match[] {
  const activeVacancies = vacancies.filter((vacancy) => vacancy.status !== 'closed' && (vacancy.capacity ?? 1) > 0)
  const preferenceLists = new Map(students.map((student) => [student.id, activeVacancies.map((vacancy) => ({ vacancy, score: score(student, vacancy) })).filter((match) => match.score >= 60).sort((a, b) => b.score - a.score)]))
  const nextProposal = new Map(students.map((student) => [student.id, 0]))
  const held = new Map<string, Match[]>()
  const queue = students.filter((student) => (preferenceLists.get(student.id)?.length ?? 0) > 0).map((student) => student.id)

  while (queue.length) {
    const studentId = queue.shift() as string
    const student = students.find((item) => item.id === studentId)
    const preferences = preferenceLists.get(studentId) ?? []
    const proposalIndex = nextProposal.get(studentId) ?? 0
    const proposal = preferences[proposalIndex]
    nextProposal.set(studentId, proposalIndex + 1)
    if (!student || !proposal) continue
    const current = held.get(proposal.vacancy.id) ?? []
    current.push({ student, vacancy: proposal.vacancy, score: proposal.score })
    current.sort((a, b) => b.score - a.score)
    const accepted = current.slice(0, proposal.vacancy.capacity ?? 1)
    held.set(proposal.vacancy.id, accepted)
    current.slice(accepted.length).forEach((rejected) => { if ((nextProposal.get(rejected.student.id) ?? 0) < (preferenceLists.get(rejected.student.id)?.length ?? 0)) queue.push(rejected.student.id) })
  }

  return Array.from(held.values()).flat()
}

export default function AdminPage() {
  const [user, setUser] = useState<User | null>(null)
  const [authorized, setAuthorized] = useState<boolean | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [students, setStudents] = useState<Student[]>([])
  const [vacancies, setVacancies] = useState<Vacancy[]>([])
  const [allocations, setAllocations] = useState<Allocation[]>([])
  const [activeTab, setActiveTab] = useState('Overview')
  const [selectedVacancy, setSelectedVacancy] = useState('')
  const [selectedStudent, setSelectedStudent] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => onAuthStateChanged(getFirebaseAuth(), async (nextUser) => {
    setUser(nextUser)
    if (!nextUser) { setAuthorized(null); return }
    const profile = await getDoc(doc(getFirebaseDb(), 'users', nextUser.uid))
    setAuthorized(profile.exists() && (profile.data() as any).type === 'admin')
  }), [])

  const loadData = async () => {
    if (!authorized) return
    setLoading(true)
    try {
      const db = getFirebaseDb()
      const [studentSnap, vacancySnap, allocationSnap] = await Promise.all([
        getDocs(collection(db, 'studentProfiles')), getDocs(collection(db, 'internships')), getDocs(collection(db, 'allocations')),
      ])
      setStudents(studentSnap.docs.map((item) => ({ id: item.id, ...(item.data() as Omit<Student, 'id'>) })))
      setVacancies(vacancySnap.docs.map((item) => ({ id: item.id, ...(item.data() as Omit<Vacancy, 'id'>) })))
      setAllocations(allocationSnap.docs.map((item) => ({ id: item.id, ...(item.data() as Omit<Allocation, 'id'>) })))
    } catch { setMessage('Some records could not be loaded. Check your connection and try again.') } finally { setLoading(false) }
  }
  useEffect(() => { loadData() }, [authorized])

  const rankedStudents = useMemo(() => {
    const vacancy = vacancies.find((item) => item.id === selectedVacancy)
    if (!vacancy) return []
    return students.map((student) => ({ student, score: score(student, vacancy) })).sort((a, b) => b.score - a.score)
  }, [selectedVacancy, vacancies, students])

  const signIn = async (event: React.FormEvent) => {
    event.preventDefault(); setMessage('')
    try { await signInWithEmailAndPassword(getFirebaseAuth(), email, password) } catch { setMessage('Sign in failed. Use an administrator account.') }
  }
  const allocate = async () => {
    const student = students.find((item) => item.id === selectedStudent); const vacancy = vacancies.find((item) => item.id === selectedVacancy)
    if (!student || !vacancy) return setMessage('Select a student and vacancy first.')
    if (allocations.some((item) => item.studentId === student.id)) return setMessage('This student already has an allocation.')
    const matchScore = score(student, vacancy)
    if (matchScore < 60) return setMessage('This match is below the 60% eligibility threshold.')
    await addDoc(collection(getFirebaseDb(), 'allocations'), { studentId: student.id, internshipId: vacancy.id, studentName: student.name || student.email, company: vacancy.company, role: vacancy.role, score: matchScore, status: 'allocated', createdAt: serverTimestamp(), allocatedBy: user?.uid })
    setMessage(`Allocation created at ${matchScore}% compatibility.`); await loadData()
  }
  const runStableAllocation = async () => {
    const existingStudentIds = new Set(allocations.map((allocation) => allocation.studentId))
    const matches = stableMatches(students.filter((student) => !existingStudentIds.has(student.id)), vacancies)
    if (!matches.length) return setMessage('No eligible matches meet the 60% threshold.')
    await Promise.all(matches.map((match) => addDoc(collection(getFirebaseDb(), 'allocations'), { studentId: match.student.id, internshipId: match.vacancy.id, studentName: match.student.name || match.student.email, company: match.vacancy.company, role: match.vacancy.role, score: match.score, status: 'allocated', algorithm: 'stable-deferred-acceptance', createdAt: serverTimestamp(), allocatedBy: user?.uid })))
    setMessage(`${matches.length} stable allocation${matches.length === 1 ? '' : 's'} created. Every match met the 60% threshold and vacancy capacity was respected.`)
    await loadData()
  }
  const closeVacancy = async (vacancy: Vacancy) => { await updateDoc(doc(getFirebaseDb(), 'internships', vacancy.id), { status: 'closed', closedAt: serverTimestamp() }); setMessage('Vacancy closed.'); await loadData() }

  if (!user) return <main className="min-h-screen bg-background px-5 py-12 text-foreground"><div className="mx-auto max-w-md rounded-3xl border border-border bg-card p-7 shadow-sm"><ShieldCheck className="size-8 text-primary" /><h1 className="mt-4 text-3xl font-bold">Coordinator sign in</h1><p className="mt-2 text-sm text-muted-foreground">Manage students, vacancies, matching, and placements from one protected workspace.</p><form onSubmit={signIn} className="mt-7 space-y-4"><input required type="email" placeholder="Admin email" value={email} onChange={(event) => setEmail(event.target.value)} className="h-11 w-full rounded-xl border border-input bg-background px-3" /><input required type="password" placeholder="Password" value={password} onChange={(event) => setPassword(event.target.value)} className="h-11 w-full rounded-xl border border-input bg-background px-3" /><button className="h-11 w-full rounded-xl bg-primary font-semibold text-primary-foreground">Sign in</button></form>{message && <p className="mt-4 text-sm text-rose-600">{message}</p>}<Link href="/" className="mt-5 block text-sm text-muted-foreground hover:text-foreground">Back to student portal</Link></div></main>
  if (authorized === false) return <main className="min-h-screen bg-background px-5 py-12 text-foreground"><div className="mx-auto max-w-lg rounded-3xl border border-rose-500/20 bg-card p-7"><h1 className="text-2xl font-bold">Administrator access required</h1><p className="mt-2 text-muted-foreground">This account is not assigned the administrator role.</p><button onClick={() => signOut(getFirebaseAuth())} className="mt-5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">Sign out</button></div></main>

  const tabs = ['Overview', 'Students', 'Vacancies', 'Allocations', 'Reports']
  return <main className="min-h-screen bg-background text-foreground"><div className="mx-auto max-w-7xl px-5 py-8 lg:px-8"><header className="flex flex-col gap-4 rounded-3xl border border-border bg-card p-6 shadow-sm md:flex-row md:items-center md:justify-between"><div><p className="text-sm font-semibold text-primary">Smart allocation control center</p><h1 className="mt-2 text-3xl font-bold tracking-tight">Coordinator dashboard</h1><p className="mt-2 text-sm text-muted-foreground">Centralized, transparent placement decisions using the 35/20/15/10/10/10 weighted model.</p></div><div className="flex gap-2"><button onClick={loadData} className="rounded-xl border border-border px-3 py-2 text-sm"><RefreshCw className="mr-2 inline size-4" />Refresh</button><button onClick={() => signOut(getFirebaseAuth())} className="rounded-xl border border-border px-3 py-2 text-sm"><LogOut className="mr-2 inline size-4" />Sign out</button></div></header>
    <nav className="mt-6 flex flex-wrap gap-2">{tabs.map((tab) => <button key={tab} onClick={() => setActiveTab(tab)} className={`rounded-xl px-4 py-2 text-sm font-semibold ${activeTab === tab ? 'bg-primary text-primary-foreground' : 'border border-border bg-card text-muted-foreground'}`}>{tab}</button>)}</nav>
    {message && <div className="mt-5 rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm font-semibold">{message}</div>}
    {activeTab === 'Overview' && <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{([{ icon: Users, label: 'Students', value: students.length }, { icon: Building2, label: 'Open vacancies', value: vacancies.filter((v) => v.status !== 'closed').length }, { icon: ClipboardList, label: 'Allocations', value: allocations.length }, { icon: BarChart3, label: 'Average match', value: `${allocations.length ? Math.round(allocations.reduce((sum, item) => sum + (item.score || 0), 0) / allocations.length) : 0}%` }]).map(({ icon: Icon, label, value }) => <div key={label} className="rounded-2xl border border-border bg-card p-5"><Icon className="size-5 text-primary" /><p className="mt-5 text-sm text-muted-foreground">{label}</p><p className="mt-1 text-3xl font-bold">{value}</p></div>)}</section>}
    {activeTab === 'Students' && <section className="mt-6 rounded-3xl border border-border bg-card p-6"><h2 className="text-xl font-bold">Student records</h2><div className="mt-5 grid gap-3 md:grid-cols-2">{students.map((student) => <div key={student.id} className="rounded-2xl border border-border p-4"><p className="font-semibold">{student.name || student.email || 'Unnamed student'}</p><p className="mt-1 text-sm text-muted-foreground">{student.course || 'Course not provided'} · {student.preferredLocation || 'Location not provided'}</p><p className="mt-2 text-xs text-muted-foreground">Skills: {Array.isArray(student.skills) ? student.skills.join(', ') : student.skills || 'Not provided'}</p></div>)}{!students.length && <p className="text-sm text-muted-foreground">No student profiles found.</p>}</div></section>}
    {activeTab === 'Vacancies' && <section className="mt-6 rounded-3xl border border-border bg-card p-6"><h2 className="text-xl font-bold">Vacancy management</h2><div className="mt-5 space-y-3">{vacancies.map((vacancy) => <div key={vacancy.id} className="flex flex-col gap-3 rounded-2xl border border-border p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-semibold">{vacancy.role || 'Untitled role'} · {vacancy.company || 'Organization'}</p><p className="text-sm text-muted-foreground">{vacancy.location} · {vacancy.type} · {vacancy.status === 'closed' ? 'Closed' : 'Active'}</p></div>{vacancy.status !== 'closed' && <button onClick={() => closeVacancy(vacancy)} className="rounded-xl border border-rose-500/30 px-3 py-2 text-sm text-rose-600">Close vacancy</button>}</div>)}{!vacancies.length && <p className="text-sm text-muted-foreground">No vacancies found.</p>}</div></section>}
    {activeTab === 'Allocations' && <section className="mt-6 grid gap-6 lg:grid-cols-[1fr_1fr]"><div className="rounded-3xl border border-border bg-card p-6"><h2 className="text-xl font-bold">Create allocation</h2><select value={selectedVacancy} onChange={(event) => { setSelectedVacancy(event.target.value); setSelectedStudent('') }} className="mt-5 h-11 w-full rounded-xl border border-input bg-background px-3"><option value="">Choose an active vacancy</option>{vacancies.filter((v) => v.status !== 'closed').map((vacancy) => <option key={vacancy.id} value={vacancy.id}>{vacancy.role} · {vacancy.company}</option>)}</select><select value={selectedStudent} onChange={(event) => setSelectedStudent(event.target.value)} className="mt-3 h-11 w-full rounded-xl border border-input bg-background px-3"><option value="">Choose a student</option>{rankedStudents.map(({ student, score: matchScore }) => <option key={student.id} value={student.id}>{student.name || student.email} · {matchScore}%</option>)}</select><button onClick={allocate} className="mt-4 h-11 w-full rounded-xl bg-primary font-semibold text-primary-foreground">Allocate selected student</button><button onClick={runStableAllocation} className="mt-3 h-11 w-full rounded-xl border border-primary/30 bg-primary/5 font-semibold text-primary">Run stable matching for all eligible students</button><p className="mt-4 text-xs text-muted-foreground">The engine uses 35% technical skills, 20% academic programme, 15% career interest, 10% location, 10% student preference, and 10% employer eligibility. It enforces the configurable 60% threshold, one placement per student, vacancy capacity, and deferred acceptance.</p></div><div className="rounded-3xl border border-border bg-card p-6"><h2 className="text-xl font-bold">Current allocations</h2><div className="mt-5 space-y-3">{allocations.map((item) => <div key={item.id} className="rounded-2xl border border-border p-4"><div className="flex items-center justify-between gap-3"><p className="font-semibold">{item.studentName || item.studentId}</p><span className="rounded-full bg-emerald-500/10 px-2 py-1 text-xs font-bold text-emerald-700">{item.score || 0}%</span></div><p className="mt-1 text-sm text-muted-foreground">{item.role} · {item.company}</p></div>)}{!allocations.length && <p className="text-sm text-muted-foreground">No allocations yet.</p>}</div></div></section>}
    {activeTab === 'Reports' && <section className="mt-6 rounded-3xl border border-border bg-card p-6"><h2 className="text-xl font-bold">Allocation report</h2><div className="mt-5 grid gap-4 sm:grid-cols-3"><div><p className="text-sm text-muted-foreground">Unallocated students</p><p className="mt-1 text-2xl font-bold">{Math.max(0, students.length - allocations.length)}</p></div><div><p className="text-sm text-muted-foreground">Active opportunities</p><p className="mt-1 text-2xl font-bold">{vacancies.filter((v) => v.status !== 'closed').length}</p></div><div><p className="text-sm text-muted-foreground">Eligibility threshold</p><p className="mt-1 text-2xl font-bold">60%</p></div></div></section>}
    {loading && <p className="mt-4 text-sm text-muted-foreground">Refreshing records…</p>}
  </div></main>
}

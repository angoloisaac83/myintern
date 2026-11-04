'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { addDoc, collection, doc, getDoc, getDocs, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore'
import { createUserWithEmailAndPassword, onAuthStateChanged, signInWithEmailAndPassword, signOut, type User } from 'firebase/auth'
import { getFirebaseAuth, getFirebaseDb } from '@/lib/firebase'
import { ArrowRight, BarChart3, Building2, CheckCircle2, ClipboardList, LogOut, RefreshCw, ShieldCheck, Users, XCircle } from 'lucide-react'

type Student = { id: string; name?: string; email?: string; course?: string; skills?: string | string[]; preferredLocation?: string; interests?: string; preferredOrganizations?: string[]; cv?: string; accountStatus?: string }
type Account = { id: string; type?: string; email?: string; name?: string; accountStatus?: 'pending' | 'active' | 'suspended' | 'deactivated' }
type Organization = { id: string; name?: string; email?: string; website?: string; industry?: string; verificationStatus?: string; accountStatus?: 'pending' | 'active' | 'suspended' | 'deactivated' }
type Vacancy = { id: string; company?: string; role?: string; location?: string; type?: string; requirements?: string; tags?: string[]; createdBy?: string; status?: string; approvalStatus?: 'pending' | 'approved' | 'suspended' | 'rejected'; capacity?: number; preferredCourses?: string[] }

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
  const activeVacancies = vacancies.filter((vacancy) => vacancy.status !== 'closed' && (!vacancy.approvalStatus || vacancy.approvalStatus === 'approved') && (vacancy.capacity ?? 1) > 0)
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
  const [showAdminSetup, setShowAdminSetup] = useState(false)
  const [adminEmail, setAdminEmail] = useState('')
  const [adminPassword, setAdminPassword] = useState('')
  const [adminSetupPassword, setAdminSetupPassword] = useState('')
  const [message, setMessage] = useState('')
  const [students, setStudents] = useState<Student[]>([])
  const [vacancies, setVacancies] = useState<Vacancy[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [allocations, setAllocations] = useState<Allocation[]>([])
  const [activeTab, setActiveTab] = useState('Overview')
  const [selectedVacancy, setSelectedVacancy] = useState('')
  const [selectedStudent, setSelectedStudent] = useState('')
  const [loading, setLoading] = useState(false)
  const creatingAdminRef = useRef(false)

  useEffect(() => onAuthStateChanged(getFirebaseAuth(), async (nextUser) => {
    setUser(nextUser)
    if (!nextUser) { setAuthorized(null); return }
    if (creatingAdminRef.current) return
    const profile = await getDoc(doc(getFirebaseDb(), 'users', nextUser.uid))
    setAuthorized(profile.exists() && (profile.data() as any).type === 'admin')
  }), [])

  const loadData = async () => {
    if (!authorized) return
    setLoading(true)
    try {
      const db = getFirebaseDb()
      const [studentSnap, vacancySnap, allocationSnap, accountSnap, organizationSnap] = await Promise.all([
        getDocs(collection(db, 'studentProfiles')), getDocs(collection(db, 'internships')), getDocs(collection(db, 'allocations')),
        getDocs(collection(db, 'users')), getDocs(collection(db, 'companies')),
      ])
      setStudents(studentSnap.docs.map((item) => ({ id: item.id, ...(item.data() as Omit<Student, 'id'>) })))
      setVacancies(vacancySnap.docs.map((item) => ({ id: item.id, ...(item.data() as Omit<Vacancy, 'id'>) })))
      setAllocations(allocationSnap.docs.map((item) => ({ id: item.id, ...(item.data() as Omit<Allocation, 'id'>) })))
      setAccounts(accountSnap.docs.map((item) => ({ id: item.id, ...(item.data() as Omit<Account, 'id'>) })))
      setOrganizations(organizationSnap.docs.map((item) => ({ id: item.id, ...(item.data() as Omit<Organization, 'id'>) })))
    } catch { setMessage('Some records could not be loaded. Check your connection and try again.') } finally { setLoading(false) }
  }
  useEffect(() => { loadData() }, [authorized])

  const rankedStudents = useMemo(() => {
    const vacancy = vacancies.find((item) => item.id === selectedVacancy)
    if (!vacancy) return []
    return students.filter((student) => !student.accountStatus || student.accountStatus === 'active').map((student) => ({ student, score: score(student, vacancy) })).sort((a, b) => b.score - a.score)
  }, [selectedVacancy, vacancies, students])

  const signIn = async (event: React.FormEvent) => {
    event.preventDefault(); setMessage('')
    try { await signInWithEmailAndPassword(getFirebaseAuth(), email, password) } catch { setMessage('Sign in failed. Use an administrator account.') }
  }
  const createAdminAccount = async (event: React.FormEvent) => {
    event.preventDefault()
    setMessage('')
    if (adminSetupPassword !== 'projfin') {
      setMessage('The admin creation password is incorrect.')
      return
    }

    creatingAdminRef.current = true
    setLoading(true)
    try {
      const credential = await createUserWithEmailAndPassword(getFirebaseAuth(), adminEmail, adminPassword)
      await setDoc(doc(getFirebaseDb(), 'users', credential.user.uid), {
        uid: credential.user.uid,
        email: credential.user.email,
        type: 'admin',
        accountStatus: 'active',
        createdAt: serverTimestamp(),
      })
      setUser(credential.user)
      setAuthorized(true)
      setMessage('Administrator account created. Your coordinator workspace is ready.')
    } catch {
      setMessage('Could not create the administrator account. Check the email, password, and Firebase settings.')
      await signOut(getFirebaseAuth()).catch(() => undefined)
    } finally {
      creatingAdminRef.current = false
      setLoading(false)
    }
  }
  const allocate = async () => {
    const student = students.find((item) => item.id === selectedStudent); const vacancy = vacancies.find((item) => item.id === selectedVacancy)
    if (!student || !vacancy) return setMessage('Select a student and role first.')
    if (student.accountStatus && student.accountStatus !== 'active') return setMessage('Approve or reactivate this student account before allocating a role.')
    if (vacancy.approvalStatus && vacancy.approvalStatus !== 'approved') return setMessage('Approve this role before creating an allocation.')
    if (allocations.some((item) => item.studentId === student.id)) return setMessage('This student already has an allocation.')
    const matchScore = score(student, vacancy)
    if (matchScore < 60) return setMessage('This match is below the 60% eligibility threshold.')
    await addDoc(collection(getFirebaseDb(), 'allocations'), { studentId: student.id, internshipId: vacancy.id, studentName: student.name || student.email, company: vacancy.company, role: vacancy.role, score: matchScore, status: 'allocated', createdAt: serverTimestamp(), allocatedBy: user?.uid })
    setMessage(`Allocation created at ${matchScore}% compatibility.`); await loadData()
  }
  const runStableAllocation = async () => {
    const existingStudentIds = new Set(allocations.map((allocation) => allocation.studentId))
    const matches = stableMatches(students.filter((student) => (!student.accountStatus || student.accountStatus === 'active') && !existingStudentIds.has(student.id)), vacancies.filter((vacancy) => !vacancy.approvalStatus || vacancy.approvalStatus === 'approved'))
    if (!matches.length) return setMessage('No eligible matches meet the 60% threshold.')
    await Promise.all(matches.map((match) => addDoc(collection(getFirebaseDb(), 'allocations'), { studentId: match.student.id, internshipId: match.vacancy.id, studentName: match.student.name || match.student.email, company: match.vacancy.company, role: match.vacancy.role, score: match.score, status: 'allocated', algorithm: 'stable-deferred-acceptance', createdAt: serverTimestamp(), allocatedBy: user?.uid })))
    setMessage(`${matches.length} stable allocation${matches.length === 1 ? '' : 's'} created. Every match met the 60% threshold and available role capacity was respected.`)
    await loadData()
  }
  const setAccountStatus = async (account: Account, accountStatus: NonNullable<Account['accountStatus']>) => {
    try {
      const db = getFirebaseDb()
      await setDoc(doc(db, 'users', account.id), { accountStatus, updatedAt: serverTimestamp() }, { merge: true })
      const profileCollection = account.type === 'company' ? 'companies' : 'studentProfiles'
      await setDoc(doc(db, profileCollection, account.id), { accountStatus, updatedAt: serverTimestamp() }, { merge: true })
      if (account.type === 'company' && accountStatus !== 'active') {
        await Promise.all(vacancies.filter((role) => role.createdBy === account.id).map((role) => updateDoc(doc(db, 'internships', role.id), { approvalStatus: 'suspended', suspendedAt: serverTimestamp() })))
      }
      setMessage(`${account.type === 'company' ? 'Organization' : 'Student'} account ${accountStatus}.`)
      await loadData()
    } catch {
      setMessage('Could not update the account status. Please try again.')
    }
  }
  const approveOrganization = async (organization: Organization) => {
    try {
      const db = getFirebaseDb()
      await setDoc(doc(db, 'users', organization.id), { uid: organization.id, email: organization.email, name: organization.name, type: 'company', accountStatus: 'active', updatedAt: serverTimestamp() }, { merge: true })
      await setDoc(doc(db, 'companies', organization.id), { accountStatus: 'active', verificationStatus: 'Verified', verifiedAt: serverTimestamp() }, { merge: true })
      setMessage(`${organization.name || organization.email || 'Organization'} approved.`)
      await loadData()
    } catch {
      setMessage('Could not approve this organization. Please try again.')
    }
  }
  const moderateRole = async (role: Vacancy, approvalStatus: NonNullable<Vacancy['approvalStatus']>) => {
    try {
      const ownerAccount = accounts.find((account) => account.id === role.createdBy && account.type === 'company')
      if (approvalStatus === 'approved' && ['pending', 'suspended', 'deactivated'].includes(ownerAccount?.accountStatus ?? 'active')) {
        setMessage('Approve or reactivate the organization before approving its roles.')
        return
      }
      await updateDoc(doc(getFirebaseDb(), 'internships', role.id), { approvalStatus, reviewedAt: serverTimestamp(), reviewedBy: user?.uid })
      setMessage(`${role.role || 'Role'} ${approvalStatus === 'approved' ? 'approved' : approvalStatus}.`)
      await loadData()
    } catch {
      setMessage('Could not update this role. Please try again.')
    }
  }
  const closeRole = async (role: Vacancy) => { await updateDoc(doc(getFirebaseDb(), 'internships', role.id), { status: 'closed', closedAt: serverTimestamp() }); setMessage('Role closed.'); await loadData() }
  useEffect(() => {
    const handleAdminTab = (event: Event) => {
      const tab = (event as CustomEvent<string>).detail
      if (['Overview', 'Students', 'Organizations', 'Roles', 'Allocations', 'Reports'].includes(tab)) setActiveTab(tab)
    }
    window.addEventListener('pathway-admin-tab', handleAdminTab)
    return () => window.removeEventListener('pathway-admin-tab', handleAdminTab)
  }, [])

  if (!user) return (
    <main className="min-h-screen bg-background px-4 py-8 text-foreground sm:px-8 sm:py-12">
      <div className="mx-auto grid max-w-5xl overflow-hidden rounded-[2rem] border border-border/80 bg-card shadow-[0_24px_80px_rgba(15,35,25,0.14)] lg:grid-cols-[0.9fr_1.1fr]">
        <section className="relative isolate overflow-hidden bg-[#10251f] p-7 text-white sm:p-10">
          <div className="pointer-events-none absolute -bottom-28 -right-28 size-80 rounded-full border border-white/[0.07]" />
          <div className="relative flex size-12 items-center justify-center rounded-2xl bg-lime-300 text-[#10251f]"><ShieldCheck className="size-6" /></div>
          <p className="relative mt-8 text-xs font-semibold uppercase tracking-[0.2em] text-lime-200">Pathway coordinator</p>
          <h1 className="relative mt-3 font-serif text-3xl font-semibold leading-tight sm:text-4xl">Bring every placement into focus.</h1>
          <p className="relative mt-4 max-w-sm text-sm leading-6 text-white/65">Manage student records, opportunities, and transparent allocation decisions from one protected workspace.</p>
          <div className="relative mt-8 space-y-3 text-sm text-white/75"><p className="flex items-center gap-2"><CheckCircle2 className="size-4 text-lime-300" /> Student and organization records</p><p className="flex items-center gap-2"><CheckCircle2 className="size-4 text-lime-300" /> Explainable matching and allocation</p><p className="flex items-center gap-2"><CheckCircle2 className="size-4 text-lime-300" /> Vacancy and placement oversight</p></div>
        </section>
        <section className="p-6 sm:p-10">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Secure workspace</p>
          <h2 className="mt-2 font-serif text-2xl font-semibold">Coordinator access</h2>
          <div className="mt-6 grid grid-cols-2 rounded-2xl bg-secondary p-1" role="tablist" aria-label="Administrator account options">
            <button type="button" role="tab" aria-selected={!showAdminSetup} onClick={() => { setShowAdminSetup(false); setMessage('') }} className={`rounded-xl px-3 py-2.5 text-sm font-semibold transition ${!showAdminSetup ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'}`}>Sign in</button>
            <button type="button" role="tab" aria-selected={showAdminSetup} onClick={() => { setShowAdminSetup(true); setMessage('') }} className={`rounded-xl px-3 py-2.5 text-sm font-semibold transition ${showAdminSetup ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'}`}>Create admin account</button>
          </div>
          {showAdminSetup ? (
            <form onSubmit={createAdminAccount} className="mt-6 space-y-4">
              <p className="text-sm leading-6 text-muted-foreground">Create a coordinator account for this system. You’ll use the account password below to sign in later.</p>
              <label className="block text-sm font-medium">Admin email<input required type="email" autoComplete="email" placeholder="coordinator@example.com" value={adminEmail} onChange={(event) => setAdminEmail(event.target.value)} className="mt-2 h-12 w-full rounded-xl border border-input bg-background px-3 outline-none ring-primary focus:ring-2" /></label>
              <label className="block text-sm font-medium">Account password<input required type="password" minLength={6} autoComplete="new-password" placeholder="At least 6 characters" value={adminPassword} onChange={(event) => setAdminPassword(event.target.value)} className="mt-2 h-12 w-full rounded-xl border border-input bg-background px-3 outline-none ring-primary focus:ring-2" /></label>
              <label className="block text-sm font-medium">Admin creation password<input required type="password" autoComplete="off" placeholder="Enter the admin creation password" value={adminSetupPassword} onChange={(event) => setAdminSetupPassword(event.target.value)} className="mt-2 h-12 w-full rounded-xl border border-input bg-background px-3 outline-none ring-primary focus:ring-2" /></label>
              <button disabled={loading} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60">{loading ? 'Creating account…' : 'Create administrator account'} <ArrowRight className="size-4" /></button>
            </form>
          ) : (
            <form onSubmit={signIn} className="mt-6 space-y-4">
              <p className="text-sm leading-6 text-muted-foreground">Sign in with your coordinator email and password to open the allocation dashboard.</p>
              <label className="block text-sm font-medium">Admin email<input required type="email" autoComplete="email" placeholder="coordinator@example.com" value={email} onChange={(event) => setEmail(event.target.value)} className="mt-2 h-12 w-full rounded-xl border border-input bg-background px-3 outline-none ring-primary focus:ring-2" /></label>
              <label className="block text-sm font-medium">Password<input required type="password" autoComplete="current-password" placeholder="Your account password" value={password} onChange={(event) => setPassword(event.target.value)} className="mt-2 h-12 w-full rounded-xl border border-input bg-background px-3 outline-none ring-primary focus:ring-2" /></label>
              <button className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary font-semibold text-primary-foreground transition hover:bg-primary/90">Sign in <ArrowRight className="size-4" /></button>
            </form>
          )}
          {message && <p role="status" className="mt-4 rounded-xl border border-primary/15 bg-primary/5 px-4 py-3 text-sm text-foreground">{message}</p>}
          <Link href="/" className="mt-6 inline-flex text-sm font-medium text-muted-foreground transition hover:text-foreground">← Back to student portal</Link>
        </section>
      </div>
    </main>
  )
  if (authorized === null) return <main className="grid min-h-screen place-items-center bg-background px-5 text-foreground"><p className="text-sm text-muted-foreground">Checking coordinator access…</p></main>
  if (authorized === false) return <main className="min-h-screen bg-background px-5 py-12 text-foreground"><div className="mx-auto max-w-lg rounded-3xl border border-rose-500/20 bg-card p-7"><h1 className="text-2xl font-bold">Administrator access required</h1><p className="mt-2 text-muted-foreground">This account is not assigned the administrator role.</p><button onClick={() => signOut(getFirebaseAuth())} className="mt-5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">Sign out</button></div></main>

  const tabs = ['Overview', 'Students', 'Organizations', 'Roles', 'Allocations', 'Reports']
  const employerPlacements = Object.entries(allocations.reduce<Record<string, number>>((totals, item) => {
    const employer = item.company || 'Unassigned'
    totals[employer] = (totals[employer] || 0) + 1
    return totals
  }, {})).sort((a, b) => b[1] - a[1]).slice(0, 5)
  const displayedEmployers: [string, number][] = employerPlacements.length ? employerPlacements : [['No allocations yet', 0]]
  const maxEmployerPlacements = Math.max(1, ...employerPlacements.map(([, count]) => count))
  const scoreRanges = [{ label: '90 to 100%', min: 90, max: 100 }, { label: '80 to 89%', min: 80, max: 89 }, { label: '70 to 79%', min: 70, max: 79 }, { label: '60 to 69%', min: 60, max: 69 }]
  const scoreDistribution = scoreRanges.map((range) => ({ ...range, count: allocations.filter((item) => (item.score ?? 0) >= range.min && (item.score ?? 0) <= range.max).length }))
  const placementRate = students.length ? Math.min(100, Math.round((allocations.length / students.length) * 100)) : 0
  const openVacancies = vacancies.filter((vacancy) => vacancy.status !== 'closed' && (!vacancy.approvalStatus || vacancy.approvalStatus === 'approved'))
  const availableSeats = openVacancies.reduce((total, vacancy) => total + (vacancy.capacity ?? 1), 0)
  const seatFillRate = availableSeats ? Math.min(100, Math.round((allocations.length / availableSeats) * 100)) : 0
  return <main className="min-h-screen bg-background text-foreground"><div className="mx-auto max-w-7xl px-5 py-8 lg:px-8"><header className="flex flex-col gap-4 rounded-3xl border border-border bg-card p-6 shadow-sm md:flex-row md:items-center md:justify-between"><div><p className="text-sm font-semibold text-primary">Smart allocation control center</p><h1 className="mt-2 text-3xl font-bold tracking-tight">Coordinator dashboard</h1><p className="mt-2 text-sm text-muted-foreground">Centralized, transparent placement decisions using the 35/20/15/10/10/10 weighted model.</p></div><div className="flex gap-2"><button onClick={loadData} className="rounded-xl border border-border px-3 py-2 text-sm"><RefreshCw className="mr-2 inline size-4" />Refresh</button><button onClick={() => signOut(getFirebaseAuth())} className="rounded-xl border border-border px-3 py-2 text-sm"><LogOut className="mr-2 inline size-4" />Sign out</button></div></header>
    <nav className="mt-6 hidden flex-wrap gap-2 md:flex">{tabs.map((tab) => <button key={tab} onClick={() => setActiveTab(tab)} className={`rounded-xl px-4 py-2 text-sm font-semibold ${activeTab === tab ? 'bg-primary text-primary-foreground' : 'border border-border bg-card text-muted-foreground'}`}>{tab}</button>)}<Link href="/admin/analytics" className="rounded-xl border border-border bg-card px-4 py-2 text-sm font-semibold text-muted-foreground hover:text-foreground">Analytics</Link><Link href="/admin/organizations" className="rounded-xl border border-border bg-card px-4 py-2 text-sm font-semibold text-muted-foreground hover:text-foreground">Organizations</Link><Link href="/admin/reports" className="rounded-xl border border-border bg-card px-4 py-2 text-sm font-semibold text-muted-foreground hover:text-foreground">Reports</Link></nav>
    {message && <div className="mt-5 rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm font-semibold">{message}</div>}
    {activeTab === 'Overview' && <>
      <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{([{ icon: Users, label: 'Students', value: students.length }, { icon: Building2, label: 'Available roles', value: openVacancies.length }, { icon: ClipboardList, label: 'Allocations', value: allocations.length }, { icon: BarChart3, label: 'Average match', value: `${allocations.length ? Math.round(allocations.reduce((sum, item) => sum + (item.score || 0), 0) / allocations.length) : 0}%` }]).map(({ icon: Icon, label, value }) => <div key={label} className="rounded-2xl border border-border bg-card p-5"><Icon className="size-5 text-primary" /><p className="mt-5 text-sm text-muted-foreground">{label}</p><p className="mt-1 text-3xl font-bold">{value}</p></div>)}</section>
      <section className="mt-6 grid gap-6 xl:grid-cols-2">
        <article className="rounded-3xl border border-border bg-card p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Placement overview</p><h2 className="mt-2 text-xl font-bold">Student placement progress</h2><p className="mt-1 text-sm text-muted-foreground">Students with a confirmed allocation.</p></div><span className="rounded-xl bg-primary/10 px-3 py-2 text-sm font-bold text-primary">{placementRate}%</span></div>
          <div className="mt-7"><div className="mb-2 flex items-center justify-between text-sm"><span className="font-medium">Allocated students</span><span className="text-muted-foreground">{allocations.length} of {students.length}</span></div><div role="progressbar" aria-label="Student placement progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={placementRate} className="h-4 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${placementRate}%` }} /></div><div className="mt-3 flex justify-between text-xs text-muted-foreground"><span>{Math.max(0, students.length - allocations.length)} still seeking a placement</span><span>{placementRate}%</span></div></div>
          <div className="mt-7 rounded-2xl border border-border bg-background p-4"><div className="flex items-center justify-between gap-4"><div><p className="text-sm font-semibold">Available role capacity</p><p className="mt-1 text-xs text-muted-foreground">Allocations compared with approved role seats</p></div><p className="text-lg font-bold">{seatFillRate}%</p></div><div role="progressbar" aria-label="Available role capacity filled" aria-valuemin={0} aria-valuemax={100} aria-valuenow={seatFillRate} className="mt-4 h-3 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-lime-500 transition-[width] duration-500 dark:bg-lime-300" style={{ width: `${seatFillRate}%` }} /></div><p className="mt-2 text-xs text-muted-foreground">{allocations.length} allocated of {availableSeats} available seats</p></div>
        </article>

        <article className="rounded-3xl border border-border bg-card p-5 sm:p-6">
          <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Match quality</p><h2 className="mt-2 text-xl font-bold">Allocation score distribution</h2><p className="mt-1 text-sm text-muted-foreground">Scores from the weighted matching model.</p></div>
          <div className="mt-6 grid grid-cols-4 items-end gap-3 rounded-2xl bg-background px-4 pb-3 pt-5" role="img" aria-label="Bar chart showing allocation scores by score range">
            {scoreDistribution.map(({ label, count }) => <div key={label} className="flex min-w-0 flex-col items-center gap-2"><span className="text-xs font-bold">{count}</span><div className="flex h-28 w-full items-end justify-center rounded-t-lg bg-muted/70"><div className="w-2/3 rounded-t-lg bg-primary transition-[height] duration-500" style={{ height: `${count ? Math.max(10, (count / Math.max(1, ...scoreDistribution.map((bucket) => bucket.count))) * 100) : 4}%` }} /></div><span className="text-center text-[10px] leading-3 text-muted-foreground">{label.replace(' to ', '–')}</span></div>)}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">{allocations.length ? `${allocations.length} total allocation${allocations.length === 1 ? '' : 's'} scored` : 'Bars will grow as eligible allocations are created.'}</p>
        </article>

        <article className="rounded-3xl border border-border bg-card p-5 xl:col-span-2 sm:p-6">
          <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Employer activity</p><h2 className="mt-2 text-xl font-bold">Placements by organization</h2><p className="mt-1 text-sm text-muted-foreground">Distribution of successful student allocations.</p></div><BarChart3 className="size-5 text-primary" /></div>
          <div className="mt-6 grid gap-x-8 gap-y-5 md:grid-cols-2">{displayedEmployers.map(([company, count]) => <div key={company}><div className="mb-2 flex items-center justify-between gap-4 text-sm"><span className="truncate font-medium">{company}</span><span className="shrink-0 text-muted-foreground">{count}</span></div><div role="progressbar" aria-label={`${company} placement count`} aria-valuemin={0} aria-valuemax={maxEmployerPlacements} aria-valuenow={count} className="h-3 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${count ? Math.max(6, (count / maxEmployerPlacements) * 100) : 0}%` }} /></div></div>)}</div>
        </article>
      </section>
    </>}
    {activeTab === 'Students' && <section className="mt-6 rounded-3xl border border-border bg-card p-6"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Account review</p><h2 className="mt-2 text-xl font-bold">Student accounts</h2><p className="mt-1 text-sm text-muted-foreground">Approve students before they apply, or suspend and deactivate access.</p></div><div className="mt-5 space-y-3">{accounts.filter((account) => account.type === 'student').map((account) => { const student = students.find((item) => item.id === account.id); const status = account.accountStatus ?? student?.accountStatus ?? 'active'; return <article key={account.id} className="rounded-2xl border border-border p-4"><div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="font-semibold">{student?.name || account.name || account.email || 'Student account'}</p><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${status === 'active' ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : status === 'pending' ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300' : 'bg-rose-500/10 text-rose-700 dark:text-rose-300'}`}>{status}</span></div><p className="mt-1 text-sm text-muted-foreground">{student?.course || 'Course not provided'} · {student?.preferredLocation || 'Location not provided'}</p><p className="mt-2 text-xs text-muted-foreground">Skills: {Array.isArray(student?.skills) ? student.skills.join(', ') : student?.skills || 'Not provided'}</p></div><div className="flex flex-wrap gap-2">{status !== 'active' && <button onClick={() => setAccountStatus(account, 'active')} className="rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground">{status === 'pending' ? 'Approve' : 'Reactivate'}</button>}{status !== 'suspended' && status !== 'deactivated' && <button onClick={() => setAccountStatus(account, 'suspended')} className="rounded-xl border border-amber-500/30 px-3 py-2 text-xs font-semibold text-amber-700 dark:text-amber-300">Suspend</button>}{status !== 'deactivated' && <button onClick={() => setAccountStatus(account, 'deactivated')} className="rounded-xl border border-rose-500/30 px-3 py-2 text-xs font-semibold text-rose-700 dark:text-rose-300">Deactivate</button>}</div></div></article> })}{!accounts.some((account) => account.type === 'student') && <p className="rounded-2xl border border-dashed border-border p-6 text-sm text-muted-foreground">Student accounts will appear here when students register.</p>}</div></section>}
    {activeTab === 'Organizations' && <section className="mt-6 rounded-3xl border border-border bg-card p-6"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Organization review</p><h2 className="mt-2 text-xl font-bold">Organization accounts</h2><p className="mt-1 text-sm text-muted-foreground">Verify employers and control access to role posting.</p></div><div className="mt-5 grid gap-4 lg:grid-cols-2">{organizations.map((organization) => { const userAccount = accounts.find((account) => account.id === organization.id); const status = organization.accountStatus ?? userAccount?.accountStatus ?? (organization.verificationStatus === 'Verified' ? 'active' : 'pending'); const roles = vacancies.filter((role) => role.createdBy === organization.id); return <article key={organization.id} className="rounded-2xl border border-border p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="font-semibold">{organization.name || userAccount?.name || organization.email || 'Organization'}</p><p className="mt-1 truncate text-sm text-muted-foreground">{organization.website || 'Website not provided'} · {organization.industry || 'Industry not provided'}</p></div><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${status === 'active' ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : status === 'pending' ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300' : 'bg-rose-500/10 text-rose-700 dark:text-rose-300'}`}>{status}</span></div><p className="mt-3 text-xs text-muted-foreground">{roles.length} uploaded role{roles.length === 1 ? '' : 's'} · {organization.email || userAccount?.email || 'No contact email'}</p><div className="mt-4 flex flex-wrap gap-2">{status !== 'active' && <button onClick={() => approveOrganization(organization)} className="rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground">{status === 'pending' ? 'Approve organization' : 'Reactivate organization'}</button>}{status !== 'suspended' && status !== 'deactivated' && <button onClick={() => setAccountStatus({ ...userAccount, id: organization.id, type: 'company', name: organization.name, email: organization.email }, 'suspended')} className="rounded-xl border border-amber-500/30 px-3 py-2 text-xs font-semibold text-amber-700 dark:text-amber-300">Suspend</button>}{status !== 'deactivated' && <button onClick={() => setAccountStatus({ ...userAccount, id: organization.id, type: 'company', name: organization.name, email: organization.email }, 'deactivated')} className="rounded-xl border border-rose-500/30 px-3 py-2 text-xs font-semibold text-rose-700 dark:text-rose-300">Deactivate</button>}</div></article> })}{!organizations.length && <p className="rounded-2xl border border-dashed border-border p-6 text-sm text-muted-foreground lg:col-span-2">Organizations will appear here when employers register.</p>}</div></section>}
    {activeTab === 'Roles' && <section className="mt-6 rounded-3xl border border-border bg-card p-6"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Role moderation</p><h2 className="mt-2 text-xl font-bold">Available roles</h2><p className="mt-1 text-sm text-muted-foreground">Review organization submissions before they appear to students.</p></div><div className="mt-5 space-y-3">{vacancies.map((role) => { const approvalStatus = role.approvalStatus ?? 'approved'; const statusLabel = approvalStatus === 'pending' ? 'Pending review' : approvalStatus === 'suspended' ? 'Suspended' : approvalStatus === 'rejected' ? 'Rejected' : role.status === 'closed' ? 'Closed' : 'Published'; return <article key={role.id} className="rounded-2xl border border-border p-4"><div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex flex-wrap items-center gap-2"><p className="font-semibold">{role.role || 'Untitled role'} · {role.company || 'Organization'}</p><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${approvalStatus === 'approved' ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : approvalStatus === 'pending' ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300' : 'bg-rose-500/10 text-rose-700 dark:text-rose-300'}`}>{statusLabel}</span></div><p className="mt-1 text-sm text-muted-foreground">{role.location || 'Flexible location'} · {role.type || 'Internship'} · {role.tags?.join(', ') || 'No skill tags'}</p><p className="mt-2 text-xs text-muted-foreground">{role.requirements || 'No additional requirements provided.'}</p></div><div className="flex flex-wrap gap-2">{approvalStatus !== 'approved' && <button onClick={() => moderateRole(role, 'approved')} className="rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground">Approve role</button>}{approvalStatus === 'approved' && role.status !== 'closed' && <button onClick={() => moderateRole(role, 'suspended')} className="rounded-xl border border-amber-500/30 px-3 py-2 text-xs font-semibold text-amber-700 dark:text-amber-300">Suspend</button>}{role.status !== 'closed' && <button onClick={() => closeRole(role)} className="rounded-xl border border-border px-3 py-2 text-xs font-semibold text-muted-foreground">Close role</button>}</div></div></article> })}{!vacancies.length && <p className="rounded-2xl border border-dashed border-border p-6 text-sm text-muted-foreground">Uploaded roles will appear here for coordinator review.</p>}</div></section>}
    {activeTab === 'Allocations' && <section className="mt-6 grid gap-6 lg:grid-cols-[1fr_1fr]"><div className="rounded-3xl border border-border bg-card p-6"><h2 className="text-xl font-bold">Create allocation</h2><select value={selectedVacancy} onChange={(event) => { setSelectedVacancy(event.target.value); setSelectedStudent('') }} className="mt-5 h-11 w-full rounded-xl border border-input bg-background px-3"><option value="">Choose an approved role</option>{vacancies.filter((v) => v.status !== 'closed' && (!v.approvalStatus || v.approvalStatus === 'approved')).map((vacancy) => <option key={vacancy.id} value={vacancy.id}>{vacancy.role} · {vacancy.company}</option>)}</select><select value={selectedStudent} onChange={(event) => setSelectedStudent(event.target.value)} className="mt-3 h-11 w-full rounded-xl border border-input bg-background px-3"><option value="">Choose an approved student</option>{rankedStudents.map(({ student, score: matchScore }) => <option key={student.id} value={student.id}>{student.name || student.email} · {matchScore}%</option>)}</select><button onClick={allocate} className="mt-4 h-11 w-full rounded-xl bg-primary font-semibold text-primary-foreground">Allocate selected student</button><button onClick={runStableAllocation} className="mt-3 h-11 w-full rounded-xl border border-primary/30 bg-primary/5 font-semibold text-primary">Run stable matching for all eligible students</button><p className="mt-4 text-xs text-muted-foreground">The engine uses 35% technical skills, 20% academic programme, 15% career interest, 10% location, 10% student preference, and 10% employer eligibility. It enforces the 60% threshold, one placement per student, available role capacity, and deferred acceptance.</p></div><div className="rounded-3xl border border-border bg-card p-6"><h2 className="text-xl font-bold">Current allocations</h2><div className="mt-5 space-y-3">{allocations.map((item) => <div key={item.id} className="rounded-2xl border border-border p-4"><div className="flex items-center justify-between gap-3"><p className="font-semibold">{item.studentName || item.studentId}</p><span className="rounded-full bg-emerald-500/10 px-2 py-1 text-xs font-bold text-emerald-700">{item.score || 0}%</span></div><p className="mt-1 text-sm text-muted-foreground">{item.role} · {item.company}</p></div>)}{!allocations.length && <p className="text-sm text-muted-foreground">No allocations yet.</p>}</div></div></section>}
    {activeTab === 'Reports' && <section className="mt-6 rounded-3xl border border-border bg-card p-6"><h2 className="text-xl font-bold">Allocation report</h2><div className="mt-5 grid gap-4 sm:grid-cols-3"><div><p className="text-sm text-muted-foreground">Unallocated students</p><p className="mt-1 text-2xl font-bold">{Math.max(0, students.length - allocations.length)}</p></div><div><p className="text-sm text-muted-foreground">Available roles</p><p className="mt-1 text-2xl font-bold">{openVacancies.length}</p></div><div><p className="text-sm text-muted-foreground">Eligibility threshold</p><p className="mt-1 text-2xl font-bold">60%</p></div></div></section>}
    {loading && <p className="mt-4 text-sm text-muted-foreground">Refreshing records…</p>}
  </div></main>
}

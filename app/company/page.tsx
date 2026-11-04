'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { addDoc, collection, doc, getDocs, getDoc, query, serverTimestamp, setDoc, where, updateDoc, onSnapshot, orderBy } from 'firebase/firestore'
import { createUserWithEmailAndPassword, onAuthStateChanged, signInWithEmailAndPassword, signOut, updateProfile, type User } from 'firebase/auth'
import { getFirebaseAuth, getFirebaseDb } from '@/lib/firebase'
import { ArrowRight, Briefcase, Building2, CheckCircle2, MapPin, Sparkles, Users } from 'lucide-react'
import { NotificationCenter } from '@/components/notification-center'

type InternshipItem = {
  id: string
  company: string
  role: string
  location: string
  type: string
  requirements?: string
  tags?: string[]
  status?: string
  approvalStatus?: 'pending' | 'approved' | 'suspended' | 'rejected'
  createdAt?: unknown
  createdBy?: string
}

function normalizeDropboxUrl(value: unknown) {
  if (typeof value !== 'string' || !value) return ''
  if (!value.includes('dropbox.com')) return value
  try {
    const url = new URL(value)
    url.searchParams.delete('dl')
    url.searchParams.set('raw', '1')
    return url.toString()
  } catch {
    return value
  }
}

export default function CompanyPage() {
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [companyLogo, setCompanyLogo] = useState('')
  const [companyWebsite, setCompanyWebsite] = useState('')
  const [role, setRole] = useState('')
  const [location, setLocation] = useState('')
  const [type, setType] = useState('Hybrid')
  const [requirements, setRequirements] = useState('')
  const [tags, setTags] = useState('')
  const [userMessage, setUserMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [currentUser, setCurrentUser] = useState<User | null>(null)
  const [jobs, setJobs] = useState<InternshipItem[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [jobsLoading, setJobsLoading] = useState(false)
  const [jobError, setJobError] = useState('')
  const [applications, setApplications] = useState<any[]>([])
  const [appsLoading, setAppsLoading] = useState(false)
  const [isCompanyAccount, setIsCompanyAccount] = useState<boolean | null>(null)
  const [companyAccountStatus, setCompanyAccountStatus] = useState<'pending' | 'active' | 'suspended' | 'deactivated'>('active')
  const [companyNotifications, setCompanyNotifications] = useState<any[]>([])

  useEffect(() => {
    const auth = getFirebaseAuth()
    return onAuthStateChanged(auth, (user) => {
      setCurrentUser(user)
      if (!user) {
        setCompanyName('')
        setCompanyLogo('')
        setIsCompanyAccount(null)
        setCompanyAccountStatus('active')
        setJobs([])
        return
      }
      if (user.displayName) setCompanyName(user.displayName)
      ;(async () => {
        try {
          const db = getFirebaseDb()
          const userDoc = await getDoc(doc(db, 'users', user.uid))
          const userData = userDoc.exists() ? userDoc.data() as any : null
          setCompanyAccountStatus(userData?.accountStatus ?? 'active')
          if (userData?.type === 'company') {
            const companyDoc = await getDoc(doc(db, 'companies', user.uid))
            if (companyDoc.exists()) {
              const companyData = companyDoc.data() as any
              setCompanyAccountStatus(userData.accountStatus ?? companyData.accountStatus ?? 'active')
              setCompanyName(companyData.name ?? user.displayName ?? '')
              setCompanyLogo(normalizeDropboxUrl(companyData.logo))
              setCompanyWebsite(companyData.website ?? '')
            }
            setIsCompanyAccount(true)
            return
          }
          const compDoc = await getDoc(doc(db, 'companies', user.uid))
          if (compDoc.exists()) {
            const companyData = compDoc.data() as any
            setCompanyAccountStatus(userData?.accountStatus ?? companyData.accountStatus ?? 'active')
            setCompanyName(companyData.name ?? user.displayName ?? '')
            setCompanyLogo(normalizeDropboxUrl(companyData.logo))
            setCompanyWebsite(companyData.website ?? '')
            setIsCompanyAccount(true)
            return
          }
          setIsCompanyAccount(false)
          setCompanyAccountStatus('active')
        } catch (err) {
          console.error(err)
          setIsCompanyAccount(false)
          setCompanyAccountStatus('active')
        }
      })()
    })
  }, [])

  useEffect(() => {
    if (!currentUser) return
    loadJobs()
    loadCompanyApplications()
    // listen for notifications targeted to this company
    try {
      const db = getFirebaseDb()
      const notesRef = collection(db, 'notifications')
      // avoid composite-index requirement: sort client-side
      const nq = query(notesRef, where('userId', '==', currentUser.uid))
      const unsubNotes = onSnapshot(nq, (snapshot) => {
        const loaded = snapshot.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))
        const normalized = loaded.map((n: any) => ({ id: n.id, message: n.message, createdAt: n.createdAt && typeof (n.createdAt as any).toDate === 'function' ? (n.createdAt as any).toDate().getTime() : Date.now(), applicationId: n.applicationId, fromUserId: n.fromUserId }))
        normalized.sort((a: any, b: any) => b.createdAt - a.createdAt)
        setCompanyNotifications(normalized)
      })
      return () => unsubNotes()
    } catch (err) {
      console.error('Failed to subscribe to company notifications', err)
    }
  }, [currentUser])

  const loadJobs = async () => {
    setJobError('')
    setJobsLoading(true)
    try {
      const db = getFirebaseDb()
      const internshipsRef = collection(db, 'internships')
      // Avoid requiring composite Firestore indexes by filtering client-side
      const q = query(internshipsRef, where('createdBy', '==', currentUser?.uid))
      const snapshot = await getDocs(q)
      const loaded = snapshot.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<InternshipItem, 'id'>) }))
      // sort locally by createdAt desc
      loaded.sort((a, b) => {
        const at = a.createdAt && typeof (a.createdAt as any).toDate === 'function' ? (a.createdAt as any).toDate().getTime() : 0
        const bt = b.createdAt && typeof (b.createdAt as any).toDate === 'function' ? (b.createdAt as any).toDate().getTime() : 0
        return bt - at
      })
      setJobs(loaded)
    } catch (error) {
      console.error(error)
      setJobError('Unable to load your posted roles. Please refresh.')
    } finally {
      setJobsLoading(false)
    }
  }

  const loadCompanyApplications = async () => {
    if (!currentUser) return
    setAppsLoading(true)
    try {
      const db = getFirebaseDb()
      const appsRef = collection(db, 'applications')
      const q = query(appsRef, where('companyId', '==', currentUser.uid), where('status', '==', 'submitted'))
      const snapshot = await getDocs(q)
      const loaded = await Promise.all(snapshot.docs.map(async (d) => {
        const application = { id: d.id, ...(d.data() as any) }
        const studentSnap = application.studentId ? await getDoc(doc(db, 'studentProfiles', application.studentId)) : null
        return { ...application, studentProfile: studentSnap?.exists() ? studentSnap.data() : null }
      }))
      setApplications(loaded)
    } catch (err) {
      console.error(err)
    } finally {
      setAppsLoading(false)
    }
  }

  const updateApplicationStatus = async (id: string, status: 'accepted' | 'declined') => {
    if (!currentUser) return
    try {
      const db = getFirebaseDb()
      await updateDoc(doc(db, 'applications', id), { status })
      // write a notification for the student so they receive it reliably
      try {
        const appSnap = await getDoc(doc(db, 'applications', id))
        if (appSnap.exists()) {
          const app = appSnap.data() as any
          if (app.studentId) {
            await addDoc(collection(db, 'notifications'), {
              userId: app.studentId,
              message: `Your application for ${app.role} was ${status}.`,
              applicationId: id,
              createdAt: serverTimestamp(),
              read: false,
            })
          }
        }
      } catch (err) {
        console.error('Failed to create notification', err)
      }
      setSuccessMessage(`Application ${status}.`)
      await loadCompanyApplications()
    } catch (err) {
      console.error(err)
      setUserMessage('Could not update application. Try again.')
    }
  }

  const submitAuth = async (event: React.FormEvent) => {
    event.preventDefault()
    setUserMessage('')
    setSuccessMessage('')
    setIsLoading(true)

    try {
      const auth = getFirebaseAuth()
      if (authMode === 'signup') {
        const result = await createUserWithEmailAndPassword(auth, email, password)
        if (companyName.trim()) {
          await updateProfile(result.user, { displayName: companyName })
        }
        const db = getFirebaseDb()
        // write to companies and users so we can gate access
        await setDoc(doc(db, 'companies', result.user.uid), {
          name: companyName,
          website: companyWebsite,
          email,
          uid: result.user.uid,
          verificationStatus: 'Pending',
          accountStatus: 'pending',
          createdAt: serverTimestamp(),
        })
        await setDoc(doc(db, 'users', result.user.uid), {
          uid: result.user.uid,
          email,
          type: 'company',
          accountStatus: 'pending',
          name: companyName,
          createdAt: serverTimestamp(),
        })
        setCurrentUser(result.user)
        setIsCompanyAccount(true)
        setCompanyAccountStatus('pending')
        setSuccessMessage('Company account created. A coordinator must approve your organization before you can publish roles.')
      } else {
        const result = await signInWithEmailAndPassword(auth, email, password)
        setCurrentUser(result.user)
        setSuccessMessage('Signed in successfully. Checking your organization approval status.')
      }
    } catch (error) {
      const code = error instanceof Error && 'code' in error ? String((error as { code?: string }).code) : ''
      const messages: Record<string, string> = {
        'auth/email-already-in-use': 'That email already has an account. Try signing in instead.',
        'auth/invalid-email': 'Enter a valid email address.',
        'auth/user-not-found': 'No account found with that email.',
        'auth/wrong-password': 'The password is incorrect.',
        'auth/weak-password': 'Use a stronger password with at least 6 characters.',
      }
      setUserMessage(messages[code] ?? 'Could not complete that request. Check your details and Firebase Auth settings.')
    } finally {
      setIsLoading(false)
    }
  }

  const submitRole = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!currentUser) {
      setUserMessage('Sign in first to post internship roles.')
      return
    }
    if (companyAccountStatus !== 'active') {
      setUserMessage('Your organization is awaiting coordinator approval before you can publish roles.')
      return
    }

    if (!role.trim() || !location.trim()) {
      setUserMessage('Role title and location are required.')
      return
    }

    setUserMessage('')
    setSuccessMessage('')
    setIsLoading(true)

    try {
      const db = getFirebaseDb()
      const compDoc = await getDoc(doc(db, 'companies', currentUser.uid))
      const compData = compDoc.exists() ? (compDoc.data() as any) : null
      if (!compData || !compData.name || !compData.website) {
        setUserMessage('Complete your company profile (name and website) before posting roles.')
        setIsLoading(false)
        return
      }
      if ((compData.accountStatus && compData.accountStatus !== 'active') || (compData.verificationStatus && compData.verificationStatus !== 'Verified')) {
        setUserMessage('Your organization must be approved before you can publish roles.')
        setIsLoading(false)
        return
      }
      await addDoc(collection(db, 'internships'), {
        company: currentUser.displayName || companyName || 'Company',
        role: role.trim(),
        location: location.trim(),
        type: type || 'Hybrid',
        requirements: requirements.trim(),
        tags: tags.split(',').map((tag) => tag.trim()).filter(Boolean),
        status: 'open',
        approvalStatus: 'pending',
        createdBy: currentUser.uid,
        createdAt: serverTimestamp(),
      })
      setSuccessMessage('Role submitted. It will appear to students after coordinator approval.')
      setRole('')
      setLocation('')
      setType('Hybrid')
      setRequirements('')
      setTags('')
      loadJobs()
    } catch (error) {
      console.error(error)
      setUserMessage('Unable to upload the role. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <main className="company-portal min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-6xl px-5 py-8 lg:px-8 lg:py-10">
        <div className="relative isolate mb-8 flex flex-col gap-5 overflow-visible rounded-[2rem] bg-[#10251f] p-6 text-white shadow-xl shadow-emerald-950/10 sm:flex-row sm:items-center sm:justify-between sm:p-8">
          <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]"><div className="absolute -right-20 -top-36 size-80 rounded-full border border-white/[0.07]" /></div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-lime-200">Pathway for employers</p>
            <h1 className="mt-3 max-w-2xl font-serif text-3xl font-semibold tracking-tight sm:text-4xl">Meet your next great intern.</h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-white/70">Share meaningful opportunities with emerging IT talent. Post roles, review applications, and manage your openings in one place.</p>
          </div>
          <div className="relative z-10 inline-flex shrink-0 items-center gap-3">
            <NotificationCenter notifications={companyNotifications} />
            <Link href="/" className="inline-flex items-center gap-2 rounded-2xl bg-lime-300 px-4 py-2.5 text-sm font-semibold text-[#10251f] transition hover:bg-lime-200">
              <Sparkles className="size-4" /> Student portal
            </Link>
          </div>
        </div>

        {successMessage && <div className="mb-6 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-5 py-4 text-sm font-semibold text-emerald-700 dark:text-emerald-400">{successMessage}</div>}
        {userMessage && <div className="mb-6 rounded-2xl border border-destructive/20 bg-destructive/5 px-5 py-4 text-sm font-semibold text-destructive">{userMessage}</div>}

        {!currentUser ? (
          <div className="grid gap-8 lg:grid-cols-[360px_1fr]">
            <div className="rounded-3xl border border-border/80 bg-card p-6 shadow-[0_8px_30px_rgba(26,50,38,0.05)] sm:p-8">
              <div className="mb-6 flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-primary">{authMode === 'signup' ? 'Create company account' : 'Company sign in'}</p>
                  <p className="mt-1 text-sm text-muted-foreground">Access your jobs dashboard and post new roles.</p>
                </div>
                <button onClick={() => setAuthMode(authMode === 'login' ? 'signup' : 'login')} className="rounded-2xl border border-border bg-secondary px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-secondary/90">
                  {authMode === 'login' ? 'Switch to sign up' : 'Switch to sign in'}
                </button>
              </div>
              <form onSubmit={submitAuth} className="space-y-4">
                <label className="block text-sm font-medium">Email<input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-input bg-background px-3 outline-none ring-primary focus:ring-2" placeholder="company@example.com" /></label>
                <label className="block text-sm font-medium">Password<input type="password" required minLength={6} value={password} onChange={(event) => setPassword(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-input bg-background px-3 outline-none ring-primary focus:ring-2" placeholder="At least 6 characters" /></label>
                {authMode === 'signup' && (
                  <>
                    <label className="block text-sm font-medium">Company name<input required value={companyName} onChange={(event) => setCompanyName(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-input bg-background px-3 outline-none ring-primary focus:ring-2" placeholder="Example Studio" /></label>
                    <label className="block text-sm font-medium">Website (optional)<input value={companyWebsite} onChange={(event) => setCompanyWebsite(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-input bg-background px-3 outline-none ring-primary focus:ring-2" placeholder="https://example.com" /></label>
                  </>
                )}
                <button type="submit" className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-foreground hover:bg-primary/90">
                  {authMode === 'signup' ? 'Create account' : 'Sign in'} <ArrowRight className="size-4" />
                </button>
              </form>
            </div>
            <div className="relative isolate overflow-hidden rounded-3xl border border-border/80 bg-card p-7 shadow-[0_8px_30px_rgba(26,50,38,0.05)] sm:p-8">
              <div className="absolute -right-12 -top-12 size-40 rounded-full bg-primary/[0.06]" />
              <p className="relative text-xs font-semibold uppercase tracking-[0.18em] text-primary">Built for better placements</p>
              <h2 className="relative mt-3 font-serif text-2xl font-semibold">A simpler way to connect with rising talent.</h2>
              <div className="relative mt-7 space-y-5 text-sm text-muted-foreground">
                <p className="flex gap-3"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" /><span><strong className="text-foreground">Post with clarity.</strong> Share the role, skills, and work arrangement students need to know.</span></p>
                <p className="flex gap-3"><Users className="mt-0.5 size-4 shrink-0 text-primary" /><span><strong className="text-foreground">Reach motivated students.</strong> Put your opportunity in front of learners ready to grow.</span></p>
                <p className="flex gap-3"><Briefcase className="mt-0.5 size-4 shrink-0 text-primary" /><span><strong className="text-foreground">Manage in one place.</strong> Keep track of openings and applications in your employer workspace.</span></p>
              </div>
            </div>
          </div>
        ) : isCompanyAccount === null ? (
          <div className="rounded-3xl border border-border bg-card p-8 text-sm text-muted-foreground">Checking organization access…</div>
        ) : isCompanyAccount === false ? (
          <div className="rounded-3xl border border-border bg-card p-6 shadow-sm">
            <p className="text-sm font-semibold text-primary">Access denied</p>
            <h2 className="mt-2 text-2xl font-bold">Company portal only</h2>
            <p className="mt-2 text-sm text-muted-foreground">This area is restricted to company accounts. Sign in with a company account or create one.</p>
            <div className="mt-4 flex gap-2">
              <Link href="/" className="rounded-xl border border-border bg-background px-4 py-2 text-sm font-medium text-muted-foreground">Back to student portal</Link>
              <button onClick={async () => { await signOut(getFirebaseAuth()); setCurrentUser(null); setIsCompanyAccount(null); setSuccessMessage('Signed out.') }} className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">Sign out</button>
            </div>
          </div>
        ) : companyAccountStatus !== 'active' ? (
          <section className="rounded-3xl border border-amber-500/20 bg-card p-7 shadow-sm sm:p-9">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700 dark:text-amber-300">Organization access</p>
            <h2 className="mt-3 font-serif text-2xl font-semibold">{companyAccountStatus === 'pending' ? 'Awaiting coordinator approval' : `Account ${companyAccountStatus}`}</h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">{companyAccountStatus === 'pending' ? 'Your organization profile is in review. You can publish internship roles once a coordinator approves it.' : 'Role posting and application management are paused. Contact your placement coordinator for assistance.'}</p>
            <div className="mt-6 flex flex-wrap gap-3"><Link href="/settings" className="rounded-xl border border-border px-4 py-2.5 text-sm font-semibold hover:bg-secondary">Review organization profile</Link><button onClick={async () => { await signOut(getFirebaseAuth()); setCurrentUser(null) }} className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground">Sign out</button></div>
          </section>
        ) : (
          <div className="space-y-6">
            <div className="rounded-3xl border border-border/80 bg-card p-6 shadow-[0_8px_30px_rgba(26,50,38,0.05)] sm:p-8">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-4">
                  {companyLogo ? <img src={companyLogo} alt="Company logo" className="h-14 w-14 rounded-2xl object-cover" /> : <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-xl font-bold text-primary">{(currentUser.displayName || companyName || 'C').slice(0, 1).toUpperCase()}</div>}
                  <div>
                  <p className="text-sm font-semibold text-primary">Welcome back</p>
                  <h2 className="mt-2 text-2xl font-bold tracking-tight">{currentUser.displayName || companyName || 'Company'}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">Post internship roles and manage the openings you already created.</p>
                  </div>
                </div>
                <button onClick={async () => { await signOut(getFirebaseAuth()); setCurrentUser(null); setSuccessMessage('Signed out successfully.') }} className="rounded-2xl border border-border bg-background px-4 py-2 text-sm font-semibold text-muted-foreground hover:bg-secondary">Sign out</button>
              </div>
            </div>

            <div className="grid gap-6 sm:grid-cols-3">
              <div className="rounded-3xl border border-border/80 bg-card p-5 shadow-sm"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Available roles</p><p className="mt-2 font-serif text-3xl font-semibold">{jobs.filter((job) => job.status !== 'closed' && (!job.approvalStatus || job.approvalStatus === 'approved')).length}</p><p className="mt-1 text-xs text-muted-foreground">Approved and accepting applications</p></div>
              <div className="rounded-3xl border border-border/80 bg-card p-5 shadow-sm"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Applications</p><p className="mt-2 font-serif text-3xl font-semibold">{applications.length}</p><p className="mt-1 text-xs text-muted-foreground">Student interest in your roles</p></div>
              <div className="rounded-3xl border border-border/80 bg-card p-5 shadow-sm"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Organization</p><p className="mt-2 truncate text-lg font-semibold">{companyWebsite || 'Complete your profile'}</p><p className="mt-1 text-xs text-muted-foreground">Your public employer profile</p></div>
            </div>

            <div className="grid items-start gap-6 lg:grid-cols-[1fr_0.95fr]">
              <div className="rounded-3xl border border-border/80 bg-card p-6 shadow-[0_8px_30px_rgba(26,50,38,0.05)] sm:p-8">
                <p className="text-sm font-semibold text-primary">Post a new internship role</p>
                <form onSubmit={submitRole} className="mt-6 space-y-4">
                  <label className="block text-sm font-medium">Role title<input required value={role} onChange={(event) => setRole(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-input bg-background px-3 outline-none ring-primary focus:ring-2" placeholder="Frontend Engineering Intern" /></label>
                  <label className="block text-sm font-medium">Location<input required value={location} onChange={(event) => setLocation(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-input bg-background px-3 outline-none ring-primary focus:ring-2" placeholder="Accra, Kumasi, Remote" /></label>
                  <label className="block text-sm font-medium">Job type<select value={type} onChange={(event) => setType(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-input bg-background px-3 outline-none ring-primary focus:ring-2"><option>Hybrid</option><option>Remote</option><option>On-site</option></select></label>
                  <label className="block text-sm font-medium">Requirements<textarea value={requirements} onChange={(event) => setRequirements(event.target.value)} className="mt-2 min-h-[120px] w-full rounded-2xl border border-input bg-background px-3 py-3 outline-none ring-primary focus:ring-2" placeholder="List technical skills, tools and experience" /></label>
                  <label className="block text-sm font-medium">Tags (comma separated)<input value={tags} onChange={(event) => setTags(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-input bg-background px-3 outline-none ring-primary focus:ring-2" placeholder="React, JavaScript, UI/UX" /></label>
                  <button type="submit" disabled={isLoading} className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-foreground hover:bg-primary/90">
                    Post this role <ArrowRight className="size-4" />
                  </button>
                </form>
              </div>

              <div className="space-y-6">
              <div className="rounded-3xl border border-border/80 bg-card p-6 shadow-[0_8px_30px_rgba(26,50,38,0.05)] sm:p-7">
                <p className="text-sm font-semibold text-primary">Your uploaded roles</p>
                {jobsLoading ? (
                  <div className="mt-6 text-sm text-muted-foreground">Loading your posted roles…</div>
                ) : jobError ? (
                  <div className="mt-6 rounded-2xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">{jobError}</div>
                ) : jobs.length === 0 ? (
                  <div className="mt-6 rounded-2xl border border-dashed border-border p-6 text-sm text-muted-foreground">No roles yet. Create your first internship posting above.</div>
                ) : (
                  <ul className="mt-6 space-y-4">
                    {jobs.map((job) => (
                      <li key={job.id} className="rounded-3xl border border-border bg-background p-4">
                        <div className="flex items-start justify-between gap-3"><div><p className="text-sm font-semibold text-foreground">{job.role}</p><p className="mt-1 text-sm text-muted-foreground">{job.location} • {job.type}</p></div><div className="flex flex-col items-end gap-2"><span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${job.approvalStatus === 'pending' ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300' : job.approvalStatus === 'suspended' ? 'bg-rose-500/10 text-rose-700 dark:text-rose-300' : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'}`}>{job.approvalStatus === 'pending' ? 'Pending review' : job.approvalStatus === 'suspended' ? 'Suspended' : job.status === 'closed' ? 'Closed' : 'Approved'}</span>{job.status !== 'closed' && <button type="button" onClick={async () => { await updateDoc(doc(getFirebaseDb(), 'internships', job.id), { status: 'closed', closedAt: serverTimestamp() }); setJobs((current) => current.map((item) => item.id === job.id ? { ...item, status: 'closed' } : item)) }} className="rounded-lg border border-rose-500/30 px-3 py-2 text-xs font-semibold text-rose-600">Close role</button>}</div></div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="rounded-3xl border border-border/80 bg-card p-6 shadow-[0_8px_30px_rgba(26,50,38,0.05)] sm:p-7">
                <p className="text-sm font-semibold text-primary">Pending applications</p>
                {appsLoading ? (
                  <div className="mt-6 text-sm text-muted-foreground">Loading pending applications…</div>
                ) : applications.length === 0 ? (
                  <div className="mt-6 rounded-2xl border border-dashed border-border p-6 text-sm text-muted-foreground">No pending applications right now.</div>
                ) : (
                  <ul className="mt-6 space-y-4">
                    {applications.map((app) => (
                      <li key={app.id} className="rounded-3xl border border-border bg-background p-4">
                        <div>
                          <p className="text-sm font-semibold text-foreground">{app.role}</p>
                          <p className="mt-1 text-sm text-muted-foreground">{app.studentProfile?.displayName || app.studentEmail || app.studentId}</p>
                        </div>
                        {app.studentProfile && <div className="mt-4 grid gap-2 rounded-2xl border border-border bg-card p-4 text-sm sm:grid-cols-2"><p><span className="text-muted-foreground">Student ID:</span> {app.studentProfile.studentId || 'Not provided'}</p><p><span className="text-muted-foreground">Course:</span> {app.studentProfile.course || 'Not provided'}</p><p><span className="text-muted-foreground">School:</span> {app.studentProfile.school || 'Not provided'}</p><p><span className="text-muted-foreground">Phone:</span> {app.studentProfile.phone || 'Not provided'}</p><p><span className="text-muted-foreground">Skills:</span> {Array.isArray(app.studentProfile.skills) ? app.studentProfile.skills.join(', ') : app.studentProfile.skills || 'Not provided'}</p><p><span className="text-muted-foreground">CGPA:</span> {app.studentProfile.cgpa || 'Not provided'}</p><p className="sm:col-span-2"><span className="text-muted-foreground">Bio:</span> {app.studentProfile.bio || 'Not provided'}</p></div>}
                        <div className="mt-4 flex flex-wrap items-center gap-2">
                          {app.studentProfile?.cv && <a href={normalizeDropboxUrl(app.studentProfile.cv)} target="_blank" rel="noreferrer" className="rounded-lg border border-border px-3 py-2 text-sm font-semibold text-primary">View CV</a>}
                          <button onClick={() => updateApplicationStatus(app.id, 'accepted')} className="rounded-lg bg-emerald/10 px-3 py-2 text-sm font-semibold text-emerald">Approve</button>
                          <button onClick={() => updateApplicationStatus(app.id, 'declined')} className="rounded-lg bg-destructive/10 px-3 py-2 text-sm font-semibold text-destructive hover:bg-destructive/20">Decline</button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  )
}

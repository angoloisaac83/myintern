'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { addDoc, collection, doc, getDocs, getDoc, query, serverTimestamp, setDoc, where, updateDoc, onSnapshot, orderBy } from 'firebase/firestore'
import { createUserWithEmailAndPassword, onAuthStateChanged, signInWithEmailAndPassword, signOut, updateProfile, type User } from 'firebase/auth'
import { getFirebaseAuth, getFirebaseDb } from '@/lib/firebase'
import { ArrowRight, Briefcase, Building2, CheckCircle2, MapPin, Sparkles, Users, Bell } from 'lucide-react'

type InternshipItem = {
  id: string
  company: string
  role: string
  location: string
  type: string
  requirements?: string
  tags?: string[]
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
  const [companyNotifications, setCompanyNotifications] = useState<any[]>([])
  const [showNotifications, setShowNotifications] = useState(false)

  useEffect(() => {
    const auth = getFirebaseAuth()
    return onAuthStateChanged(auth, (user) => {
      setCurrentUser(user)
      if (!user) {
        setCompanyName('')
        setCompanyLogo('')
        setIsCompanyAccount(null)
        setJobs([])
        return
      }
      if (user.displayName) setCompanyName(user.displayName)
      ;(async () => {
        try {
          const db = getFirebaseDb()
          const userDoc = await getDoc(doc(db, 'users', user.uid))
          if (userDoc.exists() && (userDoc.data() as any).type === 'company') {
            const companyDoc = await getDoc(doc(db, 'companies', user.uid))
            if (companyDoc.exists()) {
              const companyData = companyDoc.data() as any
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
            setCompanyName(companyData.name ?? user.displayName ?? '')
            setCompanyLogo(normalizeDropboxUrl(companyData.logo))
            setCompanyWebsite(companyData.website ?? '')
            setIsCompanyAccount(true)
            return
          }
          setIsCompanyAccount(false)
        } catch (err) {
          console.error(err)
          setIsCompanyAccount(false)
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
          createdAt: serverTimestamp(),
        })
        await setDoc(doc(db, 'users', result.user.uid), {
          uid: result.user.uid,
          email,
          type: 'company',
          name: companyName,
          createdAt: serverTimestamp(),
        })
        setCurrentUser(result.user)
        setSuccessMessage('Company account created. You can now post internship roles.')
      } else {
        const result = await signInWithEmailAndPassword(auth, email, password)
        setCurrentUser(result.user)
        setSuccessMessage('Signed in successfully. Ready to upload roles.')
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
      await addDoc(collection(db, 'internships'), {
        company: currentUser.displayName || companyName || 'Company',
        role: role.trim(),
        location: location.trim(),
        type: type || 'Hybrid',
        requirements: requirements.trim(),
        tags: tags.split(',').map((tag) => tag.trim()).filter(Boolean),
        createdBy: currentUser.uid,
        createdAt: serverTimestamp(),
      })
      setSuccessMessage('Internship role uploaded successfully.')
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
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-5xl px-5 py-10 lg:px-8">
        <div className="mb-8 flex flex-col gap-3 rounded-3xl border border-border bg-card p-6 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-primary">Company portal</p>
            <h1 className="mt-2 font-serif text-3xl font-bold tracking-tight">Post internships for students.</h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">Sign in, create your profile, and add open roles with location, requirements, and tags.</p>
          </div>
          <div className="relative inline-flex items-center gap-3">
            <button aria-label="Notifications" onClick={() => setShowNotifications((s) => !s)} className="inline-flex items-center gap-2 rounded-2xl border border-border bg-background px-3 py-2 text-sm text-muted-foreground hover:bg-secondary">
              <Bell className="size-4" />
              {companyNotifications.length > 0 && <span className="ml-1 inline-flex items-center justify-center rounded-full bg-rose-600 px-1.5 text-[10px] font-semibold text-white">{companyNotifications.length}</span>}
            </button>
            {showNotifications && <div className="absolute right-0 top-12 z-50 w-80 rounded-2xl border border-border bg-card p-3 shadow-lg">
              <p className="text-xs font-semibold text-muted-foreground">Notifications</p>
              <div className="mt-2 max-h-64 overflow-auto">
                {companyNotifications.length === 0 ? <div className="text-sm text-muted-foreground">No new notifications</div> : companyNotifications.map((n) => <div key={n.id} className="mb-2 rounded-lg border border-border bg-background px-3 py-2 text-sm">{n.message}</div>)}
              </div>
            </div>}
            <Link href="/" className="inline-flex items-center gap-2 rounded-2xl border border-border bg-background px-4 py-2 text-sm font-medium text-muted-foreground transition hover:bg-secondary">
              <Sparkles className="size-4" /> Back to student portal
            </Link>
          </div>
        </div>

        {successMessage && <div className="mb-6 rounded-2xl border border-emerald/20 bg-emerald/10 px-5 py-4 text-sm font-semibold text-emerald">{successMessage}</div>}
        {userMessage && <div className="mb-6 rounded-2xl border border-rose-500/20 bg-rose-500/5 px-5 py-4 text-sm font-semibold text-rose-700">{userMessage}</div>}

        {!currentUser ? (
          <div className="grid gap-8 lg:grid-cols-[360px_1fr]">
            <div className="rounded-3xl border border-border bg-card p-6 shadow-sm">
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
            <div className="rounded-3xl border border-border bg-card p-6 shadow-sm">
              <p className="text-sm font-semibold text-primary">Why companies love it</p>
              <div className="mt-6 space-y-4 text-sm text-muted-foreground">
                <p><strong className="text-foreground">Quick posting:</strong> Upload roles in minutes and reach motivated students.</p>
                <p><strong className="text-foreground">Structured listings:</strong> Add requirements, location, and role type so applicants know what fits.</p>
                <p><strong className="text-foreground">Manage your openings:</strong> Track all your posted internships in one dashboard.</p>
              </div>
            </div>
          </div>
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
        ) : (
          <div className="space-y-8">
            <div className="rounded-3xl border border-border bg-card p-6 shadow-sm">
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

            <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
              <div className="rounded-3xl border border-border bg-card p-6 shadow-sm">
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

              <div className="rounded-3xl border border-border bg-card p-6 shadow-sm">
                <p className="text-sm font-semibold text-primary">Your active internship listings</p>
                {jobsLoading ? (
                  <div className="mt-6 text-sm text-muted-foreground">Loading your posted roles…</div>
                ) : jobError ? (
                  <div className="mt-6 rounded-2xl border border-rose-500/20 bg-rose-500/5 p-4 text-sm text-rose-700">{jobError}</div>
                ) : jobs.length === 0 ? (
                  <div className="mt-6 rounded-2xl border border-dashed border-border p-6 text-sm text-muted-foreground">No roles yet. Create your first internship posting above.</div>
                ) : (
                  <ul className="mt-6 space-y-4">
                    {jobs.map((job) => (
                      <li key={job.id} className="rounded-3xl border border-border bg-background p-4">
                        <p className="text-sm font-semibold text-foreground">{job.role}</p>
                        <p className="mt-1 text-sm text-muted-foreground">{job.location} • {job.type}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="rounded-3xl border border-border bg-card p-6 shadow-sm mt-6">
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
                          <button onClick={() => updateApplicationStatus(app.id, 'declined')} className="rounded-lg bg-rose-100 px-3 py-2 text-sm font-semibold text-rose-700">Decline</button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  )
}

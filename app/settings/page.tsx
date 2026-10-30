'use client'

import { useEffect, useState } from 'react'
import { getFirebaseAuth, getFirebaseDb } from '@/lib/firebase'
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'
import { updateProfile } from 'firebase/auth'
import Link from 'next/link'

function fileToBase64(file: File | null) {
  return new Promise<string | null>((resolve) => {
    if (!file) return resolve(null)
    const reader = new FileReader()
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null)
    reader.onerror = () => resolve(null)
    reader.readAsDataURL(file)
  })
}

async function uploadToDropbox(data: string | null, filename: string) {
  if (!data || !data.startsWith('data:')) return data
  const mime = data.match(/^data:([^;]+);/)?.[1] ?? 'application/octet-stream'
  const extension = mime.split('/')[1]?.replace('jpeg', 'jpg')?.replace(/[^a-z0-9]/gi, '') || 'bin'
  const response = await fetch('/api/dropbox/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dataUrl: data, filename: `${filename}.${extension}` }),
  })
  const result = await response.json() as { url?: string; error?: string }
  if (!response.ok || !result.url) throw new Error(result.error ?? 'Dropbox upload failed')
  return result.url
}

function normalizeDropboxUrl(value: unknown) {
  if (typeof value !== 'string' || !value) return null
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

export default function SettingsPage() {
  const [currentUser, setCurrentUser] = useState<any | null>(null)
  const [displayName, setDisplayName] = useState('')
  const [course, setCourse] = useState('')
  const [location, setLocation] = useState('')
  const [skills, setSkills] = useState('')
  const [message, setMessage] = useState('')
  const [accountType, setAccountType] = useState<'student' | 'company' | null>(null)

  // student fields
  const [studentId, setStudentId] = useState('')
  const [phone, setPhone] = useState('')
  const [gender, setGender] = useState('')
  const [school, setSchool] = useState('')
  const [department, setDepartment] = useState('')
  const [level, setLevel] = useState('')
  const [gradYear, setGradYear] = useState('')
  const [cgpa, setCgpa] = useState('')
  const [preferredField, setPreferredField] = useState('')
  const [preferredLocation, setPreferredLocation] = useState('')
  const [duration, setDuration] = useState('')
  const [startDate, setStartDate] = useState('')
  const [cvData, setCvData] = useState<string | null>(null)
  const [portfolio, setPortfolio] = useState('')
  const [linkedin, setLinkedin] = useState('')
  const [photoData, setPhotoData] = useState<string | null>(null)
  const [bio, setBio] = useState('')

  // company fields
  const [companyName, setCompanyName] = useState('')
  const [companyReg, setCompanyReg] = useState('')
  const [companyPhone, setCompanyPhone] = useState('')
  const [companyAddress, setCompanyAddress] = useState('')
  const [companyState, setCompanyState] = useState('')
  const [companyWebsite, setCompanyWebsite] = useState('')
  const [industry, setIndustry] = useState('')
  const [companyDescription, setCompanyDescription] = useState('')
  const [contactPerson, setContactPerson] = useState('')
  const [contactPosition, setContactPosition] = useState('')
  const [numberEmployees, setNumberEmployees] = useState('')
  const [companyLogoData, setCompanyLogoData] = useState<string | null>(null)
  const [verificationDocsData, setVerificationDocsData] = useState<string | null>(null)
  const [verificationStatus, setVerificationStatus] = useState<'Pending' | 'Verified' | null>(null)

  useEffect(() => {
    const auth = getFirebaseAuth()
    const unsub = auth.onAuthStateChanged((u) => {
      setCurrentUser(u)
      setDisplayName(u?.displayName ?? '')
      ;(async () => {
        if (!u) return
        try {
          const db = getFirebaseDb()
          const userDoc = await getDoc(doc(db, 'users', u.uid))
          const userType = userDoc.exists() ? (userDoc.data() as any).type : null
          setAccountType(userType ?? 'student')
          if (userType === 'company') {
            const comp = await getDoc(doc(db, 'companies', u.uid))
            if (comp.exists()) {
              const d = comp.data() as any
              setCompanyName(d.name ?? '')
              setCompanyReg(d.registrationNumber ?? '')
              setCompanyWebsite(d.website ?? '')
              setCompanyPhone(d.phone ?? '')
              setCompanyAddress(d.address ?? '')
              setCompanyState(d.state ?? '')
              setIndustry(d.industry ?? '')
              setCompanyDescription(d.description ?? '')
              setContactPerson(d.contactPerson ?? '')
              setContactPosition(d.contactPosition ?? '')
              setNumberEmployees(d.numberEmployees ?? '')
              setCompanyLogoData(normalizeDropboxUrl(d.logo))
              setVerificationStatus(d.verificationStatus ?? null)
            }
          } else {
            const snap = await getDoc(doc(db, 'studentProfiles', u.uid))
            if (snap.exists()) {
              const d = snap.data() as any
              setCourse(d.course ?? '')
              setLocation(d.location ?? '')
              setSkills(Array.isArray(d.skills) ? d.skills.join(', ') : typeof d.skills === 'string' ? d.skills : '')
              setStudentId(d.studentId ?? '')
              setPhone(d.phone ?? '')
              setGender(d.gender ?? '')
              setSchool(d.school ?? '')
              setDepartment(d.department ?? '')
              setLevel(d.level ?? '')
              setGradYear(d.gradYear ?? '')
              setCgpa(d.cgpa ?? '')
              setPreferredField(d.preferredField ?? '')
              setPreferredLocation(d.preferredLocation ?? '')
              setDuration(d.duration ?? '')
              setStartDate(d.startDate ?? '')
              setCvData(d.cv ?? null)
              setPortfolio(d.portfolio ?? '')
              setLinkedin(d.linkedin ?? '')
              setPhotoData(normalizeDropboxUrl(d.photo))
              setBio(d.bio ?? '')
            }
          }
        } catch (err) {
          console.error(err)
        }
      })()
    })
    return () => unsub()
  }, [])

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!currentUser) return setMessage('Sign in first')
    try {
      const db = getFirebaseDb()
      if (accountType === 'company') {
        setMessage('Uploading files...')
        const [logoUrl, verificationDocsUrl] = await Promise.all([
          uploadToDropbox(companyLogoData, `company-logo-${currentUser.uid}`),
          uploadToDropbox(verificationDocsData, `verification-docs-${currentUser.uid}`),
        ])
        const companyData: Record<string, unknown> = {
          uid: currentUser.uid,
          name: companyName,
          registrationNumber: companyReg,
          email: currentUser.email,
          phone: companyPhone,
          address: companyAddress,
          state: companyState,
          website: companyWebsite,
          industry,
          description: companyDescription,
          contactPerson,
          contactPosition,
          numberEmployees,
          logo: logoUrl,
          verificationDocs: verificationDocsUrl,
          verificationStatus: verificationStatus ?? 'Pending',
          updatedAt: serverTimestamp(),
        }
        await setDoc(doc(db, 'companies', currentUser.uid), companyData, { merge: true })
        setMessage('Company profile updated')
      } else {
        setMessage('Uploading files...')
        const [cvUrl, photoUrl] = await Promise.all([
          uploadToDropbox(cvData, `cv-${currentUser.uid}`),
          uploadToDropbox(photoData, `profile-photo-${currentUser.uid}`),
        ])
        const studentData: Record<string, unknown> = {
          uid: currentUser.uid,
          displayName,
          studentId,
          phone,
          gender,
          school,
          department,
          level,
          gradYear,
          cgpa,
          course,
          location: preferredLocation || location,
          skills,
          preferredField,
          preferredLocation,
          duration,
          startDate,
          cv: cvUrl,
          portfolio,
          linkedin,
          photo: photoUrl,
          bio,
          updatedAt: serverTimestamp(),
        }
        await setDoc(doc(db, 'studentProfiles', currentUser.uid), studentData, { merge: true })
        await updateProfile(currentUser, { displayName })
        setMessage('Student profile updated')
      }
    } catch (err) {
      console.error(err)
      setMessage(err instanceof Error ? err.message : 'Could not update profile')
    }
  }

  if (!currentUser) return (
    <main className="min-h-screen bg-[#f7f8fa] px-5 py-10 text-[#111827] dark:bg-background dark:text-foreground sm:px-8">
      <div className="mx-auto max-w-md rounded-[2rem] border border-border bg-card p-8 text-center shadow-sm">
        <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-primary text-2xl font-bold text-primary-foreground">P</div>
        <h2 className="mt-6 text-3xl font-bold tracking-tight">Your profile, your path</h2>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">Sign in to manage the details that power your internship matches.</p>
        <Link href="/" className="mt-7 inline-flex rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground">Back to placements</Link>
      </div>
    </main>
  )

  const profileFields = [displayName, course, preferredField, preferredLocation, skills, bio, cvData]
  const profileCompletion = Math.round((profileFields.filter(Boolean).length / profileFields.length) * 100)

  return (
    <main className="min-h-screen bg-[#f7f8fa] px-4 py-5 text-[#111827] dark:bg-background dark:text-foreground sm:px-8 sm:py-8">
      <div className="mx-auto max-w-6xl">
        <header className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div><Link href="/" className="text-sm font-semibold text-primary">← Pathway</Link><h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Profile settings</h1><p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">Keep your profile current so the allocation engine can make fair, explainable recommendations.</p></div>
          <div className="rounded-2xl border border-border bg-card px-4 py-3 text-left shadow-sm"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Profile strength</p><p className="mt-1 text-2xl font-bold text-primary">{accountType === 'company' ? (verificationStatus === 'Verified' ? 'Verified' : 'In review') : `${profileCompletion}%`}</p></div>
        </header>
        <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <aside className="h-fit rounded-[1.75rem] border border-border bg-card p-5 shadow-sm lg:sticky lg:top-6">
          <div className="flex items-center gap-4">
            {accountType === 'company' && companyLogoData ? <img src={companyLogoData} alt="Company logo" className="h-16 w-16 rounded-full object-cover" /> : photoData ? <img src={photoData} alt="Profile" className="h-16 w-16 rounded-full object-cover" /> : <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-2xl font-bold text-primary">{(displayName || (currentUser && currentUser.email) || 'U').slice(0, 1).toUpperCase()}</div>}
            <div>
              <p className="text-sm font-semibold">{displayName || (currentUser && currentUser.email)}</p>
              <p className="mt-1 text-xs text-muted-foreground">{accountType === 'company' ? 'Employer profile' : 'Student profile'}</p>
            </div>
          </div>
          <div className="mt-6">
            <p className="text-xs font-semibold text-muted-foreground">About</p>
            <p className="mt-2 text-sm text-muted-foreground">{course ? `${course} • ${location || 'No location set'}` : 'Add your course and preferred location to improve matching.'}</p>
          </div>
          <div className="mt-6">
            <p className="text-xs font-semibold text-muted-foreground">Skills</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {(skills ? skills.split(',').map((s) => s.trim()).filter(Boolean) : []).map((s) => <span key={s} className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">{s}</span>)}
              {(!skills || skills.trim() === '') && <p className="text-sm text-muted-foreground">No skills added yet.</p>}
            </div>
          </div>
        </aside>
        <section className="rounded-[1.75rem] border border-border bg-card p-5 shadow-sm sm:p-8">
          <div className="border-b border-border pb-5"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Account details</p><h2 className="mt-2 text-2xl font-bold">Edit your {accountType === 'company' ? 'company' : 'student'} profile</h2>
          <p className="mt-2 text-sm text-muted-foreground">Edit your profile to help the platform match you correctly.</p></div>
          {accountType === 'company' ? (
            <form onSubmit={save} className="mt-6 space-y-4">
              <label className="block text-sm font-medium">Company name<input required value={companyName} onChange={(e) => setCompanyName(e.target.value)} className="mt-2 h-11 w-full rounded-xl border border-input bg-background px-3 outline-none" /></label>
              <label className="block text-sm font-medium">Company registration number<input value={companyReg} onChange={(e) => setCompanyReg(e.target.value)} className="mt-2 h-11 w-full rounded-xl border border-input bg-background px-3 outline-none" /></label>
              <label className="block text-sm font-medium">Phone number<input value={companyPhone} onChange={(e) => setCompanyPhone(e.target.value)} className="mt-2 h-11 w-full rounded-xl border border-input bg-background px-3 outline-none" /></label>
              <label className="block text-sm font-medium">Address<input value={companyAddress} onChange={(e) => setCompanyAddress(e.target.value)} className="mt-2 h-11 w-full rounded-xl border border-input bg-background px-3 outline-none" /></label>
              <label className="block text-sm font-medium">State<input value={companyState} onChange={(e) => setCompanyState(e.target.value)} className="mt-2 h-11 w-full rounded-xl border border-input bg-background px-3 outline-none" /></label>
              <label className="block text-sm font-medium">Website<input value={companyWebsite} onChange={(e) => setCompanyWebsite(e.target.value)} className="mt-2 h-11 w-full rounded-xl border border-input bg-background px-3 outline-none" /></label>
              <label className="block text-sm font-medium">Industry<input value={industry} onChange={(e) => setIndustry(e.target.value)} className="mt-2 h-11 w-full rounded-xl border border-input bg-background px-3 outline-none" /></label>
              <label className="block text-sm font-medium">Company description<textarea value={companyDescription} onChange={(e) => setCompanyDescription(e.target.value)} className="mt-2 w-full rounded-xl border border-input bg-background px-3 py-2 outline-none" /></label>
              <label className="block text-sm font-medium">Contact person<input value={contactPerson} onChange={(e) => setContactPerson(e.target.value)} className="mt-2 h-11 w-full rounded-xl border border-input bg-background px-3 outline-none" /></label>
              <label className="block text-sm font-medium">Contact position<input value={contactPosition} onChange={(e) => setContactPosition(e.target.value)} className="mt-2 h-11 w-full rounded-xl border border-input bg-background px-3 outline-none" /></label>
              <label className="block text-sm font-medium">Number of employees<input value={numberEmployees} onChange={(e) => setNumberEmployees(e.target.value)} className="mt-2 h-11 w-full rounded-xl border border-input bg-background px-3 outline-none" /></label>
              <div className="rounded-2xl border border-dashed border-primary/30 bg-primary/5 p-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                  {companyLogoData ? <img src={companyLogoData} alt="Company logo preview" className="h-20 w-20 rounded-2xl border border-border bg-card object-cover" /> : <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-card text-xs font-semibold text-muted-foreground">No logo</div>}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">Company logo</p>
                    <p className="mt-1 text-xs text-muted-foreground">Upload the logo students should see on your internship roles.</p>
                    <label className="mt-3 inline-flex cursor-pointer items-center rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
                      {companyLogoData ? 'Choose a different logo' : 'Upload company logo'}
                      <input type="file" accept="image/png,image/jpeg,image/webp" onChange={async (e) => { const f = e.target.files?.[0] ?? null; const b = await fileToBase64(f); setCompanyLogoData(b) }} className="sr-only" />
                    </label>
                  </div>
                </div>
              </div>
              <label className="block text-sm font-medium">Verification documents (PDF/image)<input type="file" accept="application/pdf,image/*" onChange={async (e) => { const f = e.target.files?.[0] ?? null; const b = await fileToBase64(f); setVerificationDocsData(b) }} className="mt-2" /></label>
              <div className="flex items-center gap-3">
                <button className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">Save company profile</button>
                <Link href="/" className="text-sm text-muted-foreground">Cancel</Link>
              </div>
              {message && <p className="text-sm text-muted-foreground">{message}</p>}
            </form>
          ) : (
            <form onSubmit={save} className="mt-6 space-y-4">
              <label className="block text-sm font-medium">Full name<input value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="mt-2 h-11 w-full rounded-xl border border-input bg-background px-3 outline-none" /></label>
              <label className="block text-sm font-medium">Student ID / Matric No.<input value={studentId} onChange={(e) => setStudentId(e.target.value)} className="mt-2 h-11 w-full rounded-xl border border-input bg-background px-3 outline-none" /></label>
              <label className="block text-sm font-medium">Email (read-only)<input value={currentUser.email ?? ''} readOnly className="mt-2 h-11 w-full rounded-xl border border-input bg-muted-foreground px-3 outline-none" /></label>
              <label className="block text-sm font-medium">Phone number<input value={phone} onChange={(e) => setPhone(e.target.value)} className="mt-2 h-11 w-full rounded-xl border border-input bg-background px-3 outline-none" /></label>
              <label className="block text-sm font-medium">Gender<select value={gender} onChange={(e) => setGender(e.target.value)} className="mt-2 h-11 w-full rounded-xl border border-input bg-background px-3 outline-none"><option value="">Select</option><option>Male</option><option>Female</option><option>Prefer not to say</option></select></label>
              <label className="block text-sm font-medium">School/Institution<input value={school} onChange={(e) => setSchool(e.target.value)} className="mt-2 h-11 w-full rounded-xl border border-input bg-background px-3 outline-none" /></label>
              <label className="block text-sm font-medium">Department<input value={department} onChange={(e) => setDepartment(e.target.value)} className="mt-2 h-11 w-full rounded-xl border border-input bg-background px-3 outline-none" /></label>
              <label className="block text-sm font-medium">Course/Program<input value={course} onChange={(e) => setCourse(e.target.value)} className="mt-2 h-11 w-full rounded-xl border border-input bg-background px-3 outline-none" /></label>
              <label className="block text-sm font-medium">Level<input value={level} onChange={(e) => setLevel(e.target.value)} className="mt-2 h-11 w-full rounded-xl border border-input bg-background px-3 outline-none" /></label>
              <label className="block text-sm font-medium">Expected graduation year<input value={gradYear} onChange={(e) => setGradYear(e.target.value)} className="mt-2 h-11 w-full rounded-xl border border-input bg-background px-3 outline-none" /></label>
              <label className="block text-sm font-medium">CGPA<input value={cgpa} onChange={(e) => setCgpa(e.target.value)} className="mt-2 h-11 w-full rounded-xl border border-input bg-background px-3 outline-none" /></label>
              <label className="block text-sm font-medium">Skills (comma separated)<input value={skills} onChange={(e) => setSkills(e.target.value)} className="mt-2 h-11 w-full rounded-xl border border-input bg-background px-3 outline-none" /></label>
              <label className="block text-sm font-medium">Experience<textarea value={bio} onChange={(e) => setBio(e.target.value)} className="mt-2 w-full rounded-xl border border-input bg-background px-3 py-2 outline-none" placeholder="Briefly mention projects or work experience" /></label>
              <label className="block text-sm font-medium">Preferred internship field<input value={preferredField} onChange={(e) => setPreferredField(e.target.value)} className="mt-2 h-11 w-full rounded-xl border border-input bg-background px-3 outline-none" /></label>
              <label className="block text-sm font-medium">Preferred location<input value={preferredLocation} onChange={(e) => setPreferredLocation(e.target.value)} className="mt-2 h-11 w-full rounded-xl border border-input bg-background px-3 outline-none" /></label>
              <label className="block text-sm font-medium">Internship duration<input value={duration} onChange={(e) => setDuration(e.target.value)} className="mt-2 h-11 w-full rounded-xl border border-input bg-background px-3 outline-none" /></label>
              <label className="block text-sm font-medium">Start date<input type="month" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="mt-2 h-11 w-full rounded-xl border border-input bg-background px-3 outline-none" /></label>
              <label className="block text-sm font-medium">CV / Resume (PDF)<input type="file" accept="application/pdf" onChange={async (e) => { const f = e.target.files?.[0] ?? null; const b = await fileToBase64(f); setCvData(b) }} className="mt-2" /></label>
              <label className="block text-sm font-medium">Portfolio / GitHub Link<input value={portfolio} onChange={(e) => setPortfolio(e.target.value)} className="mt-2 h-11 w-full rounded-xl border border-input bg-background px-3 outline-none" /></label>
              <label className="block text-sm font-medium">LinkedIn Link<input value={linkedin} onChange={(e) => setLinkedin(e.target.value)} className="mt-2 h-11 w-full rounded-xl border border-input bg-background px-3 outline-none" /></label>
              <label className="block text-sm font-medium">Profile photo (image)<input type="file" accept="image/*" onChange={async (e) => { const f = e.target.files?.[0] ?? null; const b = await fileToBase64(f); setPhotoData(b) }} className="mt-2" /></label>
              <div className="flex items-center gap-3">
                <button className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">Save profile</button>
                <Link href="/" className="text-sm text-muted-foreground">Cancel</Link>
              </div>
              {message && <p className="text-sm text-muted-foreground">{message}</p>}
            </form>
          )}
        </section>
        </div>
      </div>
    </main>
  )
}

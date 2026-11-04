'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { collection, doc, getDocs, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore'
import { Building2, ChevronLeft } from 'lucide-react'
import { getFirebaseDb } from '@/lib/firebase'
import { AdminAuthGuard } from '@/components/admin-auth-guard'

type Status = 'pending' | 'active' | 'suspended' | 'deactivated'
type Organization = { id: string; name?: string; email?: string; website?: string; industry?: string; verificationStatus?: string; accountStatus?: Status; roles: Role[] }
type Account = { id: string; name?: string; email?: string; type?: string; accountStatus?: Status }
type Role = { id: string; company?: string; role?: string; location?: string; type?: string; status?: string; approvalStatus?: string; capacity?: number; createdBy?: string }

export default function OrganizationsPage() {
  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const db = getFirebaseDb()
      const [companySnap, accountSnap, roleSnap] = await Promise.all([
        getDocs(collection(db, 'companies')), getDocs(collection(db, 'users')), getDocs(collection(db, 'internships')),
      ])
      const nextAccounts = accountSnap.docs.map((item) => ({ id: item.id, ...(item.data() as Omit<Account, 'id'>) }))
      const roles = roleSnap.docs.map((item) => ({ id: item.id, ...(item.data() as Omit<Role, 'id'>) }))
      const companies = companySnap.docs.map((item) => ({ id: item.id, ...(item.data() as Omit<Organization, 'id' | 'roles'>) }))
      const ids = new Set([...companies.map((item) => item.id), ...nextAccounts.filter((item) => item.type === 'company').map((item) => item.id)])
      setAccounts(nextAccounts)
      setOrganizations(Array.from(ids, (id) => {
        const company = companies.find((item) => item.id === id)
        const account = nextAccounts.find((item) => item.id === id)
        return { ...company, id, name: company?.name || account?.name, email: company?.email || account?.email,
          accountStatus: company?.accountStatus || account?.accountStatus || (company?.verificationStatus === 'Verified' ? 'active' : 'pending'),
          roles: roles.filter((role) => role.createdBy === id) }
      }))
    } catch { setMessage('Could not load organization accounts.') } finally { setLoading(false) }
  }, [])

  useEffect(() => { void load() }, [load])

  const setStatus = async (organization: Organization, status: Status) => {
    try {
      const db = getFirebaseDb()
      await setDoc(doc(db, 'users', organization.id), { uid: organization.id, email: organization.email, name: organization.name, type: 'company', accountStatus: status, updatedAt: serverTimestamp() }, { merge: true })
      await setDoc(doc(db, 'companies', organization.id), { accountStatus: status, ...(status === 'active' ? { verificationStatus: 'Verified', verifiedAt: serverTimestamp() } : {}), updatedAt: serverTimestamp() }, { merge: true })
      if (status === 'suspended' || status === 'deactivated') {
        await Promise.all(organization.roles.map((role) => updateDoc(doc(db, 'internships', role.id), { approvalStatus: 'suspended', suspendedAt: serverTimestamp() })))
      }
      setMessage(`${organization.name || organization.email || 'Organization'} ${status === 'active' ? 'approved' : status}.`)
      await load()
    } catch { setMessage('Could not update this organization account.') }
  }

  return <AdminAuthGuard><main className="min-h-screen bg-background text-foreground"><div className="mx-auto max-w-7xl px-5 py-8 lg:px-8">
    <Link href="/admin" className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground"><ChevronLeft className="size-4" /> Back to coordinator dashboard</Link>
    <header className="mt-6 rounded-[2rem] border border-border bg-card p-6"><p className="text-sm font-semibold uppercase tracking-[0.2em] text-primary">Employer network</p><div className="mt-3 flex flex-col gap-3 md:flex-row md:items-end md:justify-between"><div><h1 className="text-4xl font-bold tracking-tight">Organizations</h1><p className="mt-2 max-w-2xl text-sm text-muted-foreground">Review organization accounts and their uploaded roles.</p></div><div className="rounded-2xl bg-primary/10 px-4 py-3 text-sm font-semibold text-primary">{organizations.length} organizations</div></div></header>
    {message && <p role="status" className="mt-4 rounded-xl bg-muted p-3 text-sm">{message}</p>}
    {loading ? <p className="mt-8 text-sm text-muted-foreground">Loading organizations…</p> : <section className="mt-6 grid gap-5 md:grid-cols-2">{organizations.map((organization) => {
      const status = organization.accountStatus || 'pending'
      const availableRoles = organization.roles.filter((role) => role.status !== 'closed' && (!role.approvalStatus || role.approvalStatus === 'approved'))
      const seats = availableRoles.reduce((sum, role) => sum + (role.capacity ?? 1), 0)
      return <article key={organization.id} className="rounded-3xl border border-border bg-card p-6"><div className="flex items-start justify-between gap-4"><div className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Building2 className="size-6" /></div><span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold capitalize">{status}</span></div>
        <h2 className="mt-5 text-xl font-bold">{organization.name || organization.email || 'Organization'}</h2><p className="mt-1 text-sm text-muted-foreground">{organization.website || 'Website not provided'} · {organization.industry || 'Industry not provided'}</p>
        <p className="mt-4 text-sm text-muted-foreground">{availableRoles.length} available roles · {seats} seats · {organization.email || 'No contact email'}</p>
        <div className="mt-4 flex flex-wrap gap-2">{status !== 'active' && <button onClick={() => setStatus(organization, 'active')} className="rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground">Approve organization</button>}{status !== 'suspended' && status !== 'deactivated' && <button onClick={() => setStatus(organization, 'suspended')} className="rounded-xl border border-amber-500/30 px-3 py-2 text-xs font-semibold text-amber-700 dark:text-amber-300">Suspend</button>}{status !== 'deactivated' && <button onClick={() => setStatus(organization, 'deactivated')} className="rounded-xl border border-rose-500/30 px-3 py-2 text-xs font-semibold text-rose-700 dark:text-rose-300">Deactivate</button>}</div>
        <div className="mt-5 space-y-2">{organization.roles.map((role) => <div key={role.id} className="rounded-2xl border border-border bg-muted/30 p-3"><div className="flex items-center justify-between gap-3"><p className="text-sm font-semibold">{role.role || 'Untitled role'}</p><span className="text-xs capitalize text-muted-foreground">{role.approvalStatus || (role.status === 'closed' ? 'closed' : 'approved')}</span></div><p className="mt-1 text-xs text-muted-foreground">{role.type || 'Internship'} · {role.location || 'Flexible location'}</p></div>)}</div>
      </article>
    })}{!organizations.length && <div className="rounded-3xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground md:col-span-2">Organizations will appear here when employers register.</div>}</section>}
  </div></main></AdminAuthGuard>
}

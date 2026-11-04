'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Bell, Check, CheckCheck, Clock3, Inbox, Sparkles, X } from 'lucide-react'

export type NotificationItem = {
  id: string
  message: string
  createdAt?: unknown
}

function getTimestamp(value: unknown) {
  if (typeof value === 'number') return value
  if (value instanceof Date) return value.getTime()
  if (value && typeof (value as { toDate?: unknown }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate().getTime()
  }
  return null
}

function formatTime(value: unknown) {
  const timestamp = getTimestamp(value)
  if (!timestamp) return 'Recently'
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60_000))
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(timestamp)
}

export function NotificationCenter({ notifications }: { notifications: NotificationItem[] }) {
  const [open, setOpen] = useState(false)
  const [readIds, setReadIds] = useState<string[]>([])
  const rootRef = useRef<HTMLDivElement>(null)
  const unreadCount = notifications.filter((item) => !readIds.includes(item.id)).length
  const sortedNotifications = useMemo(
    () => [...notifications].sort((a, b) => (getTimestamp(b.createdAt) ?? 0) - (getTimestamp(a.createdAt) ?? 0)),
    [notifications],
  )

  useEffect(() => {
    if (!open) return
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', closeOnOutsideClick)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  const markAllRead = () => setReadIds(notifications.map((item) => item.id))

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-label={unreadCount ? `Notifications, ${unreadCount} unread` : 'Notifications'}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((current) => !current)}
        className="relative flex size-10 items-center justify-center rounded-2xl border border-border bg-card text-muted-foreground shadow-sm transition hover:border-primary/30 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <Bell className="size-[18px]" />
        {unreadCount > 0 && <span className="absolute -right-1 -top-1 flex min-h-5 min-w-5 items-center justify-center rounded-full border-2 border-background bg-primary px-1 text-[9px] font-bold leading-none text-primary-foreground">{unreadCount > 9 ? '9+' : unreadCount}</span>}
      </button>

      {open && (
        <section role="dialog" aria-label="Notifications" className="absolute right-0 top-[calc(100%_+_0.75rem)] z-[80] w-[min(22rem,calc(100vw_-_2rem))] overflow-hidden rounded-[1.4rem] border border-border bg-popover text-popover-foreground shadow-[0_24px_70px_rgba(9,24,18,0.24)]">
          <div className="bg-[#10251f] px-5 pb-5 pt-4 text-white">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-lime-200"><Sparkles className="size-3" /> Your updates</p>
                <h2 className="mt-2 font-serif text-2xl font-semibold">Notifications</h2>
              </div>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close notifications" className="rounded-xl p-2 text-white/65 transition hover:bg-white/10 hover:text-white"><X className="size-4" /></button>
            </div>
            <div className="mt-4 flex items-center justify-between gap-3 text-xs">
              <span className="rounded-full bg-white/10 px-3 py-1.5 text-white/80">{unreadCount ? `${unreadCount} new update${unreadCount === 1 ? '' : 's'}` : 'You’re all caught up'}</span>
              {unreadCount > 0 && <button type="button" onClick={markAllRead} className="inline-flex items-center gap-1.5 font-semibold text-lime-200 hover:text-lime-100"><CheckCheck className="size-3.5" /> Mark all read</button>}
            </div>
          </div>

          <div className="max-h-[min(24rem,65svh)] space-y-2 overflow-y-auto bg-background p-3">
            {sortedNotifications.length === 0 ? (
              <div className="flex flex-col items-center px-5 py-9 text-center">
                <span className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Inbox className="size-5" /></span>
                <p className="mt-4 text-sm font-semibold">Nothing new for now</p>
                <p className="mt-1 max-w-56 text-xs leading-5 text-muted-foreground">We’ll let you know when there’s an update on your placements.</p>
              </div>
            ) : sortedNotifications.map((item) => {
              const isRead = readIds.includes(item.id)
              return (
                <article key={item.id} className={`flex gap-3 rounded-2xl border p-3.5 transition-colors ${isRead ? 'border-transparent bg-card' : 'border-primary/15 bg-primary/[0.045]'}`}>
                  <span className={`mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl ${isRead ? 'bg-secondary text-muted-foreground' : 'bg-primary/10 text-primary'}`}><Bell className="size-4" /></span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2"><p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-primary">Placement update</p>{!isRead && <span className="size-1.5 shrink-0 rounded-full bg-primary" />}</div>
                    <p className="mt-1.5 text-sm leading-5">{item.message}</p>
                    <p className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground"><Clock3 className="size-3" />{formatTime(item.createdAt)}</p>
                  </div>
                  {!isRead && <button type="button" aria-label="Mark as read" title="Mark as read" onClick={() => setReadIds((current) => [...current, item.id])} className="self-start rounded-lg p-1.5 text-muted-foreground transition hover:bg-secondary hover:text-primary"><Check className="size-3.5" /></button>}
                </article>
              )
            })}
          </div>
          <div className="border-t border-border bg-card px-4 py-3 text-center text-[11px] text-muted-foreground">Updates about your applications and placements</div>
        </section>
      )}
    </div>
  )
}

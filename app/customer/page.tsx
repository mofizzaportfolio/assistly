'use client'

import { FormEvent, useState } from 'react'

type Ticket = { id: string; subject: string; originalMessage: string; status: string }
type Event = { id: number; actor: string; body: string | null; createdAt: string }

export default function CustomerPage() {
  const [ticket, setTicket] = useState<Ticket | null>(null)
  const [events, setEvents] = useState<Event[]>([])
  const [form, setForm] = useState({ subject: '', customer: '', email: '', message: '' })
  const [reply, setReply] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function create(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('')
    const response = await fetch('/api/tickets', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(form) })
    const data = await response.json().catch(() => null); setBusy(false)
    if (!response.ok) { setError(data?.error ?? 'Unable to create ticket.'); return }
    setTicket(data.ticket); await refresh(data.ticket.id)
  }
  async function refresh(id = ticket?.id) { if (!id) return; const response = await fetch(`/api/tickets/${id}/events`); const data = await response.json(); if (!response.ok) { setError(data.error); return }; setTicket(data.ticket); setEvents(data.events) }
  async function send(event: FormEvent) { event.preventDefault(); if (!ticket || !reply.trim()) return; setBusy(true); const response = await fetch(`/api/tickets/${ticket.id}/events`, { method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': crypto.randomUUID() }, body: JSON.stringify({ eventType: 'customer_message', body: reply }) }); const data = await response.json().catch(() => null); setBusy(false); if (!response.ok) { setError(data?.error ?? 'Unable to send reply.'); return }; setReply(''); await refresh() }
  if (!ticket) return <main className="min-h-screen bg-[#f7f8fb] p-6"><div className="mx-auto max-w-xl"><p className="eyebrow">Assistly customer portal</p><h1 className="mt-2 text-3xl font-semibold text-slate-950">Tell us what is going wrong</h1><p className="mt-2 text-sm text-slate-500">Submit a request and keep this browser session to continue the conversation.</p><form onSubmit={create} className="mt-8 grid gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><input required placeholder="Subject" value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })} className="h-11 rounded-lg border border-slate-200 px-3 text-sm" /><input required placeholder="Your name" value={form.customer} onChange={e => setForm({ ...form, customer: e.target.value })} className="h-11 rounded-lg border border-slate-200 px-3 text-sm" /><input type="email" placeholder="Email (optional)" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className="h-11 rounded-lg border border-slate-200 px-3 text-sm" /><textarea required minLength={10} placeholder="Describe the problem in detail" value={form.message} onChange={e => setForm({ ...form, message: e.target.value })} className="min-h-36 rounded-lg border border-slate-200 p-3 text-sm" />{error && <p role="alert" className="text-sm text-red-600">{error}</p>}<button className="action primary" disabled={busy}>{busy ? 'Creating…' : 'Create support ticket'}</button></form></div></main>
  return <main className="min-h-screen bg-[#f7f8fb] p-6"><div className="mx-auto max-w-2xl"><div className="flex items-start justify-between"><div><p className="eyebrow">Ticket {ticket.id}</p><h1 className="mt-2 text-2xl font-semibold">{ticket.subject}</h1></div><span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">{ticket.status}</span></div><section className="mt-6 space-y-3">{events.map(item => <article key={item.id} className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{item.actor === 'customer' ? 'You' : 'Assistly support'}</p><p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{item.body}</p></article>)}</section><form onSubmit={send} className="mt-6 flex gap-3"><textarea required value={reply} onChange={e => setReply(e.target.value)} placeholder="Reply to support" className="min-h-24 flex-1 rounded-xl border border-slate-200 bg-white p-3 text-sm" /><button className="action primary self-end" disabled={busy}>Send reply</button></form>{error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}</div></main>
}

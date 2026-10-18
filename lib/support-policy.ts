export type Risk = 'Low' | 'Medium' | 'High' | 'Critical'
export type Status = 'Open' | 'Awaiting approval' | 'Escalated' | 'Resolved'
export type Ticket = {
  id: string
  subject: string
  customer: string
  category: string
  priority: Risk
  status: Status
  channel: string
  created: string
  assignee: string
  reviewedBy?: string
  note?: string
}

export const UNASSIGNED = 'Unassigned'

export const verifiedArticles = [
  {
    id: 'export-shifts',
    matches: (ticket: Ticket) => ticket.category === 'Software access' && /export/i.test(ticket.subject) && /shifts/i.test(ticket.subject),
    reply:
      "Thanks for reaching out. You can export last month's shifts from Reports → Shifts → Export. This simulated answer is based on a verified demo article.",
  },
]

export const statuses: readonly Status[] = ['Open', 'Awaiting approval', 'Escalated', 'Resolved']

/**
 * Fails safe: only an explicit Low or Medium classification is treated as lower risk.
 * A missing or unrecognised classification is handled like High/Critical.
 */
export function isHighRisk(risk: Risk | string | null | undefined) {
  return risk !== 'Low' && risk !== 'Medium'
}

/** A reply is only suggested when a verified article matches and the ticket is low risk. */
export function suggestedReply(ticket: Ticket) {
  if (ticket.priority !== 'Low') return ''
  return verifiedArticles.find(article => article.matches(ticket))?.reply ?? ''
}

export function allowedStatuses(ticket: Ticket): Status[] {
  const base: Status[] = ['Open', 'Awaiting approval', 'Escalated']
  return isHighRisk(ticket.priority) ? base : [...base, 'Resolved']
}

export function canResolve(ticket: Ticket) {
  return !isHighRisk(ticket.priority)
}

export type Decision = { ok: true } | { ok: false; error: string }

export function evaluateDraftApproval(ticket: Ticket, draft: string): Decision {
  if (isHighRisk(ticket.priority)) return { ok: false, error: 'High and critical risk tickets cannot be approved for an automated reply.' }
  if (typeof draft !== 'string' || draft.trim().length === 0) return { ok: false, error: 'Write a draft before approving.' }
  return { ok: true }
}

export function canApproveDraft(ticket: Ticket, draft: string) {
  return evaluateDraftApproval(ticket, draft).ok
}

export function canRecordReview(ticket: Ticket) {
  return (
    isHighRisk(ticket.priority) &&
    typeof ticket.assignee === 'string' &&
    ticket.assignee.trim() !== '' &&
    ticket.assignee !== UNASSIGNED &&
    ticket.status !== 'Resolved' &&
    ticket.reviewedBy !== ticket.assignee
  )
}

export function recordReview(ticket: Ticket): Ticket {
  if (!canRecordReview(ticket)) return ticket
  return { ...ticket, reviewedBy: ticket.assignee, status: 'Escalated' }
}

export type TicketPatch = Partial<Pick<Ticket, 'status' | 'assignee' | 'note'>>
export type ChangeResult = { ok: true; ticket: Ticket } | { ok: false; ticket: Ticket; error: string }

/**
 * Single choke point for ticket mutations so the UI cannot bypass policy.
 * - Only status, assignee and note can be patched; id, priority and reviewedBy cannot be forged.
 * - High/critical (or unclassified) tickets can never be resolved from the demo UI.
 * - Reassigning or unassigning a high-risk ticket invalidates any recorded human review
 *   and returns an escalated ticket to the approval queue.
 * A blocked change returns the original ticket untouched together with an error.
 */
export function changeTicket(ticket: Ticket, patch: TicketPatch): ChangeResult {
  const blocked = (error: string): ChangeResult => ({ ok: false, ticket, error })
  const next: Ticket = { ...ticket }

  if (patch.status !== undefined) {
    if (!statuses.includes(patch.status)) return blocked('Unknown ticket status.')
    if (patch.status === 'Resolved' && !canResolve(ticket)) return blocked('Human approval is required before resolving this ticket.')
    next.status = patch.status
  }
  if (patch.assignee !== undefined) {
    if (typeof patch.assignee !== 'string' || patch.assignee.trim() === '') return blocked('Choose a valid assignee.')
    next.assignee = patch.assignee
  }
  if (patch.note !== undefined) next.note = patch.note

  if (isHighRisk(next.priority) && next.assignee !== ticket.assignee) {
    delete next.reviewedBy
    if (next.status === 'Escalated' && ticket.reviewedBy) next.status = 'Awaiting approval'
  }
  if (isHighRisk(next.priority) && next.reviewedBy && next.reviewedBy !== next.assignee) {
    delete next.reviewedBy
  }

  return { ok: true, ticket: next }
}

/** Convenience wrapper that returns the unchanged ticket when a change is blocked. */
export function applyTicketChange(ticket: Ticket, patch: TicketPatch): Ticket {
  return changeTicket(ticket, patch).ticket
}

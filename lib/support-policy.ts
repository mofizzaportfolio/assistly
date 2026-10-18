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

export function isHighRisk(risk: Risk) {
  return risk === 'High' || risk === 'Critical'
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

export function canApproveDraft(ticket: Ticket, draft: string) {
  return !isHighRisk(ticket.priority) && draft.trim().length > 0
}

export function canRecordReview(ticket: Ticket) {
  return isHighRisk(ticket.priority) && ticket.assignee !== UNASSIGNED && ticket.status !== 'Resolved'
}

export function recordReview(ticket: Ticket): Ticket {
  if (!canRecordReview(ticket)) return ticket
  return { ...ticket, reviewedBy: ticket.assignee, status: 'Escalated' }
}

/**
 * Single choke point for ticket mutations so the UI cannot bypass policy.
 * - High/critical tickets can never be resolved from the demo UI.
 * - Reassigning a high-risk ticket invalidates any recorded human review and
 *   returns an escalated ticket to the approval queue.
 * - Unassigning a high-risk ticket also invalidates review.
 */
export function applyTicketChange(ticket: Ticket, patch: Partial<Ticket>): Ticket {
  const next: Ticket = { ...ticket, ...patch, id: ticket.id, priority: ticket.priority }

  if (next.status === 'Resolved' && !canResolve(next)) next.status = ticket.status

  if (isHighRisk(next.priority) && next.assignee !== ticket.assignee) {
    delete next.reviewedBy
    if (next.status === 'Escalated' && ticket.reviewedBy) next.status = 'Awaiting approval'
  }

  if (isHighRisk(next.priority) && next.reviewedBy && next.reviewedBy !== next.assignee) {
    delete next.reviewedBy
  }

  return next
}

import { describe, expect, it } from 'vitest'
import {
  allowedStatuses,
  applyTicketChange,
  canApproveDraft,
  canRecordReview,
  canResolve,
  changeTicket,
  evaluateDraftApproval,
  isHighRisk,
  recordReview,
  suggestedReply,
  type Ticket,
} from './support-policy'

const base: Ticket = {
  id: 'INC-1',
  subject: "How do I export last month's shifts?",
  customer: 'Acme',
  category: 'Software access',
  priority: 'Low',
  status: 'Open',
  channel: 'Email',
  created: 'now',
  assignee: 'Maya Chen',
}
const critical: Ticket = { ...base, id: 'INC-2', subject: 'Gateway stopped reporting', category: 'Sensor connectivity', priority: 'Critical', assignee: 'Jon Bell' }

describe('resolution policy', () => {
  it('blocks resolving high and critical tickets', () => {
    expect(canResolve({ ...base, priority: 'High' })).toBe(false)
    expect(canResolve(critical)).toBe(false)
    expect(allowedStatuses(critical)).not.toContain('Resolved')
  })

  it('allows resolving low and medium tickets', () => {
    expect(canResolve(base)).toBe(true)
    expect(canResolve({ ...base, priority: 'Medium' })).toBe(true)
    expect(allowedStatuses(base)).toContain('Resolved')
  })

  it('ignores attempts to resolve or re-prioritise a critical ticket', () => {
    const next = applyTicketChange(critical, { status: 'Resolved', priority: 'Low' } as never)
    expect(next.status).toBe(critical.status)
    expect(next.priority).toBe('Critical')
  })
})

describe('suggested replies', () => {
  it('suggests a reply only for a verified article match', () => {
    expect(suggestedReply(base)).toContain('Reports')
  })

  it('does not reuse the export reply for other low-risk tickets', () => {
    const invite = { ...base, subject: 'New employee invite not arriving' }
    expect(suggestedReply(invite)).toBe('')
  })

  it('never suggests a reply for medium, high or critical tickets', () => {
    expect(suggestedReply({ ...base, priority: 'Medium' })).toBe('')
    expect(suggestedReply({ ...base, priority: 'High' })).toBe('')
    expect(suggestedReply(critical)).toBe('')
  })

  it('blocks approving drafts on high risk or empty drafts', () => {
    expect(canApproveDraft(base, 'hello')).toBe(true)
    expect(canApproveDraft(base, '   ')).toBe(false)
    expect(canApproveDraft(critical, 'hello')).toBe(false)
  })
})

describe('human review and assignee invalidation', () => {
  it('requires an assignee before review can be recorded', () => {
    expect(canRecordReview({ ...critical, assignee: 'Unassigned' })).toBe(false)
    expect(canRecordReview(critical)).toBe(true)
    expect(canRecordReview(base)).toBe(false)
  })

  it('records review against the current assignee and escalates', () => {
    const reviewed = recordReview(critical)
    expect(reviewed.reviewedBy).toBe('Jon Bell')
    expect(reviewed.status).toBe('Escalated')
  })

  it('invalidates review and returns to the approval queue on reassignment', () => {
    const reviewed = recordReview(critical)
    const reassigned = applyTicketChange(reviewed, { assignee: 'Priya Shah' })
    expect(reassigned.reviewedBy).toBeUndefined()
    expect(reassigned.status).toBe('Awaiting approval')
  })

  it('invalidates review when a high-risk ticket is unassigned', () => {
    const next = applyTicketChange(recordReview(critical), { assignee: 'Unassigned' })
    expect(next.reviewedBy).toBeUndefined()
  })

  it('keeps review when other fields change', () => {
    const reviewed = recordReview(critical)
    expect(applyTicketChange(reviewed, { note: 'x' }).reviewedBy).toBe('Jon Bell')
  })

  it('does not touch low-risk assignment', () => {
    const next = applyTicketChange(base, { assignee: 'Jon Bell' })
    expect(next.assignee).toBe('Jon Bell')
    expect(next.status).toBe('Open')
  })
})

describe('fail-safe risk classification', () => {
  const unknown = { ...base, priority: 'Urgent' as never }
  const missing = { ...base, priority: undefined as never }

  it('treats unknown or missing risk as high risk', () => {
    expect(isHighRisk('Urgent')).toBe(true)
    expect(isHighRisk(undefined)).toBe(true)
    expect(isHighRisk(null)).toBe(true)
    expect(isHighRisk('low')).toBe(true)
    expect(isHighRisk('Low')).toBe(false)
    expect(isHighRisk('Medium')).toBe(false)
  })

  it('blocks resolve, approval and suggestions for unclassified tickets', () => {
    for (const ticket of [unknown, missing]) {
      expect(canResolve(ticket)).toBe(false)
      expect(allowedStatuses(ticket)).not.toContain('Resolved')
      expect(canApproveDraft(ticket, 'hello')).toBe(false)
      expect(suggestedReply(ticket)).toBe('')
      expect(changeTicket(ticket, { status: 'Resolved' }).ok).toBe(false)
    }
  })
})

describe('blocked actions return an error and preserve the ticket', () => {
  it('reports why resolving a critical ticket is blocked', () => {
    const result = changeTicket(critical, { status: 'Resolved' })
    expect(result.ok).toBe(false)
    expect(result.ticket).toBe(critical)
    if (!result.ok) expect(result.error).toMatch(/Human approval/)
  })

  it('does not partially apply a patch when part of it is blocked', () => {
    const result = changeTicket(critical, { status: 'Resolved', assignee: 'Priya Shah' })
    expect(result.ok).toBe(false)
    expect(result.ticket.assignee).toBe('Jon Bell')
  })

  it('rejects unknown statuses and blank assignees', () => {
    expect(changeTicket(base, { status: 'Closed' as never }).ok).toBe(false)
    expect(changeTicket(base, { assignee: '   ' }).ok).toBe(false)
    expect(changeTicket(base, { assignee: undefined as never }).ok).toBe(true)
  })

  it('allows resolving a low-risk ticket', () => {
    const result = changeTicket(base, { status: 'Resolved' })
    expect(result.ok).toBe(true)
    expect(result.ticket.status).toBe('Resolved')
  })

  it('explains why a draft cannot be approved', () => {
    expect(evaluateDraftApproval(critical, 'hi')).toMatchObject({ ok: false })
    expect(evaluateDraftApproval(base, '  ')).toMatchObject({ ok: false })
    expect(evaluateDraftApproval(base, undefined as never)).toMatchObject({ ok: false })
    expect(evaluateDraftApproval(base, 'hi')).toEqual({ ok: true })
  })
})

describe('patch allowlist prevents forged review state', () => {
  it('ignores reviewedBy, priority and id in a patch', () => {
    const forged = applyTicketChange(critical, { reviewedBy: 'Jon Bell', priority: 'Low', id: 'INC-9' } as never)
    expect(forged.reviewedBy).toBeUndefined()
    expect(forged.priority).toBe('Critical')
    expect(forged.id).toBe('INC-2')
  })

  it('cannot forge a review on an unassigned high-risk ticket', () => {
    const open = { ...critical, assignee: 'Unassigned' }
    expect(applyTicketChange(open, { reviewedBy: 'Unassigned' } as never).reviewedBy).toBeUndefined()
  })
})

describe('review lifecycle edge cases', () => {
  it('does not allow a repeated review once recorded', () => {
    const reviewed = recordReview(critical)
    expect(canRecordReview(reviewed)).toBe(false)
    expect(recordReview(reviewed)).toBe(reviewed)
  })

  it('does not allow review of resolved or low-risk tickets', () => {
    expect(recordReview({ ...critical, status: 'Resolved' }).reviewedBy).toBeUndefined()
    expect(recordReview(base)).toBe(base)
  })

  it('an old approval cannot be reused after reassignment and back', () => {
    const reviewed = recordReview(critical)
    const away = applyTicketChange(reviewed, { assignee: 'Priya Shah' })
    const back = applyTicketChange(away, { assignee: 'Jon Bell' })
    expect(back.reviewedBy).toBeUndefined()
    expect(canRecordReview(back)).toBe(true)
  })

  it('a stale review by a different person is dropped', () => {
    const stale = { ...critical, reviewedBy: 'Maya Chen' }
    expect(applyTicketChange(stale, { note: 'x' }).reviewedBy).toBeUndefined()
  })

  it('repeated reassignment requests are idempotent and keep the queue state', () => {
    const reviewed = recordReview(critical)
    const once = applyTicketChange(reviewed, { assignee: 'Priya Shah' })
    const twice = applyTicketChange(once, { assignee: 'Priya Shah' })
    expect(twice).toEqual(once)
  })

  it('interleaved review and reassignment applied to latest state cannot keep a stale review', () => {
    const afterReassign = applyTicketChange(critical, { assignee: 'Priya Shah' })
    const afterReview = recordReview(afterReassign)
    expect(afterReview.reviewedBy).toBe('Priya Shah')
    const reassignedAgain = applyTicketChange(afterReview, { assignee: 'Maya Chen' })
    expect(reassignedAgain.reviewedBy).toBeUndefined()
  })
})

describe('suggested reply eligibility', () => {
  it('requires both the article category and subject keywords', () => {
    expect(suggestedReply({ ...base, category: 'Device setup' })).toBe('')
    expect(suggestedReply({ ...base, subject: 'Export something else' })).toBe('')
    expect(suggestedReply({ ...base, subject: 'Shifts are wrong' })).toBe('')
  })

  it('stops suggesting once the ticket is no longer low risk', () => {
    expect(suggestedReply(base)).not.toBe('')
    expect(suggestedReply({ ...base, priority: 'High' })).toBe('')
  })

  it('does not suggest for an empty subject', () => {
    expect(suggestedReply({ ...base, subject: '' })).toBe('')
  })
})

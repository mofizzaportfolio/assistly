import { describe, expect, it } from 'vitest'
import {
  allowedStatuses,
  applyTicketChange,
  canApproveDraft,
  canRecordReview,
  canResolve,
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
    const next = applyTicketChange(critical, { status: 'Resolved', priority: 'Low' })
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

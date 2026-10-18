import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { tickets } from '@/lib/db/schema'

const scenarios = [
  ['Login failure', 'Account access fails after a valid password.', 'Account access'], ['Password reset', 'Reset email never arrives.', 'Account access'], ['Email verification', 'Verification link has expired.', 'Verification'], ['Duplicate payment', 'Customer reports being charged twice.', 'Billing'], ['Refund status', 'Refund has not appeared.', 'Billing'], ['Subscription cancellation', 'Cancellation fails.', 'Subscriptions'], ['Payment declined', 'Checkout fails despite valid details.', 'Payments'], ['Email notifications', 'Notifications are not received.', 'Notifications'], ['File upload', 'Upload fails with an error.', 'Files'], ['Dashboard loading', 'Dashboard is stuck loading.', 'Dashboard'], ['Slow performance', 'Pages take too long to load.', 'Performance'], ['Mobile layout', 'Interface elements overlap on mobile.', 'Usability'], ['Browser compatibility', 'Feature fails in one browser.', 'Usability'], ['Data synchronization', 'Updated information does not appear everywhere.', 'Synchronization'], ['Report export', 'CSV export fails.', 'Reports'], ['Search issue', 'Expected results are missing.', 'Search'], ['Permission issue', 'Authorized feature is inaccessible.', 'Permissions'], ['API integration', 'Requests return unexpected errors.', 'Integrations'], ['Suspicious account activity', 'Possible unauthorized access.', 'Security'], ['Workflow failure', 'Automation is stuck or repeatedly fails.', 'Automation'],
] as const

export async function POST() {
  try {
    for (const [index, [subject, message, category]] of scenarios.entries()) {
      await db.insert(tickets).values({ id: `DEMO-${String(index + 1).padStart(4, '0')}`, subject: `DEMO: ${subject}`, customer: `Demo customer ${index + 1}`, originalMessage: message, category, tags: ['demo', 'sample'], priority: index % 5 === 0 ? 'High' : index % 3 === 0 ? 'Medium' : 'Low', riskLevel: index % 5 === 0 ? 'High' : 'Low', status: index % 4 === 0 ? 'Awaiting approval' : 'Open', channel: index % 2 ? 'Web form' : 'Email', team: 'Human Support', isDemo: true }).onConflictDoNothing()
    }
    return NextResponse.json({ seeded: scenarios.length })
  } catch { return NextResponse.json({ error: 'Demo seed failed.' }, { status: 503 }) }
}

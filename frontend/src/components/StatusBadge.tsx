import type { ActionStatus } from '../types'

const styles: Record<ActionStatus, string> = {
  pending_approval: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  approved: 'bg-blue-100 text-blue-800 border-blue-200',
  rejected: 'bg-red-100 text-red-800 border-red-200',
  executing: 'bg-blue-100 text-blue-800 border-blue-200',
  completed: 'bg-green-100 text-green-800 border-green-200',
  failed: 'bg-red-100 text-red-800 border-red-200',
  rolled_back: 'bg-gray-100 text-gray-800 border-gray-200',
}

const labels: Record<ActionStatus, string> = {
  pending_approval: 'Pending Approval',
  approved: 'Approved',
  rejected: 'Rejected',
  executing: 'Executing',
  completed: 'Completed',
  failed: 'Failed',
  rolled_back: 'Rolled Back',
}

export function StatusBadge({ status }: { status: ActionStatus }) {
  return (
    <span className={`px-2 py-0.5 text-xs font-semibold rounded border ${styles[status]}`}>
      {labels[status]}
    </span>
  )
}

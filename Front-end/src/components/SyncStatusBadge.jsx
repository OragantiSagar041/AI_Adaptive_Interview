import React from 'react';

export default function SyncStatusBadge({ status }) {
  const statusMap = {
    SUCCESS: { label: 'Synced', className: 'bg-emerald-500 text-white' },
    FAILED: { label: 'Sync Failed', className: 'bg-rose-500 text-white' },
    PENDING: { label: 'Pending', className: 'bg-slate-500 text-white' },
  };
  const { label, className } = statusMap[status] || statusMap.PENDING;
  return <span className={`px-3 py-1 rounded-full text-xs font-semibold ${className}`}>{label}</span>;
}

import React from 'react';

export default function SyncBanner({ error, onRetry }) {
  if (!error) return null;
  return (
    <div className="mb-6 p-4 rounded-xl bg-rose-500/10 border border-rose-500 text-rose-600">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="font-semibold">Sync Failed</p>
          <p className="text-sm text-rose-400 mt-1">{error}</p>
        </div>
        <button
          type="button"
          onClick={onRetry}
          className="px-4 py-2 bg-rose-500 text-white rounded-lg hover:bg-rose-600"
        >
          Retry Sync
        </button>
      </div>
    </div>
  );
}

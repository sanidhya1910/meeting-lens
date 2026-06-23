import type { ReactNode } from 'react';
import { BatchStatusIcon } from './BatchStatusIcon';
import type { BatchProgressItem } from '../types';

type Props = {
  items: BatchProgressItem[];
  status: string;
  done: number;
  total: number;
  skippedCount?: number;
  onCancel?: () => void;
  cancelling?: boolean;
  children?: ReactNode;
};

export function BatchProgressPanel({
  items,
  status,
  done,
  total,
  skippedCount,
  onCancel,
  cancelling,
  children,
}: Props) {
  const progressPct = total ? Math.round((done / total) * 100) : 0;
  const isRunning = ['queued', 'processing', 'cancelling'].includes(status);

  return (
    <>
      <div className="batch-progress-bar">
        <div className="batch-progress-fill" style={{ width: `${progressPct}%` }} />
      </div>
      <p className="batch-progress-label">
        {done} of {total} finished ({progressPct}%)
        {skippedCount ? ` · ${skippedCount} skipped` : ''}
        {status === 'cancelled' ? ' · cancelled' : ''}
      </p>

      {isRunning && onCancel && (
        <button
          type="button"
          className="btn btn-outline btn-sm batch-cancel-btn"
          onClick={onCancel}
          disabled={cancelling}
        >
          {cancelling ? 'Cancelling…' : 'Cancel batch'}
        </button>
      )}

      <ul className="batch-item-list">
        {items.map(item => (
          <li key={item.id} className={`batch-item batch-item-${item.status}`}>
            <span className="batch-item-icon">
              <BatchStatusIcon status={item.status} />
            </span>
            <div className="batch-item-body">
              <span className="batch-item-name">{item.label}</span>
              <span className="batch-item-progress">
                {item.error || item.progress || item.status}
              </span>
            </div>
          </li>
        ))}
      </ul>

      {children}
    </>
  );
}

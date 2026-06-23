import { CheckCircle2, Loader2, XCircle } from 'lucide-react';

export function BatchStatusIcon({ status }: { status: string }) {
  if (status === 'completed') return <CheckCircle2 size={16} className="batch-icon-ok" />;
  if (status === 'failed') return <XCircle size={16} className="batch-icon-fail" />;
  if (status === 'skipped') return <span className="batch-icon-skipped" title="Skipped">—</span>;
  if (status === 'cancelled') return <span className="batch-icon-skipped" title="Cancelled">×</span>;
  if (status === 'processing' || status === 'cancelling') {
    return <Loader2 size={16} className="batch-icon-spin" />;
  }
  return <span className="batch-icon-pending" />;
}

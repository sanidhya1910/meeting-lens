import { useState } from 'react';
import { X, Sparkles, Cpu } from 'lucide-react';
import axios from 'axios';
import { apiUrl } from '../../api';
import { useAsrModels } from '../../hooks/useAsrModels';
import { useBatchPoll } from '../../hooks/useBatchPoll';
import { FileDropZone } from '../FileDropZone';
import { BatchProgressPanel } from '../BatchProgressPanel';
import { saveLastTranscribeBatch } from '../../utils/batchStorage';
import type { TranscribeBatchJob } from '../../types';

type Props = {
  onClose: () => void;
  onComplete: () => void;
  onSummarizeBatch?: (meetingIds: string[]) => void;
  cudaAvailable?: boolean;
  diarizeAvailable?: boolean;
};

const TERMINAL = new Set(['completed', 'cancelled', 'failed']);

export function BulkTranscribeModal({ onClose, onComplete, onSummarizeBatch, cudaAvailable = false, diarizeAvailable = false }: Props) {
  const [files, setFiles] = useState<File[]>([]);
  const [asrModel, setAsrModel] = useState('tiny');
  const [useGpu, setUseGpu] = useState(cudaAvailable);
  const [diarize, setDiarize] = useState(false);
  const [translate, setTranslate] = useState(false);
  const [running, setRunning] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [batch, setBatch] = useState<TranscribeBatchJob | null>(null);
  const [error, setError] = useState('');
  const [completedMeetingIds, setCompletedMeetingIds] = useState<string[]>([]);
  const asrModels = useAsrModels();
  const { startPolling, stopPolling } = useBatchPoll<TranscribeBatchJob>(
    id => `/api/transcribe/batch/${id}`,
  );

  const handleTerminal = async (job: TranscribeBatchJob) => {
    setRunning(false);
    try {
      const res = await axios.get(apiUrl(`/api/transcribe/batch/${job.id}/meeting-ids`));
      const ids: string[] = res.data.meeting_ids ?? [];
      setCompletedMeetingIds(ids);
      if (ids.length) saveLastTranscribeBatch(job.id, ids);
    } catch {
      const ids = job.items
        .filter(i => i.status === 'completed' && i.meeting_id)
        .map(i => i.meeting_id as string);
      setCompletedMeetingIds(ids);
      if (ids.length) saveLastTranscribeBatch(job.id, ids);
    }
  };

  const handleStart = async () => {
    if (!files.length) return setError('Add at least one file');
    setRunning(true);
    setError('');
    setBatch(null);
    setCompletedMeetingIds([]);

    const formData = new FormData();
    files.forEach(f => formData.append('files', f));
    formData.append('asr_model', asrModel);
    formData.append('device', useGpu ? 'auto' : 'cpu');
    formData.append('diarize', diarize ? 'true' : 'false');
    formData.append('translate', translate ? 'true' : 'false');

    try {
      const res = await axios.post(apiUrl('/api/transcribe/batch'), formData);
      startPolling(res.data.batch_id, setBatch, handleTerminal);
      const statusRes = await axios.get(apiUrl(`/api/transcribe/batch/${res.data.batch_id}`));
      setBatch(statusRes.data.batch);
    } catch (err: unknown) {
      const ax = err as { response?: { data?: { detail?: string } } };
      setError(ax.response?.data?.detail || (err instanceof Error ? err.message : 'Failed to start batch'));
      setRunning(false);
    }
  };

  const handleCancel = async () => {
    if (!batch) return;
    setCancelling(true);
    try {
      await axios.post(apiUrl(`/api/transcribe/batch/${batch.id}/cancel`));
    } catch {
      /* poll will pick up status */
    }
  };

  const total = batch?.items?.length ?? 0;
  const done =
    batch?.items?.filter(i =>
      ['completed', 'failed', 'skipped', 'cancelled'].includes(i.status),
    ).length ?? 0;

  const canClose = !running || (batch && TERMINAL.has(batch.status));

  return (
    <div className="modal-backdrop">
      <div className="modal-content modal-content-wide">
        <button className="close-btn" onClick={onClose} disabled={!canClose}><X size={20} /></button>
        <h2 style={{ marginBottom: '0.5rem' }}>Bulk Transcription</h2>
        <p className="modal-subtitle">
          Files are processed one after another. The Whisper model stays loaded between files.
        </p>

        {error && <div className="warning-box error-banner">{error}</div>}

        {!batch && (
          <>
            <div className="form-group">
              <FileDropZone
                label="Drop multiple files here, or click to browse"
                multiple
                files={files}
                onFiles={setFiles}
                disabled={running}
              />
              {files.length > 0 && (
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  style={{ marginTop: '0.5rem' }}
                  onClick={() => setFiles([])}
                  disabled={running}
                >
                  Clear all
                </button>
              )}
            </div>

            <div className="form-group">
              <label>Whisper Model</label>
              <select value={asrModel} onChange={e => setAsrModel(e.target.value)} disabled={running}>
                {asrModels.map(m => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </div>

            {cudaAvailable ? (
              <div className="form-group">
                <label>Compute Device</label>
                <div className="switch-wrapper">
                  <label className="switch">
                    <input type="checkbox" checked={useGpu} onChange={e => setUseGpu(e.target.checked)} disabled={running} />
                    <span className="slider" />
                  </label>
                  <span style={{ fontSize: '0.875rem' }}>{useGpu ? 'Use GPU if available' : 'CPU only'}</span>
                </div>
              </div>
            ) : (
              <div className="form-group">
                <div className="device-note"><Cpu size={15} /> Transcribing on CPU — Tiny or Base recommended.</div>
              </div>
            )}

            {diarizeAvailable && (
              <div className="form-group">
                <label className="checkbox-label">
                  <input type="checkbox" checked={diarize} onChange={e => setDiarize(e.target.checked)} disabled={running} />
                  Detect &amp; label speakers
                </label>
              </div>
            )}

            <div className="form-group">
              <label className="checkbox-label">
                <input type="checkbox" checked={translate} onChange={e => setTranslate(e.target.checked)} disabled={running} />
                Translate to English
              </label>
            </div>

            <button className="btn" onClick={handleStart} disabled={running || !files.length} style={{ width: '100%' }}>
              {running ? <><div className="loader" /> Starting...</> : `Transcribe ${files.length || 0} file(s)`}
            </button>
          </>
        )}

        {batch && (
          <BatchProgressPanel
            items={batch.items.map(i => ({
              id: i.id,
              label: i.filename,
              status: i.status,
              error: i.error,
              progress: i.progress,
            }))}
            status={batch.status}
            done={done}
            total={total}
            onCancel={TERMINAL.has(batch.status) ? undefined : handleCancel}
            cancelling={cancelling}
          >
            {TERMINAL.has(batch.status) && (
              <div className="batch-actions">
                <button className="btn" style={{ flex: 1 }} onClick={() => { onComplete(); onClose(); }}>
                  View in library
                </button>
                {completedMeetingIds.length > 0 && onSummarizeBatch && (
                  <button
                    className="btn btn-outline"
                    style={{ flex: 1 }}
                    onClick={() => {
                      onSummarizeBatch(completedMeetingIds);
                      onClose();
                    }}
                  >
                    <Sparkles size={16} /> Summarize these ({completedMeetingIds.length})
                  </button>
                )}
                <button
                  className="btn btn-outline"
                  onClick={() => {
                    stopPolling();
                    setBatch(null);
                    setFiles([]);
                    setRunning(false);
                    setCompletedMeetingIds([]);
                  }}
                >
                  New batch
                </button>
              </div>
            )}
          </BatchProgressPanel>
        )}
      </div>
    </div>
  );
}

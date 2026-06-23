import { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import axios from 'axios';
import { apiUrl } from '../../api';
import { useBatchPoll } from '../../hooks/useBatchPoll';
import { BatchProgressPanel } from '../BatchProgressPanel';
import type { LlmSettings, Meeting, SummarizeBatchJob, Template } from '../../types';

type Props = LlmSettings & {
  meetings: Meeting[];
  availableTemplates: Template[];
  initialMeetingIds?: string[];
  onClose: () => void;
  onComplete: () => void;
};

export function BulkSummarizeModal({
  meetings,
  availableTemplates,
  provider,
  apiKey,
  baseUrl,
  modelName,
  initialMeetingIds,
  onClose,
  onComplete,
}: Props) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [selectedTemplateName, setSelectedTemplateName] = useState(availableTemplates[0]?.name || '');
  const [skipExisting, setSkipExisting] = useState(true);
  const [autoTitle, setAutoTitle] = useState(true);
  const [running, setRunning] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [batch, setBatch] = useState<SummarizeBatchJob | null>(null);
  const [error, setError] = useState('');
  const { startPolling, stopPolling } = useBatchPoll<SummarizeBatchJob>(
    id => `/api/summarize/batch/${id}`,
  );

  const unsummarizedIds = useMemo(
    () => meetings.filter(m => !m.summary).map(m => m.id),
    [meetings],
  );

  useEffect(() => {
    if (initialMeetingIds?.length) {
      setSelectedIds(new Set(initialMeetingIds));
    } else {
      setSelectedIds(
        unsummarizedIds.length
          ? new Set(unsummarizedIds)
          : new Set(meetings.map(m => m.id)),
      );
    }
  }, []);

  const filteredMeetings = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return meetings;
    return meetings.filter(
      m => m.title.toLowerCase().includes(q) || m.id.toLowerCase().includes(q),
    );
  }, [meetings, search]);

  const handleStart = async () => {
    if (!selectedIds.size) return setError('Select at least one meeting');
    if (!['lmstudio', 'openai_compatible', 'ollama'].includes(provider) && !apiKey.trim()) {
      return setError('Configure your LLM API key in Settings first');
    }

    const tmpl = availableTemplates.find(t => t.name === selectedTemplateName);
    setRunning(true);
    setError('');
    setBatch(null);

    try {
      const res = await axios.post(apiUrl('/api/summarize/batch'), {
        meeting_ids: Array.from(selectedIds),
        json_template: tmpl?.content ?? '{}',
        llm_provider: provider,
        llm_api_key: apiKey,
        llm_base_url: baseUrl,
        llm_model: modelName,
        auto_title: autoTitle,
        skip_existing: skipExisting,
      });
      startPolling(res.data.batch_id, setBatch, () => setRunning(false));
      const statusRes = await axios.get(apiUrl(`/api/summarize/batch/${res.data.batch_id}`));
      setBatch(statusRes.data.batch);
    } catch (err: unknown) {
      const ax = err as { response?: { data?: { detail?: string } } };
      setError(ax.response?.data?.detail || (err instanceof Error ? err.message : 'Failed'));
      setRunning(false);
    }
  };

  const handleCancel = async () => {
    if (!batch) return;
    setCancelling(true);
    try {
      await axios.post(apiUrl(`/api/summarize/batch/${batch.id}/cancel`));
    } catch {
      /* poll updates */
    }
  };

  const toggleMeeting = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const total = batch?.items?.length ?? 0;
  const done =
    batch?.items?.filter(i =>
      ['completed', 'failed', 'skipped', 'cancelled'].includes(i.status),
    ).length ?? 0;

  const terminal = batch && ['completed', 'cancelled', 'failed'].includes(batch.status);
  const canClose = !running || terminal;

  return (
    <div className="modal-backdrop">
      <div className="modal-content modal-content-wide">
        <button className="close-btn" onClick={onClose} disabled={!canClose}><X size={20} /></button>
        <h2 style={{ marginBottom: '0.5rem' }}>Bulk Summarize</h2>
        <p className="modal-subtitle">
          Run the same template against multiple meetings. Configure your LLM in Settings first.
        </p>

        {error && <div className="warning-box error-banner">{error}</div>}

        {!batch && (
          <>
            {meetings.length === 0 ? (
              <p className="modal-subtitle">No meetings yet. Transcribe some files first.</p>
            ) : (
              <>
                <div className="form-group">
                  <label>Summary template</label>
                  <select
                    value={selectedTemplateName}
                    onChange={e => setSelectedTemplateName(e.target.value)}
                    disabled={running}
                  >
                    {availableTemplates.map(t => (
                      <option key={t.name} value={t.name}>{t.name}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group batch-options-row">
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={skipExisting}
                      onChange={e => setSkipExisting(e.target.checked)}
                      disabled={running}
                    />
                    Skip meetings that already have a summary
                  </label>
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={autoTitle}
                      onChange={e => setAutoTitle(e.target.checked)}
                      disabled={running}
                    />
                    Auto-title default-named meetings
                  </label>
                </div>

                <div className="form-group">
                  <label>Search meetings</label>
                  <input
                    type="search"
                    placeholder="Filter by title…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    disabled={running}
                  />
                </div>

                <div className="meeting-select-toolbar">
                  <span className="meeting-select-count">{selectedIds.size} selected</span>
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    onClick={() => setSelectedIds(new Set(meetings.map(m => m.id)))}
                    disabled={running}
                  >
                    All
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    onClick={() => setSelectedIds(new Set(unsummarizedIds))}
                    disabled={running}
                  >
                    Unsummarized
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    onClick={() => setSelectedIds(new Set())}
                    disabled={running}
                  >
                    Clear
                  </button>
                </div>

                <ul className="meeting-check-list">
                  {filteredMeetings.map(m => (
                    <li key={m.id}>
                      <label className="meeting-check-row">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(m.id)}
                          onChange={() => toggleMeeting(m.id)}
                          disabled={running}
                        />
                        <span className="meeting-check-title">{m.title}</span>
                        {m.summary ? (
                          <span className="meeting-check-badge">has summary</span>
                        ) : (
                          <span className="meeting-check-badge meeting-check-badge-new">no summary</span>
                        )}
                      </label>
                    </li>
                  ))}
                  {filteredMeetings.length === 0 && (
                    <li className="meeting-check-empty">No meetings match your search.</li>
                  )}
                </ul>
              </>
            )}

            <button
              className="btn"
              onClick={handleStart}
              disabled={running || !selectedIds.size || meetings.length === 0}
              style={{ width: '100%', marginTop: '1rem' }}
            >
              {running ? <><div className="loader" /> Starting...</> : `Summarize ${selectedIds.size} meeting(s)`}
            </button>
          </>
        )}

        {batch && (
          <BatchProgressPanel
            items={batch.items.map(i => ({
              id: i.id,
              label: i.title,
              status: i.status,
              error: i.error,
              progress: i.progress,
            }))}
            status={batch.status}
            done={done}
            total={total}
            skippedCount={batch.skipped_count}
            onCancel={terminal ? undefined : handleCancel}
            cancelling={cancelling}
          >
            {terminal && (
              <div className="batch-actions">
                <button className="btn" style={{ flex: 1 }} onClick={() => { onComplete(); onClose(); }}>
                  View updated library
                </button>
                <button
                  className="btn btn-outline"
                  onClick={() => {
                    stopPolling();
                    setBatch(null);
                    setRunning(false);
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

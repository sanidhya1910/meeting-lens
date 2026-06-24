import { useState } from 'react';
import { Sparkles, Plus, Trash2, Download, Copy, Calendar, ListChecks } from 'lucide-react';
import axios from 'axios';
import { apiUrl } from '../api';
import { useToast } from './Toast';
import { actionItemsToMarkdown, actionItemsToIcs } from '../utils/actionItems';
import { copyToClipboard, downloadTextFile } from '../utils/exportMarkdown';
import type { ActionItem, LlmSettings } from '../types';

type Props = LlmSettings & {
  meetingId: string;
  meetingTitle: string;
  items: ActionItem[];
  onChange: () => void;
};

export function ActionItems({ meetingId, meetingTitle, items, provider, apiKey, baseUrl, modelName, onChange }: Props) {
  const toast = useToast();
  const [extracting, setExtracting] = useState(false);

  const persist = async (next: ActionItem[]) => {
    try {
      await axios.put(apiUrl(`/api/meetings/${meetingId}/action-items`), { action_items: next });
      onChange();
    } catch {
      toast.error('Failed to save action items');
    }
  };

  const extract = async () => {
    setExtracting(true);
    try {
      const res = await axios.post(apiUrl(`/api/meetings/${meetingId}/action-items/extract`), {
        llm_provider: provider,
        llm_api_key: apiKey,
        llm_base_url: baseUrl,
        llm_model: modelName,
      });
      onChange();
      toast.success(`Found ${res.data.action_items.length} action item(s)`);
    } catch (err: unknown) {
      const ax = err as { response?: { data?: { detail?: string } } };
      toast.error(ax.response?.data?.detail || 'Extraction failed');
    } finally {
      setExtracting(false);
    }
  };

  const toggle = (id: string) =>
    persist(items.map(it => (it.id === id ? { ...it, status: it.status === 'done' ? 'open' : 'done' } : it)));

  const edit = (id: string, field: keyof ActionItem, value: string) =>
    persist(items.map(it => (it.id === id ? { ...it, [field]: value } : it)));

  const remove = (id: string) => persist(items.filter(it => it.id !== id));

  const add = () =>
    persist([...items, { id: crypto.randomUUID(), task: 'New action item', owner: '', due: '', status: 'open' }]);

  const exportMd = () => {
    downloadTextFile(`${meetingTitle.replace(/\s+/g, '_')}_actions.md`, actionItemsToMarkdown(meetingTitle, items));
    toast.success('Markdown downloaded');
  };
  const exportIcs = () => {
    downloadTextFile(`${meetingTitle.replace(/\s+/g, '_')}_actions.ics`, actionItemsToIcs(meetingTitle, items), 'text/calendar');
    toast.success('Calendar (.ics) downloaded');
  };
  const copyMd = async () => {
    (await copyToClipboard(actionItemsToMarkdown(meetingTitle, items)))
      ? toast.success('Copied checklist')
      : toast.error('Copy failed');
  };

  const open = items.filter(i => i.status === 'open').length;

  return (
    <div className="card">
      <div className="card-header-row">
        <h2 className="card-title">
          <ListChecks size={20} color="var(--primary)" /> Action Items
          {items.length > 0 && <span className="ai-count">{open} open / {items.length}</span>}
        </h2>
        <div className="card-header-actions">
          <button className="btn btn-outline btn-sm" onClick={extract} disabled={extracting}>
            {extracting ? <><div className="loader" /> Extracting…</> : <><Sparkles size={15} /> Extract from transcript</>}
          </button>
          {items.length > 0 && (
            <>
              <button className="btn btn-outline btn-sm" onClick={copyMd}><Copy size={15} /> Copy</button>
              <button className="btn btn-outline btn-sm" onClick={exportMd}><Download size={15} /> .md</button>
              <button className="btn btn-outline btn-sm" onClick={exportIcs}><Calendar size={15} /> .ics</button>
            </>
          )}
        </div>
      </div>

      {items.length === 0 ? (
        <div className="ai-empty">
          No action items yet. Click <strong>Extract from transcript</strong> to detect them with AI, or add one manually.
        </div>
      ) : (
        <ul className="action-list">
          {items.map(it => (
            <li key={it.id} className={`action-row ${it.status === 'done' ? 'done' : ''}`}>
              <input type="checkbox" checked={it.status === 'done'} onChange={() => toggle(it.id)} />
              <input
                className="action-task"
                value={it.task}
                onChange={e => edit(it.id, 'task', e.target.value)}
              />
              <input
                className="action-owner"
                placeholder="owner"
                value={it.owner}
                onChange={e => edit(it.id, 'owner', e.target.value)}
              />
              <input
                className="action-due"
                placeholder="due"
                value={it.due}
                onChange={e => edit(it.id, 'due', e.target.value)}
              />
              <button className="meeting-icon-btn" onClick={() => remove(it.id)} title="Remove">
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <button className="btn btn-outline btn-sm action-add" onClick={add}>
        <Plus size={15} /> Add item
      </button>
    </div>
  );
}

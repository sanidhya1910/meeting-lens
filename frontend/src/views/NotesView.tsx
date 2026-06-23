import { useEffect, useState } from 'react';
import { FileText, FileJson, Download, Sparkles, Copy, MessageSquare, BookOpen } from 'lucide-react';
import axios from 'axios';
// @ts-ignore
import html2pdf from 'html2pdf.js';
import { apiUrl } from '../api';
import { SummaryRenderer } from '../components/SummaryRenderer';
import { ChatPanel } from '../components/ChatPanel';
import { TagEditor } from '../components/TagEditor';
import { useToast } from '../components/Toast';
import { summaryToMarkdown, copyToClipboard, downloadTextFile } from '../utils/exportMarkdown';
import type { LlmSettings, Meeting, Template } from '../types';

type Props = LlmSettings & {
  meetings: Meeting[];
  selectedId: string | null;
  onSummaryGenerated: () => void;
  availableTemplates: Template[];
};

export function NotesView({
  meetings,
  selectedId,
  onSummaryGenerated,
  provider,
  apiKey,
  baseUrl,
  modelName,
  availableTemplates,
}: Props) {
  const meeting = meetings.find(m => m.id === selectedId);
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedTemplateName, setSelectedTemplateName] = useState(availableTemplates[0]?.name || '');
  const [isRegeneratingSummary, setIsRegeneratingSummary] = useState(false);
  const [isEditingTranscript, setIsEditingTranscript] = useState(false);
  const [editedTranscript, setEditedTranscript] = useState('');
  const [tab, setTab] = useState<'notes' | 'chat'>('notes');

  useEffect(() => {
    if (meeting) {
      setEditedTranscript(meeting.transcript);
      setIsEditingTranscript(false);
      setTab('notes');
    }
  }, [selectedId, meeting?.transcript]);

  if (!meeting) {
    return (
      <div className="empty-state">
        <FileText size={64} style={{ marginBottom: '1rem', opacity: 0.5 }} />
        <h2>Select a meeting</h2>
        <p>Choose a meeting from the sidebar to view its transcript and notes.</p>
      </div>
    );
  }

  const handleGenerateSummary = async () => {
    setLoading(true);
    setError('');
    const tmpl = availableTemplates.find(t => t.name === selectedTemplateName);
    const formData = new FormData();
    formData.append('llm_provider', provider);
    formData.append('llm_api_key', apiKey);
    formData.append('llm_base_url', baseUrl);
    formData.append('llm_model', modelName);
    formData.append('json_template', tmpl?.content ?? '{}');
    formData.append('auto_title', 'true');

    try {
      await axios.post(apiUrl(`/api/meetings/${meeting.id}/summarize`), formData);
      onSummaryGenerated();
      setIsRegeneratingSummary(false);
      toast.success('Summary generated');
    } catch (err: unknown) {
      const ax = err as { response?: { data?: { detail?: string } } };
      setError(ax.response?.data?.detail || (err instanceof Error ? err.message : 'Failed'));
    } finally {
      setLoading(false);
    }
  };

  const handleSaveTranscript = async () => {
    const formData = new FormData();
    formData.append('transcript', editedTranscript);
    try {
      await axios.put(apiUrl(`/api/meetings/${meeting.id}/transcript`), formData);
      onSummaryGenerated();
      setIsEditingTranscript(false);
      toast.success('Transcript saved');
    } catch (err: unknown) {
      const ax = err as { response?: { data?: { detail?: string } } };
      setError(ax.response?.data?.detail || (err instanceof Error ? err.message : 'Failed'));
    }
  };

  const handleSaveTags = async (tags: string[]) => {
    try {
      await axios.put(apiUrl(`/api/meetings/${meeting.id}/tags`), { tags });
      onSummaryGenerated();
    } catch {
      toast.error('Failed to update tags');
    }
  };

  const handleCopyMarkdown = async () => {
    if (!meeting.summary) return;
    const md = summaryToMarkdown(meeting.title, meeting.date, meeting.summary);
    const ok = await copyToClipboard(md);
    ok ? toast.success('Markdown copied to clipboard') : toast.error('Copy failed');
  };

  const handleDownloadMarkdown = () => {
    if (!meeting.summary) return;
    const md = summaryToMarkdown(meeting.title, meeting.date, meeting.summary);
    downloadTextFile(`${meeting.title.replace(/\s+/g, '_')}.md`, md);
    toast.success('Markdown downloaded');
  };

  const handleDownloadPdf = () => {
    if (!meeting.summary) return;
    const source = document.getElementById('summary-content-export');
    if (!source) return;

    const wrapper = document.createElement('div');
    wrapper.style.cssText =
      'position:fixed;left:-9999px;top:0;width:800px;background:#ffffff;color:#0f172a;padding:40px;font-family:Inter,sans-serif;font-size:14px;line-height:1.6;';
    wrapper.innerHTML =
      `<h1 style="font-size:22px;margin-bottom:4px;color:#0f172a;">${meeting.title}</h1>` +
      `<p style="font-size:12px;color:#64748b;margin-bottom:24px;">${new Date(meeting.date).toLocaleString()}</p>` +
      source.innerHTML;

    document.body.appendChild(wrapper);
    wrapper.querySelectorAll('*').forEach((el: Element) => {
      (el as HTMLElement).style.color = '#1e293b';
      (el as HTMLElement).style.background = 'transparent';
    });

    html2pdf()
      .set({
        margin: [15, 15, 15, 15],
        filename: `${meeting.title.replace(/\s+/g, '_')}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, width: 800, windowWidth: 800 },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      })
      .from(wrapper)
      .save()
      .then(() => document.body.removeChild(wrapper));
  };

  return (
    <div style={{ maxWidth: '820px' }}>
      <div className="page-header notes-header">
        <h1>{meeting.title}</h1>
        <p>{new Date(meeting.date).toLocaleString()}</p>
        <TagEditor tags={meeting.tags ?? []} onChange={handleSaveTags} />
      </div>

      <div className="tab-bar">
        <button className={`tab ${tab === 'notes' ? 'active' : ''}`} onClick={() => setTab('notes')}>
          <BookOpen size={16} /> Notes
        </button>
        <button className={`tab ${tab === 'chat' ? 'active' : ''}`} onClick={() => setTab('chat')}>
          <MessageSquare size={16} /> Ask AI
        </button>
      </div>

      {error && <div className="warning-box error-banner">{error}</div>}

      {tab === 'chat' ? (
        <div className="card">
          <ChatPanel
            meetingId={meeting.id}
            provider={provider}
            apiKey={apiKey}
            baseUrl={baseUrl}
            modelName={modelName}
          />
        </div>
      ) : (
        <>
          {!meeting.summary || isRegeneratingSummary ? (
            <div className="empty-state notes-summary-empty">
              <FileJson size={48} style={{ marginBottom: '1rem', opacity: 0.5 }} />
              <h2>{isRegeneratingSummary ? 'Regenerate Summary' : 'No Summary Generated Yet'}</h2>
              <p>Generate an AI-powered summary to get key points, action items, and decisions.</p>
              <select
                value={selectedTemplateName}
                onChange={e => setSelectedTemplateName(e.target.value)}
                style={{ width: '220px', marginBottom: '1rem' }}
              >
                {availableTemplates.map(t => (
                  <option key={t.name} value={t.name}>{t.name}</option>
                ))}
              </select>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                {isRegeneratingSummary && (
                  <button className="btn btn-outline" onClick={() => setIsRegeneratingSummary(false)} disabled={loading}>
                    Cancel
                  </button>
                )}
                <button className="btn" onClick={handleGenerateSummary} disabled={loading}>
                  {loading ? <><div className="loader" /> Processing...</> : <><Sparkles size={18} /> Generate Summary</>}
                </button>
              </div>
            </div>
          ) : (
            <div className="card">
              <div className="card-header-row">
                <h2 className="card-title">
                  <Sparkles size={20} color="var(--primary)" />
                  AI Enhanced Summary
                </h2>
                <div className="card-header-actions">
                  <button className="btn btn-outline btn-sm" onClick={() => setIsRegeneratingSummary(true)}>
                    <Sparkles size={15} /> Regenerate
                  </button>
                  <button className="btn btn-outline btn-sm" onClick={handleCopyMarkdown}>
                    <Copy size={15} /> Copy
                  </button>
                  <button className="btn btn-outline btn-sm" onClick={handleDownloadMarkdown}>
                    <Download size={15} /> .md
                  </button>
                  <button className="btn btn-outline btn-sm" onClick={handleDownloadPdf}>
                    <Download size={15} /> PDF
                  </button>
                </div>
              </div>
              <div id="summary-content-export" className="summary-export-box">
                <SummaryRenderer data={meeting.summary} />
              </div>
            </div>
          )}

          <div className="card">
            <div className="card-header-row">
              <h2 className="card-title">Transcript</h2>
              {!isEditingTranscript ? (
                <button className="btn btn-outline btn-sm" onClick={() => setIsEditingTranscript(true)}>
                  Edit Transcript
                </button>
              ) : (
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    className="btn btn-outline btn-sm"
                    onClick={() => {
                      setIsEditingTranscript(false);
                      setEditedTranscript(meeting.transcript);
                    }}
                  >
                    Cancel
                  </button>
                  <button className="btn btn-sm" onClick={handleSaveTranscript}>Save Changes</button>
                </div>
              )}
            </div>
            {isEditingTranscript ? (
              <textarea
                className="result-box transcript-editor"
                value={editedTranscript}
                onChange={e => setEditedTranscript(e.target.value)}
              />
            ) : (
              <div className="result-box transcript-view">{meeting.transcript}</div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

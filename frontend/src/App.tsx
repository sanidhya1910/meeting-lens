import { useState, useEffect } from 'react';
import { Home, FileText, Video, Settings, Sparkles, Sun, Moon, Monitor } from 'lucide-react';
import axios from 'axios';
import { apiUrl } from './api';
import { loadLastTranscribeMeetingIds } from './utils/batchStorage';
import { useTheme } from './hooks/useTheme';
import { useSystemInfo } from './hooks/useSystemInfo';
import { useToast } from './components/Toast';
import { MeetingSidebar } from './components/MeetingSidebar';
import { ConfirmDialog } from './components/ConfirmDialog';
import { HomeView } from './views/HomeView';
import { NotesView } from './views/NotesView';
import { TranscribeModal } from './components/modals/TranscribeModal';
import { RecordModal } from './components/modals/RecordModal';
import { BulkTranscribeModal } from './components/modals/BulkTranscribeModal';
import { BulkSummarizeModal } from './components/modals/BulkSummarizeModal';
import { TemplateModal } from './components/modals/TemplateModal';
import { SettingsModal } from './components/modals/SettingsModal';
import type { Meeting, Template } from './types';
import './index.css';

function App() {
  const [view, setView] = useState<'home' | 'notes'>('home');
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [selectedMeetingId, setSelectedMeetingId] = useState<string | null>(null);

  const [showTranscribeModal, setShowTranscribeModal] = useState(false);
  const [showRecordModal, setShowRecordModal] = useState(false);
  const [showBulkTranscribeModal, setShowBulkTranscribeModal] = useState(false);
  const [showBulkSummarizeModal, setShowBulkSummarizeModal] = useState(false);
  const [summarizePreselectIds, setSummarizePreselectIds] = useState<string[] | undefined>();
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const { pref, cycle } = useTheme();
  const { info: systemInfo, refresh: refreshSystem } = useSystemInfo();
  const toast = useToast();

  const [provider, setProvider] = useState(() => localStorage.getItem('llmProvider') || 'ollama');
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('llmApiKey') || '');
  const [baseUrl, setBaseUrl] = useState(() => localStorage.getItem('llmBaseUrl') || '');
  const [modelName, setModelName] = useState(() => localStorage.getItem('llmModelName') || '');
  const [availableTemplates, setAvailableTemplates] = useState<Template[]>([]);

  const llm = { provider, apiKey, baseUrl, modelName };

  useEffect(() => {
    localStorage.setItem('llmProvider', provider);
    localStorage.setItem('llmApiKey', apiKey);
    localStorage.setItem('llmBaseUrl', baseUrl);
    localStorage.setItem('llmModelName', modelName);
  }, [provider, apiKey, baseUrl, modelName]);

  const fetchMeetings = async () => {
    try {
      const res = await axios.get(apiUrl('/api/meetings'));
      setMeetings(res.data.meetings);
    } catch (e) {
      console.error('Error fetching meetings', e);
    }
  };

  const fetchTemplates = async () => {
    try {
      const res = await axios.get(apiUrl('/api/templates'));
      setAvailableTemplates(res.data.templates);
    } catch (e) {
      console.error('Error fetching templates', e);
    }
  };

  useEffect(() => {
    fetchMeetings();
    fetchTemplates();
  }, []);

  const openBulkSummarize = (meetingIds?: string[]) => {
    setSummarizePreselectIds(meetingIds);
    setShowBulkSummarizeModal(true);
  };

  const confirmDelete = async () => {
    const id = pendingDeleteId;
    if (!id) return;
    setPendingDeleteId(null);
    try {
      await axios.delete(apiUrl(`/api/meetings/${id}`));
      setMeetings(prev => prev.filter(m => m.id !== id));
      if (selectedMeetingId === id) setSelectedMeetingId(null);
      toast.success('Meeting deleted');
    } catch {
      toast.error('Failed to delete meeting');
    }
  };

  const handleRename = async (id: string, title: string) => {
    const fd = new FormData();
    fd.append('title', title);
    try {
      await axios.put(apiUrl(`/api/meetings/${id}/title`), fd);
      setMeetings(prev => prev.map(m => (m.id === id ? { ...m, title } : m)));
      toast.success('Renamed');
    } catch {
      toast.error('Rename failed');
    }
  };

  const lastBatchIds = loadLastTranscribeMeetingIds();
  const ThemeIcon = pref === 'light' ? Sun : pref === 'dark' ? Moon : Monitor;
  const pendingDeleteMeeting = meetings.find(m => m.id === pendingDeleteId);

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="logo-area">
          <div className="logo-icon">
            <Video size={24} />
          </div>
          Meeting Lens
        </div>

        <nav className="nav-links">
          <div className={`nav-item ${view === 'home' ? 'active' : ''}`} onClick={() => setView('home')}>
            <Home size={20} /> Home
          </div>
          <div className={`nav-item ${view === 'notes' ? 'active' : ''}`} onClick={() => setView('notes')}>
            <FileText size={20} /> Meeting Notes
          </div>
        </nav>

        {view === 'notes' && (
          <>
            <button
              type="button"
              className="btn btn-outline sidebar-bulk-btn"
              onClick={() => openBulkSummarize()}
              disabled={meetings.length === 0}
            >
              <Sparkles size={16} /> Bulk Summarize
            </button>
            {lastBatchIds.length > 0 && (
              <button
                type="button"
                className="btn btn-outline sidebar-bulk-btn sidebar-bulk-btn-secondary"
                onClick={() => openBulkSummarize(lastBatchIds)}
              >
                <Sparkles size={16} /> Summarize last batch ({lastBatchIds.length})
              </button>
            )}
            <div className="sidebar-section-label">LIBRARY</div>
            <MeetingSidebar
              meetings={meetings}
              selectedId={selectedMeetingId}
              onSelect={setSelectedMeetingId}
              onDelete={setPendingDeleteId}
              onRename={handleRename}
            />
          </>
        )}

        <div className="sidebar-bottom">
          <div className="nav-item" onClick={cycle} title={`Theme: ${pref}`}>
            <ThemeIcon size={20} /> Theme: {pref}
          </div>
          <div className="nav-item" onClick={() => setShowSettingsModal(true)}>
            <Settings size={20} /> Settings
          </div>
        </div>
      </aside>

      <main className="main-content">
        {view === 'home' && (
          <HomeView
            meetings={meetings}
            systemInfo={systemInfo}
            onTranscribeClick={() => setShowTranscribeModal(true)}
            onRecordClick={() => setShowRecordModal(true)}
            onBulkTranscribeClick={() => setShowBulkTranscribeModal(true)}
            onBulkSummarizeClick={() => openBulkSummarize()}
            onTemplateClick={() => setShowTemplateModal(true)}
          />
        )}
        {view === 'notes' && (
          <NotesView
            meetings={meetings}
            selectedId={selectedMeetingId}
            onSummaryGenerated={fetchMeetings}
            availableTemplates={availableTemplates}
            {...llm}
          />
        )}
      </main>

      {showTranscribeModal && (
        <TranscribeModal
          cudaAvailable={systemInfo.cuda_available}
          onClose={() => setShowTranscribeModal(false)}
          onSuccess={id => {
            fetchMeetings();
            setShowTranscribeModal(false);
            setView('notes');
            setSelectedMeetingId(id);
          }}
        />
      )}

      {showRecordModal && (
        <RecordModal
          onClose={() => setShowRecordModal(false)}
          onSuccess={id => {
            fetchMeetings();
            setShowRecordModal(false);
            setView('notes');
            setSelectedMeetingId(id);
          }}
        />
      )}

      {showBulkTranscribeModal && (
        <BulkTranscribeModal
          cudaAvailable={systemInfo.cuda_available}
          onClose={() => setShowBulkTranscribeModal(false)}
          onComplete={fetchMeetings}
          onSummarizeBatch={ids => {
            fetchMeetings();
            openBulkSummarize(ids);
          }}
        />
      )}

      {showBulkSummarizeModal && (
        <BulkSummarizeModal
          key={summarizePreselectIds?.join(',') ?? 'all'}
          meetings={meetings}
          availableTemplates={availableTemplates}
          initialMeetingIds={summarizePreselectIds}
          onClose={() => {
            setShowBulkSummarizeModal(false);
            setSummarizePreselectIds(undefined);
          }}
          onComplete={() => {
            fetchMeetings();
            setView('notes');
          }}
          {...llm}
        />
      )}

      {showTemplateModal && (
        <TemplateModal
          onClose={() => setShowTemplateModal(false)}
          onSuccess={() => {
            fetchTemplates();
            setShowTemplateModal(false);
            toast.success('Template created');
          }}
          {...llm}
        />
      )}

      {showSettingsModal && (
        <SettingsModal
          onClose={() => setShowSettingsModal(false)}
          provider={provider}
          setProvider={setProvider}
          apiKey={apiKey}
          setApiKey={setApiKey}
          baseUrl={baseUrl}
          setBaseUrl={setBaseUrl}
          modelName={modelName}
          setModelName={setModelName}
          systemInfo={systemInfo}
          onRefreshSystem={refreshSystem}
        />
      )}

      {pendingDeleteMeeting && (
        <ConfirmDialog
          title="Delete meeting?"
          message={`"${pendingDeleteMeeting.title}" and its transcript will be permanently removed.`}
          confirmLabel="Delete"
          danger
          onConfirm={confirmDelete}
          onCancel={() => setPendingDeleteId(null)}
        />
      )}
    </div>
  );
}

export default App;

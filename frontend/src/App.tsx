import { useState, useEffect, useRef } from 'react';
import { Home, FileText, Video, Settings, Sparkles, Sun, Moon, Monitor, Search, Library, FileJson } from 'lucide-react';
import axios from 'axios';
import { apiUrl } from './api';
import { loadLastTranscribeMeetingIds } from './utils/batchStorage';
import { useTheme } from './hooks/useTheme';
import { useSystemInfo } from './hooks/useSystemInfo';
import { useToast } from './components/Toast';
import { MeetingSidebar } from './components/MeetingSidebar';
import { ConfirmDialog } from './components/ConfirmDialog';
import { SearchPalette } from './components/SearchPalette';
import { OnboardingModal } from './components/OnboardingModal';
import { HomeView } from './views/HomeView';
import { NotesView } from './views/NotesView';
import { TranscribeModal } from './components/modals/TranscribeModal';
import { RecordModal } from './components/modals/RecordModal';
import { BulkTranscribeModal } from './components/modals/BulkTranscribeModal';
import { BulkSummarizeModal } from './components/modals/BulkSummarizeModal';
import { TemplateModal } from './components/modals/TemplateModal';
import { TemplatesModal } from './components/modals/TemplatesModal';
import { SettingsModal } from './components/modals/SettingsModal';
import { LibraryChatModal } from './components/modals/LibraryChatModal';
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
  const [showTemplatesModal, setShowTemplatesModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [showLibraryChat, setShowLibraryChat] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const { pref, cycle } = useTheme();
  const { info: systemInfo, loading: systemLoading, refresh: refreshSystem } = useSystemInfo();
  const [showOnboarding, setShowOnboarding] = useState(false);
  const toast = useToast();

  const [provider, setProvider] = useState(() => localStorage.getItem('llmProvider') || 'ollama');
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('llmApiKey') || '');
  const [baseUrl, setBaseUrl] = useState(() => localStorage.getItem('llmBaseUrl') || '');
  const [modelName, setModelName] = useState(() => localStorage.getItem('llmModelName') || '');
  const [embedModel, setEmbedModel] = useState(() => localStorage.getItem('llmEmbedModel') || '');
  const [availableTemplates, setAvailableTemplates] = useState<Template[]>([]);

  const llm = { provider, apiKey, baseUrl, modelName };

  useEffect(() => {
    localStorage.setItem('llmProvider', provider);
    localStorage.setItem('llmApiKey', apiKey);
    localStorage.setItem('llmBaseUrl', baseUrl);
    localStorage.setItem('llmModelName', modelName);
    localStorage.setItem('llmEmbedModel', embedModel);
  }, [provider, apiKey, baseUrl, modelName, embedModel]);

  // Global keyboard shortcut: ⌘K / Ctrl+K opens search.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setShowSearch(s => !s);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const openMeeting = (id: string) => {
    setView('notes');
    setSelectedMeetingId(id);
  };

  // First-run onboarding: show once if a key dependency is missing.
  useEffect(() => {
    if (systemLoading || localStorage.getItem('onboardingSeen')) return;
    if (!systemInfo.ffmpeg_available || !systemInfo.ollama.available) setShowOnboarding(true);
  }, [systemLoading, systemInfo]);

  const closeOnboarding = () => {
    setShowOnboarding(false);
    localStorage.setItem('onboardingSeen', '1');
  };

  // Warm up the local model once on load so the first summary/chat is instant.
  const warmedRef = useRef(false);
  useEffect(() => {
    if (systemLoading || warmedRef.current) return;
    if (provider === 'ollama' && systemInfo.ollama.available) {
      warmedRef.current = true;
      axios.post(apiUrl('/api/warmup'), {
        llm_provider: provider, llm_api_key: apiKey, llm_base_url: baseUrl, llm_model: modelName,
      }).catch(() => {});
    }
  }, [systemLoading, systemInfo, provider, apiKey, baseUrl, modelName]);

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
          <div className="nav-item" onClick={() => setShowSearch(true)}>
            <Search size={20} /> Search
            <kbd className="nav-kbd">⌘K</kbd>
          </div>
          <div
            className="nav-item"
            onClick={() => meetings.length > 0 && setShowLibraryChat(true)}
            style={meetings.length === 0 ? { opacity: 0.5, pointerEvents: 'none' } : undefined}
          >
            <Library size={20} /> Ask Library
          </div>
          <div className="nav-item" onClick={() => setShowTemplatesModal(true)}>
            <FileJson size={20} /> Templates
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
            onLibraryChatClick={() => setShowLibraryChat(true)}
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
          diarizeAvailable={systemInfo.diarization_available}
          urlImportAvailable={systemInfo.url_import_available}
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
          diarizeAvailable={systemInfo.diarization_available}
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
          diarizeAvailable={systemInfo.diarization_available}
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

      {showTemplatesModal && (
        <TemplatesModal
          templates={availableTemplates}
          onChange={fetchTemplates}
          onClose={() => setShowTemplatesModal(false)}
          onOpenGenerator={() => {
            setShowTemplatesModal(false);
            setShowTemplateModal(true);
          }}
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
          embedModel={embedModel}
          setEmbedModel={setEmbedModel}
          systemInfo={systemInfo}
          onRefreshSystem={refreshSystem}
        />
      )}

      {showSearch && (
        <SearchPalette
          meetings={meetings}
          onSelect={openMeeting}
          onClose={() => setShowSearch(false)}
        />
      )}

      {showLibraryChat && (
        <LibraryChatModal
          {...llm}
          embedModel={embedModel}
          onClose={() => setShowLibraryChat(false)}
          onOpenMeeting={openMeeting}
        />
      )}

      {showOnboarding && (
        <OnboardingModal
          systemInfo={systemInfo}
          onClose={closeOnboarding}
          onRefresh={refreshSystem}
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

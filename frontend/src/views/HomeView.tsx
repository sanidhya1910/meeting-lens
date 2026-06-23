import { UploadCloud, Mic, Layers, Sparkles, FileJson, Cpu, Zap, CheckCircle2, FileText, ListChecks } from 'lucide-react';
import type { Meeting, SystemInfo } from '../types';

type Props = {
  onTranscribeClick: () => void;
  onBulkTranscribeClick: () => void;
  onBulkSummarizeClick: () => void;
  onTemplateClick: () => void;
  onRecordClick: () => void;
  meetings: Meeting[];
  systemInfo: SystemInfo;
};

export function HomeView({
  onTranscribeClick,
  onBulkTranscribeClick,
  onBulkSummarizeClick,
  onTemplateClick,
  onRecordClick,
  meetings,
  systemInfo,
}: Props) {
  const hasMeetings = meetings.length > 0;
  const summarized = meetings.filter(m => m.summary).length;
  const awaiting = meetings.length - summarized;

  return (
    <>
      <div className="page-header">
        <h1>Welcome to Meeting Lens</h1>
        <p>Transcribe and summarize meetings — entirely on your own machine.</p>
      </div>

      <div className="status-banner">
        <div className="status-chip">
          {systemInfo.cuda_available ? <Zap size={15} className="status-ok" /> : <Cpu size={15} />}
          {systemInfo.cuda_available ? 'GPU acceleration available' : 'Running on CPU'}
        </div>
        <div className="status-chip">
          {systemInfo.ollama.available ? <CheckCircle2 size={15} className="status-ok" /> : <Cpu size={15} />}
          {systemInfo.ollama.available
            ? `Local AI ready (Ollama, ${systemInfo.ollama.models.length} model${systemInfo.ollama.models.length === 1 ? '' : 's'})`
            : 'Local AI offline — configure in Settings'}
        </div>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <FileText size={20} className="stat-icon" />
          <div className="stat-value">{meetings.length}</div>
          <div className="stat-label">Meetings</div>
        </div>
        <div className="stat-card">
          <CheckCircle2 size={20} className="stat-icon" style={{ color: 'var(--success)' }} />
          <div className="stat-value">{summarized}</div>
          <div className="stat-label">Summarized</div>
        </div>
        <div className="stat-card">
          <ListChecks size={20} className="stat-icon" style={{ color: 'var(--primary)' }} />
          <div className="stat-value">{awaiting}</div>
          <div className="stat-label">Awaiting summary</div>
        </div>
      </div>

      <div className="features-grid">
        <div className="feature-card" onClick={onRecordClick}>
          <div className="feature-icon" style={{ background: 'rgba(239, 68, 68, 0.1)', color: 'var(--accent)' }}>
            <Mic size={24} />
          </div>
          <div>
            <h3>Live Transcription</h3>
            <p>Record audio from your microphone and transcribe it locally with Whisper.</p>
          </div>
          <button className="btn btn-danger" style={{ marginTop: 'auto' }}>Start Recording</button>
        </div>

        <div className="feature-card" onClick={onTranscribeClick}>
          <div className="feature-icon">
            <UploadCloud size={24} />
          </div>
          <div>
            <h3>Transcribe Audio/Video</h3>
            <p>Upload a media file and run it through local Whisper ASR on your device.</p>
          </div>
          <button className="btn btn-outline" style={{ marginTop: 'auto' }}>Upload File</button>
        </div>

        <div className="feature-card" onClick={onBulkTranscribeClick}>
          <div className="feature-icon" style={{ background: 'rgba(139, 92, 246, 0.1)', color: '#8b5cf6' }}>
            <Layers size={24} />
          </div>
          <div>
            <h3>Bulk Transcription</h3>
            <p>Upload multiple files at once. One shared Whisper model processes them sequentially.</p>
          </div>
          <button className="btn btn-outline" style={{ marginTop: 'auto' }}>Bulk Upload</button>
        </div>

        <div
          className={`feature-card ${!hasMeetings ? 'feature-card-muted' : ''}`}
          onClick={hasMeetings ? onBulkSummarizeClick : undefined}
        >
          <div className="feature-icon" style={{ background: 'rgba(59, 130, 246, 0.1)', color: 'var(--primary)' }}>
            <Sparkles size={24} />
          </div>
          <div>
            <h3>Bulk Summarize</h3>
            <p>
              {hasMeetings
                ? 'Apply one JSON template to many meetings. Skip already-summarized items by default.'
                : 'Transcribe meetings first, then summarize your library in one batch.'}
            </p>
          </div>
          <button className="btn btn-outline" style={{ marginTop: 'auto' }} disabled={!hasMeetings}>
            Summarize Library
          </button>
        </div>

        <div className="feature-card" onClick={onTemplateClick}>
          <div className="feature-icon" style={{ background: 'rgba(16, 185, 129, 0.1)', color: 'var(--success)' }}>
            <FileJson size={24} />
          </div>
          <div>
            <h3>Create LLM Template</h3>
            <p>Describe what to extract from a meeting and let the AI build a JSON template.</p>
          </div>
          <button className="btn btn-outline" style={{ marginTop: 'auto' }}>Build Template</button>
        </div>
      </div>
    </>
  );
}

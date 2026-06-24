import { X, CheckCircle2, XCircle, RefreshCw, Zap, Cpu } from 'lucide-react';
import type { SystemInfo } from '../types';

type Props = {
  systemInfo: SystemInfo;
  onClose: () => void;
  onRefresh: () => void;
};

function Row({ ok, title, children }: { ok: boolean; title: string; children: React.ReactNode }) {
  return (
    <div className="onboard-row">
      {ok ? <CheckCircle2 size={18} className="status-ok" /> : <XCircle size={18} className="status-bad" />}
      <div>
        <div className="onboard-title">{title}</div>
        {!ok && <div className="onboard-hint">{children}</div>}
      </div>
    </div>
  );
}

export function OnboardingModal({ systemInfo, onClose, onRefresh }: Props) {
  return (
    <div className="modal-backdrop">
      <div className="modal-content">
        <button className="close-btn" onClick={onClose}><X size={20} /></button>
        <h2 style={{ marginBottom: '0.25rem' }}>Welcome to Meeting Lens 👋</h2>
        <p className="modal-subtitle">Everything runs on your machine. Let's check you're set up.</p>

        <div className="onboard-list">
          <Row ok={systemInfo.ffmpeg_available} title="FFmpeg">
            Required to extract audio. Install from{' '}
            <a href="https://ffmpeg.org/download.html" target="_blank" rel="noreferrer">ffmpeg.org</a> and add it to your PATH.
          </Row>
          <Row ok={systemInfo.ollama.available} title="Local AI (Ollama)">
            Needed for offline summaries &amp; chat. Install <a href="https://ollama.com" target="_blank" rel="noreferrer">Ollama</a>,
            then run <code>ollama pull llama3.2</code>. You can also use a cloud key in Settings instead.
          </Row>
          <div className="onboard-row">
            {systemInfo.cuda_available ? <Zap size={18} className="status-ok" /> : <Cpu size={18} />}
            <div>
              <div className="onboard-title">
                {systemInfo.cuda_available ? 'GPU acceleration available' : 'Running on CPU'}
              </div>
              <div className="onboard-hint">
                {systemInfo.cuda_available
                  ? 'Transcription can use your GPU.'
                  : 'No GPU detected — the Tiny Whisper model is fast and recommended.'}
              </div>
            </div>
          </div>
        </div>

        <div className="onboard-actions">
          <button className="btn btn-outline" onClick={onRefresh}><RefreshCw size={15} /> Re-check</button>
          <button className="btn" onClick={onClose}>Get started</button>
        </div>
      </div>
    </div>
  );
}

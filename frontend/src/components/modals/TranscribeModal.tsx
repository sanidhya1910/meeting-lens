import { useState } from 'react';
import { X, AlertTriangle, Cpu } from 'lucide-react';
import { apiUrl } from '../../api';
import { useAsrModels } from '../../hooks/useAsrModels';
import { consumeSseStream } from '../../utils/sse';
import { FileDropZone } from '../FileDropZone';

type Props = {
  onClose: () => void;
  onSuccess: (meetingId: string) => void;
  cudaAvailable?: boolean;
};

export function TranscribeModal({ onClose, onSuccess, cudaAvailable = false }: Props) {
  const [files, setFiles] = useState<File[]>([]);
  const [title, setTitle] = useState('');
  const [asrModel, setAsrModel] = useState('tiny');
  const [useGpu, setUseGpu] = useState(cudaAvailable);
  const [transcribing, setTranscribing] = useState(false);
  const [progressText, setProgressText] = useState('');
  const [error, setError] = useState('');
  const asrModels = useAsrModels();
  const file = files[0] ?? null;

  const handleTranscribe = async () => {
    if (!file) return setError('Please select a file');
    setTranscribing(true);
    setError('');
    setProgressText('Extracting audio...');

    const formData = new FormData();
    formData.append('file', file);
    formData.append('asr_model', asrModel);
    formData.append('device', useGpu ? 'auto' : 'cpu');
    if (title.trim()) formData.append('title', title.trim());

    try {
      const response = await fetch(apiUrl('/api/transcribe'), { method: 'POST', body: formData });
      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        throw new Error(errBody.detail || 'Transcription request failed');
      }

      let completed = false;

      await consumeSseStream(response, data => {
        if (data.error) {
          throw new Error(String(data.error));
        }
        if (data.event === 'completed' && data.meeting_id) {
          completed = true;
          setTranscribing(false);
          onSuccess(String(data.meeting_id));
          return;
        }
        if (data.start != null && data.text != null) {
          setProgressText(`[${Number(data.start).toFixed(2)}s] ${String(data.text)}`);
        }
      });

      if (!completed) {
        setTranscribing(false);
        setError('Transcription finished but the server did not confirm save. Check Meeting Notes — your transcript may still be there.');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Transcription failed');
      setTranscribing(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-content">
        <button className="close-btn" onClick={onClose} disabled={transcribing}><X size={20} /></button>
        <h2 style={{ marginBottom: '1.5rem' }}>Transcribe Audio/Video</h2>

        {error && <div className="warning-box error-banner">{error}</div>}

        <div className="form-group">
          <FileDropZone
            label="Drop a video or audio file here, or click to browse"
            files={files}
            onFiles={setFiles}
            disabled={transcribing}
          />
        </div>

        <div className="form-group">
          <label>Meeting title (optional)</label>
          <input
            type="text"
            placeholder="Defaults to timestamp"
            value={title}
            onChange={e => setTitle(e.target.value)}
            disabled={transcribing}
          />
        </div>

        <div className="form-group">
          <label>Whisper Model</label>
          <select value={asrModel} onChange={e => setAsrModel(e.target.value)} disabled={transcribing}>
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
                <input
                  type="checkbox"
                  checked={useGpu}
                  onChange={e => setUseGpu(e.target.checked)}
                  disabled={transcribing}
                />
                <span className="slider" />
              </label>
              <span style={{ fontSize: '0.875rem' }}>{useGpu ? 'Use GPU if available' : 'CPU only'}</span>
            </div>
          </div>
        ) : (
          <div className="form-group">
            <div className="device-note"><Cpu size={15} /> Transcribing on CPU — the Tiny model is recommended for speed.</div>
          </div>
        )}
        {asrModel === 'large-v3' && !cudaAvailable && (
          <div className="warning-box">
            <AlertTriangle size={16} />
            Large models are very slow on CPU. Pick Tiny or Base unless you have time to wait.
          </div>
        )}

        {transcribing && (
          <div className="result-box" style={{ height: '100px', marginBottom: '1rem' }}>
            {progressText || 'Processing...'}
          </div>
        )}

        <button className="btn" onClick={handleTranscribe} disabled={transcribing || !file} style={{ width: '100%' }}>
          {transcribing ? <><div className="loader" /> Processing...</> : 'Start Transcription'}
        </button>
      </div>
    </div>
  );
}

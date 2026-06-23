import { useEffect, useRef, useState } from 'react';
import { X, Mic, Square, AlertTriangle } from 'lucide-react';
import { apiUrl } from '../../api';
import { useAsrModels } from '../../hooks/useAsrModels';
import { consumeSseStream } from '../../utils/sse';

type Props = {
  onClose: () => void;
  onSuccess: (meetingId: string) => void;
};

type Phase = 'idle' | 'recording' | 'transcribing';

function fmt(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function RecordModal({ onClose, onSuccess }: Props) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [title, setTitle] = useState('');
  const [asrModel, setAsrModel] = useState('tiny');
  const [elapsed, setElapsed] = useState(0);
  const [progressText, setProgressText] = useState('');
  const [error, setError] = useState('');

  const asrModels = useAsrModels();
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, []);

  const startRecording = async () => {
    setError('');
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('Recording is not supported in this browser.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      recorder.ondataavailable = e => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => transcribe();
      recorder.start();
      recorderRef.current = recorder;
      setPhase('recording');
      setElapsed(0);
      timerRef.current = window.setInterval(() => setElapsed(e => e + 1), 1000);
    } catch {
      setError('Microphone access was denied.');
    }
  };

  const stopRecording = () => {
    if (timerRef.current) window.clearInterval(timerRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
    recorderRef.current?.stop();
  };

  const transcribe = async () => {
    setPhase('transcribing');
    setProgressText('Uploading audio…');
    const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
    const formData = new FormData();
    formData.append('file', blob, 'recording.webm');
    formData.append('asr_model', asrModel);
    formData.append('device', 'auto');
    if (title.trim()) formData.append('title', title.trim());

    try {
      const response = await fetch(apiUrl('/api/transcribe'), { method: 'POST', body: formData });
      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        throw new Error(errBody.detail || 'Transcription request failed');
      }
      let completed = false;
      await consumeSseStream(response, data => {
        if (data.error) throw new Error(String(data.error));
        if (data.event === 'completed' && data.meeting_id) {
          completed = true;
          onSuccess(String(data.meeting_id));
          return;
        }
        if (data.start != null && data.text != null) {
          setProgressText(`[${Number(data.start).toFixed(1)}s] ${String(data.text)}`);
        }
      });
      if (!completed) {
        setError('Transcription finished but was not confirmed. Check Meeting Notes.');
        setPhase('idle');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Transcription failed');
      setPhase('idle');
    }
  };

  const busy = phase !== 'idle';

  return (
    <div className="modal-backdrop">
      <div className="modal-content">
        <button className="close-btn" onClick={onClose} disabled={phase === 'transcribing'}>
          <X size={20} />
        </button>
        <h2 style={{ marginBottom: '1.5rem' }}>Record Live Audio</h2>

        {error && <div className="warning-box error-banner">{error}</div>}

        <div className="record-stage">
          <div className={`record-pulse ${phase === 'recording' ? 'active' : ''}`}>
            <Mic size={32} />
          </div>
          <div className="record-timer">{fmt(elapsed)}</div>
          <div className="record-hint">
            {phase === 'idle' && 'Click record and start speaking.'}
            {phase === 'recording' && 'Recording… click stop when finished.'}
            {phase === 'transcribing' && 'Transcribing on your device…'}
          </div>
        </div>

        <div className="form-group">
          <label>Meeting title (optional)</label>
          <input
            type="text"
            placeholder="Defaults to timestamp"
            value={title}
            onChange={e => setTitle(e.target.value)}
            disabled={busy}
          />
        </div>

        <div className="form-group">
          <label>Whisper Model</label>
          <select value={asrModel} onChange={e => setAsrModel(e.target.value)} disabled={busy}>
            {asrModels.map(m => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </div>

        {phase === 'transcribing' && (
          <div className="result-box" style={{ height: '90px', marginBottom: '1rem' }}>
            {progressText || 'Processing…'}
          </div>
        )}

        {phase !== 'transcribing' && (
          <button
            className={phase === 'recording' ? 'btn btn-danger' : 'btn'}
            onClick={phase === 'recording' ? stopRecording : startRecording}
            style={{ width: '100%' }}
          >
            {phase === 'recording' ? (
              <><Square size={16} /> Stop &amp; Transcribe</>
            ) : (
              <><Mic size={16} /> Start Recording</>
            )}
          </button>
        )}

        {phase === 'transcribing' && (
          <div className="warning-box" style={{ marginTop: 0 }}>
            <AlertTriangle size={16} /> Keep this window open until transcription completes.
          </div>
        )}
      </div>
    </div>
  );
}

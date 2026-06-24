import { useMemo, useRef, useState } from 'react';
import { Users, Check, X } from 'lucide-react';
import { apiUrl } from '../api';
import { parseTranscript, isTimestamped, uniqueSpeakers } from '../utils/transcript';

type Props = {
  meetingId: string;
  transcript: string;
  hasAudio: boolean;
  onRenameSpeaker?: (oldLabel: string, newLabel: string) => void;
};

function fmt(t: number): string {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

// Stable color per speaker for quick visual scanning.
const SPEAKER_COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#06b6d4'];

export function TranscriptPlayer({ meetingId, transcript, hasAudio, onRenameSpeaker }: Props) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [current, setCurrent] = useState(0);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  const segments = useMemo(() => parseTranscript(transcript), [transcript]);
  const timestamped = isTimestamped(transcript);
  const speakers = useMemo(() => uniqueSpeakers(segments), [segments]);
  const colorFor = (sp: string) => SPEAKER_COLORS[speakers.indexOf(sp) % SPEAKER_COLORS.length];

  const talkTime = useMemo(() => {
    const map: Record<string, number> = {};
    for (const s of segments) {
      if (s.speaker) map[s.speaker] = (map[s.speaker] ?? 0) + Math.max(0, s.end - s.start);
    }
    return map;
  }, [segments]);
  const totalTalk = Object.values(talkTime).reduce((a, b) => a + b, 0);

  const seek = (t: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = t;
    audio.play().catch(() => {});
  };

  const commitRename = (oldLabel: string) => {
    const next = draft.trim();
    if (next && next !== oldLabel) onRenameSpeaker?.(oldLabel, next);
    setEditing(null);
  };

  if (!timestamped) {
    return (
      <>
        {hasAudio && (
          <audio ref={audioRef} controls className="transcript-audio" src={apiUrl(`/api/meetings/${meetingId}/audio`)} />
        )}
        <div className="result-box transcript-view">{transcript}</div>
      </>
    );
  }

  return (
    <div className="transcript-player">
      {hasAudio && (
        <audio
          ref={audioRef}
          controls
          className="transcript-audio"
          src={apiUrl(`/api/meetings/${meetingId}/audio`)}
          onTimeUpdate={e => setCurrent((e.target as HTMLAudioElement).currentTime)}
        />
      )}

      {speakers.length > 0 && onRenameSpeaker && (
        <div className="speaker-legend">
          <Users size={14} />
          {speakers.map(sp =>
            editing === sp ? (
              <span key={sp} className="speaker-edit">
                <input
                  autoFocus
                  value={draft}
                  onChange={e => setDraft(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') commitRename(sp);
                    if (e.key === 'Escape') setEditing(null);
                  }}
                />
                <button className="meeting-icon-btn" onClick={() => commitRename(sp)}><Check size={13} /></button>
                <button className="meeting-icon-btn" onClick={() => setEditing(null)}><X size={13} /></button>
              </span>
            ) : (
              <button
                key={sp}
                className="speaker-chip"
                style={{ borderColor: colorFor(sp), color: colorFor(sp) }}
                title="Click to rename this speaker everywhere"
                onClick={() => { setEditing(sp); setDraft(sp); }}
              >
                {sp}
              </button>
            ),
          )}
        </div>
      )}

      {speakers.length > 0 && totalTalk > 0 && (
        <div className="talktime">
          {speakers.map(sp => {
            const t = talkTime[sp] ?? 0;
            const pct = Math.round((t / totalTalk) * 100);
            return (
              <div key={sp} className="talktime-row">
                <span className="talktime-name" style={{ color: colorFor(sp) }}>{sp}</span>
                <div className="talktime-bar">
                  <div className="talktime-fill" style={{ width: `${pct}%`, background: colorFor(sp) }} />
                </div>
                <span className="talktime-val">{pct}% · {fmt(t)}</span>
              </div>
            );
          })}
        </div>
      )}

      <div className="segment-list">
        {segments.map((seg, i) => {
          const active = hasAudio && current >= seg.start && current < seg.end;
          return (
            <div
              key={i}
              className={`segment ${active ? 'active' : ''} ${hasAudio ? 'seekable' : ''}`}
              onClick={() => hasAudio && seek(seg.start)}
            >
              <span className="segment-time">{fmt(seg.start)}</span>
              <div className="segment-text">
                {seg.speaker && (
                  <span className="segment-speaker" style={{ color: colorFor(seg.speaker) }}>
                    {seg.speaker}
                  </span>
                )}
                {seg.text}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

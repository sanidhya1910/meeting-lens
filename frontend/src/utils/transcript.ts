import type { TranscriptSegment } from '../types';

const LINE_RE = /^\[(\d+(?:\.\d+)?)s\s*->\s*(\d+(?:\.\d+)?)s\]\s*(.*)$/;
// Only treat a leading "Label:" as a speaker when it looks like one
// (e.g. "Speaker 1", "Alice", "Alice Smith") — avoids eating sentence colons.
const SPEAKER_RE = /^(Speaker \d+|[A-Z][\w'-]*(?: [A-Z][\w'-]*){0,2}):\s+(.*)$/;

/** Parse our "[12.30s -> 15.10s] Speaker 1: text" transcript format into segments. */
export function parseTranscript(transcript: string): TranscriptSegment[] {
  const segments: TranscriptSegment[] = [];
  for (const raw of transcript.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const m = LINE_RE.exec(line);
    if (!m) continue;
    let speaker: string | null = null;
    let text = m[3];
    const sp = SPEAKER_RE.exec(text);
    if (sp) {
      speaker = sp[1];
      text = sp[2];
    }
    segments.push({ start: parseFloat(m[1]), end: parseFloat(m[2]), speaker, text });
  }
  return segments;
}

/** True if the transcript uses our timestamped format (vs. free-form edited text). */
export function isTimestamped(transcript: string): boolean {
  return LINE_RE.test(transcript.trim().split('\n')[0] ?? '');
}

export function uniqueSpeakers(segments: TranscriptSegment[]): string[] {
  return [...new Set(segments.map(s => s.speaker).filter((s): s is string => !!s))];
}

function pad(n: number, len = 2): string {
  return String(Math.floor(n)).padStart(len, '0');
}

function timestamp(seconds: number, sep: ','): string {
  const ms = Math.round((seconds - Math.floor(seconds)) * 1000);
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${pad(h)}:${pad(m)}:${pad(s)}${sep}${pad(ms, 3)}`;
}

export function segmentsToSrt(segments: TranscriptSegment[]): string {
  return segments
    .map((seg, i) => {
      const label = seg.speaker ? `${seg.speaker}: ` : '';
      return `${i + 1}\n${timestamp(seg.start, ',')} --> ${timestamp(seg.end, ',')}\n${label}${seg.text}\n`;
    })
    .join('\n');
}

export function segmentsToVtt(segments: TranscriptSegment[]): string {
  const body = segments
    .map(seg => {
      const label = seg.speaker ? `<v ${seg.speaker}>` : '';
      const t = (x: number) => timestamp(x, ',').replace(',', '.');
      return `${t(seg.start)} --> ${t(seg.end)}\n${label}${seg.text}\n`;
    })
    .join('\n');
  return `WEBVTT\n\n${body}`;
}

/** Flatten a summary (arbitrary JSON) into plain text for full-text search. */
export function summaryToText(summary: unknown): string {
  if (summary == null) return '';
  if (typeof summary === 'string') return summary;
  if (typeof summary === 'number' || typeof summary === 'boolean') return String(summary);
  if (Array.isArray(summary)) return summary.map(summaryToText).join(' ');
  if (typeof summary === 'object') {
    return Object.entries(summary as Record<string, unknown>)
      .map(([k, v]) => `${k} ${summaryToText(v)}`)
      .join(' ');
  }
  return '';
}

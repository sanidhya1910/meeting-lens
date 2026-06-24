import { useMemo, useState, useEffect, useRef } from 'react';
import { Search, FileText, CornerDownLeft } from 'lucide-react';
import type { Meeting } from '../types';
import { summaryToText } from '../utils/transcript';

type Props = {
  meetings: Meeting[];
  onSelect: (id: string) => void;
  onClose: () => void;
};

type Hit = {
  meeting: Meeting;
  where: string;
  snippet: string;
};

function snippetAround(text: string, q: string): string {
  const idx = text.toLowerCase().indexOf(q);
  if (idx === -1) return '';
  const start = Math.max(0, idx - 40);
  const end = Math.min(text.length, idx + q.length + 60);
  return (start > 0 ? '…' : '') + text.slice(start, end).replace(/\s+/g, ' ').trim() + (end < text.length ? '…' : '');
}

export function SearchPalette({ meetings, onSelect, onClose }: Props) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const hits = useMemo<Hit[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const results: Hit[] = [];
    for (const m of meetings) {
      if (m.title.toLowerCase().includes(q)) {
        results.push({ meeting: m, where: 'Title', snippet: m.title });
        continue;
      }
      if ((m.tags ?? []).some(t => t.toLowerCase().includes(q))) {
        results.push({ meeting: m, where: 'Tag', snippet: (m.tags ?? []).join(', ') });
        continue;
      }
      if (m.transcript.toLowerCase().includes(q)) {
        results.push({ meeting: m, where: 'Transcript', snippet: snippetAround(m.transcript, q) });
        continue;
      }
      const summaryText = summaryToText(m.summary);
      if (summaryText.toLowerCase().includes(q)) {
        results.push({ meeting: m, where: 'Summary', snippet: snippetAround(summaryText, q) });
      }
    }
    return results.slice(0, 30);
  }, [meetings, query]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  const choose = (id: string) => {
    onSelect(id);
    onClose();
  };

  return (
    <div className="modal-backdrop palette-backdrop" onClick={onClose}>
      <div className="palette" onClick={e => e.stopPropagation()}>
        <div className="palette-input">
          <Search size={18} />
          <input
            ref={inputRef}
            placeholder="Search titles, transcripts, summaries, tags…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Escape') onClose();
              if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(a + 1, hits.length - 1)); }
              if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(a - 1, 0)); }
              if (e.key === 'Enter' && hits[active]) choose(hits[active].meeting.id);
            }}
          />
          <kbd className="palette-kbd">Esc</kbd>
        </div>
        <div className="palette-results">
          {query && hits.length === 0 && <div className="palette-empty">No matches.</div>}
          {hits.map((h, i) => (
            <button
              key={h.meeting.id + h.where}
              className={`palette-item ${i === active ? 'active' : ''}`}
              onMouseEnter={() => setActive(i)}
              onClick={() => choose(h.meeting.id)}
            >
              <FileText size={16} className="palette-item-icon" />
              <div className="palette-item-body">
                <div className="palette-item-title">
                  {h.meeting.title}
                  <span className="palette-where">{h.where}</span>
                </div>
                {h.snippet && <div className="palette-snippet">{h.snippet}</div>}
              </div>
              {i === active && <CornerDownLeft size={14} className="palette-enter" />}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

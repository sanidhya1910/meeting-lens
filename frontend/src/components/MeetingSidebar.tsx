import { useMemo, useState } from 'react';
import { Search, Trash2, Pencil, Check, X, Tag } from 'lucide-react';
import type { Meeting } from '../types';

type SortKey = 'newest' | 'oldest' | 'title';
type FilterKey = 'all' | 'summarized' | 'unsummarized';

type Props = {
  meetings: Meeting[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
};

export function MeetingSidebar({ meetings, selectedId, onSelect, onDelete, onRename }: Props) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('newest');
  const [filter, setFilter] = useState<FilterKey>('all');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = meetings.filter(m => {
      if (filter === 'summarized' && !m.summary) return false;
      if (filter === 'unsummarized' && m.summary) return false;
      if (!q) return true;
      const inTitle = m.title.toLowerCase().includes(q);
      const inTags = (m.tags ?? []).some(t => t.toLowerCase().includes(q));
      return inTitle || inTags;
    });
    list = [...list].sort((a, b) => {
      if (sort === 'title') return a.title.localeCompare(b.title);
      const da = new Date(a.date).getTime();
      const db = new Date(b.date).getTime();
      return sort === 'newest' ? db - da : da - db;
    });
    return list;
  }, [meetings, query, sort, filter]);

  const startEdit = (m: Meeting, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(m.id);
    setDraftTitle(m.title);
  };

  const commitEdit = (id: string) => {
    const t = draftTitle.trim();
    if (t) onRename(id, t);
    setEditingId(null);
  };

  return (
    <>
      <div className="sidebar-search">
        <Search size={15} />
        <input
          type="text"
          placeholder="Search meetings & tags…"
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
      </div>

      <div className="sidebar-filters">
        <select value={filter} onChange={e => setFilter(e.target.value as FilterKey)}>
          <option value="all">All</option>
          <option value="summarized">Summarized</option>
          <option value="unsummarized">No summary</option>
        </select>
        <select value={sort} onChange={e => setSort(e.target.value as SortKey)}>
          <option value="newest">Newest</option>
          <option value="oldest">Oldest</option>
          <option value="title">A–Z</option>
        </select>
      </div>

      <div className="meeting-list">
        {filtered.length === 0 && (
          <div className="meeting-list-empty">
            {meetings.length === 0 ? 'No meetings yet.' : 'No matches.'}
          </div>
        )}
        {filtered.map(m => (
          <div
            key={m.id}
            className={`meeting-list-item ${selectedId === m.id ? 'active' : ''}`}
            onClick={() => editingId !== m.id && onSelect(m.id)}
          >
            {editingId === m.id ? (
              <div className="meeting-rename-row" onClick={e => e.stopPropagation()}>
                <input
                  autoFocus
                  value={draftTitle}
                  onChange={e => setDraftTitle(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') commitEdit(m.id);
                    if (e.key === 'Escape') setEditingId(null);
                  }}
                />
                <button className="meeting-icon-btn" title="Save" onClick={() => commitEdit(m.id)}>
                  <Check size={14} />
                </button>
                <button className="meeting-icon-btn" title="Cancel" onClick={() => setEditingId(null)}>
                  <X size={14} />
                </button>
              </div>
            ) : (
              <>
                <div className="meeting-list-item-row">
                  <div className="meeting-title" title={m.title}>{m.title}</div>
                  <div className="meeting-actions">
                    <button className="meeting-icon-btn" title="Rename" onClick={e => startEdit(m, e)}>
                      <Pencil size={13} />
                    </button>
                    <button
                      className="meeting-icon-btn meeting-delete-btn"
                      title="Delete meeting"
                      onClick={e => {
                        e.stopPropagation();
                        onDelete(m.id);
                      }}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
                <div className="meeting-date">{new Date(m.date).toLocaleString()}</div>
                <div className="meeting-meta-row">
                  {!m.summary && <span className="meeting-no-summary">No summary</span>}
                  {(m.tags ?? []).slice(0, 3).map(t => (
                    <span key={t} className="meeting-tag-mini"><Tag size={9} /> {t}</span>
                  ))}
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </>
  );
}

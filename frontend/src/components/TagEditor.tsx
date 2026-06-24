import { useState } from 'react';
import { Tag, X, Plus, Sparkles } from 'lucide-react';

type Props = {
  tags: string[];
  onChange: (tags: string[]) => void;
  onSuggest?: () => Promise<string[]>;
};

export function TagEditor({ tags, onChange, onSuggest }: Props) {
  const [adding, setAdding] = useState(false);
  const [value, setValue] = useState('');
  const [suggesting, setSuggesting] = useState(false);

  const add = () => {
    const t = value.trim();
    if (t && !tags.includes(t)) onChange([...tags, t]);
    setValue('');
    setAdding(false);
  };

  const suggest = async () => {
    if (!onSuggest) return;
    setSuggesting(true);
    try {
      const suggested = await onSuggest();
      const merged = [...tags];
      for (const t of suggested) if (t && !merged.includes(t)) merged.push(t);
      onChange(merged);
    } finally {
      setSuggesting(false);
    }
  };

  return (
    <div className="tag-editor">
      <Tag size={14} className="tag-editor-icon" />
      {tags.map(t => (
        <span key={t} className="tag-pill">
          {t}
          <button onClick={() => onChange(tags.filter(x => x !== t))} title="Remove tag">
            <X size={11} />
          </button>
        </span>
      ))}
      {adding ? (
        <input
          autoFocus
          className="tag-input"
          value={value}
          placeholder="tag…"
          onChange={e => setValue(e.target.value)}
          onBlur={add}
          onKeyDown={e => {
            if (e.key === 'Enter') add();
            if (e.key === 'Escape') {
              setValue('');
              setAdding(false);
            }
          }}
        />
      ) : (
        <button className="tag-add-btn" onClick={() => setAdding(true)}>
          <Plus size={12} /> Add tag
        </button>
      )}
      {onSuggest && (
        <button className="tag-add-btn" onClick={suggest} disabled={suggesting}>
          <Sparkles size={12} /> {suggesting ? 'Suggesting…' : 'Suggest'}
        </button>
      )}
    </div>
  );
}

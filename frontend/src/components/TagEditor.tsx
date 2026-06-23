import { useState } from 'react';
import { Tag, X, Plus } from 'lucide-react';

type Props = {
  tags: string[];
  onChange: (tags: string[]) => void;
};

export function TagEditor({ tags, onChange }: Props) {
  const [adding, setAdding] = useState(false);
  const [value, setValue] = useState('');

  const add = () => {
    const t = value.trim();
    if (t && !tags.includes(t)) onChange([...tags, t]);
    setValue('');
    setAdding(false);
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
    </div>
  );
}

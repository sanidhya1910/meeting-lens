import { useState } from 'react';
import { X, Save, Trash2, Copy, Plus, Sparkles } from 'lucide-react';
import axios from 'axios';
import { apiUrl } from '../../api';
import { useToast } from '../Toast';
import type { Template } from '../../types';

type Props = {
  templates: Template[];
  onChange: () => void;
  onClose: () => void;
  onOpenGenerator: () => void;
};

const STARTER = JSON.stringify(
  {
    name: 'New Template',
    description: 'What this summary captures.',
    sections: [
      { title: 'Summary', instruction: 'A short overview of the meeting', format: 'paragraph' },
      { title: 'Decisions', instruction: 'Key decisions made', format: 'list' },
    ],
  },
  null,
  2,
);

export function TemplatesModal({ templates, onChange, onClose, onOpenGenerator }: Props) {
  const toast = useToast();
  const [selected, setSelected] = useState(templates[0]?.name ?? '');
  const current = templates.find(t => t.name === selected);
  const [content, setContent] = useState(current?.content ?? STARTER);
  const [newName, setNewName] = useState('');

  const pick = (name: string) => {
    setSelected(name);
    setContent(templates.find(t => t.name === name)?.content ?? '');
  };

  const save = async (name: string, body: string) => {
    try {
      JSON.parse(body);
    } catch {
      return toast.error('Content is not valid JSON');
    }
    try {
      await axios.put(apiUrl(`/api/templates/${encodeURIComponent(name)}`), { content: body });
      toast.success('Template saved');
      onChange();
    } catch (err: unknown) {
      const ax = err as { response?: { data?: { detail?: string } } };
      toast.error(ax.response?.data?.detail || 'Save failed');
    }
  };

  const remove = async () => {
    if (!selected) return;
    try {
      await axios.delete(apiUrl(`/api/templates/${encodeURIComponent(selected)}`));
      toast.success('Template deleted');
      onChange();
      onClose();
    } catch {
      toast.error('Delete failed');
    }
  };

  const duplicate = () => {
    if (!selected) return;
    const base = selected.replace(/\.json$/, '');
    save(`${base}_copy`, content);
  };

  const createNew = () => {
    const name = newName.trim();
    if (!name) return toast.error('Enter a template name');
    save(name, STARTER);
    setNewName('');
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-content modal-content-wide">
        <button className="close-btn" onClick={onClose}><X size={20} /></button>
        <h2 style={{ marginBottom: '0.25rem' }}>Manage Templates</h2>
        <p className="modal-subtitle">Edit, duplicate, or delete your summary templates — or generate one with AI.</p>

        <div className="form-group">
          <label>Template</label>
          <select value={selected} onChange={e => pick(e.target.value)}>
            {templates.length === 0 && <option value="">No templates yet</option>}
            {templates.map(t => (
              <option key={t.name} value={t.name}>{t.name}</option>
            ))}
          </select>
        </div>

        {selected && (
          <>
            <div className="form-group">
              <label>Content (JSON)</label>
              <textarea
                className="result-box transcript-editor"
                style={{ height: '260px' }}
                value={content}
                onChange={e => setContent(e.target.value)}
              />
            </div>
            <div className="card-header-actions" style={{ marginBottom: '1.25rem' }}>
              <button className="btn btn-sm" onClick={() => save(selected, content)}><Save size={15} /> Save</button>
              <button className="btn btn-outline btn-sm" onClick={duplicate}><Copy size={15} /> Duplicate</button>
              <button className="btn btn-outline btn-sm" onClick={remove}><Trash2 size={15} /> Delete</button>
            </div>
          </>
        )}

        <div className="form-group">
          <label>New blank template</label>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <input
              type="text"
              placeholder="e.g. Standup Notes"
              value={newName}
              onChange={e => setNewName(e.target.value)}
            />
            <button className="btn btn-outline" onClick={createNew}><Plus size={15} /> Create</button>
          </div>
        </div>

        <button className="btn btn-outline" style={{ width: '100%' }} onClick={onOpenGenerator}>
          <Sparkles size={16} /> Generate a template with AI instead
        </button>
      </div>
    </div>
  );
}

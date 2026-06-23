import { useState } from 'react';
import { X } from 'lucide-react';
import axios from 'axios';
import { apiUrl } from '../../api';
import type { LlmSettings } from '../../types';

type Props = LlmSettings & {
  onClose: () => void;
  onSuccess: () => void;
};

export function TemplateModal({ onClose, onSuccess, provider, apiKey, baseUrl, modelName }: Props) {
  const [desc, setDesc] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleGenerate = async () => {
    if (!desc || !name) return setError('Please provide name and description.');
    setLoading(true);
    setError('');
    const formData = new FormData();
    formData.append('description', desc);
    formData.append('template_name', name);
    formData.append('llm_provider', provider);
    formData.append('llm_api_key', apiKey);
    formData.append('llm_base_url', baseUrl);
    formData.append('llm_model', modelName);

    try {
      await axios.post(apiUrl('/api/templates/generate'), formData);
      onSuccess();
    } catch (err: unknown) {
      const ax = err as { response?: { data?: { detail?: string } } };
      setError(ax.response?.data?.detail || (err instanceof Error ? err.message : 'Failed'));
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-content">
        <button className="close-btn" onClick={onClose} disabled={loading}><X size={20} /></button>
        <h2 style={{ marginBottom: '1.5rem' }}>Create Custom JSON Template</h2>

        {error && <div className="warning-box error-banner">{error}</div>}

        <div className="form-group">
          <label>Template Name</label>
          <input
            type="text"
            placeholder="e.g. Sales Call Analysis"
            value={name}
            onChange={e => setName(e.target.value)}
            disabled={loading}
          />
        </div>
        <div className="form-group">
          <label>Description of desired JSON structure</label>
          <textarea
            placeholder="e.g. Extract client budget, pain points as a list, and next steps."
            value={desc}
            onChange={e => setDesc(e.target.value)}
            disabled={loading}
          />
        </div>

        <button className="btn" onClick={handleGenerate} disabled={loading || !desc || !name} style={{ width: '100%' }}>
          {loading ? <><div className="loader" /> Generating...</> : 'Generate Template via LLM'}
        </button>
      </div>
    </div>
  );
}

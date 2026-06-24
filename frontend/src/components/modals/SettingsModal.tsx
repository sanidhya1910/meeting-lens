import { X, Cpu, Zap, CheckCircle2, XCircle, RefreshCw } from 'lucide-react';
import type { SystemInfo } from '../../types';

type Props = {
  onClose: () => void;
  provider: string;
  setProvider: (v: string) => void;
  apiKey: string;
  setApiKey: (v: string) => void;
  baseUrl: string;
  setBaseUrl: (v: string) => void;
  modelName: string;
  setModelName: (v: string) => void;
  embedModel: string;
  setEmbedModel: (v: string) => void;
  systemInfo: SystemInfo;
  onRefreshSystem: () => void;
};

const MODEL_SUGGESTIONS: Record<string, string[]> = {
  openai: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini'],
  claude: ['claude-haiku-4-5', 'claude-sonnet-4-6', 'claude-opus-4-8'],
  ollama: ['llama3.2', 'llama3.1', 'qwen2.5', 'mistral', 'phi3'],
  lmstudio: [],
  openai_compatible: [],
};

const NEEDS_KEY = new Set(['openai', 'claude']);
const NEEDS_BASE_URL = new Set(['lmstudio', 'openai_compatible']);

export function SettingsModal({
  onClose,
  provider,
  setProvider,
  apiKey,
  setApiKey,
  baseUrl,
  setBaseUrl,
  modelName,
  setModelName,
  embedModel,
  setEmbedModel,
  systemInfo,
  onRefreshSystem,
}: Props) {
  const ollama = systemInfo.ollama;
  const ollamaModels = MODEL_SUGGESTIONS.ollama.concat(
    ollama.models.filter(m => !MODEL_SUGGESTIONS.ollama.includes(m)),
  );
  const suggestions = provider === 'ollama' ? ollamaModels : MODEL_SUGGESTIONS[provider] ?? [];

  return (
    <div className="modal-backdrop">
      <div className="modal-content">
        <button className="close-btn" onClick={onClose}><X size={20} /></button>
        <h2 style={{ marginBottom: '0.5rem' }}>Settings</h2>
        <p className="modal-subtitle">Transcription always runs locally. Choose where summaries are generated.</p>

        <div className="system-status">
          <div className="system-status-row">
            {systemInfo.cuda_available ? <Zap size={16} className="status-ok" /> : <Cpu size={16} />}
            <span>{systemInfo.cuda_available ? 'GPU (CUDA) detected' : 'Running on CPU'}</span>
          </div>
          <div className="system-status-row">
            {ollama.available ? <CheckCircle2 size={16} className="status-ok" /> : <XCircle size={16} className="status-bad" />}
            <span>
              {ollama.available
                ? `Ollama connected (${ollama.models.length} model${ollama.models.length === 1 ? '' : 's'})`
                : 'Ollama not detected'}
            </span>
            <button className="icon-btn-inline" title="Re-check" onClick={onRefreshSystem}>
              <RefreshCw size={13} />
            </button>
          </div>
        </div>

        <div className="form-group">
          <label>Summarization Provider</label>
          <select value={provider} onChange={e => setProvider(e.target.value)}>
            <option value="ollama">Ollama — fully local, no API key</option>
            <option value="lmstudio">LM Studio — local</option>
            <option value="openai">OpenAI (ChatGPT)</option>
            <option value="claude">Anthropic (Claude)</option>
            <option value="openai_compatible">OpenAI Compatible (any endpoint)</option>
          </select>
        </div>

        {provider === 'ollama' && !ollama.available && (
          <div className="warning-box">
            Ollama isn't running. Install it from ollama.com, then run{' '}
            <code>ollama pull llama3.2</code> and start the app.
          </div>
        )}

        {NEEDS_KEY.has(provider) && (
          <div className="form-group">
            <label>API Key</label>
            <input
              type="password"
              placeholder="Enter API Key"
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
            />
          </div>
        )}

        {(NEEDS_BASE_URL.has(provider) || provider === 'ollama') && (
          <div className="form-group">
            <label>Base URL {provider === 'ollama' ? '(optional)' : ''}</label>
            <input
              type="text"
              placeholder={
                provider === 'lmstudio'
                  ? 'http://localhost:1234/v1'
                  : provider === 'ollama'
                  ? `${ollama.base_url}/v1`
                  : 'https://api.example.com/v1'
              }
              value={baseUrl}
              onChange={e => setBaseUrl(e.target.value)}
            />
          </div>
        )}

        <div className="form-group">
          <label>Model Name</label>
          <input
            type="text"
            list="model-suggestions"
            placeholder={suggestions[0] ?? 'model name'}
            value={modelName}
            onChange={e => setModelName(e.target.value)}
          />
          <datalist id="model-suggestions">
            {suggestions.map(m => (
              <option key={m} value={m} />
            ))}
          </datalist>
          {suggestions.length > 0 && (
            <div className="model-chips">
              {suggestions.slice(0, 5).map(m => (
                <button key={m} className="model-chip" onClick={() => setModelName(m)}>
                  {m}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="form-group">
          <label>Embedding Model <span className="label-hint">(for "Ask Library" search)</span></label>
          <input
            type="text"
            placeholder={provider === 'openai' ? 'text-embedding-3-small' : 'nomic-embed-text'}
            value={embedModel}
            onChange={e => setEmbedModel(e.target.value)}
          />
          <div className="device-note" style={{ marginTop: '0.4rem' }}>
            {provider === 'claude'
              ? 'Claude has no embeddings API — library search falls back to local Ollama (nomic-embed-text).'
              : provider === 'openai'
              ? 'Leave blank to use text-embedding-3-small.'
              : 'Leave blank to use nomic-embed-text. Run: ollama pull nomic-embed-text'}
          </div>
        </div>

        <button className="btn" onClick={onClose} style={{ width: '100%', marginTop: '1rem' }}>
          Save &amp; Close
        </button>
      </div>
    </div>
  );
}

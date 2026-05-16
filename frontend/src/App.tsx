import { useState, useEffect } from 'react';
import { UploadCloud, Video, Mic, BrainCircuit, Cpu, Settings2, FileJson, Play } from 'lucide-react';
import axios from 'axios';
import './index.css';

function App() {
  const [file, setFile] = useState<File | null>(null);
  const [asrModel, setAsrModel] = useState('base');
  const [useGpu, setUseGpu] = useState(true);
  const [provider, setProvider] = useState('openai');
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [modelName, setModelName] = useState('gpt-3.5-turbo');
  const [jsonTemplate, setJsonTemplate] = useState('{\n  "summary": "",\n  "action_items": [],\n  "key_points": []\n}');
  const [availableTemplates, setAvailableTemplates] = useState<{name: string, content: string}[]>([]);
  const [selectedTemplateName, setSelectedTemplateName] = useState('');
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [results, setResults] = useState<{ transcript: str, summary: any } | null>(null);

  const ASR_MODELS = [
    { id: 'tiny', name: 'Tiny (fastest, lowest accuracy, ~39MB)' },
    { id: 'base', name: 'Base (~74MB)' },
    { id: 'small', name: 'Small (~241MB)' },
    { id: 'medium', name: 'Medium (~769MB)' },
    { id: 'large-v3', name: 'Large v3 (slowest, highest accuracy, ~1.5GB)' }
  ];

  useEffect(() => {
    // Fetch available templates on component mount
    axios.get('http://localhost:8000/api/templates')
      .then(res => {
        const templates = res.data.templates;
        setAvailableTemplates(templates);
        if (templates.length > 0) {
          setSelectedTemplateName(templates[0].name);
          setJsonTemplate(templates[0].content);
        }
      })
      .catch(err => console.error("Could not fetch templates:", err));
  }, []);

  const handleTemplateChange = (name: string) => {
    setSelectedTemplateName(name);
    const tmpl = availableTemplates.find(t => t.name === name);
    if (tmpl) {
      setJsonTemplate(tmpl.content);
    }
  };

  const handleProcess = async () => {
    if (!file) {
      setError('Please select a video file to process.');
      return;
    }
    setError('');
    setLoading(true);
    setResults(null);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('asr_model', asrModel);
    formData.append('device', useGpu ? 'cuda' : 'cpu');
    formData.append('llm_provider', provider);
    formData.append('llm_api_key', apiKey);
    formData.append('llm_base_url', baseUrl);
    formData.append('llm_model', modelName);
    formData.append('json_template', jsonTemplate);

    try {
      const response = await axios.post('http://localhost:8000/api/process', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setResults(response.data);
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'An error occurred during processing.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app-container">
      <header>
        <h1>Pipeline Lens</h1>
        <p>Extract, Transcribe, and Summarize Video Content Automatically</p>
      </header>

      {error && <div className="error-msg">{error}</div>}

      <div className="main-grid">
        <div className="card">
          <h2 className="card-title"><Video size={20} /> Input & Audio (ASR)</h2>
          
          <div className="form-group">
            <div className="file-upload">
              <UploadCloud size={32} color="var(--primary)" style={{ marginBottom: '1rem' }} />
              <p>{file ? file.name : "Click or drag video file here to upload"}</p>
              <input type="file" accept="video/*" onChange={(e) => setFile(e.target.files?.[0] || null)} />
            </div>
          </div>

          <div className="form-group">
            <label>ASR Model (Whisper)</label>
            <select value={asrModel} onChange={(e) => setAsrModel(e.target.value)}>
              {ASR_MODELS.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>

          <div className="form-group">
            <label>Compute Device</label>
            <div className="switch-wrapper">
              <label className="switch">
                <input type="checkbox" checked={useGpu} onChange={(e) => setUseGpu(e.target.checked)} />
                <span className="slider"></span>
              </label>
              <span style={{ fontSize: '0.875rem' }}>{useGpu ? 'GPU (CUDA)' : 'CPU'}</span>
            </div>
          </div>
        </div>

        <div className="card">
          <h2 className="card-title"><BrainCircuit size={20} /> Language Model</h2>
          
          <div className="form-group">
            <label>LLM Provider</label>
            <select value={provider} onChange={(e) => setProvider(e.target.value)}>
              <option value="openai">OpenAI (ChatGPT)</option>
              <option value="claude">Anthropic (Claude)</option>
              <option value="lmstudio">LM Studio (Local)</option>
              <option value="openai_compatible">OpenAI Compatible (Any)</option>
            </select>
          </div>

          <div className="form-group">
            <label>API Key {['lmstudio'].includes(provider) ? '(Optional)' : ''}</label>
            <input 
              type="password" 
              placeholder="Enter API Key" 
              value={apiKey} 
              onChange={(e) => setApiKey(e.target.value)} 
            />
          </div>

          {['lmstudio', 'openai_compatible'].includes(provider) && (
            <div className="form-group">
              <label>Base URL</label>
              <input 
                type="text" 
                placeholder={provider === 'lmstudio' ? 'http://localhost:1234/v1' : 'https://api.example.com/v1'} 
                value={baseUrl} 
                onChange={(e) => setBaseUrl(e.target.value)} 
              />
            </div>
          )}

          <div className="form-group">
            <label>Model Name</label>
            <input 
              type="text" 
              placeholder="e.g. gpt-4o, claude-3-opus-20240229, local-model" 
              value={modelName} 
              onChange={(e) => setModelName(e.target.value)} 
            />
          </div>
        </div>

        <div className="card" style={{ gridColumn: '1 / -1' }}>
          <h2 className="card-title"><FileJson size={20} /> Output Template</h2>
          
          {availableTemplates.length > 0 && (
            <div className="form-group">
              <label>Select Template</label>
              <select 
                value={selectedTemplateName} 
                onChange={(e) => handleTemplateChange(e.target.value)}
                style={{ marginBottom: '1rem' }}
              >
                {availableTemplates.map(t => (
                  <option key={t.name} value={t.name}>{t.name}</option>
                ))}
              </select>
            </div>
          )}

          <div className="form-group">
            <label>JSON Structure (Editable)</label>
            <textarea 
              value={jsonTemplate} 
              onChange={(e) => setJsonTemplate(e.target.value)}
              placeholder="Define your desired JSON output format here..."
            />
          </div>

          <button className="btn" onClick={handleProcess} disabled={loading || !file}>
            {loading ? (
              <><div className="loader"></div> Processing...</>
            ) : (
              <><Play size={18} /> Start Pipeline</>
            )}
          </button>
        </div>

        {results && (
          <>
            <div className="card">
              <h2 className="card-title"><Mic size={20} /> Transcript Output</h2>
              <div className="result-box">
                {results.transcript}
              </div>
            </div>
            
            <div className="card">
              <h2 className="card-title"><FileJson size={20} /> Structured Summary</h2>
              <div className="result-box">
                {JSON.stringify(results.summary, null, 2)}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default App;

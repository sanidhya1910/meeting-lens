import { useState, useEffect } from 'react';
import { Home, FileText, UploadCloud, Video, Mic, Settings, X, AlertTriangle, FileJson, Download, Sparkles } from 'lucide-react';
import axios from 'axios';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
// @ts-ignore
import html2pdf from 'html2pdf.js';
import './index.css';

function App() {
  const [view, setView] = useState<'home' | 'notes'>('home');
  
  // Library State
  const [meetings, setMeetings] = useState<any[]>([]);
  const [selectedMeetingId, setSelectedMeetingId] = useState<string | null>(null);
  
  // Modal States
  const [showTranscribeModal, setShowTranscribeModal] = useState(false);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);

  // Settings / LLM config (Persisted in localStorage)
  const [provider, setProvider] = useState(() => localStorage.getItem('llmProvider') || 'openai');
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('llmApiKey') || '');
  const [baseUrl, setBaseUrl] = useState(() => localStorage.getItem('llmBaseUrl') || '');
  const [modelName, setModelName] = useState(() => localStorage.getItem('llmModelName') || 'gpt-3.5-turbo');

  useEffect(() => {
    localStorage.setItem('llmProvider', provider);
    localStorage.setItem('llmApiKey', apiKey);
    localStorage.setItem('llmBaseUrl', baseUrl);
    localStorage.setItem('llmModelName', modelName);
  }, [provider, apiKey, baseUrl, modelName]);

  // Templates
  const [availableTemplates, setAvailableTemplates] = useState<{name: string, content: string}[]>([]);

  // Fetch initial data
  const fetchMeetings = async () => {
    try {
      const res = await axios.get('http://localhost:8000/api/meetings');
      setMeetings(res.data.meetings);
    } catch (e) { console.error("Error fetching meetings", e); }
  };

  const fetchTemplates = async () => {
    try {
      const res = await axios.get('http://localhost:8000/api/templates');
      setAvailableTemplates(res.data.templates);
    } catch (e) { console.error("Error fetching templates", e); }
  };

  useEffect(() => {
    fetchMeetings();
    fetchTemplates();
  }, []);

  return (
    <div className="app-layout">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="logo-area">
          <div style={{background: 'var(--primary)', color:'white', padding:'4px', borderRadius:'8px'}}>
            <Video size={24} />
          </div>
          Meeting Lens
        </div>

        <div className="nav-links">
          <div className={`nav-item ${view === 'home' ? 'active' : ''}`} onClick={() => setView('home')}>
            <Home size={20} /> Home
          </div>
          <div className={`nav-item ${view === 'notes' ? 'active' : ''}`} onClick={() => setView('notes')}>
            <FileText size={20} /> Meeting Notes
          </div>
        </div>

        {view === 'notes' && (
          <>
            <div style={{fontSize:'0.75rem', fontWeight:600, color:'var(--text-muted)', margin:'1rem 0 0.5rem 1rem'}}>
              LIBRARY
            </div>
            <div className="meeting-list">
              {meetings.length === 0 && <div style={{padding:'1rem', fontSize:'0.875rem', color:'var(--text-muted)'}}>No meetings yet.</div>}
              {meetings.map(m => (
                <div 
                  key={m.id} 
                  className={`meeting-list-item ${selectedMeetingId === m.id ? 'active' : ''}`}
                  onClick={() => setSelectedMeetingId(m.id)}
                >
                  <div className="meeting-title" title={m.title}>{m.title}</div>
                  <div className="meeting-date">{new Date(m.date).toLocaleString()}</div>
                </div>
              ))}
            </div>
          </>
        )}

        <div className="sidebar-bottom">
          <div className="nav-item" onClick={() => setShowSettingsModal(true)}>
            <Settings size={20} /> Settings
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="main-content">
        {view === 'home' && (
          <HomeView 
            onTranscribeClick={() => setShowTranscribeModal(true)} 
            onTemplateClick={() => setShowTemplateModal(true)} 
          />
        )}
        
        {view === 'notes' && (
          <NotesView 
            meetings={meetings} 
            selectedId={selectedMeetingId} 
            onSummaryGenerated={fetchMeetings}
            provider={provider} apiKey={apiKey} baseUrl={baseUrl} modelName={modelName}
            availableTemplates={availableTemplates}
          />
        )}
      </main>

      {/* Modals */}
      {showTranscribeModal && (
        <TranscribeModal 
          onClose={() => setShowTranscribeModal(false)} 
          onSuccess={(id: string) => { 
            fetchMeetings(); 
            setShowTranscribeModal(false);
            setView('notes');
            setSelectedMeetingId(id);
          }}
        />
      )}

      {showTemplateModal && (
        <TemplateModal 
          onClose={() => setShowTemplateModal(false)}
          onSuccess={() => {
            fetchTemplates();
            setShowTemplateModal(false);
          }}
          provider={provider} apiKey={apiKey} baseUrl={baseUrl} modelName={modelName}
        />
      )}

      {showSettingsModal && (
        <SettingsModal 
          onClose={() => setShowSettingsModal(false)}
          provider={provider} setProvider={setProvider}
          apiKey={apiKey} setApiKey={setApiKey}
          baseUrl={baseUrl} setBaseUrl={setBaseUrl}
          modelName={modelName} setModelName={setModelName}
        />
      )}
    </div>
  );
}

const SKIP_KEYS = new Set(['instruction', 'format', 'item_format', 'example_item_format']);

function SummaryRenderer({ data, depth = 0 }: { data: any; depth?: number }) {
  if (data === null || data === undefined) return null;

  if (typeof data === 'string') {
    return (
      <div className="markdown-body">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{data}</ReactMarkdown>
      </div>
    );
  }

  if (typeof data === 'number' || typeof data === 'boolean') {
    return <span>{String(data)}</span>;
  }

  if (Array.isArray(data)) {
    return (
      <div className="summary-sections">
        {data.map((item, i) => (
          <div key={i} className="summary-section">
            <SummaryRenderer data={item} depth={depth + 1} />
          </div>
        ))}
      </div>
    );
  }

  if (typeof data === 'object') {
    const entries = Object.entries(data).filter(([k]) => !SKIP_KEYS.has(k));
    const title = data.title;
    const name = data.name;
    const description = data.description;
    const content = data.content ?? data.value;
    const sections = data.sections;

    // If this object has title+content structure, render it as a clean section
    const hasStructuredLayout = title || name || content !== undefined || sections;

    if (hasStructuredLayout) {
      return (
        <div className="summary-block">
          {name && <h2 className="summary-name">{name}</h2>}
          {description && typeof description === 'string' && (
            <p className="summary-description">{description}</p>
          )}
          {title && <h3 className="summary-title">{title}</h3>}
          {content !== undefined && <SummaryRenderer data={content} depth={depth + 1} />}
          {sections && <SummaryRenderer data={sections} depth={depth + 1} />}
          {/* Render remaining keys that aren't already handled */}
          {entries
            .filter(([k]) => !['title', 'name', 'description', 'content', 'value', 'sections'].includes(k))
            .map(([key, value]) => (
              <div key={key} className="summary-field">
                <span className="summary-field-label">{key.replace(/_/g, ' ')}</span>
                <SummaryRenderer data={value} depth={depth + 1} />
              </div>
            ))}
        </div>
      );
    }

    // Flat key-value object → render as a clean definition list
    const allPrimitive = entries.every(([, v]) => typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean');
    if (allPrimitive && entries.length > 0) {
      return (
        <div className="summary-kv-table">
          {entries.map(([key, value]) => (
            <div key={key} className="summary-kv-row">
              <span className="summary-kv-key">{key.replace(/_/g, ' ')}</span>
              <span className="summary-kv-value">{String(value)}</span>
            </div>
          ))}
        </div>
      );
    }

    // Mixed object fallback
    return (
      <div className="summary-block">
        {entries.map(([key, value]) => (
          <div key={key} className="summary-field">
            <span className="summary-field-label">{key.replace(/_/g, ' ')}</span>
            <SummaryRenderer data={value} depth={depth + 1} />
          </div>
        ))}
      </div>
    );
  }

  return <span>{String(data)}</span>;
}

// ----------------------
// Home View
// ----------------------
function HomeView({ onTranscribeClick, onTemplateClick }: any) {
  return (
    <>
      <div className="page-header">
        <h1>Welcome to Meeting Lens!</h1>
        <p>Extract, Transcribe, and Summarize Video Content Automatically.</p>
      </div>

      <div className="features-grid">
        <div className="feature-card">
          <div className="feature-icon" style={{background: 'rgba(239, 68, 68, 0.1)', color: 'var(--accent)'}}>
            <Mic size={24} />
          </div>
          <div>
            <h3>Live Transcription</h3>
            <p>Coming soon. Record meeting audio dynamically from your browser.</p>
          </div>
          <button className="btn btn-danger" disabled style={{marginTop:'auto'}}>Start Recording</button>
        </div>

        <div className="feature-card" onClick={onTranscribeClick}>
          <div className="feature-icon">
            <UploadCloud size={24} />
          </div>
          <div>
            <h3>Transcribe Audio/Video</h3>
            <p>Upload a media file and run it through state-of-the-art Whisper ASR on your device.</p>
          </div>
          <button className="btn btn-outline" style={{marginTop:'auto'}}>Upload File</button>
        </div>

        <div className="feature-card" onClick={onTemplateClick}>
          <div className="feature-icon" style={{background: 'rgba(16, 185, 129, 0.1)', color: 'var(--success)'}}>
            <Sparkles size={24} />
          </div>
          <div>
            <h3>Create LLM Template</h3>
            <p>Describe what you want to extract from a meeting, and let the AI build a strict JSON template for it.</p>
          </div>
          <button className="btn btn-outline" style={{marginTop:'auto'}}>Build Template</button>
        </div>
      </div>
    </>
  );
}

// ----------------------
// Notes View
// ----------------------
function NotesView({ meetings, selectedId, onSummaryGenerated, provider, apiKey, baseUrl, modelName, availableTemplates }: any) {
  const meeting = meetings.find((m: any) => m.id === selectedId);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  const [selectedTemplateName, setSelectedTemplateName] = useState(availableTemplates[0]?.name || '');

  // Regenerate summary state
  const [isRegeneratingSummary, setIsRegeneratingSummary] = useState(false);

  // Editable transcript state
  const [isEditingTranscript, setIsEditingTranscript] = useState(false);
  const [editedTranscript, setEditedTranscript] = useState('');

  useEffect(() => {
    if (meeting) {
      setEditedTranscript(meeting.transcript);
      setIsEditingTranscript(false);
    }
  }, [selectedId, meeting?.transcript]);

  if (!meeting) {
    return (
      <div className="empty-state">
        <FileText size={64} style={{marginBottom:'1rem', opacity:0.5}} />
        <h2>Select a meeting</h2>
        <p>Choose a meeting from the sidebar to view its transcript and notes.</p>
      </div>
    );
  }

  const handleGenerateSummary = async () => {
    setLoading(true);
    setError('');
    
    const tmpl = availableTemplates.find((t:any) => t.name === selectedTemplateName);
    const jsonTemplateStr = tmpl ? tmpl.content : "{}";

    const formData = new FormData();
    formData.append('llm_provider', provider);
    formData.append('llm_api_key', apiKey);
    formData.append('llm_base_url', baseUrl);
    formData.append('llm_model', modelName);
    formData.append('json_template', jsonTemplateStr);
    formData.append('auto_title', 'true'); // Auto generate title if it's default

    try {
      await axios.post(`http://localhost:8000/api/meetings/${meeting.id}/summarize`, formData);
      onSummaryGenerated();
      setIsRegeneratingSummary(false);
    } catch(err:any) {
      setError(err.response?.data?.detail || err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveTranscript = async () => {
    const formData = new FormData();
    formData.append('transcript', editedTranscript);
    try {
      await axios.put(`http://localhost:8000/api/meetings/${meeting.id}/transcript`, formData);
      onSummaryGenerated(); // refresh meetings from backend
      setIsEditingTranscript(false);
    } catch(err:any) {
      setError(err.response?.data?.detail || err.message);
    }
  };

  const handleDownloadPdf = () => {
    if (!meeting.summary) return;
    const source = document.getElementById('summary-content-export');
    if (!source) return;
    
    // Clone into an off-screen light-themed container for clean PDF
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'position:fixed;left:-9999px;top:0;width:800px;background:#ffffff;color:#0f172a;padding:40px;font-family:Inter,sans-serif;';
    wrapper.innerHTML = `<h1 style="font-size:22px;margin-bottom:4px;color:#0f172a;">${meeting.title}</h1><p style="font-size:12px;color:#64748b;margin-bottom:24px;">${new Date(meeting.date).toLocaleString()}</p>` + source.innerHTML;
    
    // Force light colors on all children
    wrapper.querySelectorAll('*').forEach((el: any) => {
      const cs = getComputedStyle(el);
      if (cs.color) el.style.color = '#0f172a';
      if (cs.borderColor && cs.borderColor !== 'rgba(0, 0, 0, 0)') el.style.borderColor = '#e2e8f0';
      el.style.background = 'transparent';
    });
    wrapper.querySelectorAll('h2, .summary-name').forEach((el: any) => { el.style.color = '#3b82f6'; });
    wrapper.querySelectorAll('h3, .summary-title').forEach((el: any) => { el.style.color = '#0f172a'; el.style.borderBottomColor = '#e2e8f0'; });
    wrapper.querySelectorAll('.summary-field-label, .summary-kv-key').forEach((el: any) => { el.style.color = '#64748b'; });
    wrapper.querySelectorAll('th').forEach((el: any) => { el.style.background = '#f1f5f9'; el.style.color = '#0f172a'; });
    wrapper.querySelectorAll('td').forEach((el: any) => { el.style.color = '#0f172a'; });
    
    document.body.appendChild(wrapper);
    
    const opt = {
      margin:       [15, 15, 15, 15],
      filename:     `${meeting.title.replace(/\s+/g, '_')}.pdf`,
      image:        { type: 'jpeg', quality: 0.98 },
      html2canvas:  { scale: 2, useCORS: true, width: 800, windowWidth: 800 },
      jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' },
      pagebreak:    { mode: ['avoid-all', 'css', 'legacy'] }
    };
    
    html2pdf().set(opt).from(wrapper).save().then(() => {
      document.body.removeChild(wrapper);
    });
  };

  return (
    <div style={{maxWidth:'800px'}}>
      <div className="page-header">
        <h1>{meeting.title}</h1>
        <p>{new Date(meeting.date).toLocaleString()}</p>
      </div>

      {error && <div className="warning-box" style={{color:'var(--danger)', borderColor:'var(--danger)', background:'rgba(239,68,68,0.1)'}}>{error}</div>}

      {!meeting.summary || isRegeneratingSummary ? (
        <div className="empty-state" style={{border:'2px dashed var(--border-color)', borderRadius:'1rem', marginBottom:'2rem'}}>
          <FileJson size={48} style={{marginBottom:'1rem', opacity:0.5}} />
          <h2 style={{color:'var(--text-main)', marginBottom:'0.5rem'}}>
            {isRegeneratingSummary ? 'Regenerate Summary' : 'No Summary Generated Yet'}
          </h2>
          <p style={{marginBottom:'1.5rem', maxWidth:'400px'}}>Generate an AI-powered summary of your meeting transcript to get key points, action items, and decisions.</p>
          
          <div style={{display:'flex', gap:'1rem', alignItems:'center', marginBottom:'1.5rem'}}>
            <select value={selectedTemplateName} onChange={e => setSelectedTemplateName(e.target.value)} style={{width:'200px'}}>
              {availableTemplates.map((t:any) => <option key={t.name} value={t.name}>{t.name}</option>)}
            </select>
          </div>

          <div style={{display:'flex', gap:'0.5rem'}}>
            {isRegeneratingSummary && (
              <button className="btn btn-outline" onClick={() => setIsRegeneratingSummary(false)} disabled={loading}>Cancel</button>
            )}
            <button className="btn" onClick={handleGenerateSummary} disabled={loading}>
              {loading ? <><div className="loader"></div> Processing...</> : <><Sparkles size={18} /> Generate Summary</>}
            </button>
          </div>
        </div>
      ) : (
        <div className="card">
          <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1rem'}}>
            <h2 className="card-title" style={{margin:0}}>
              <Sparkles size={20} color="var(--primary)" style={{marginRight:'0.5rem'}} />
              AI Enhanced Summary
            </h2>
            <div style={{display:'flex', gap:'0.5rem'}}>
              <button className="btn btn-outline" onClick={() => setIsRegeneratingSummary(true)}>
                <Sparkles size={16} /> Regenerate
              </button>
              <button className="btn btn-outline" onClick={handleDownloadPdf}>
                <Download size={16} /> Download PDF
              </button>
            </div>
          </div>
          <div id="summary-content-export" style={{ background: 'var(--card-bg)', color: 'var(--text-main)', padding: '1rem', borderRadius: '0.5rem' }}>
            <SummaryRenderer data={meeting.summary} />
          </div>
        </div>
      )}

      <div className="card">
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1rem'}}>
          <h2 className="card-title" style={{margin:0}}>Transcript</h2>
          {!isEditingTranscript ? (
            <button className="btn btn-outline" onClick={() => setIsEditingTranscript(true)}>
              Edit Transcript
            </button>
          ) : (
            <div style={{display: 'flex', gap: '0.5rem'}}>
              <button className="btn btn-outline" onClick={() => {setIsEditingTranscript(false); setEditedTranscript(meeting.transcript)}}>Cancel</button>
              <button className="btn" onClick={handleSaveTranscript}>Save Changes</button>
            </div>
          )}
        </div>
        {isEditingTranscript ? (
          <textarea 
            className="result-box" 
            style={{height:'400px', width: '100%', resize: 'vertical', fontFamily: 'Inter, sans-serif'}} 
            value={editedTranscript}
            onChange={(e) => setEditedTranscript(e.target.value)}
          />
        ) : (
          <div className="result-box" style={{maxHeight:'400px'}}>
            {meeting.transcript}
          </div>
        )}
      </div>
    </div>
  );
}

// ----------------------
// Modals
// ----------------------
function TranscribeModal({ onClose, onSuccess }: any) {
  const [file, setFile] = useState<File|null>(null);
  const [asrModel, setAsrModel] = useState('base');
  const [useGpu, setUseGpu] = useState(true);
  const [transcribing, setTranscribing] = useState(false);
  const [progressText, setProgressText] = useState('');
  const [error, setError] = useState('');

  const ASR_MODELS = [
    { id: 'tiny', name: 'Tiny (~39MB)' },
    { id: 'base', name: 'Base (~74MB)' },
    { id: 'small', name: 'Small (~241MB)' },
    { id: 'medium', name: 'Medium (~769MB)' },
    { id: 'large-v3', name: 'Large v3 (~1.5GB)' }
  ];

  const handleTranscribe = async () => {
    if (!file) return setError('Please select a file');
    setTranscribing(true);
    setError('');
    setProgressText('Extracting audio...');

    const formData = new FormData();
    formData.append('file', file);
    formData.append('asr_model', asrModel);
    formData.append('device', useGpu ? 'cuda' : 'cpu');

    try {
      const response = await fetch('http://localhost:8000/api/transcribe', { method: 'POST', body: formData });
      if (!response.ok) throw new Error('Network response was not ok');
      const reader = response.body?.getReader();
      const decoder = new TextDecoder("utf-8");
      if (!reader) return;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataStr = line.substring(6);
            if (dataStr === '[DONE]') break;
            try {
              const data = JSON.parse(dataStr);
              if (data.error) { setError(data.error); break; }
              if (data.event === 'completed') {
                onSuccess(data.meeting_id);
                return;
              }
              setProgressText(`[${data.start.toFixed(2)}s] ${data.text}`);
            } catch(e) {}
          }
        }
      }
    } catch(err:any) {
      setError(err.message);
      setTranscribing(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-content">
        <button className="close-btn" onClick={onClose} disabled={transcribing}><X size={20}/></button>
        <h2 style={{marginBottom:'1.5rem'}}>Transcribe Audio/Video</h2>
        
        {error && <div className="warning-box" style={{color:'var(--danger)', borderColor:'var(--danger)', background:'rgba(239,68,68,0.1)', marginBottom:'1rem'}}>{error}</div>}

        <div className="form-group">
          <div className="file-upload">
            <UploadCloud size={32} color="var(--primary)" style={{ marginBottom: '1rem' }} />
            <p>{file ? file.name : "Select video or audio file"}</p>
            <input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} disabled={transcribing} />
          </div>
        </div>

        <div className="form-group">
          <label>Whisper Model</label>
          <select value={asrModel} onChange={e => setAsrModel(e.target.value)} disabled={transcribing}>
            {ASR_MODELS.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>

        <div className="form-group">
          <label>Compute Device</label>
          <div className="switch-wrapper">
            <label className="switch">
              <input type="checkbox" checked={useGpu} onChange={(e) => setUseGpu(e.target.checked)} disabled={transcribing} />
              <span className="slider"></span>
            </label>
            <span style={{ fontSize: '0.875rem' }}>{useGpu ? 'GPU (CUDA)' : 'CPU'}</span>
          </div>
          {asrModel === 'large-v3' && !useGpu && (
            <div className="warning-box">
              <AlertTriangle size={16} /> 
              Warning: Large models run extremely slow on CPU. GPU is highly recommended!
            </div>
          )}
        </div>

        {transcribing && (
          <div className="result-box" style={{height:'100px', marginBottom:'1rem'}}>
            {progressText}
          </div>
        )}

        <button className="btn" onClick={handleTranscribe} disabled={transcribing || !file} style={{width:'100%'}}>
          {transcribing ? <><div className="loader"></div> Processing...</> : "Start Transcription"}
        </button>
      </div>
    </div>
  );
}

function TemplateModal({ onClose, onSuccess, provider, apiKey, baseUrl, modelName }: any) {
  const [desc, setDesc] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleGenerate = async () => {
    if (!desc || !name) return setError('Please provide name and description.');
    setLoading(true); setError('');
    const formData = new FormData();
    formData.append('description', desc);
    formData.append('template_name', name);
    formData.append('llm_provider', provider);
    formData.append('llm_api_key', apiKey);
    formData.append('llm_base_url', baseUrl);
    formData.append('llm_model', modelName);

    try {
      await axios.post('http://localhost:8000/api/templates/generate', formData);
      onSuccess();
    } catch(err:any) {
      setError(err.response?.data?.detail || err.message);
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-content">
        <button className="close-btn" onClick={onClose} disabled={loading}><X size={20}/></button>
        <h2 style={{marginBottom:'1.5rem'}}>Create Custom JSON Template</h2>
        
        {error && <div className="warning-box" style={{color:'var(--danger)', borderColor:'var(--danger)', background:'rgba(239,68,68,0.1)', marginBottom:'1rem'}}>{error}</div>}

        <div className="form-group">
          <label>Template Name</label>
          <input type="text" placeholder="e.g. Sales Call Analysis" value={name} onChange={e=>setName(e.target.value)} disabled={loading}/>
        </div>
        <div className="form-group">
          <label>Description of desired JSON structure</label>
          <textarea 
            placeholder="e.g. I want to extract the client's budget, the main pain points as a list, and the next steps." 
            value={desc} onChange={e=>setDesc(e.target.value)} disabled={loading}
          />
        </div>

        <button className="btn" onClick={handleGenerate} disabled={loading || !desc || !name} style={{width:'100%'}}>
          {loading ? <><div className="loader"></div> Generating...</> : "Generate Template via LLM"}
        </button>
      </div>
    </div>
  );
}

function SettingsModal({ onClose, provider, setProvider, apiKey, setApiKey, baseUrl, setBaseUrl, modelName, setModelName }: any) {
  return (
    <div className="modal-backdrop">
      <div className="modal-content">
        <button className="close-btn" onClick={onClose}><X size={20}/></button>
        <h2 style={{marginBottom:'1.5rem'}}>Global LLM Settings</h2>
        
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
          <input type="password" placeholder="Enter API Key" value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
        </div>
        {['lmstudio', 'openai_compatible'].includes(provider) && (
          <div className="form-group">
            <label>Base URL</label>
            <input type="text" placeholder={provider === 'lmstudio' ? 'http://localhost:1234/v1' : 'https://api.example.com/v1'} value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
          </div>
        )}
        <div className="form-group">
          <label>Model Name</label>
          <input type="text" placeholder="e.g. gpt-4o, claude-3-opus-20240229, local-model" value={modelName} onChange={(e) => setModelName(e.target.value)} />
        </div>

        <button className="btn" onClick={onClose} style={{width:'100%', marginTop:'1rem'}}>Save & Close</button>
      </div>
    </div>
  );
}

export default App;

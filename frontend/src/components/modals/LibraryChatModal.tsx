import { useEffect, useRef, useState } from 'react';
import { X, Send, Library, FileText } from 'lucide-react';
import axios from 'axios';
import { apiUrl } from '../../api';
import type { ChatMessage, ChatSource, LlmSettings } from '../../types';

type Props = LlmSettings & {
  embedModel: string;
  onClose: () => void;
  onOpenMeeting: (id: string) => void;
};

type Turn = ChatMessage & { sources?: ChatSource[] };

export function LibraryChatModal({
  provider, apiKey, baseUrl, modelName, embedModel, onClose, onOpenMeeting,
}: Props) {
  const [messages, setMessages] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const ask = async () => {
    const q = input.trim();
    if (!q || loading) return;
    const history = messages.map(({ role, content }) => ({ role, content }));
    setMessages(prev => [...prev, { role: 'user', content: q }]);
    setInput('');
    setLoading(true);
    setError('');
    try {
      const res = await axios.post(apiUrl('/api/library/chat'), {
        question: q,
        history,
        llm_provider: provider,
        llm_api_key: apiKey,
        llm_base_url: baseUrl,
        llm_model: modelName,
        embed_model: embedModel,
      });
      setMessages(prev => [...prev, { role: 'assistant', content: res.data.answer, sources: res.data.sources }]);
    } catch (err: unknown) {
      const ax = err as { response?: { data?: { detail?: string } } };
      setError(ax.response?.data?.detail || (err instanceof Error ? err.message : 'Library chat failed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-content modal-content-wide">
        <button className="close-btn" onClick={onClose}><X size={20} /></button>
        <h2 style={{ marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Library size={22} /> Ask Your Library
        </h2>
        <p className="modal-subtitle">
          Questions are answered from across every transcribed meeting. The first question indexes
          your library (embeddings run locally via Ollama) and may take a moment.
        </p>

        <div className="chat-panel">
          <div className="chat-messages" style={{ maxHeight: '50vh' }}>
            {messages.length === 0 && (
              <div className="chat-empty">
                <Library size={32} style={{ opacity: 0.4 }} />
                <p>e.g. "What did we decide about pricing?" or "List every action item assigned to me."</p>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`chat-bubble chat-bubble-${m.role}`}>
                {m.content}
                {m.sources && m.sources.length > 0 && (
                  <div className="chat-sources">
                    {m.sources.map(s => (
                      <button key={s.meeting_id} className="chat-source-chip" onClick={() => { onOpenMeeting(s.meeting_id); onClose(); }}>
                        <FileText size={11} /> {s.title || 'Untitled'}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {loading && (
              <div className="chat-bubble chat-bubble-assistant chat-typing">
                <span className="dot" /><span className="dot" /><span className="dot" />
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {error && <div className="warning-box error-banner">{error}</div>}

          <form className="chat-input-row" onSubmit={e => { e.preventDefault(); ask(); }}>
            <input
              type="text"
              placeholder="Ask across all your meetings…"
              value={input}
              onChange={e => setInput(e.target.value)}
              disabled={loading}
            />
            <button type="submit" className="btn" disabled={loading || !input.trim()}>
              <Send size={16} />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import { Send, MessageSquare, Sparkles } from 'lucide-react';
import axios from 'axios';
import { apiUrl } from '../api';
import type { ChatMessage, LlmSettings } from '../types';

type Props = LlmSettings & {
  meetingId: string;
};

const SUGGESTIONS = [
  'Summarize the key decisions',
  'List the action items and owners',
  'What questions were left unresolved?',
];

export function ChatPanel({ meetingId, provider, apiKey, baseUrl, modelName }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  // Reset the conversation when switching meetings.
  useEffect(() => {
    setMessages([]);
    setError('');
  }, [meetingId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const ask = async (question: string) => {
    const q = question.trim();
    if (!q || loading) return;
    const history = messages;
    setMessages(prev => [...prev, { role: 'user', content: q }]);
    setInput('');
    setLoading(true);
    setError('');

    try {
      const res = await axios.post(apiUrl(`/api/meetings/${meetingId}/chat`), {
        question: q,
        history,
        llm_provider: provider,
        llm_api_key: apiKey,
        llm_base_url: baseUrl,
        llm_model: modelName,
      });
      setMessages(prev => [...prev, { role: 'assistant', content: res.data.answer }]);
    } catch (err: unknown) {
      const ax = err as { response?: { data?: { detail?: string } } };
      setError(ax.response?.data?.detail || (err instanceof Error ? err.message : 'Chat failed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="chat-panel">
      <div className="chat-messages">
        {messages.length === 0 && (
          <div className="chat-empty">
            <MessageSquare size={32} style={{ opacity: 0.4 }} />
            <p>Ask anything about this meeting. Answers are grounded in the transcript.</p>
            <div className="chat-suggestions">
              {SUGGESTIONS.map(s => (
                <button key={s} className="chat-chip" onClick={() => ask(s)}>
                  <Sparkles size={13} /> {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`chat-bubble chat-bubble-${m.role}`}>
            {m.content}
          </div>
        ))}
        {loading && (
          <div className="chat-bubble chat-bubble-assistant chat-typing">
            <span className="dot" />
            <span className="dot" />
            <span className="dot" />
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {error && <div className="warning-box error-banner">{error}</div>}

      <form
        className="chat-input-row"
        onSubmit={e => {
          e.preventDefault();
          ask(input);
        }}
      >
        <input
          type="text"
          placeholder="Ask a question about this meeting…"
          value={input}
          onChange={e => setInput(e.target.value)}
          disabled={loading}
        />
        <button type="submit" className="btn" disabled={loading || !input.trim()}>
          <Send size={16} />
        </button>
      </form>
    </div>
  );
}

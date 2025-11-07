import { useState, useRef, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { chatAPI, API_URL } from '../services/api';
import { MessageCircle, X, Send, Bot, Brain, Database, Activity, Hammer, ListChecks, User as UserIcon, Trash2 } from 'lucide-react';
import useAuthStore from '../stores/authStore';

function ChatWidget() {
  const user = useAuthStore((s) => s.user);
  const storageKey = `chat:${user?.id || 'anon'}`;
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]); // {role:'user'|'assistant', content:string}
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const endRef = useRef(null);
  const messagesRef = useRef(null);
  const textareaRef = useRef(null);
  const queryClient = useQueryClient();
  const [events, setEvents] = useState([]); // live agent events for current task
  const pollRef = useRef(null);
  const sseRef = useRef(null);

  // Rehydrate state from localStorage on mount or when user changes
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed?.messages)) setMessages(parsed.messages);
        if (typeof parsed?.open === 'boolean') setOpen(parsed.open);
      }
    } catch (_) { /* ignore */ }
  }, [storageKey]);

  useEffect(() => {
    if (open && messages.length === 0) {
      setMessages([{ role: 'assistant', content: 'Hi! Ask me anything about your weights, goals, streaks, or trends. I will answer using your data.' }]);
    }
  }, [open, messages.length]);

  useEffect(() => {
    try {
      if (messagesRef.current) {
        messagesRef.current.scrollTo({ top: messagesRef.current.scrollHeight, behavior: 'smooth' });
      } else {
        endRef.current?.scrollIntoView({ behavior: 'smooth' });
      }
    } catch (_) { /* ignore */ }
  }, [messages, open, events]);

  // Persist state to localStorage whenever it changes (keep last 20 messages only)
  useEffect(() => {
    try {
      const limitedMessages = messages.slice(-20); // Keep last 20 messages
      const toSave = JSON.stringify({ open, messages: limitedMessages });
      localStorage.setItem(storageKey, toSave);
    } catch (_) {
      // ignore
    }
  }, [open, messages, storageKey]);

  const clearHistory = () => {
    if (window.confirm('Clear all chat history? This cannot be undone.')) {
      setMessages([{ role: 'assistant', content: 'Hi! Ask me anything about your weights, goals, streaks, or trends. I will answer using your data.' }]);
      try {
        localStorage.removeItem(storageKey);
      } catch (_) { /* ignore */ }
    }
  };

  const onInputResize = (e) => {
    const el = e?.target || textareaRef.current;
    if (!el) return;
    // Reset to base height then grow to content up to max
    el.style.height = '24px';
    const newHeight = Math.min(el.scrollHeight, 160); // matches max-h-40
    el.style.height = `${newHeight}px`;
  };

  useEffect(() => {
    // Keep height in sync when input or panel state changes
    onInputResize();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input, open]);

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;
    const next = [...messages, { role: 'user', content: text }];
    // Do not add a gray pending bubble; rely on live progress box only
    setMessages(next);
    setInput('');
    setLoading(true);
    try {
      const history = next.slice(-12);
      // Start async task (will prefer SSE, else poll)
      const start = await chatAPI.startTask(history);
      const taskId = start.data?.task_id;
      if (!taskId) throw new Error('Failed to start task');
      setEvents([]);
      const updatePending = () => {};
      const trySSE = () => {
        if (!('EventSource' in window)) return false;
        try {
          const token = localStorage.getItem('token') || '';
          const es = new EventSource(`${API_URL}/api/chat/v2/stream/${taskId}?token=${encodeURIComponent(token)}`);
          sseRef.current = es;
          es.addEventListener('agent', (e) => {
            const ev = JSON.parse(e.data || '{}');
            setEvents((arr) => {
              const nextArr = [...arr, ev];
              updatePending(nextArr);
              return nextArr;
            });
          });
          es.addEventListener('status', (e) => {
            const st = JSON.parse(e.data || '{}');
            if (st.status === 'done') finalizeReply(st.reply);
            else finalizeReply('Sorry, something went wrong.');
            es.close();
            sseRef.current = null;
          });
          es.onerror = () => {
            es.close();
            sseRef.current = null;
          };
          return true;
        } catch {
          return false;
        }
      };
      const ok = trySSE();
      if (!ok) {
        // Poll fallback
        const poll = async () => {
          const st = await chatAPI.getTask(taskId);
          const data = st.data;
          const evs = data.events || [];
          setEvents(evs);
          updatePending(evs);
          if (data.status === 'done') {
            finalizeReply(data.reply);
            clearInterval(pollRef.current);
            pollRef.current = null;
          } else if (data.status === 'error') {
            finalizeReply('Sorry, something went wrong.');
            clearInterval(pollRef.current);
            pollRef.current = null;
          }
        };
        pollRef.current = setInterval(poll, 800);
        await poll();
      }
      // Query invalidation moved to finalizeReply (after completion)
    } catch (e) {
      setMessages((m) => [...m, { role: 'assistant', content: 'Sorry, chat is unavailable right now.' }]);
    } finally {
      setLoading(false);
    }
  };

  const finalizeReply = (reply) => {
    setMessages((m) => [...m, { role: 'assistant', content: reply || 'Done.' }]);
    // Refresh key queries so UI reflects server-side changes (tables update without full page refresh)
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    queryClient.invalidateQueries({ queryKey: ['weights'] });
    queryClient.invalidateQueries({ queryKey: ['targets'] });
    queryClient.invalidateQueries({ queryKey: ['insights'] });
  };

  // titleForAgent removed (unused)

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <>
      {/* Floating button */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-6 right-6 z-40 rounded-full p-4 bg-primary-600 text-white shadow-lg hover:bg-primary-700 focus:outline-none"
        title={open ? 'Close chat' : 'Open chat'}
      >
        {open ? <X size={22} /> : <MessageCircle size={22} />}
      </button>

      {/* Panel */}
      {open && (
        <div className="fixed bottom-24 right-6 z-40 w-[420px] max-w-[92vw] bg-white/90 backdrop-blur border border-gray-200 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-primary-600 to-indigo-600 text-white">
            <div className="flex items-center gap-2">
              <Bot size={18} className="opacity-90" />
              <div className="font-semibold">Agent Chat</div>
            </div>
            <button
              onClick={clearHistory}
              className="p-1.5 rounded-lg hover:bg-white/20 transition-colors"
              title="Clear chat history"
            >
              <Trash2 size={16} />
            </button>
          </div>
          <div ref={messagesRef} className="p-3 space-y-3 overflow-auto" style={{ maxHeight: '55vh' }}>
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`${m.role === 'user' ? 'bg-primary-600 text-white' : 'bg-gray-50 text-gray-900 border border-gray-200'} shadow-sm px-3 py-2 rounded-2xl max-w-[80%] ${m._pending ? 'animate-pulse' : ''}`}>
                  {m.role === 'assistant' ? (
                    <AssistantMessage content={m.content} />
                  ) : (
                    <div className="whitespace-pre-wrap">{m.content}</div>
                  )}
                </div>
              </div>
            ))}

            {/* In-chat live agent status bubble */}
            {(events.length > 0 && (sseRef.current || pollRef.current)) && (
              <div className="flex justify-start">
                <div className="max-w-[85%] bg-indigo-50 text-indigo-900 border border-indigo-200 px-3 py-2 rounded-2xl shadow-sm animate-pulse">
                  <div className="text-xs font-semibold mb-2 flex items-center gap-1">
                    <Brain className="w-4 h-4 text-indigo-600" /> Live progress
                  </div>
                  <div className="flex flex-col gap-2">
                    {events.slice(-6).map((ev, idx) => (
                      <span key={idx} className="inline-flex items-center gap-2 px-2 py-1 rounded-full bg-white text-indigo-800 border border-indigo-200">
                        {chipIcon(ev.agent)}
                        <span className="font-semibold capitalize">{(ev.agent || 'agent')}</span>
                        <span className="text-indigo-300">•</span>
                        <span className="text-indigo-700">{ev.label}</span>
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <div ref={endRef} />
          </div>
          <div className="p-3 border-t bg-white">
            <div className="flex items-end gap-2">
              <div className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 focus-within:ring-2 focus-within:ring-primary-500">
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => { setInput(e.target.value); onInputResize(e); }}
                  onInput={onInputResize}
                  onKeyDown={onKeyDown}
                  rows={1}
                  placeholder="Ask about your data... (Shift+Enter for newline)"
                  className="w-full bg-transparent resize-none outline-none leading-6 max-h-40 text-gray-900 placeholder:text-gray-400"
                  style={{ height: '24px' }}
                />
              </div>
              <button
                onClick={send}
                disabled={loading}
                className="inline-flex items-center gap-2 rounded-xl px-4 py-2 bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50 shadow"
                title="Send"
              >
                <Send size={16} />
              </button>
            </div>
            {/* Moved live chips inside chat box above */}
          </div>
        </div>
      )}
    </>
  );
}

export default ChatWidget;

  const chipIcon = (agent) => {
    const a = (agent || '').toLowerCase();
    if (a === 'planner') return <Brain className="inline w-3.5 h-3.5 text-purple-600"/>;
    if (a === 'sql') return <Database className="inline w-3.5 h-3.5 text-blue-600"/>;
    if (a === 'analytics') return <Activity className="inline w-3.5 h-3.5 text-green-600"/>;
    if (a === 'action') return <Hammer className="inline w-3.5 h-3.5 text-orange-600"/>;
    if (a === 'admin') return <UserIcon className="inline w-3.5 h-3.5 text-rose-600"/>;
    return <ListChecks className="inline w-3.5 h-3.5 text-gray-600"/>;
  };

// Lightweight assistant renderer with JSON extraction and minimal markdown
function AssistantMessage({ content }) {
  // Try to extract a fenced JSON block for structured rendering
  const jsonMatch = (content || '').match(/```json\s*([\s\S]*?)\s*```/i);
  let data = null;
  if (jsonMatch) {
    try { data = JSON.parse(jsonMatch[1]); } catch (_) { data = null; }
  }

  // Structured metrics card
  if (data && (data.type === 'metrics' || (data.per_day !== undefined && data.per_week !== undefined))) {
    const perDay = data.per_day;
    const perWeek = data.per_week;
    const perMonth = data.per_month;
    const delta = data.delta_kg;
    const days = data.days;
    const from = data?.period?.from || data.start_date;
    const to = data?.period?.to || data.end_date;
    return (
      <div className="space-y-2">
        {renderMinimalMarkdown(removeJsonBlock(content))}
        <div className="mt-2 border border-indigo-200 bg-indigo-50 text-indigo-900 rounded-xl p-3 text-sm">
          <div className="font-semibold mb-2">Averages {from && to ? (<span className="font-normal">({from} → {to})</span>) : null}</div>
          <div className="grid grid-cols-3 gap-2">
            <MetricChip label="Per Day" value={perDay} suffix="kg/day" />
            <MetricChip label="Per Week" value={perWeek} suffix="kg/week" />
            <MetricChip label="Per Month" value={perMonth} suffix="kg/month" />
          </div>
          {(delta !== undefined || days !== undefined) && (
            <div className="mt-2 text-xs text-indigo-800">Total change: {formatNumber(delta)} kg · Days: {days}</div>
          )}
        </div>
      </div>
    );
  }

  // Fallback: minimal markdown (bold, lists, code) without external libs
  return renderMinimalMarkdown(content);
}

function MetricChip({ label, value, suffix }) {
  return (
    <div className="rounded-lg bg-white border border-indigo-200 px-2.5 py-1.5">
      <div className="text-[11px] text-indigo-600">{label}</div>
      <div className="text-sm font-semibold text-indigo-900">{formatNumber(value)} <span className="text-xs font-normal text-indigo-700">{suffix}</span></div>
    </div>
  );
}

function formatNumber(v) {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  const num = typeof v === 'number' ? v : parseFloat(v);
  if (!isFinite(num)) return '—';
  return (Math.round(num * 1000) / 1000).toString();
}

function removeJsonBlock(s) {
  return (s || '').replace(/```json[\s\S]*?```/gi, '').trim();
}

function renderMinimalMarkdown(raw) {
  const text = (raw || '').replace(/\r\n/g, '\n');
  // Escape HTML
  const esc = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  // Bold **text** and inline code `code`
  const withInline = esc
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code class="px-1 py-0.5 rounded bg-gray-100 border border-gray-200">$1</code>');
  // Split into lines and build lists
  const lines = withInline.split(/\n/);
  const out = [];
  let list = [];
  const flushList = () => {
    if (list.length) {
      out.push(<ul className="list-disc pl-5 space-y-1" key={`ul-${out.length}`}>{list.map((li, idx) => <li key={idx} dangerouslySetInnerHTML={{ __html: li }} />)}</ul>);
      list = [];
    }
  };
  lines.forEach((ln) => {
    const m = ln.match(/^\s*[-\*]\s+(.*)$/);
    if (m) {
      list.push(m[1]);
    } else if (ln.trim() === '') {
      flushList();
      out.push(<div key={`br-${out.length}`} className="h-1" />);
    } else {
      flushList();
      out.push(<div key={`p-${out.length}`} className="whitespace-pre-wrap" dangerouslySetInnerHTML={{ __html: ln }} />);
    }
  });
  flushList();
  return <div className="text-sm leading-6 space-y-1">{out}</div>;
}

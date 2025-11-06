import { useState, useRef, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { chatAPI, API_URL } from '../services/api';
import { MessageCircle, X, Send, Bot, Brain, Database, Activity, Hammer, ListChecks, User as UserIcon } from 'lucide-react';
import useAuthStore from '../stores/authStore';

function ChatWidget() {
  const user = useAuthStore((s) => s.user);
  const storageKey = `chat:${user?.id || 'anon'}`;
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]); // {role:'user'|'assistant', content:string}
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const endRef = useRef(null);
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
    } catch (_) {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  useEffect(() => {
    if (open && messages.length === 0) {
      setMessages([{ role: 'assistant', content: 'Hi! Ask me anything about your weights, goals, streaks, or trends. I will answer using your data.' }]);
    }
  }, [open]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, open]);

  // Persist state to localStorage whenever it changes
  useEffect(() => {
    try {
      const toSave = JSON.stringify({ open, messages });
      localStorage.setItem(storageKey, toSave);
    } catch (_) {
      // ignore
    }
  }, [open, messages, storageKey]);

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
      // After assistant reply, proactively refresh key queries so UI reflects any server-side changes
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['weights'] });
      queryClient.invalidateQueries({ queryKey: ['targets'] });
      queryClient.invalidateQueries({ queryKey: ['insights'] });
    } catch (e) {
      setMessages((m) => [...m, { role: 'assistant', content: 'Sorry, chat is unavailable right now.' }]);
    } finally {
      setLoading(false);
    }
  };

  const finalizeReply = (reply) => {
    setMessages((m) => [...m, { role: 'assistant', content: reply || 'Done.' }]);
  };

  const titleForAgent = (agent) => {
    const a = (agent || '').toLowerCase();
    if (a === 'planner') return 'Planning';
    if (a === 'sql') return 'Querying data';
    if (a === 'analytics') return 'Analyzing';
    if (a === 'action') return 'Applying changes';
    if (a === 'admin') return 'Admin action';
    return 'Working';
  };

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
        <div className="fixed bottom-24 right-6 z-40 w-[360px] max-w-[90vw] bg-white border border-gray-200 rounded-xl shadow-xl flex flex-col overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b bg-gray-50">
            <Bot size={18} className="text-primary-600" />
            <div className="font-medium text-gray-800">Chat</div>
          </div>
          <div className="p-3 space-y-3 overflow-auto" style={{ maxHeight: '50vh' }}>
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`${m.role === 'user' ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-800'} px-3 py-2 rounded-lg max-w-[80%] whitespace-pre-wrap ${m._pending ? 'animate-pulse' : ''}`}>{m.content}</div>
              </div>
            ))}

            {/* In-chat live agent status bubble */}
            {(events.length > 0 && (sseRef.current || pollRef.current)) && (
              <div className="flex justify-start">
                <div className="max-w-[80%] bg-indigo-50 text-indigo-900 border border-indigo-200 px-3 py-2 rounded-lg animate-pulse">
                  <div className="text-xs font-semibold mb-1 flex items-center gap-1">
                    <Brain className="w-4 h-4 text-indigo-600" /> Live progress
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {events.slice(-6).map((ev, idx) => (
                      <span key={idx} className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-white text-indigo-800 border border-indigo-200">
                        {chipIcon(ev.agent)}
                        <span className="font-medium capitalize">{(ev.agent || 'agent')}</span>
                        <span className="text-indigo-300">·</span>
                        <span>{ev.label}</span>
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <div ref={endRef} />
          </div>
          <div className="p-3 border-t bg-white">
            <div className="flex items-center gap-2">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKeyDown}
                rows={1}
                placeholder="Ask about your data..."
                className="flex-1 resize-none rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
              <button
                onClick={send}
                disabled={loading}
                className="inline-flex items-center gap-2 rounded-md px-3 py-2 bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50"
              >
                <Send size={16} /> {loading ? 'Sending' : 'Send'}
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

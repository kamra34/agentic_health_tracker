import { useState, useRef, useEffect } from 'react';
import { chatAPI } from '../services/api';
import { MessageCircle, X, Send, Bot } from 'lucide-react';

function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]); // {role:'user'|'assistant', content:string}
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const endRef = useRef(null);

  useEffect(() => {
    if (open && messages.length === 0) {
      setMessages([{ role: 'assistant', content: 'Hi! Ask me anything about your weights, goals, streaks, or trends. I will answer using your data.' }]);
    }
  }, [open]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, open]);

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;
    const next = [...messages, { role: 'user', content: text }];
    setMessages(next);
    setInput('');
    setLoading(true);
    try {
      const history = next.slice(-12); // keep it light
      const res = await chatAPI.send(history);
      const reply = res.data?.reply ?? 'Sorry, I could not generate a reply.';
      setMessages((m) => [...m, { role: 'assistant', content: reply }]);
    } catch (e) {
      setMessages((m) => [...m, { role: 'assistant', content: 'Sorry, chat is unavailable right now.' }]);
    } finally {
      setLoading(false);
    }
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
                <div className={`${m.role === 'user' ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-800'} px-3 py-2 rounded-lg max-w-[80%] whitespace-pre-wrap`}>{m.content}</div>
              </div>
            ))}
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
          </div>
        </div>
      )}
    </>
  );
}

export default ChatWidget;


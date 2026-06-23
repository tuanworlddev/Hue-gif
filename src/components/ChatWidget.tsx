import React, { useState, useEffect, useRef } from 'react';
import { MessageCircle, X, Send, User } from 'lucide-react';

interface Msg {
  sender: 'user' | 'bot';
  text: string;
  time: string;
}

export const ChatWidget: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [messages, setMessages] = useState<Msg[]>([
    {
      sender: 'bot',
      text: "Dạ Huegifts xin chào ạ! Con người xứ Huế hiền hòa đón tiếp bạn. Bạn cần tư vấn đặc sản bánh mứt, trà sen Hồ Tịnh Tâm hay quà thêu tay truyền thống làm quà tặng người thương ạ?",
      time: "Vừa xong"
    }
  ]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Hiển thị text có chèn link Markdown [nhãn](url) thành liên kết bấm được.
  // Link nội bộ dạng #/product/slug sẽ điều hướng qua hash router của trang.
  const renderText = (text: string): React.ReactNode => {
    const linkRegex = /\[([^\]]+)\]\((#?\/[^\s)]+|https?:\/\/[^\s)]+)\)/g;
    const nodes: React.ReactNode[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    let key = 0;
    while ((match = linkRegex.exec(text)) !== null) {
      if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));
      const [, label, url] = match;
      const isExternal = url.startsWith('http');
      nodes.push(
        <a
          key={`lnk-${key++}`}
          href={url}
          target={isExternal ? '_blank' : undefined}
          rel={isExternal ? 'noopener noreferrer' : undefined}
          className="text-brand-purple font-semibold underline underline-offset-2 hover:text-brand-gold break-words"
        >
          {label}
        </a>
      );
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
    return nodes.length ? nodes : text;
  };

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim()) return;

    const userText = inputValue;
    const time = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    
    const userMsg: Msg = { sender: 'user', text: userText, time };
    setMessages(prev => [...prev, userMsg]);
    setInputValue('');

    // Call server-side chat endpoint which proxies to OpenAI (reads key from server env)
    (async () => {
      try {
        const resp = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: userText,
            history: messages.slice(-6).map(m => ({ role: m.sender === 'user' ? 'user' : 'assistant', content: m.text }))
          })
        });
        if (!resp.ok) throw new Error('Server chat error');
        const data = await resp.json();
        const botText = data?.reply || 'Xin lỗi, tôi chưa nhận được phản hồi.';
        setMessages(prev => [...prev, { sender: 'bot', text: String(botText), time: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) }]);
      } catch (err) {
        // Fallback: simple canned reply if server or AI not available
        setTimeout(() => {
          setMessages(prev => [...prev, { sender: 'bot', text: 'Dạ em xin lỗi, trợ lý đang bận chút xíu. Mình có thể xem trực tiếp [Cửa hàng quà Huế](#/shop) hoặc gọi hotline 0977047908 giúp em nhé!', time: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) }]);
        }, 800);
      }
    })();
  };

  return (
    <div className="fixed bottom-6 left-6 z-40 font-sans pointer-events-auto">
      {isOpen ? (
        <div className="w-80 md:w-96 h-[450px] bg-white rounded-xl shadow-2xl flex flex-col overflow-hidden border border-gray-200/50">
          {/* Header */}
          <div className="bg-brand-purple p-4 text-white flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-9 h-9 rounded-full bg-brand-gold-light/20 flex items-center justify-center text-brand-gold font-bold font-serif">
                H
              </div>
              <div>
                <h4 className="text-sm font-semibold">Tư vấn Huegifts</h4>
                <p className="text-[10px] text-brand-gold-light/80">● Đang trực tuyến dột sương</p>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="text-white/80 hover:text-white hover:bg-white/10 p-1.5 rounded-full transition-colors cursor-pointer"
              id="close-chat"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-zinc-50 scrollbar-thin">
            {messages.map((m, idx) => (
              <div
                key={idx}
                className={`flex ${m.sender === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] rounded-lg p-3 text-xs leading-relaxed ${
                    m.sender === 'user'
                      ? 'bg-brand-purple text-white rounded-br-none'
                      : 'bg-white border border-gray-100 text-text-charcoal rounded-bl-none shadow-sm'
                  }`}
                >
                  <p className="whitespace-pre-wrap">{m.sender === 'bot' ? renderText(m.text) : m.text}</p>
                  <span
                    className={`block text-[9px] mt-1 text-right ${
                      m.sender === 'user' ? 'text-white/70' : 'text-text-muted/70'
                    }`}
                  >
                    {m.time}
                  </span>
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Form */}
          <form onSubmit={handleSend} className="p-3 bg-white border-t border-gray-100 flex items-center gap-2">
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Hỏi Huegifts điều gì..."
              className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-brand-purple focus:bg-white text-text-charcoal"
              id="chat-input"
            />
            <button
              type="submit"
              className="bg-brand-purple hover:bg-brand-purple/90 text-white p-2 rounded-lg transition-colors cursor-pointer"
              id="send-chat-btn"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </form>
        </div>
      ) : (
        <button
          onClick={() => setIsOpen(true)}
          className="bg-brand-purple hover:bg-brand-purple/95 text-white p-4 rounded-full shadow-xl flex items-center justify-center cursor-pointer transform hover:scale-105 active:scale-95 transition-all group"
          id="open-chat-btn"
          aria-label="Mở tư vấn trực tuyến"
        >
          <MessageCircle className="w-6 h-6 shrink-0 transition-transform group-hover:rotate-12" />
          <span className="max-w-0 overflow-hidden group-hover:max-w-xs group-hover:ml-2 transition-all duration-300 text-xs font-medium tracking-tight whitespace-nowrap">
            Hỏi chuyện Huế
          </span>
        </button>
      )}
    </div>
  );
};

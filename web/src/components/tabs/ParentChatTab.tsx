/**
 * AttendSure - Web Portal Parent & Faculty Direct Chat
 * File: web/src/components/tabs/ParentChatTab.tsx
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { MessageSquare, RefreshCw, Send, User } from 'lucide-react';
import apiClient from '../../api/client';
import { useApiResource } from '../../hooks/useApiResource';

interface ChatThread {
  thread_key: string;
  student_id: number;
  student_name: string;
  student_lrn: string;
  section: string;
  faculty_id: number;
  faculty_name: string;
  parent_name: string;
  last_message: string;
  last_time: string;
  unread_count: number;
}

interface ChatMessage {
  id: number;
  sender_name: string;
  is_mine: boolean;
  body: string;
  time_only: string;
}

export const ParentChatTab: React.FC = () => {
  const { data: threadPayload, loading: loadingThreads, reload: reloadThreads } = useApiResource<any>(
    '/chat/threads/',
    { threads: [] }
  );

  const threads: ChatThread[] = Array.isArray(threadPayload?.threads) ? threadPayload.threads : [];
  const [selectedThread, setSelectedThread] = useState<ChatThread | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState<boolean>(false);
  const [draft, setDraft] = useState<string>('');
  const [sending, setSending] = useState<boolean>(false);
  const [search, setSearch] = useState<string>('');
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (threads.length > 0 && !selectedThread) {
      setSelectedThread(threads[0]);
    }
  }, [threads, selectedThread]);

  const loadMessages = useCallback(async (thread: ChatThread, silent = false) => {
    if (!silent) setLoadingMessages(true);
    try {
      const res = await apiClient.get('/chat/messages/', {
        params: { student_id: thread.student_id, faculty_id: thread.faculty_id },
      });
      setMessages(Array.isArray(res.data?.messages) ? res.data.messages : []);
    } catch {
    } finally {
      if (!silent) setLoadingMessages(false);
    }
  }, []);

  useEffect(() => {
    if (!selectedThread) return;
    loadMessages(selectedThread, false);
    const interval = setInterval(() => loadMessages(selectedThread, true), 10000);
    return () => clearInterval(interval);
  }, [selectedThread, loadMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedThread || !draft.trim() || sending) return;

    const text = draft.trim();
    setDraft('');
    setSending(true);
    try {
      const res = await apiClient.post('/chat/messages/', {
        student_id: selectedThread.student_id,
        faculty_id: selectedThread.faculty_id,
        body: text,
      });
      setMessages((prev) => [...prev, res.data]);
      reloadThreads(true);
    } catch {
      setDraft(text);
    } finally {
      setSending(false);
    }
  };

  const filteredThreads = threads.filter((t) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      t.student_name.toLowerCase().includes(q) ||
      t.parent_name.toLowerCase().includes(q) ||
      t.section.toLowerCase().includes(q)
    );
  });

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 16, padding: 20, height: 'calc(100vh - 120px)' }}>
      {/* Left Sidebar: Student & Parent Class List */}
      <div style={{ backgroundColor: '#ffffff', borderRadius: 12, border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: 14, borderBottom: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <strong style={{ fontSize: '0.92rem', color: '#0f172a', display: 'flex', alignItems: 'center', gap: 6 }}>
              <MessageSquare size={16} color="#004b87" /> Parent Messages
            </strong>
            <button type="button" onClick={() => reloadThreads(false)} style={{ border: 'none', background: 'transparent', cursor: 'pointer' }}>
              <RefreshCw size={14} color="#64748b" />
            </button>
          </div>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search student or parent..."
            style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: '0.8rem' }}
          />
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loadingThreads ? (
            <div style={{ padding: 16, fontSize: '0.8rem', color: '#64748b' }}>Loading conversations...</div>
          ) : filteredThreads.length === 0 ? (
            <div style={{ padding: 16, fontSize: '0.8rem', color: '#64748b' }}>
              No linked parent accounts found in your class list yet.
            </div>
          ) : (
            filteredThreads.map((t) => {
              const isSelected = selectedThread?.thread_key === t.thread_key;
              return (
                <button
                  key={t.thread_key}
                  type="button"
                  onClick={() => setSelectedThread(t)}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    padding: '12px 14px',
                    border: 'none',
                    borderBottom: '1px solid #f1f5f9',
                    backgroundColor: isSelected ? '#eff6ff' : '#ffffff',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 3,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <strong style={{ fontSize: '0.84rem', color: '#0f172a' }}>{t.student_name}</strong>
                    {t.unread_count > 0 && (
                      <span style={{ backgroundColor: '#004b87', color: '#ffffff', fontSize: '0.68rem', fontWeight: 800, padding: '2px 7px', borderRadius: 10 }}>
                        {t.unread_count}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#004b87', fontWeight: 700 }}>
                    Parent: {t.parent_name} • {t.section}
                  </div>
                  <div style={{ fontSize: '0.74rem', color: '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {t.last_message}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Right Panel: Active Chat Window */}
      <div style={{ backgroundColor: '#ffffff', borderRadius: 12, border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {!selectedThread ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', fontSize: '0.88rem' }}>
            Select a student conversation on the left to message their parent.
          </div>
        ) : (
          <>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid #e2e8f0', backgroundColor: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: '0.94rem', color: '#0f172a' }}>
                  {selectedThread.student_name} ({selectedThread.section})
                </div>
                <div style={{ fontSize: '0.75rem', color: '#475569', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <User size={12} /> Parent / Guardian: <strong>{selectedThread.parent_name}</strong>
                </div>
              </div>
              <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#059669', backgroundColor: '#ecfdf5', padding: '4px 10px', borderRadius: 12 }}>
                Mobile App Push Connected
              </span>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 10, backgroundColor: '#f8fafc' }}>
              {loadingMessages ? (
                <div style={{ fontSize: '0.8rem', color: '#64748b' }}>Loading messages...</div>
              ) : messages.length === 0 ? (
                <div style={{ textAlign: 'center', color: '#64748b', fontSize: '0.82rem', marginTop: 40 }}>
                  Start the conversation with {selectedThread.parent_name}. Messages are delivered directly to their AttendSure Mobile App.
                </div>
              ) : (
                messages.map((m) => (
                  <div
                    key={m.id}
                    style={{
                      alignSelf: m.is_mine ? 'flex-end' : 'flex-start',
                      maxWidth: '72%',
                      backgroundColor: m.is_mine ? '#004b87' : '#ffffff',
                      color: m.is_mine ? '#ffffff' : '#0f172a',
                      padding: '10px 14px',
                      borderRadius: 12,
                      border: m.is_mine ? 'none' : '1px solid #e2e8f0',
                    }}
                  >
                    <div style={{ fontSize: '0.68rem', opacity: 0.8, marginBottom: 3, fontWeight: 700 }}>
                      {m.sender_name} • {m.time_only}
                    </div>
                    <div style={{ fontSize: '0.84rem', lineHeight: 1.4 }}>{m.body}</div>
                  </div>
                ))
              )}
              <div ref={bottomRef} />
            </div>

            <form onSubmit={handleSend} style={{ padding: 12, borderTop: '1px solid #e2e8f0', display: 'flex', gap: 8, backgroundColor: '#ffffff' }}>
              <input
                type="text"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={`Write a message to ${selectedThread.parent_name}...`}
                style={{ flex: 1, padding: '10px 14px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
              />
              <button
                type="submit"
                disabled={sending || !draft.trim()}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '10px 18px',
                  borderRadius: 8,
                  border: 'none',
                  backgroundColor: '#004b87',
                  color: '#ffffff',
                  fontWeight: 700,
                  fontSize: '0.84rem',
                  cursor: 'pointer',
                }}
              >
                <Send size={15} /> {sending ? 'Sending...' : 'Send'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
};

export default ParentChatTab;
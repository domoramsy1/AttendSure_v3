/**
 * AttendSure - Theme-Adaptive Parent & Teacher Direct Messaging
 * File: web/src/components/tabs/ParentChatTab.tsx
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { MessageSquare, RefreshCw, Send, Trash2, User } from 'lucide-react';
import apiClient from '../../api/client';
import { API_ROUTES } from '../../api/routes';
import { useApiResource } from '../../hooks/useApiResource';
import { useTheme } from '../../context/ThemeContext';

interface ChatThread {
  thread_key: string;
  student_id: number;
  student_name: string;
  section: string;
  faculty_id: number;
  parent_name: string;
  last_message: string;
  unread_count: number;
}

interface ChatMessageItem {
  id: number;
  sender_name: string;
  is_mine: boolean;
  body: string;
  time_only: string;
}

export const ParentChatTab: React.FC = () => {
  const { tokens, brand, ui } = useTheme();
  const { data: payload, loading: loadingThreads, reload: reloadThreads } = useApiResource<{ threads: ChatThread[] }>(
    API_ROUTES.messaging.threads,
    { threads: [] }
  );

  const threads = Array.isArray(payload?.threads) ? payload.threads : [];
  const [selectedThread, setSelectedThread] = useState<ChatThread | null>(null);
  const [messages, setMessages] = useState<ChatMessageItem[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [search, setSearch] = useState('');
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (threads.length > 0 && !selectedThread) setSelectedThread(threads[0]);
  }, [threads, selectedThread]);

  const loadMessages = useCallback(async (thread: ChatThread, silent = false) => {
    if (silent && document.visibilityState !== 'visible') return;
    if (!silent) setLoadingMessages(true);
    try {
      const res = await apiClient.get(API_ROUTES.messaging.messages, {
        params: { student_id: thread.student_id, teacher_id: thread.faculty_id, ...(silent ? { nocache: 1 } : {}) },
      });
      setMessages(Array.isArray(res.data?.messages) ? res.data.messages : []);
    } catch {
      // Handled gracefully
    } finally {
      if (!silent) setLoadingMessages(false);
    }
  }, []);

  useEffect(() => {
    if (!selectedThread) return;
    loadMessages(selectedThread, false);
    const timer = setInterval(() => loadMessages(selectedThread, true), 12000);
    return () => clearInterval(timer);
  }, [selectedThread, loadMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedThread || !draft.trim() || sending) return;
    const body = draft.trim();
    setDraft('');
    setSending(true);
    try {
      const res = await apiClient.post(API_ROUTES.messaging.messages, {
        student_id: selectedThread.student_id,
        teacher_id: selectedThread.faculty_id,
        body,
      });
      setMessages((prev) => [...prev, res.data]);
      reloadThreads(true);
    } catch {
      setDraft(body);
    } finally {
      setSending(false);
    }
  };

  const handleDeleteMessage = async (id: number) => {
    await apiClient.delete(API_ROUTES.messaging.messages, { params: { id } }).catch(() => {});
    setMessages((prev) => prev.filter((m) => m.id !== id));
  };

  const filteredThreads = threads.filter((t) => {
    const q = search.trim().toLowerCase();
    return !q || t.student_name.toLowerCase().includes(q) || t.parent_name.toLowerCase().includes(q) || t.section.toLowerCase().includes(q);
  });

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 320px) 1fr', gap: 16, padding: 18, height: 'calc(100vh - 140px)' }}>
      <div style={{ ...ui.card, padding: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: 14, borderBottom: `1px solid ${tokens.borderSubtle}`, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <strong style={{ fontSize: '0.90rem', color: tokens.textPrimary, display: 'flex', alignItems: 'center', gap: 6 }}>
              <MessageSquare size={16} color={brand.primary} /> Parent Threads
            </strong>
            <button type="button" onClick={() => reloadThreads(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: tokens.textMuted }}>
              <RefreshCw size={14} />
            </button>
          </div>
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search learner or parent..." style={ui.input} />
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loadingThreads ? (
            <div style={{ padding: 16, fontSize: '0.8rem', color: tokens.textMuted }}>Loading threads...</div>
          ) : filteredThreads.length === 0 ? (
            <div style={{ padding: 16, fontSize: '0.8rem', color: tokens.textMuted }}>No linked parent accounts in your classes yet.</div>
          ) : (
            filteredThreads.map((t) => {
              const active = selectedThread?.thread_key === t.thread_key;
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
                    borderBottom: `1px solid ${tokens.borderSubtle}`,
                    backgroundColor: active ? tokens.primaryLight : 'transparent',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <strong style={{ fontSize: '0.84rem', color: tokens.textPrimary }}>{t.student_name}</strong>
                    {t.unread_count > 0 && <span style={ui.badge(brand.primary, '#ffffff')}>{t.unread_count}</span>}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: brand.primary, fontWeight: 700, marginTop: 2 }}>
                    Parent: {t.parent_name} &bull; {t.section}
                  </div>
                  <div style={{ fontSize: '0.74rem', color: tokens.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 2 }}>
                    {t.last_message}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      <div style={{ ...ui.card, padding: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {!selectedThread ? (
          <div style={{ margin: 'auto', color: tokens.textMuted, fontSize: '0.86rem' }}>Select a learner conversation on the left.</div>
        ) : (
          <>
            <div style={{ padding: '12px 16px', borderBottom: `1px solid ${tokens.borderSubtle}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 800, color: tokens.textPrimary }}>{selectedThread.student_name} ({selectedThread.section})</div>
                <div style={{ fontSize: '0.74rem', color: tokens.textSecondary, display: 'flex', alignItems: 'center', gap: 5 }}>
                  <User size={12} /> Guardian: <strong>{selectedThread.parent_name}</strong>
                </div>
              </div>
              <span style={ui.badge(tokens.successLight, brand.success)}>Mobile Push Active</span>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 10, backgroundColor: tokens.bgCanvas }}>
              {loadingMessages ? (
                <div style={{ color: tokens.textMuted, fontSize: '0.8rem' }}>Loading messages...</div>
              ) : messages.length === 0 ? (
                <div style={{ margin: 'auto', color: tokens.textMuted, fontSize: '0.82rem' }}>No messages yet. Say hello to {selectedThread.parent_name}.</div>
              ) : (
                messages.map((m) => (
                  <div
                    key={m.id}
                    style={{
                      alignSelf: m.is_mine ? 'flex-end' : 'flex-start',
                      maxWidth: '74%',
                      backgroundColor: m.is_mine ? brand.primary : tokens.bgSurface,
                      color: m.is_mine ? '#ffffff' : tokens.textPrimary,
                      padding: '10px 14px',
                      borderRadius: 12,
                      border: m.is_mine ? 'none' : `1px solid ${tokens.borderSubtle}`,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: '0.68rem', opacity: 0.85, marginBottom: 4, fontWeight: 700 }}>
                      <span>{m.sender_name} &bull; {m.time_only}</span>
                      {m.is_mine && (
                        <button type="button" onClick={() => handleDeleteMessage(m.id)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0 }}>
                          <Trash2 size={11} />
                        </button>
                      )}
                    </div>
                    <div style={{ fontSize: '0.84rem', lineHeight: 1.4 }}>{m.body}</div>
                  </div>
                ))
              )}
              <div ref={bottomRef} />
            </div>

            <form onSubmit={handleSend} style={{ padding: 12, borderTop: `1px solid ${tokens.borderSubtle}`, display: 'flex', gap: 8 }}>
              <input type="text" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={`Message ${selectedThread.parent_name}...`} style={ui.input} />
              <button type="submit" disabled={sending || !draft.trim()} style={ui.btnPrimary}>
                <Send size={14} /> {sending ? 'Sending...' : 'Send'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
};

export default ParentChatTab;
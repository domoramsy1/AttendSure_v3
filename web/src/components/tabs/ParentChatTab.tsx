/**
 * AttendSure - Theme-Adaptive Parent & Faculty Direct Messaging
 * File: web/src/components/tabs/ParentChatTab.tsx
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Edit2, MessageSquare, RefreshCw, Send, Trash2, User, X } from 'lucide-react';
import apiClient, { peekApiCache } from '../../api/client';
import { API_ROUTES, extractApiError } from '../../api/routes';
import { useApiResource } from '../../hooks/useApiResource';
import { useTheme } from '../../context/ThemeContext';
import { useAlert } from '../../context/AlertContext';

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

const sanitizeInput = (raw: string, maxLength = 1000): string =>
  String(raw || '')
    .replace(/[\u0000-\u001F\u007F<>]/g, '')
    .trim()
    .slice(0, maxLength);

export const ParentChatTab: React.FC = () => {
  const { tokens, brand, ui } = useTheme();
  const { showAlert, showConfirm } = useAlert();
  const { data: payload, loading: loadingThreads, refreshing: refreshingThreads, reload: reloadThreads } =
    useApiResource<{ threads: ChatThread[] }>(API_ROUTES.messaging.threads, { threads: [] });

  const threads = Array.isArray(payload?.threads) ? payload.threads : [];
  const [selectedThread, setSelectedThread] = useState<ChatThread | null>(null);
  const [messages, setMessages] = useState<ChatMessageItem[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [search, setSearch] = useState('');

  const bottomRef = useRef<HTMLDivElement | null>(null);
  const messagesAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (threads.length > 0 && !selectedThread) {
      setSelectedThread(threads[0]);
    }
  }, [threads, selectedThread]);

  const loadMessages = useCallback(async (thread: ChatThread, silent = false) => {
    if (silent && document.visibilityState !== 'visible') return;

    messagesAbortRef.current?.abort();
    const controller = new AbortController();
    messagesAbortRef.current = controller;

    const baseParams = { student_id: thread.student_id, faculty_id: thread.faculty_id };
    if (!silent) {
      const cached = peekApiCache<{ messages?: ChatMessageItem[] }>(API_ROUTES.messaging.messages, baseParams);
      if (cached && Array.isArray(cached.messages)) {
        setMessages(cached.messages);
        setLoadingMessages(false);
      } else {
        setLoadingMessages(true);
      }
    }

    try {
      const res = await apiClient.get(API_ROUTES.messaging.messages, {
        params: {
          ...baseParams,
          ...(silent ? { nocache: 1 } : {}),
        },
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      setMessages(Array.isArray(res.data?.messages) ? res.data.messages : []);
    } catch (err: unknown) {
      const anyErr = err as { name?: string; code?: string };
      if (controller.signal.aborted || anyErr?.name === 'CanceledError' || anyErr?.code === 'ERR_CANCELED') {
        return;
      }
      if (!silent) {
        showAlert({
          title: 'Messages Unavailable',
          message: extractApiError(err, 'Could not load conversation messages.'),
          type: 'warning',
        });
      }
    } finally {
      if (!controller.signal.aborted && !silent) {
        setLoadingMessages(false);
      }
    }
  }, [showAlert]);

  useEffect(() => {
    if (!selectedThread) return;
    void loadMessages(selectedThread, false);
    const timer = setInterval(() => void loadMessages(selectedThread, true), 12000);
    return () => {
      clearInterval(timer);
      messagesAbortRef.current?.abort();
    };
  }, [selectedThread, loadMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedThread || sending) return;
    const body = sanitizeInput(draft, 1000);
    if (!body) return;

    setDraft('');
    setSending(true);
    try {
      const res = await apiClient.post(API_ROUTES.messaging.messages, {
        student_id: selectedThread.student_id,
        faculty_id: selectedThread.faculty_id,
        body,
      });
      setMessages((prev) => [...prev, res.data]);
      void reloadThreads(true, true);
    } catch (err: unknown) {
      setDraft(body);
      showAlert({
        title: 'Message Not Sent',
        message: extractApiError(err, 'Unable to send message. Please try again.'),
        type: 'error',
      });
    } finally {
      setSending(false);
    }
  };

  const handleStartEdit = (msg: ChatMessageItem) => {
    setEditingId(msg.id);
    setEditDraft(msg.body);
  };

  const handleSaveEdit = async (id: number) => {
    const cleanBody = sanitizeInput(editDraft, 1000);
    if (!cleanBody || savingEdit) return;
    setSavingEdit(true);
    try {
      const res = await apiClient.put(API_ROUTES.messaging.messages, { id, body: cleanBody });
      const updatedBody = typeof res.data?.body === 'string' ? res.data.body : cleanBody;
      setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, body: updatedBody } : m)));
      setEditingId(null);
      setEditDraft('');
      void reloadThreads(true, true);
    } catch (err: unknown) {
      showAlert({
        title: 'Update Failed',
        message: extractApiError(err, 'Could not update message.'),
        type: 'error',
      });
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDeleteMessage = (id: number) => {
    if (deletingId === id) return;
    showConfirm({
      title: 'Delete Message',
      message: 'Are you sure you want to permanently remove this message?',
      confirmLabel: 'Delete',
      isDestructive: true,
      onConfirm: async () => {
        setDeletingId(id);
        try {
          await apiClient.delete(API_ROUTES.messaging.messages, { params: { id } });
          setMessages((prev) => prev.filter((m) => m.id !== id));
          if (editingId === id) {
            setEditingId(null);
            setEditDraft('');
          }
          void reloadThreads(true, true);
        } catch (err: unknown) {
          showAlert({
            title: 'Delete Failed',
            message: extractApiError(err, 'Could not delete message.'),
            type: 'error',
          });
        } finally {
          setDeletingId(null);
        }
      },
    });
  };

  const cleanSearch = sanitizeInput(search, 80).toLowerCase();
  const filteredThreads = threads.filter((t) => {
    return (
      !cleanSearch ||
      t.student_name.toLowerCase().includes(cleanSearch) ||
      t.parent_name.toLowerCase().includes(cleanSearch) ||
      t.section.toLowerCase().includes(cleanSearch)
    );
  });

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 16,
        padding: 'clamp(12px, 2vw, 18px)',
        minHeight: 'calc(100vh - 150px)',
        boxSizing: 'border-box',
        alignItems: 'stretch',
      }}
    >
      <div
        style={{
          ...ui.card,
          padding: 0,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          flex: '1 1 280px',
          maxWidth: '100%',
          minHeight: 300,
          maxHeight: 'calc(100vh - 175px)',
        }}
      >
        <div style={{ padding: 14, borderBottom: `1px solid ${tokens.borderSubtle}`, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <strong style={{ fontSize: '0.90rem', color: tokens.textPrimary, display: 'flex', alignItems: 'center', gap: 6 }}>
              <MessageSquare size={16} color={brand.primary} /> Parent Threads
            </strong>
            <button
              type="button"
              onClick={() => void reloadThreads(false, true)}
              disabled={loadingThreads || refreshingThreads}
              aria-label="Refresh parent threads"
              title="Refresh threads"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: tokens.textMuted, display: 'inline-flex', padding: 4 }}
            >
              <RefreshCw size={14} className={refreshingThreads ? 'animate-spin' : ''} />
            </button>
          </div>
          <input
            type="text"
            maxLength={80}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search student or parent..."
            style={ui.input}
          />
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
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
                    <strong style={{ fontSize: '0.84rem', color: tokens.textPrimary }}>{t.student_name}</strong>
                    {t.unread_count > 0 && <span style={ui.badge(brand.buttonBg, '#ffffff')}>{t.unread_count}</span>}
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

      <div
        style={{
          ...ui.card,
          padding: 0,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          flex: '3 1 380px',
          minWidth: 0,
          minHeight: 380,
          maxHeight: 'calc(100vh - 175px)',
        }}
      >
        {!selectedThread ? (
          <div style={{ margin: 'auto', padding: 24, color: tokens.textMuted, fontSize: '0.86rem' }}>
            Select a student conversation to view messages.
          </div>
        ) : (
          <>
            <div style={{ padding: '12px 16px', borderBottom: `1px solid ${tokens.borderSubtle}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
              <div>
                <div style={{ fontWeight: 800, color: tokens.textPrimary }}>
                  {selectedThread.student_name} ({selectedThread.section})
                </div>
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
                <div style={{ margin: 'auto', color: tokens.textMuted, fontSize: '0.82rem' }}>
                  No messages yet. Say hello to {selectedThread.parent_name}.
                </div>
              ) : (
                messages.map((m) => (
                  <div
                    key={m.id}
                    style={{
                      alignSelf: m.is_mine ? 'flex-end' : 'flex-start',
                      maxWidth: '78%',
                      backgroundColor: m.is_mine ? brand.buttonBg : tokens.bgSurface,
                      color: m.is_mine ? '#ffffff' : tokens.textPrimary,
                      padding: '10px 14px',
                      borderRadius: 12,
                      border: m.is_mine ? 'none' : `1px solid ${tokens.borderSubtle}`,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: '0.68rem', opacity: 0.9, marginBottom: 4, fontWeight: 700 }}>
                      <span>{m.sender_name} &bull; {m.time_only}</span>
                      {m.is_mine && (
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <button
                            type="button"
                            onClick={() => handleStartEdit(m)}
                            aria-label="Edit message"
                            title="Edit message"
                            style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0, display: 'inline-flex' }}
                          >
                            <Edit2 size={11} />
                          </button>
                          <button
                            type="button"
                            disabled={deletingId === m.id}
                            onClick={() => handleDeleteMessage(m.id)}
                            aria-label="Delete message"
                            title="Delete message"
                            style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0, display: 'inline-flex' }}
                          >
                            <Trash2 size={11} />
                          </button>
                        </div>
                      )}
                    </div>
                    {editingId === m.id ? (
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <input
                          type="text"
                          maxLength={1000}
                          value={editDraft}
                          onChange={(e) => setEditDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              void handleSaveEdit(m.id);
                            } else if (e.key === 'Escape') {
                              setEditingId(null);
                              setEditDraft('');
                            }
                          }}
                          style={{
                            ...ui.input,
                            padding: '4px 8px',
                            fontSize: '0.80rem',
                            minWidth: 160,
                          }}
                        />
                        <button
                          type="button"
                          disabled={savingEdit || !editDraft.trim()}
                          onClick={() => void handleSaveEdit(m.id)}
                          aria-label="Save edited message"
                          title="Save"
                          style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: 6, color: '#ffffff', cursor: 'pointer', padding: '4px 6px', display: 'inline-flex' }}
                        >
                          <Check size={13} />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingId(null);
                            setEditDraft('');
                          }}
                          aria-label="Cancel edit"
                          title="Cancel"
                          style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 6, color: '#ffffff', cursor: 'pointer', padding: '4px 6px', display: 'inline-flex' }}
                        >
                          <X size={13} />
                        </button>
                      </div>
                    ) : (
                      <div style={{ fontSize: '0.84rem', lineHeight: 1.4, wordBreak: 'break-word' }}>{m.body}</div>
                    )}
                  </div>
                ))
              )}
              <div ref={bottomRef} />
            </div>

            <form onSubmit={handleSend} style={{ padding: 12, borderTop: `1px solid ${tokens.borderSubtle}`, display: 'flex', gap: 8 }}>
              <input
                type="text"
                maxLength={1000}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={`Message ${selectedThread.parent_name}...`}
                style={ui.input}
              />
              <button type="submit" disabled={sending || !draft.trim()} style={{ ...ui.btnPrimary, flexShrink: 0 }}>
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

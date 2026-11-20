/**
 * AttendSure Mobile - Parent & Faculty Messages
 * File: mobile/src/screens/ChatScreen.tsx
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiClient } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useThemeMode } from '../context/ThemeContext';
import { cleanText, getFriendlyErrorMessage, type ThemePalette } from '../constants/theme';

const THREADS_CACHE_KEY = 'attendsure_cached_chat_threads';

interface ThreadItem {
  thread_key: string;
  student_id: number;
  student_name: string;
  section: string;
  faculty_id: number;
  faculty_name: string;
  parent_name: string;
  last_message: string;
  last_time: string;
  unread_count: number;
}

interface MessageItem {
  id: number;
  sender_name: string;
  is_mine: boolean;
  body: string;
  time_only: string;
}

const isCanceledError = (err: unknown): boolean => {
  const e = err as { code?: string; name?: string };
  return e?.code === 'ERR_CANCELED' || e?.name === 'CanceledError' || e?.name === 'AbortError';
};

const showNotice = (title: string, message: string): void => {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.alert(`${title}: ${message}`);
  } else {
    Alert.alert(title, message);
  }
};

const getInitials = (name: string): string => {
  const parts = String(name || '')
    .replace(/,/g, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return String(name || 'FA').slice(0, 2).toUpperCase();
};

export const ChatScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { palette, fonts } = useThemeMode();
  const styles = useMemo(() => createStyles(palette, fonts), [palette, fonts]);
  const isParentUser =
    String(user?.role || user?.system_role || '')
      .trim()
      .toUpperCase() === 'PARENT';

  const [threads, setThreads] = useState<ThreadItem[]>([]);
  const [activeThread, setActiveThread] = useState<ThreadItem | null>(null);
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [search, setSearch] = useState<string>('');
  const [filterMode, setFilterMode] = useState<'ALL' | 'UNREAD'>('ALL');
  const [draft, setDraft] = useState<string>('');
  const [sending, setSending] = useState<boolean>(false);
  const [editingMsgId, setEditingMsgId] = useState<number | null>(null);

  const flatListRef = useRef<FlatList<MessageItem> | null>(null);
  const isMountedRef = useRef<boolean>(true);
  const threadsAbortRef = useRef<AbortController | null>(null);
  const messagesAbortRef = useRef<AbortController | null>(null);
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      threadsAbortRef.current?.abort();
      messagesAbortRef.current?.abort();
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, []);

  const loadThreads = useCallback(async (silent = false) => {
    threadsAbortRef.current?.abort();
    const controller = new AbortController();
    threadsAbortRef.current = controller;

    if (!silent) {
      try {
        const cached = await AsyncStorage.getItem(THREADS_CACHE_KEY);
        if (cached && isMountedRef.current && !controller.signal.aborted) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed)) setThreads(parsed);
        }
      } catch {}
    }

    try {
      const res = await apiClient.get<{ threads?: ThreadItem[] }>('chat/threads/', {
        signal: controller.signal,
      });
      if (!isMountedRef.current || controller.signal.aborted) return;
      const list = Array.isArray(res.data?.threads) ? res.data.threads : [];
      setThreads(list);
      AsyncStorage.setItem(THREADS_CACHE_KEY, JSON.stringify(list)).catch(() => {});
    } catch (err: unknown) {
      if (isCanceledError(err)) return;
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  const loadMessages = useCallback(async (thread: ThreadItem, readCache = false) => {
    messagesAbortRef.current?.abort();
    const controller = new AbortController();
    messagesAbortRef.current = controller;

    const msgCacheKey = `attendsure_cached_chat_msgs_${thread.student_id}_${thread.faculty_id}`;
    if (readCache) {
      try {
        const cached = await AsyncStorage.getItem(msgCacheKey);
        if (cached && isMountedRef.current && !controller.signal.aborted) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed)) setMessages(parsed);
        }
      } catch {}
    }

    try {
      const res = await apiClient.get<{ messages?: MessageItem[] }>('chat/messages/', {
        params: { student_id: thread.student_id, faculty_id: thread.faculty_id },
        signal: controller.signal,
      });
      if (!isMountedRef.current || controller.signal.aborted) return;
      const list = Array.isArray(res.data?.messages) ? res.data.messages : [];
      setMessages(list);
      AsyncStorage.setItem(msgCacheKey, JSON.stringify(list)).catch(() => {});
    } catch (err: unknown) {
      if (isCanceledError(err)) return;
    }
  }, []);

  useEffect(() => {
    void loadThreads(false);
  }, [loadThreads]);

  useEffect(() => {
    if (!activeThread) {
      messagesAbortRef.current?.abort();
      setMessages([]);
      return;
    }
    void loadMessages(activeThread, true);
    const timer = setInterval(() => {
      void loadMessages(activeThread, false);
    }, 8000);
    return () => {
      clearInterval(timer);
      messagesAbortRef.current?.abort();
    };
  }, [activeThread, loadMessages]);

  const handleSend = async () => {
    if (!activeThread || sending) return;
    const text = cleanText(draft, 1000);
    if (!text) return;

    setDraft('');
    setSending(true);
    try {
      if (editingMsgId) {
        const res = await apiClient.put<{ id: number; body: string }>('chat/messages/', {
          id: editingMsgId,
          body: text,
        });
        if (!isMountedRef.current) return;
        const updatedBody = res.data?.body || text;
        setMessages((prev) => prev.map((m) => (m.id === editingMsgId ? { ...m, body: updatedBody } : m)));
        setEditingMsgId(null);
      } else {
        const res = await apiClient.post<MessageItem>('chat/messages/', {
          student_id: activeThread.student_id,
          faculty_id: activeThread.faculty_id,
          body: text,
        });
        if (!isMountedRef.current) return;
        setMessages((prev) => [...prev, res.data]);
        if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
        scrollTimeoutRef.current = setTimeout(() => {
          if (isMountedRef.current) {
            flatListRef.current?.scrollToEnd({ animated: true });
          }
        }, 100);
      }
    } catch (err: unknown) {
      if (!isMountedRef.current) return;
      setDraft(text);
      showNotice(
        editingMsgId ? 'Update Failed' : 'Message Not Sent',
        getFriendlyErrorMessage(err, editingMsgId ? 'Could not update your message.' : 'Could not send your message. Please try again.')
      );
    } finally {
      if (isMountedRef.current) {
        setSending(false);
      }
    }
  };

  const executeDeleteMessage = async (id: number) => {
    try {
      await apiClient.delete('chat/messages/', { params: { id } });
      if (!isMountedRef.current) return;
      setMessages((prev) => prev.filter((m) => m.id !== id));
      if (editingMsgId === id) {
        setEditingMsgId(null);
        setDraft('');
      }
    } catch (err: unknown) {
      if (!isMountedRef.current) return;
      showNotice('Delete Failed', getFriendlyErrorMessage(err, 'Could not delete this message.'));
    }
  };

  const handleDeleteMessage = (id: number) => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      if (window.confirm('Delete this message?')) {
        void executeDeleteMessage(id);
      }
      return;
    }
    Alert.alert('Delete Message', 'Permanently delete this message?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => void executeDeleteMessage(id) },
    ]);
  };

  const totalUnread = threads.reduce((acc, t) => acc + (t.unread_count || 0), 0);
  const cleanSearch = cleanText(search, 80).toLowerCase();

  const filteredThreads = threads.filter((t) => {
    if (filterMode === 'UNREAD' && t.unread_count <= 0) return false;
    if (!cleanSearch) return true;
    return (
      String(t.student_name || '').toLowerCase().includes(cleanSearch) ||
      String(t.faculty_name || '').toLowerCase().includes(cleanSearch) ||
      String(t.parent_name || '').toLowerCase().includes(cleanSearch) ||
      String(t.section || '').toLowerCase().includes(cleanSearch)
    );
  });

  if (!activeThread) {
    return (
      <View style={styles.container}>
        {/* Curved Header */}
        <View style={[styles.header, { paddingTop: Math.max(insets.top, 14) }]}>
          <View style={styles.headerTopRow}>
            <View>
              <Text style={styles.headerTitle}>Messages</Text>
              <Text style={styles.headerSub}>
                {totalUnread === 0 ? 'You are all caught up' : `${totalUnread} unread message(s)`}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.headerIconBtn}
              onPress={() => {
                setRefreshing(true);
                void loadThreads(true);
              }}
              accessibilityLabel="Refresh messages"
            >
              <Ionicons name="refresh-outline" size={20} color={palette.onPrimary} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Search Input & Filter Row */}
        <View style={styles.controlsWrap}>
          <View style={styles.searchRow}>
            <View style={styles.searchBox}>
              <Ionicons name="search-outline" size={18} color={palette.textMuted} />
              <TextInput
                style={styles.searchInput}
                value={search}
                onChangeText={setSearch}
                placeholder="Search faculty or parents"
                placeholderTextColor={palette.textMuted}
                maxLength={80}
              />
              {search.length > 0 && (
                <TouchableOpacity onPress={() => setSearch('')}>
                  <Ionicons name="close-circle" size={17} color={palette.textMuted} />
                </TouchableOpacity>
              )}
            </View>
            <TouchableOpacity
              style={styles.filterIconBtn}
              onPress={() => setFilterMode(filterMode === 'ALL' ? 'UNREAD' : 'ALL')}
              accessibilityLabel="Toggle unread filter"
            >
              <Ionicons name="options-outline" size={18} color={palette.primary} />
            </TouchableOpacity>
          </View>

          <View style={styles.pillsRow}>
            <TouchableOpacity
              style={[
                styles.filterPill,
                filterMode === 'ALL' ? styles.filterPillActive : styles.filterPillInactive,
              ]}
              onPress={() => setFilterMode('ALL')}
            >
              <Text
                style={[
                  styles.filterPillText,
                  { color: filterMode === 'ALL' ? palette.onPrimary : palette.textSecondary },
                ]}
              >
                All
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.filterPill,
                filterMode === 'UNREAD' ? styles.filterPillActive : styles.filterPillInactive,
              ]}
              onPress={() => setFilterMode('UNREAD')}
            >
              <Text
                style={[
                  styles.filterPillText,
                  { color: filterMode === 'UNREAD' ? palette.onPrimary : palette.textSecondary },
                ]}
              >
                Unread
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {loading && threads.length === 0 ? (
          <View style={styles.centerBox}>
            <ActivityIndicator size="small" color={palette.primary} />
          </View>
        ) : (
          <FlatList
            data={filteredThreads}
            keyExtractor={(item) => item.thread_key}
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120 }}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => {
                  setRefreshing(true);
                  void loadThreads(true);
                }}
                colors={[palette.primary]}
                tintColor={palette.primary}
              />
            }
            ListEmptyComponent={
              <View style={styles.centerBox}>
                <Ionicons name="chatbubbles-outline" size={44} color={palette.textMuted} />
                <Text style={styles.emptyTitle}>No conversations found</Text>
                <Text style={styles.mutedText}>
                  Linked parent and faculty chat threads appear here automatically.
                </Text>
              </View>
            }
            renderItem={({ item }) => {
              const counterpartName = isParentUser
                ? item.faculty_name || item.student_name
                : item.parent_name || item.student_name || item.faculty_name;
              return (
                <TouchableOpacity
                  style={styles.threadRow}
                  onPress={() => setActiveThread(item)}
                  activeOpacity={0.75}
                >
                  <View style={styles.initialsCircle}>
                    <Text style={styles.initialsText}>{getInitials(counterpartName)}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.threadTitle} numberOfLines={1}>
                      {counterpartName}
                    </Text>
                    <Text style={styles.threadSub} numberOfLines={1}>
                      {item.student_name} • {item.section}
                    </Text>
                  </View>
                  {item.unread_count > 0 && (
                    <View style={styles.unreadBadge}>
                      <Text style={styles.unreadText}>{item.unread_count}</Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            }}
          />
        )}
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={80}
    >
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 14) }]}>
        <View style={styles.headerTopRow}>
          <TouchableOpacity
            onPress={() => {
              setActiveThread(null);
              void loadThreads(true);
            }}
            style={styles.headerIconBtn}
            accessibilityLabel="Back to conversations"
          >
            <Ionicons name="arrow-back" size={20} color={palette.onPrimary} />
          </TouchableOpacity>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {activeThread.student_name}
            </Text>
            <Text style={styles.headerSub} numberOfLines={1}>
              {activeThread.section} • {activeThread.faculty_name}
            </Text>
          </View>
        </View>
      </View>

      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={{ padding: 16, paddingBottom: 24, gap: 8 }}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
        renderItem={({ item }) => (
          <View
            style={[
              styles.msgBubble,
              item.is_mine ? styles.msgBubbleMine : styles.msgBubbleOther,
            ]}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
              <Text
                style={[
                  styles.senderMeta,
                  {
                    color: item.is_mine ? palette.onPrimary : palette.textMuted,
                    opacity: item.is_mine ? 0.85 : 1,
                  },
                ]}
              >
                {item.sender_name} • {item.time_only}
              </Text>
              {item.is_mine && (
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TouchableOpacity
                    onPress={() => {
                      setEditingMsgId(item.id);
                      setDraft(item.body);
                    }}
                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                    accessibilityLabel="Edit message"
                  >
                    <Ionicons name="create-outline" size={13} color={palette.onPrimary} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => handleDeleteMessage(item.id)}
                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                    accessibilityLabel="Delete message"
                  >
                    <Ionicons name="trash-outline" size={13} color={palette.onPrimary} />
                  </TouchableOpacity>
                </View>
              )}
            </View>
            <Text
              style={[
                styles.msgText,
                { color: item.is_mine ? palette.onPrimary : palette.textPrimary },
              ]}
            >
              {item.body}
            </Text>
          </View>
        )}
      />

      <View
        style={[
          styles.inputRow,
          { marginBottom: Math.max(insets.bottom, 10) + 72 },
        ]}
      >
        {editingMsgId ? (
          <TouchableOpacity
            style={[styles.sendBtn, { backgroundColor: palette.surfaceSubtle }]}
            onPress={() => {
              setEditingMsgId(null);
              setDraft('');
            }}
            accessibilityLabel="Cancel editing message"
          >
            <Ionicons name="close" size={18} color={palette.textSecondary} />
          </TouchableOpacity>
        ) : null}
        <TextInput
          style={styles.inputBox}
          value={draft}
          onChangeText={setDraft}
          placeholder={editingMsgId ? 'Edit your message...' : 'Type a message...'}
          placeholderTextColor={palette.textMuted}
          maxLength={1000}
          returnKeyType="send"
          onSubmitEditing={() => void handleSend()}
        />
        <TouchableOpacity
          style={[styles.sendBtn, (!draft.trim() || sending) && { opacity: 0.5 }]}
          onPress={() => void handleSend()}
          disabled={!draft.trim() || sending}
          accessibilityLabel="Send message"
        >
          {sending ? (
            <ActivityIndicator size="small" color={palette.onPrimary} />
          ) : (
            <Ionicons name="send" size={18} color={palette.onPrimary} />
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
};

const createStyles = (palette: ThemePalette, fonts: ReturnType<typeof useThemeMode>['fonts']) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: palette.background },
    header: {
      backgroundColor: palette.headerBg,
      paddingHorizontal: 20,
      paddingBottom: 22,
      borderBottomLeftRadius: 28,
      borderBottomRightRadius: 28,
    },
    headerTopRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    headerTitle: {
      fontSize: fonts.xxl,
      fontWeight: fonts.weight.extrabold,
      color: palette.onPrimary,
    },
    headerSub: {
      fontSize: fonts.base,
      color: palette.onPrimary,
      opacity: 0.86,
      marginTop: 2,
    },
    headerIconBtn: {
      width: 44,
      height: 44,
      borderRadius: 14,
      backgroundColor: palette.headerSurface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    controlsWrap: {
      paddingHorizontal: 16,
      paddingTop: 14,
      paddingBottom: 6,
    },
    searchRow: {
      flexDirection: 'row',
      gap: 10,
    },
    searchBox: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      height: 48,
      borderRadius: 16,
      paddingHorizontal: 14,
      borderWidth: 1,
      borderColor: palette.border,
      backgroundColor: palette.surface,
      gap: 8,
    },
    searchInput: {
      flex: 1,
      fontSize: fonts.md,
      color: palette.textPrimary,
    },
    filterIconBtn: {
      width: 48,
      height: 48,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: palette.border,
      backgroundColor: palette.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    pillsRow: {
      flexDirection: 'row',
      gap: 8,
      marginTop: 12,
      marginBottom: 6,
    },
    filterPill: {
      paddingHorizontal: 18,
      paddingVertical: 8,
      borderRadius: 20,
    },
    filterPillActive: {
      backgroundColor: palette.buttonBg,
    },
    filterPillInactive: {
      backgroundColor: palette.surface,
      borderWidth: 1,
      borderColor: palette.border,
    },
    filterPillText: {
      fontSize: fonts.sm,
      fontWeight: fonts.weight.bold,
    },
    threadRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
      gap: 14,
      borderBottomWidth: 1,
      borderBottomColor: palette.border,
    },
    initialsCircle: {
      width: 50,
      height: 50,
      borderRadius: 25,
      backgroundColor: palette.primarySoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    initialsText: {
      fontSize: fonts.md,
      fontWeight: fonts.weight.extrabold,
      color: palette.primary,
    },
    threadTitle: {
      fontSize: fonts.md,
      fontWeight: fonts.weight.extrabold,
      color: palette.textPrimary,
    },
    threadSub: {
      fontSize: fonts.sm,
      color: palette.textSecondary,
      marginTop: 2,
    },
    unreadBadge: {
      borderRadius: 12,
      paddingHorizontal: 9,
      paddingVertical: 3,
      backgroundColor: palette.buttonBg,
    },
    unreadText: {
      color: palette.onPrimary,
      fontSize: fonts.xs,
      fontWeight: fonts.weight.extrabold,
    },
    centerBox: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 32,
    },
    emptyTitle: {
      fontSize: fonts.lg,
      fontWeight: fonts.weight.extrabold,
      color: palette.textPrimary,
      marginTop: 10,
    },
    mutedText: {
      fontSize: fonts.sm,
      color: palette.textSecondary,
      textAlign: 'center',
      marginTop: 4,
    },
    msgBubble: {
      maxWidth: '80%',
      padding: 12,
      borderRadius: 16,
    },
    msgBubbleMine: {
      alignSelf: 'flex-end',
      backgroundColor: palette.buttonBg,
    },
    msgBubbleOther: {
      alignSelf: 'flex-start',
      backgroundColor: palette.surface,
      borderColor: palette.border,
      borderWidth: 1,
    },
    senderMeta: {
      fontSize: fonts.xxs,
      fontWeight: fonts.weight.bold,
      marginBottom: 4,
    },
    msgText: {
      fontSize: fonts.md,
      lineHeight: 19,
    },
    inputRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      padding: 10,
      borderTopWidth: 1,
      borderTopColor: palette.border,
      backgroundColor: palette.surface,
    },
    inputBox: {
      flex: 1,
      borderRadius: 20,
      paddingHorizontal: 14,
      paddingVertical: 10,
      fontSize: fonts.md,
      backgroundColor: palette.surfaceSubtle,
      borderWidth: 1,
      borderColor: palette.border,
      color: palette.textPrimary,
    },
    sendBtn: {
      width: 42,
      height: 42,
      borderRadius: 21,
      backgroundColor: palette.buttonBg,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });

export default ChatScreen;

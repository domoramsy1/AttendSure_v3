import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { apiClient } from '../api/client';
import { useThemeMode } from '../context/ThemeContext';

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

const getInitials = (name: string): string => {
  const parts = String(name || '').replace(/,/g, '').trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return String(name || 'FA').slice(0, 2).toUpperCase();
};

export const ChatScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const { palette } = useThemeMode();

  const [threads, setThreads] = useState<ThreadItem[]>([]);
  const [activeThread, setActiveThread] = useState<ThreadItem | null>(null);
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [search, setSearch] = useState<string>('');
  const [filterMode, setFilterMode] = useState<'ALL' | 'UNREAD'>('ALL');
  const [draft, setDraft] = useState<string>('');
  const [sending, setSending] = useState<boolean>(false);
  const flatListRef = useRef<FlatList<MessageItem> | null>(null);

  const loadThreads = useCallback(async () => {
    try {
      const res = await apiClient.get<any>('chat/threads/');
      setThreads(Array.isArray(res.data?.threads) ? res.data.threads : []);
    } catch {
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMessages = useCallback(async (thread: ThreadItem) => {
    try {
      const res = await apiClient.get<any>('chat/messages/', {
        params: { student_id: thread.student_id, faculty_id: thread.faculty_id },
      });
      setMessages(Array.isArray(res.data?.messages) ? res.data.messages : []);
    } catch {}
  }, []);

  useEffect(() => {
    loadThreads();
  }, [loadThreads]);

  useEffect(() => {
    if (!activeThread) return;
    loadMessages(activeThread);
    const timer = setInterval(() => loadMessages(activeThread), 8000);
    return () => clearInterval(timer);
  }, [activeThread, loadMessages]);

  const handleSend = async () => {
    if (!activeThread || !draft.trim() || sending) return;
    const text = draft.trim();
    setDraft('');
    setSending(true);
    try {
      const res = await apiClient.post<MessageItem>('chat/messages/', {
        student_id: activeThread.student_id,
        faculty_id: activeThread.faculty_id,
        body: text,
      });
      setMessages((prev) => [...prev, res.data]);
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    } catch {
      setDraft(text);
    } finally {
      setSending(false);
    }
  };

  const totalUnread = threads.reduce((acc, t) => acc + (t.unread_count || 0), 0);

  const filteredThreads = threads.filter((t) => {
    if (filterMode === 'UNREAD' && t.unread_count <= 0) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      t.student_name.toLowerCase().includes(q) ||
      t.faculty_name.toLowerCase().includes(q) ||
      t.parent_name.toLowerCase().includes(q) ||
      t.section.toLowerCase().includes(q)
    );
  });

  if (!activeThread) {
    return (
      <View style={[styles.container, { backgroundColor: palette.background }]}>
        {/* Royal Blue Curved Header */}
        <View
          style={[
            styles.royalHeader,
            { backgroundColor: palette.headerBg, paddingTop: Math.max(insets.top, 14) },
          ]}
        >
          <View style={styles.headerTopRow}>
            <View>
              <Text style={styles.headerTitle}>Messages</Text>
              <Text style={styles.headerSub}>
                {totalUnread === 0 ? 'You are all caught up' : `${totalUnread} unread message(s)`}
              </Text>
            </View>
            <TouchableOpacity style={styles.composeSquare} onPress={loadThreads}>
              <Ionicons name="create-outline" size={20} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Search Input & Filter Row */}
        <View style={styles.controlsWrap}>
          <View style={styles.searchRow}>
            <View style={[styles.searchBox, { backgroundColor: palette.surface, borderColor: palette.border }]}>
              <Ionicons name="search-outline" size={18} color={palette.textMuted} />
              <TextInput
                style={[styles.searchInput, { color: palette.textPrimary }]}
                value={search}
                onChangeText={setSearch}
                placeholder="Search faculty or parents"
                placeholderTextColor={palette.textMuted}
              />
            </View>
            <TouchableOpacity
              style={[styles.filterIconBtn, { backgroundColor: palette.surface, borderColor: palette.border }]}
              onPress={() => setFilterMode(filterMode === 'ALL' ? 'UNREAD' : 'ALL')}
            >
              <Ionicons name="options-outline" size={18} color={palette.primary} />
            </TouchableOpacity>
          </View>

          <View style={styles.pillsRow}>
            <TouchableOpacity
              style={[
                styles.filterPill,
                filterMode === 'ALL'
                  ? { backgroundColor: palette.primary }
                  : { backgroundColor: palette.surface, borderColor: palette.border, borderWidth: 1 },
              ]}
              onPress={() => setFilterMode('ALL')}
            >
              <Text style={[styles.filterPillText, { color: filterMode === 'ALL' ? '#FFFFFF' : palette.textSecondary }]}>
                All
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.filterPill,
                filterMode === 'UNREAD'
                  ? { backgroundColor: palette.primary }
                  : { backgroundColor: palette.surface, borderColor: palette.border, borderWidth: 1 },
              ]}
              onPress={() => setFilterMode('UNREAD')}
            >
              <Text style={[styles.filterPillText, { color: filterMode === 'UNREAD' ? '#FFFFFF' : palette.textSecondary }]}>
                Unread
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {loading ? (
          <View style={styles.centerBox}>
            <ActivityIndicator size="small" color={palette.primary} />
          </View>
        ) : (
          <FlatList
            data={filteredThreads}
            keyExtractor={(item) => item.thread_key}
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120 }}
            ListEmptyComponent={
              <View style={styles.centerBox}>
                <Ionicons name="chatbubbles-outline" size={44} color={palette.textMuted} />
                <Text style={[styles.emptyTitle, { color: palette.textPrimary }]}>No conversations found</Text>
                <Text style={[styles.mutedText, { color: palette.textSecondary }]}>
                  Linked parent and faculty chat threads appear here automatically.
                </Text>
              </View>
            }
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.threadRow}
                onPress={() => setActiveThread(item)}
                activeOpacity={0.75}
              >
                <View style={[styles.initialsCircle, { backgroundColor: palette.primarySoft }]}>
                  <Text style={[styles.initialsText, { color: palette.primary }]}>
                    {getInitials(item.faculty_name || item.student_name)}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.threadTitle, { color: palette.textPrimary }]}>
                    {item.faculty_name || item.parent_name}
                  </Text>
                  <Text style={[styles.threadSub, { color: palette.textSecondary }]} numberOfLines={1}>
                    {item.student_name} • {item.section}
                  </Text>
                </View>
                {item.unread_count > 0 && (
                  <View style={[styles.unreadBadge, { backgroundColor: palette.primary }]}>
                    <Text style={styles.unreadText}>{item.unread_count}</Text>
                  </View>
                )}
              </TouchableOpacity>
            )}
          />
        )}
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: palette.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={80}
    >
      <View
        style={[
          styles.royalHeader,
          { backgroundColor: palette.headerBg, paddingTop: Math.max(insets.top, 14) },
        ]}
      >
        <View style={styles.headerTopRow}>
          <TouchableOpacity
            onPress={() => {
              setActiveThread(null);
              loadThreads();
            }}
            style={styles.composeSquare}
          >
            <Ionicons name="arrow-back" size={20} color="#FFFFFF" />
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
        contentContainerStyle={{ padding: 16, paddingBottom: 110, gap: 8 }}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
        renderItem={({ item }) => (
          <View
            style={[
              styles.msgBubble,
              item.is_mine
                ? { alignSelf: 'flex-end', backgroundColor: palette.primary }
                : { alignSelf: 'flex-start', backgroundColor: palette.surface, borderColor: palette.border, borderWidth: 1 },
            ]}
          >
            <Text style={[styles.senderMeta, { color: item.is_mine ? '#DBE4FF' : palette.textMuted }]}>
              {item.sender_name} • {item.time_only}
            </Text>
            <Text style={[styles.msgText, { color: item.is_mine ? '#FFFFFF' : palette.textPrimary }]}>
              {item.body}
            </Text>
          </View>
        )}
      />

      <View style={[styles.inputRow, { backgroundColor: palette.surface, borderTopColor: palette.border, marginBottom: 78 }]}>
        <TextInput
          style={[styles.inputBox, { backgroundColor: palette.background, color: palette.textPrimary }]}
          value={draft}
          onChangeText={setDraft}
          placeholder="Type a message..."
          placeholderTextColor={palette.textMuted}
        />
        <TouchableOpacity
          style={[styles.sendBtn, { backgroundColor: palette.primary }, (!draft.trim() || sending) && { opacity: 0.5 }]}
          onPress={handleSend}
          disabled={!draft.trim() || sending}
        >
          <Ionicons name="send" size={18} color="#FFFFFF" />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  royalHeader: {
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
    fontSize: 26,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  headerSub: {
    fontSize: 13.5,
    color: '#DBE4FF',
    marginTop: 2,
  },
  composeSquare: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
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
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
  },
  filterIconBtn: {
    width: 48,
    height: 48,
    borderRadius: 16,
    borderWidth: 1,
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
  filterPillText: {
    fontSize: 13,
    fontWeight: '700',
  },
  threadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 14,
  },
  initialsCircle: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initialsText: {
    fontSize: 15,
    fontWeight: '800',
  },
  threadTitle: {
    fontSize: 15.5,
    fontWeight: '800',
  },
  threadSub: {
    fontSize: 13,
    marginTop: 2,
  },
  unreadBadge: {
    borderRadius: 12,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  unreadText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  centerBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '800',
    marginTop: 10,
  },
  mutedText: {
    fontSize: 13,
    textAlign: 'center',
    marginTop: 4,
  },
  msgBubble: {
    maxWidth: '80%',
    padding: 12,
    borderRadius: 16,
  },
  senderMeta: {
    fontSize: 10,
    fontWeight: '700',
    marginBottom: 4,
  },
  msgText: {
    fontSize: 14,
    lineHeight: 19,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderTopWidth: 1,
  },
  inputBox: {
    flex: 1,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
  },
  sendBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default ChatScreen;
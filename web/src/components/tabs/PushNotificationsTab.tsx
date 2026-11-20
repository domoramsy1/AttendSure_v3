/**
 * AttendSure - Mobile Push Notifications & Parent Alerts Center
 * File: web/src/components/tabs/PushNotificationsTab.tsx
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import apiClient, { peekApiCache } from '../../api/client';
import { API_ROUTES, extractApiError } from '../../api/routes';
import { useTheme } from '../../context/ThemeContext';
import { useAlert } from '../../context/AlertContext';
import { StatsCard } from '../common/StatsCard';
import { ControlSwitch } from '../ui/ControlSwitch';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Bell, CheckCircle2, Edit2, Plus, RefreshCw, Send, Smartphone, Trash2 } from 'lucide-react';

interface NotificationRow {
  id: number;
  recipient?: number | null;
  recipient_name?: string;
  student: number | null;
  student_name: string;
  title: string;
  message: string;
  category: string;
  is_read: boolean;
  is_pushed: boolean;
  created_at: string;
}

type CategoryFilter = 'ALL' | 'ATTENDANCE' | 'CUTTING_ALERT' | 'GATE_PASS' | 'ANNOUNCEMENT';

const sanitizeInput = (raw: string, maxLength = 500): string =>
  String(raw || '')
    .replace(/[\u0000-\u001F\u007F<>]/g, '')
    .trim()
    .slice(0, maxLength);

export const PushNotificationsTab: React.FC = () => {
  const { tokens, brand, ui } = useTheme();
  const { showAlert, showConfirm } = useAlert();

  const userRole = String(localStorage.getItem('attendsure_role') || 'FACULTY').toUpperCase();
  const isLeader = ['ADMIN', 'SUPERADMIN', 'FACULTY_ADMIN', 'PRINCIPAL', 'DEPT_HEAD'].includes(userRole);
  const listBaseParams = isLeader ? { page_size: 100, scope: 'all' } : { page_size: 100 };

  const cachedNotifs = peekApiCache<any>(API_ROUTES.messaging.notifications, listBaseParams);
  const cachedSys = peekApiCache<any>(API_ROUTES.reports.systemStatus);

  const [rows, setRows] = useState<NotificationRow[]>(() =>
    Array.isArray(cachedNotifs) ? cachedNotifs : cachedNotifs?.results || []
  );
  const [loading, setLoading] = useState<boolean>(() => !cachedNotifs);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [markingRead, setMarkingRead] = useState<boolean>(false);
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('ALL');
  const [search, setSearch] = useState('');
  const [statusStats, setStatusStats] = useState(() => ({
    sentToday: Number(cachedSys?.push_alerts_today || 0),
    pushedToday: Number(cachedSys?.push_delivered_today || 0),
    activeStudents: Number(cachedSys?.active_students || 0),
  }));

  const [composeOpen, setComposeOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<NotificationRow | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    title: '',
    message: '',
    category: 'ANNOUNCEMENT',
    target_role: 'PARENT',
    is_read: false,
  });

  const abortRef = useRef<AbortController | null>(null);

  const fetchAlerts = useCallback(
    async (silent = false, bypassCache = false) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const baseQuery = isLeader ? { page_size: 100, scope: 'all' } : { page_size: 100 };
      const warmNotifs = !bypassCache
        ? peekApiCache<any>(API_ROUTES.messaging.notifications, baseQuery)
        : undefined;
      if (warmNotifs) {
        setRows(Array.isArray(warmNotifs) ? warmNotifs : warmNotifs?.results || []);
        setLoading(false);
        if (silent) setRefreshing(true);
      } else if (!silent) {
        setLoading(true);
      } else {
        setRefreshing(true);
      }

      try {
        const extra = bypassCache ? { nocache: 1 } : {};
        const [notifRes, sysRes] = await Promise.allSettled([
          apiClient.get(API_ROUTES.messaging.notifications, {
            params: { ...baseQuery, ...extra },
            signal: controller.signal,
          }),
          apiClient.get(API_ROUTES.reports.systemStatus, {
            params: extra,
            signal: controller.signal,
          }),
        ]);

        if (controller.signal.aborted) return;

        if (notifRes.status === 'fulfilled') {
          const payload = notifRes.value.data;
          const list = Array.isArray(payload) ? payload : payload?.results || [];
          setRows(list);
        } else {
          const reason = notifRes.reason as { name?: string; code?: string };
          if (reason?.name !== 'CanceledError' && reason?.code !== 'ERR_CANCELED' && !silent) {
            showAlert({
              title: 'Load Error',
              message: extractApiError(notifRes.reason, 'Could not load notifications.'),
              type: 'error',
            });
          }
        }

        if (sysRes.status === 'fulfilled' && sysRes.value.data) {
          const data = sysRes.value.data;
          setStatusStats({
            sentToday: Number(data.push_alerts_today || 0),
            pushedToday: Number(data.push_delivered_today || 0),
            activeStudents: Number(data.active_students || 0),
          });
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [showAlert, isLeader]
  );

  useEffect(() => {
    void fetchAlerts(false, false);
    return () => {
      abortRef.current?.abort();
    };
  }, [fetchAlerts]);

  const handleOpenCreate = () => {
    setEditingRow(null);
    setForm({ title: '', message: '', category: 'ANNOUNCEMENT', target_role: 'PARENT', is_read: false });
    setComposeOpen(true);
  };

  const handleOpenEdit = (item: NotificationRow) => {
    setEditingRow(item);
    setForm({
      title: item.title,
      message: item.message,
      category: item.category || 'ANNOUNCEMENT',
      target_role: 'PARENT',
      is_read: Boolean(item.is_read),
    });
    setComposeOpen(true);
  };

  const handleCreateOrUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanTitle = sanitizeInput(form.title, 150);
    const cleanMessage = sanitizeInput(form.message, 500);
    if (!cleanTitle || !cleanMessage) {
      showAlert({
        title: 'Notice Incomplete',
        message: 'Please enter both a valid title and message.',
        type: 'warning',
      });
      return;
    }

    setSubmitting(true);
    try {
      if (editingRow) {
        const res = await apiClient.patch(`${API_ROUTES.messaging.notifications}${editingRow.id}/`, {
          title: cleanTitle,
          message: cleanMessage,
          category: form.category,
          is_read: form.is_read,
        });
        setRows((prev) => prev.map((r) => (r.id === editingRow.id ? { ...r, ...res.data } : r)));
        setComposeOpen(false);
        setEditingRow(null);
        showAlert({
          title: 'Notice Updated',
          message: 'Notification details have been saved.',
          type: 'success',
        });
      } else {
        const res = await apiClient.post(API_ROUTES.messaging.notifications, {
          title: cleanTitle,
          message: cleanMessage,
          category: form.category,
          target_role: form.target_role,
        });
        const count = res.data?.dispatched_count ?? 1;
        setComposeOpen(false);
        setForm({ title: '', message: '', category: 'ANNOUNCEMENT', target_role: 'PARENT', is_read: false });
        await fetchAlerts(true, true);
        showAlert({
          title: 'Alert Dispatched',
          message: `Delivered notice to ${count} active account(s) and queued mobile push notifications.`,
          type: 'success',
        });
      }
    } catch (err) {
      showAlert({
        title: editingRow ? 'Update Error' : 'Dispatch Error',
        message: extractApiError(err, editingRow ? 'Could not update notice.' : 'Could not send push alert.'),
        type: 'error',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleMarkAllRead = async () => {
    if (markingRead) return;
    setMarkingRead(true);
    try {
      await apiClient.post(API_ROUTES.messaging.markRead, {});
      await fetchAlerts(true, true);
      showAlert({
        title: 'Inbox Cleared',
        message: 'All notifications have been marked as read.',
        type: 'success',
      });
    } catch (err) {
      showAlert({
        title: 'Update Failed',
        message: extractApiError(err, 'Could not mark notifications as read.'),
        type: 'error',
      });
    } finally {
      setMarkingRead(false);
    }
  };

  const handleDelete = (item: NotificationRow) => {
    showConfirm({
      title: 'Delete Notification',
      message: `Remove "${item.title}" permanently?`,
      confirmLabel: 'Delete',
      isDestructive: true,
      onConfirm: async () => {
        try {
          await apiClient.delete(`${API_ROUTES.messaging.notifications}${item.id}/`);
          setRows((prev) => prev.filter((r) => r.id !== item.id));
        } catch (err) {
          showAlert({ title: 'Delete Failed', message: extractApiError(err, 'Could not delete notification.'), type: 'error' });
        }
      },
    });
  };

  const cleanSearch = sanitizeInput(search, 80).toLowerCase();
  const filtered = rows.filter((r) => {
    if (categoryFilter !== 'ALL' && r.category !== categoryFilter) return false;
    if (!cleanSearch) return true;
    return (
      r.title.toLowerCase().includes(cleanSearch) ||
      r.message.toLowerCase().includes(cleanSearch) ||
      (r.student_name || '').toLowerCase().includes(cleanSearch)
    );
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: 'clamp(12px, 2vw, 20px)' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 210px), 1fr))', gap: 12 }}>
        <StatsCard
          label="ALERTS CREATED TODAY"
          value={statusStats.sentToday}
          helpText="Attendance, cutting & exit alerts"
          badge={<Bell size={18} color={brand.primary} />}
        />
        <StatsCard
          label="MOBILE PUSH DELIVERED"
          value={statusStats.pushedToday}
          valueColor={brand.success}
          helpText="Delivered to mobile devices"
          badge={<Smartphone size={18} color={brand.success} />}
        />
        <StatsCard
          label="UNREAD IN INBOX"
          value={rows.filter((r) => !r.is_read).length}
          helpText="Awaiting recipient read receipt"
          badge={<CheckCircle2 size={18} color={brand.secondary} />}
        />
      </div>

      <div style={{ ...ui.card, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <ControlSwitch<CategoryFilter>
          options={[
            { value: 'ALL', label: 'All Alerts' },
            { value: 'ATTENDANCE', label: 'Attendance' },
            { value: 'CUTTING_ALERT', label: 'Cutting Alerts' },
            { value: 'GATE_PASS', label: 'Exit Passes' },
            { value: 'ANNOUNCEMENT', label: 'Announcements' },
          ]}
          value={categoryFilter}
          onChange={setCategoryFilter}
          size="sm"
        />

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            type="text"
            maxLength={80}
            placeholder="Search alerts..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ ...ui.input, width: 200 }}
          />
          <button type="button" onClick={() => void handleMarkAllRead()} disabled={markingRead} style={ui.btnSecondary}>
            <CheckCircle2 size={14} /> {markingRead ? 'Updating...' : 'Mark All Read'}
          </button>
          <button type="button" onClick={() => void fetchAlerts(false, true)} disabled={loading || refreshing} style={ui.btnSecondary}>
            <RefreshCw size={14} className={loading || refreshing ? 'animate-spin' : ''} /> Refresh
          </button>
          <button type="button" onClick={handleOpenCreate} style={ui.btnPrimary}>
            <Plus size={14} /> New Notice
          </button>
        </div>
      </div>

      <div style={{ ...ui.card, padding: 0, overflowX: 'auto' }}>
        <table style={{ width: '100%', minWidth: 680, borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr>
              <th style={ui.th}>Category</th>
              <th style={ui.th}>Student</th>
              <th style={ui.th}>Title &amp; Message</th>
              <th style={ui.th}>Delivery</th>
              <th style={ui.th}>Created</th>
              <th style={{ ...ui.th, textAlign: 'right' }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} style={{ padding: 32, textAlign: 'center', color: tokens.textMuted }}>
                  Loading notifications...
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: 32, textAlign: 'center', color: tokens.textMuted }}>
                  No notifications match the current filter.
                </td>
              </tr>
            ) : (
              filtered.map((item) => (
                <tr key={item.id}>
                  <td style={ui.td}>
                    <span style={ui.badge(tokens.primaryLight, brand.primary)}>{item.category}</span>
                  </td>
                  <td style={ui.td}>{item.student_name || 'General'}</td>
                  <td style={ui.td}>
                    <strong style={{ display: 'block', color: tokens.textPrimary }}>{item.title}</strong>
                    <span style={{ fontSize: '0.76rem', color: tokens.textSecondary }}>{item.message}</span>
                  </td>
                  <td style={ui.td}>
                    <span
                      style={ui.badge(
                        item.is_pushed ? tokens.successLight : tokens.infoLight,
                        item.is_pushed ? brand.success : brand.secondary
                      )}
                    >
                      {item.is_pushed ? 'PUSHED' : 'IN-APP'}
                    </span>
                  </td>
                  <td style={{ ...ui.td, fontSize: '0.74rem', color: tokens.textMuted }}>
                    {new Date(item.created_at).toLocaleString()}
                  </td>
                  <td style={{ ...ui.td, textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', gap: 6 }}>
                      <button
                        type="button"
                        onClick={() => handleOpenEdit(item)}
                        aria-label={`Edit notification ${item.title}`}
                        title="Edit Notice"
                        style={{ ...ui.btnSecondary, color: brand.primary, padding: '5px 8px' }}
                      >
                        <Edit2 size={13} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(item)}
                        aria-label={`Delete notification ${item.title}`}
                        title="Delete Notice"
                        style={{ ...ui.btnSecondary, color: brand.danger, padding: '5px 8px' }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Modal
        isOpen={composeOpen}
        onClose={() => {
          setComposeOpen(false);
          setEditingRow(null);
        }}
        title={editingRow ? 'Edit Notification' : 'Send Mobile Push Notice'}
      >
        <form onSubmit={handleCreateOrUpdate} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 190px), 1fr))', gap: 10 }}>
            {!editingRow && (
              <div>
                <label style={ui.label}>Target Audience</label>
                <select
                  value={form.target_role}
                  onChange={(e) => setForm({ ...form, target_role: e.target.value })}
                  style={ui.input}
                >
                  <option value="PARENT">All Linked Parents</option>
                  <option value="FACULTY">All Faculty</option>
                  <option value="ALL">Everyone (Parents &amp; Staff)</option>
                </select>
              </div>
            )}

            <div>
              <label style={ui.label}>Category</label>
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                style={ui.input}
              >
                <option value="ANNOUNCEMENT">School Announcement</option>
                <option value="ATTENDANCE">Attendance Notice</option>
                <option value="GATE_PASS">Exit Pass Notice</option>
                <option value="CUTTING_ALERT">Cutting Alert</option>
              </select>
            </div>
          </div>

          <div>
            <label style={ui.label}>Title *</label>
            <input
              required
              maxLength={150}
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              style={ui.input}
              placeholder="e.g. Early Dismissal Advisory"
            />
          </div>
          <div>
            <label style={ui.label}>Message *</label>
            <textarea
              required
              rows={3}
              maxLength={500}
              value={form.message}
              onChange={(e) => setForm({ ...form, message: e.target.value })}
              style={ui.input}
              placeholder="Write plain-English message..."
            />
          </div>
          {editingRow && (
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: '0.80rem', color: tokens.textPrimary, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={form.is_read}
                onChange={(e) => setForm({ ...form, is_read: e.target.checked })}
              />
              <span>Mark as read</span>
            </label>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
            <Button
              variant="secondary"
              type="button"
              onClick={() => {
                setComposeOpen(false);
                setEditingRow(null);
              }}
            >
              Cancel
            </Button>
            <Button variant="primary" type="submit" loading={submitting} icon={<Send size={14} />}>
              {editingRow ? 'Save Changes' : 'Send Alert'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default PushNotificationsTab;

/**
 * AttendSure - Mobile Push Notifications & Parent Alerts Center (Zero Hardware Bloat)
 * File: web/src/components/tabs/PushNotificationsTab.tsx
 */

import React, { useState, useEffect, useCallback } from 'react';
import apiClient from '../../api/client';
import { API_ROUTES, extractApiError } from '../../api/routes';
import { useTheme } from '../../context/ThemeContext';
import { useAlert } from '../../context/AlertContext';
import { StatsCard } from '../common/StatsCard';
import { ControlSwitch } from '../ui/ControlSwitch';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Bell, CheckCircle2, Plus, RefreshCw, Send, Smartphone, Trash2 } from 'lucide-react';

interface NotificationRow {
  id: number;
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

export const PushNotificationsTab: React.FC = () => {
  const { tokens, brand, ui } = useTheme();
  const { showAlert } = useAlert();

  const [rows, setRows] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('ALL');
  const [search, setSearch] = useState('');
  const [statusStats, setStatusStats] = useState({ sentToday: 0, pushedToday: 0, activeStudents: 0 });

  const [composeOpen, setComposeOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ title: '', message: '', category: 'ANNOUNCEMENT' });

  const fetchAlerts = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [notifRes, sysRes] = await Promise.all([
        apiClient.get(API_ROUTES.messaging.notifications, { params: { page_size: 100 } }),
        apiClient.get(API_ROUTES.reports.systemStatus),
      ]);
      const list = Array.isArray(notifRes.data) ? notifRes.data : notifRes.data?.results || [];
      setRows(list);
      if (sysRes.data) {
        setStatusStats({
          sentToday: Number(sysRes.data.push_alerts_today || 0),
          pushedToday: Number(sysRes.data.push_delivered_today || 0),
          activeStudents: Number(sysRes.data.active_students || 0),
        });
      }
    } catch (err) {
      if (!silent) showAlert({ title: 'Load Error', message: extractApiError(err), type: 'error' });
    } finally {
      if (!silent) setLoading(false);
    }
  }, [showAlert]);

  useEffect(() => {
    fetchAlerts(false);
  }, [fetchAlerts]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim() || !form.message.trim()) return;
    setSubmitting(true);
    try {
      await apiClient.post(API_ROUTES.messaging.notifications, {
        title: form.title.trim(),
        message: form.message.trim(),
        category: form.category,
      });
      setComposeOpen(false);
      setForm({ title: '', message: '', category: 'ANNOUNCEMENT' });
      fetchAlerts(true);
      showAlert({ title: 'Alert Dispatched', message: 'Mobile push notification saved and queued.', type: 'success' });
    } catch (err) {
      showAlert({ title: 'Dispatch Error', message: extractApiError(err), type: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleMarkAllRead = async () => {
    await apiClient.post(API_ROUTES.messaging.markRead, {});
    fetchAlerts(true);
  };

  const handleDelete = async (id: number) => {
    await apiClient.delete(`${API_ROUTES.messaging.notifications}${id}/`);
    setRows((prev) => prev.filter((r) => r.id !== id));
  };

  const filtered = rows.filter((r) => {
    if (categoryFilter !== 'ALL' && r.category !== categoryFilter) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      r.title.toLowerCase().includes(q) ||
      r.message.toLowerCase().includes(q) ||
      (r.student_name || '').toLowerCase().includes(q)
    );
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: 'clamp(12px, 2vw, 20px)' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 12 }}>
        <StatsCard label="ALERTS CREATED TODAY" value={statusStats.sentToday} helpText="Attendance, cutting & exit alerts" badge={<Bell size={18} color={brand.primary} />} />
        <StatsCard label="EXPO PUSH DELIVERED" value={statusStats.pushedToday} valueColor={brand.success} helpText="Delivered to mobile devices" badge={<Smartphone size={18} color={brand.success} />} />
        <StatsCard label="UNREAD IN INBOX" value={rows.filter((r) => !r.is_read).length} helpText="Awaiting recipient read receipt" badge={<CheckCircle2 size={18} color={brand.secondary} />} />
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
            placeholder="Search alerts..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ ...ui.input, width: 200 }}
          />
          <button type="button" onClick={handleMarkAllRead} style={ui.btnSecondary}>
            <CheckCircle2 size={14} /> Mark All Read
          </button>
          <button type="button" onClick={() => fetchAlerts(false)} style={ui.btnSecondary}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
          <button type="button" onClick={() => setComposeOpen(true)} style={ui.btnPrimary}>
            <Plus size={14} /> New Notice
          </button>
        </div>
      </div>

      <div style={{ ...ui.card, padding: 0, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
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
              <tr><td colSpan={6} style={{ padding: 32, textAlign: 'center', color: tokens.textMuted }}>Loading notifications...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={6} style={{ padding: 32, textAlign: 'center', color: tokens.textMuted }}>No notifications match the current filter.</td></tr>
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
                    <span style={ui.badge(item.is_pushed ? tokens.successLight : tokens.infoLight, item.is_pushed ? brand.success : brand.secondary)}>
                      {item.is_pushed ? 'PUSHED' : 'IN-APP'}
                    </span>
                  </td>
                  <td style={{ ...ui.td, fontSize: '0.74rem', color: tokens.textMuted }}>
                    {new Date(item.created_at).toLocaleString()}
                  </td>
                  <td style={{ ...ui.td, textAlign: 'right' }}>
                    <button type="button" onClick={() => handleDelete(item.id)} style={{ ...ui.btnSecondary, color: brand.danger, padding: '5px 8px' }}>
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Modal isOpen={composeOpen} onClose={() => setComposeOpen(false)} title="Send Mobile Push Notice">
        <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={ui.label}>Category</label>
            <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} style={ui.input}>
              <option value="ANNOUNCEMENT">School Announcement</option>
              <option value="ATTENDANCE">Attendance Notice</option>
              <option value="GATE_PASS">Exit Pass Notice</option>
            </select>
          </div>
          <div>
            <label style={ui.label}>Title *</label>
            <input required maxLength={150} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} style={ui.input} placeholder="e.g. Early Dismissal Advisory" />
          </div>
          <div>
            <label style={ui.label}>Message *</label>
            <textarea required rows={3} maxLength={500} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} style={ui.input} placeholder="Write plain-English message..." />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
            <Button variant="secondary" type="button" onClick={() => setComposeOpen(false)}>Cancel</Button>
            <Button variant="primary" type="submit" loading={submitting} icon={<Send size={14} />}>Send Alert</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default PushNotificationsTab;
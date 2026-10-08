import React, { useState, useEffect, useCallback } from 'react';
import apiClient from '../../api/client';
import { ModuleTableLayout } from './ModuleTableLayout';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Pencil, Trash2, Loader2 } from 'lucide-react';

interface SystemUser {
  id: number;
  username: string;
  email: string;
  role: string;
  is_active: boolean;
}

export const UsersTab: React.FC = () => {
  const [users, setUsers] = useState<SystemUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<SystemUser | null>(null);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    role: 'STAFF',
    password: '',
  });

  const fetchUsers = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await apiClient.get<any>('/users/');
      const raw = res.data;
      const items: SystemUser[] = Array.isArray(raw)
        ? raw
        : raw?.results && Array.isArray(raw.results)
        ? raw.results
        : [];
      setUsers(items);
    } catch (err: any) {
      setError('Failed to fetch user accounts. Admin access required.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleOpenCreate = () => {
    setEditingUser(null);
    setFormData({ username: '', email: '', role: 'STAFF', password: '' });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (user: SystemUser) => {
    setEditingUser(user);
    setFormData({ username: user.username, email: user.email, role: user.role, password: '' });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload: any = {
        username: formData.username,
        email: formData.email,
        role: formData.role,
      };
      if (formData.password) payload.password = formData.password;

      if (editingUser) {
        const res = await apiClient.put<SystemUser>(`/users/${editingUser.id}/`, payload);
        setUsers((prev) => (Array.isArray(prev) ? prev.map((u) => (u.id === editingUser.id ? res.data : u)) : [res.data]));
      } else {
        const res = await apiClient.post<SystemUser>('/users/', payload);
        setUsers((prev) => (Array.isArray(prev) ? [res.data, ...prev] : [res.data]));
      }
      setIsModalOpen(false);
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to save user account.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (user: SystemUser) => {
    if (!window.confirm(`Delete user account "${user.username}"?`)) return;
    try {
      await apiClient.delete(`/users/${user.id}/`);
      setUsers((prev) => (Array.isArray(prev) ? prev.filter((u) => u.id !== user.id) : []));
    } catch (err) {
      alert('Failed to delete user.');
    }
  };

  const userList = Array.isArray(users) ? users : [];
  const filtered = userList.filter((u) =>
    (u.username || '').toLowerCase().includes(search.toLowerCase()) ||
    (u.email || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <>
      <ModuleTableLayout
        title="Users"
        subtitle="Manage access roles and credentials directly from the database."
        searchPlaceholder="Search username or email..."
        searchValue={search}
        onSearchChange={setSearch}
        addButtonLabel="Add User"
        onAdd={handleOpenCreate}
        loading={loading}
        error={error}
        data={filtered}
        keyExtractor={(u) => u.id}
        columns={[
          { header: 'Username', render: (u) => <span style={{ fontWeight: 700 }}>{u.username}</span> },
          { header: 'Email Address', render: (u) => u.email || '—' },
          { header: 'Portal Role', render: (u) => u.role },
          {
            header: 'Status',
            render: (u) => (
              <span
                style={{
                  padding: '3px 8px',
                  borderRadius: 12,
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  backgroundColor: u.is_active ? '#ecfdf5' : '#fef2f2',
                  color: u.is_active ? '#059669' : '#dc2626',
                }}
              >
                {u.is_active ? 'ACTIVE' : 'SUSPENDED'}
              </span>
            ),
          },
          {
            header: 'Actions',
            align: 'right',
            render: (u) => (
              <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                <button
                  onClick={() => handleOpenEdit(u)}
                  title="Edit User"
                  style={{
                    background: '#f1f5f9',
                    border: '1px solid #cbd5e1',
                    borderRadius: 6,
                    padding: 5,
                    cursor: 'pointer',
                    color: '#0284c7',
                  }}
                >
                  <Pencil size={14} />
                </button>
                <button
                  onClick={() => handleDelete(u)}
                  title="Delete User"
                  style={{
                    background: '#fef2f2',
                    border: '1px solid #fee2e2',
                    borderRadius: 6,
                    padding: 5,
                    cursor: 'pointer',
                    color: '#dc2626',
                  }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ),
          },
        ]}
      />

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingUser ? 'Edit User Credentials' : 'Create User Account'}
      >
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: 4 }}>
              Username *
            </label>
            <input
              type="text"
              required
              value={formData.username}
              onChange={(e) => setFormData({ ...formData, username: e.target.value })}
              style={inputStyle}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: 4 }}>
              Email Address
            </label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              style={inputStyle}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: 4 }}>
              Access Role *
            </label>
            <select
              value={formData.role}
              onChange={(e) => setFormData({ ...formData, role: e.target.value })}
              style={inputStyle}
            >
              <option value="ADMIN">Administrator</option>
              <option value="REGISTRAR">Registrar</option>
              <option value="TEACHER">Faculty</option>
              <option value="SECURITY">Guard</option>
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: 4 }}>
              Password {editingUser ? '(Leave blank to keep unchanged)' : '*'}
            </label>
            <input
              type="password"
              required={!editingUser}
              placeholder="••••••••"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              style={inputStyle}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
            <Button variant="secondary" size="md" type="button" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="md" type="submit" disabled={saving}>
              {saving ? <Loader2 className="animate-spin" size={16} style={{ marginRight: 6 }} /> : null}
              {editingUser ? 'Update Account' : 'Create User'}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  borderRadius: 6,
  border: '1px solid #cbd5e1',
  fontSize: '0.85rem',
  outline: 'none',
  boxSizing: 'border-box',
};

export default UsersTab;
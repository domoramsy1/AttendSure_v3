import React, { useState, useEffect } from 'react';
import apiClient from '../../api/client';
import { ModuleTableLayout } from './ModuleTableLayout';

interface Pass {
  pass_id: string;
  bearer_name: string;
  reason: string;
  valid_from: string;
  valid_to: string;
  status: string;
}

export const GatePassesTab: React.FC = () => {
  const [passes, setPasses] = useState<Pass[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetchPasses();
  }, []);

  const fetchPasses = async () => {
    try {
      setLoading(true);
      const res = await apiClient.get<Pass[]>('/gate-passes/');
      setPasses(res.data);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to fetch gate pass records');
    } finally {
      setLoading(false);
    }
  };

  const filtered = passes.filter((p) =>
    p.bearer_name.toLowerCase().includes(search.toLowerCase()) ||
    p.pass_id.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <ModuleTableLayout
      title="Gate Pass Slips"
      subtitle="Campus leave authorizations recorded in database."
      searchPlaceholder="Search pass..."
      searchValue={search}
      onSearchChange={setSearch}
      loading={loading}
      error={error}
      data={filtered}
      keyExtractor={(p) => p.pass_id}
      columns={[
        { header: 'Pass Number', render: (p) => <span style={{ fontWeight: 700 }}>{p.pass_id}</span> },
        { header: 'Bearer Name', render: (p) => p.bearer_name },
        { header: 'Official Reason', render: (p) => p.reason },
        { header: 'Valid From', render: (p) => p.valid_from },
        { header: 'Valid Until', render: (p) => p.valid_to },
        {
          header: 'Status',
          render: (p) => (
            <span style={{ padding: '3px 8px', borderRadius: 12, fontSize: '0.72rem', fontWeight: 700, backgroundColor: p.status === 'ACTIVE' ? '#ecfdf5' : '#f1f5f9', color: p.status === 'ACTIVE' ? '#059669' : '#64748b' }}>
              {p.status}
            </span>
          ),
        },
      ]}
    />
  );
};
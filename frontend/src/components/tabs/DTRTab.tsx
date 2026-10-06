import React, { useState, useEffect } from 'react';
import apiClient from '../../api/client';
import { ModuleTableLayout } from './ModuleTableLayout';

interface DTRRecord {
  record_id: string;
  faculty_name: string;
  date: string;
  time_in: string;
  time_out: string;
  status: string;
}

export const DTRTab: React.FC = () => {
  const [dtrLogs, setDtrLogs] = useState<DTRRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetchDTR();
  }, []);

  const fetchDTR = async () => {
    try {
      setLoading(true);
      const res = await apiClient.get<DTRRecord[]>('/dtr/');
      setDtrLogs(res.data);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to fetch Daily Time Records');
    } finally {
      setLoading(false);
    }
  };

  const filtered = dtrLogs.filter((d) => 
    d.faculty_name.toLowerCase().includes(search.toLowerCase()) || 
    d.date.includes(search)
  );

  return (
    <ModuleTableLayout
      title="Daily Time Record (CSC Form 48)"
      subtitle="Biometric gate scans aggregated into official DepEd teacher time logs."
      searchPlaceholder="Filter by teacher or date (YYYY-MM-DD)..."
      searchValue={search}
      onSearchChange={setSearch}
      loading={loading}
      error={error}
      data={filtered}
      keyExtractor={(d) => d.record_id}
      columns={[
        { header: 'Date', render: (d) => <span style={{ fontWeight: 600 }}>{d.date}</span> },
        { header: 'Faculty Name', render: (d) => d.faculty_name },
        { header: 'Time In', render: (d) => <span style={{ color: '#059669', fontWeight: 600 }}>{d.time_in}</span> },
        { header: 'Time Out', render: (d) => <span style={{ color: '#0284c7', fontWeight: 600 }}>{d.time_out}</span> },
        {
          header: 'Log State',
          render: (d) => (
            <span style={{ padding: '3px 8px', borderRadius: 12, fontSize: '0.72rem', fontWeight: 700, backgroundColor: '#f0fdf4', color: '#16a34a' }}>
              {d.status}
            </span>
          ),
        },
      ]}
    />
  );
};
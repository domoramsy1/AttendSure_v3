import React from 'react';
import { Search, Plus, Loader2, AlertCircle } from 'lucide-react';
import { Button } from '../ui/Button';

interface Column<T> {
  header: string;
  render: (item: T, index?: number) => React.ReactNode;
  align?: 'left' | 'center' | 'right';
}

interface ModuleTableLayoutProps<T> {
  title: string;
  subtitle: string;
  searchPlaceholder?: string;
  searchValue: string;
  onSearchChange: (value: string) => void;
  addButtonLabel?: string;
  onAdd?: () => void;
  loading: boolean;
  error: string | null;
  columns: Column<T>[];
  data: T[];
  keyExtractor: (item: T) => string | number;
}

export function ModuleTableLayout<T>({
  title,
  subtitle,
  searchPlaceholder = 'Search records...',
  searchValue,
  onSearchChange,
  addButtonLabel,
  onAdd,
  loading,
  error,
  columns,
  data,
  keyExtractor,
}: ModuleTableLayoutProps<T>) {
  // Runtime defensive check: safely unwrap whether data is an array or a paginated object
  const tableItems: T[] = Array.isArray(data)
    ? data
    : (data as any)?.results && Array.isArray((data as any).results)
    ? (data as any).results
    : (data as any)?.data && Array.isArray((data as any).data)
    ? (data as any).data
    : [];

  return (
    <div style={{ padding: '24px 32px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: '#0f172a' }}>
            {title}
          </h3>
          <p style={{ margin: '4px 0 0 0', fontSize: '0.82rem', color: '#64748b' }}>
            {subtitle}
          </p>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ position: 'relative' }}>
            <Search size={16} color="#94a3b8" style={{ position: 'absolute', left: 10, top: 10 }} />
            <input
              type="text"
              placeholder={searchPlaceholder}
              value={searchValue}
              onChange={(e) => onSearchChange(e.target.value)}
              style={{
                padding: '8px 12px 8px 32px',
                borderRadius: '6px',
                border: '1px solid #cbd5e1',
                fontSize: '0.85rem',
                outline: 'none',
                minWidth: '240px',
              }}
            />
          </div>
          {addButtonLabel && onAdd && (
            <Button variant="primary" size="md" icon={<Plus size={16} />} onClick={onAdd}>
              {addButtonLabel}
            </Button>
          )}
        </div>
      </div>

      {error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 14, backgroundColor: '#fef2f2', color: '#dc2626', borderRadius: 8, marginBottom: 16 }}>
          <AlertCircle size={18} />
          <span style={{ fontSize: '0.85rem' }}>{error}</span>
        </div>
      )}

      <div
        style={{
          backgroundColor: '#ffffff',
          borderRadius: '10px',
          border: '1px solid #e2e8f0',
          boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
          overflow: 'hidden',
          minHeight: '200px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: loading || tableItems.length === 0 ? 'center' : 'flex-start',
        }}
      >
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 48, color: '#64748b' }}>
            <Loader2 className="animate-spin" size={22} color="#0284c7" />
            <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>Querying database records...</span>
          </div>
        ) : tableItems.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 48, color: '#94a3b8', fontSize: '0.88rem' }}>
            No matching database records found.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569', fontWeight: 700 }}>
                {columns.map((col, idx) => (
                  <th key={idx} style={{ padding: '12px 16px', textAlign: col.align || 'left' }}>
                    {col.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tableItems.map((item, index) => (
                <tr key={keyExtractor(item)} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  {columns.map((col, cIdx) => (
                    <td key={cIdx} style={{ padding: '14px 16px', textAlign: col.align || 'left' }}>
                      {col.render(item, index)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
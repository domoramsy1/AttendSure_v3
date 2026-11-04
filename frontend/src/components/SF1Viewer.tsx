import React, { useState, useEffect, useRef } from 'react';
import apiClient from '../api/client';
import { 
  ZoomIn, 
  ZoomOut, 
  Maximize2, 
  Printer, 
  Loader2, 
  RefreshCcw,
  Minimize2,
  FileCheck2
} from 'lucide-react';

interface LearnerRecord {
  lrn: string;
  name: string;
  sex: string;
  birthdate: string;
  age: number | string;
  mother_tongue: string;
  ip_ethnic: string;
  religion: string;
  address: string;
  father_name: string;
  mother_name: string;
  guardian_name: string;
  guardian_relationship: string;
  parent_contact: string;
  remarks: string;
}

interface SF1Data {
  school_id: string;
  school_name: string;
  academic_year: string;
  grade_level: string;
  section_name: string;
  total_male: number;
  total_female: number;
  total_combined: number;
  males: LearnerRecord[];
  females: LearnerRecord[];
}

interface SF1ViewerProps {
  sectionId: number;
}

export const SF1Viewer: React.FC<SF1ViewerProps> = ({ sectionId }) => {
  const [data, setData] = useState<SF1Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Default to a comfortable reading zoom (80%) instead of 40%
  const [zoom, setZoom] = useState<number>(80);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchSF1Data();
  }, [sectionId]);

  const fetchSF1Data = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await apiClient.get<SF1Data>(`/reports/sf1/${sectionId}/`);
      setData(res.data);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to generate DepEd SF1 register.');
    } finally {
      setLoading(false);
    }
  };

  const handleZoomIn = () => setZoom((prev) => Math.min(prev + 10, 150));
  const handleZoomOut = () => setZoom((prev) => Math.max(prev - 10, 50));
  const handleResetZoom = () => setZoom(80);

  const toggleFullScreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(() => {});
      setIsFullScreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullScreen(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 10, color: '#64748b' }}>
        <Loader2 className="animate-spin" size={28} color="#0284c7" />
        <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>Compiling School Form 1 (SF1) Register...</span>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 8, color: '#dc2626' }}>
        <span style={{ fontWeight: 700 }}>Unable to load School Form 1</span>
        <span style={{ fontSize: '0.85rem', color: '#64748b' }}>{error}</span>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: '100%',
        backgroundColor: '#475569', // Neutral PDF viewer dark-slate backdrop
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      <style>{`
        /* Official DepEd School Form 1 Legal Landscape Styling */
        .sf1-paper {
          width: 1400px; /* High-res canvas corresponding to 14" Legal */
          background-color: #ffffff;
          padding: 24px 30px;
          margin: 20px auto 40px auto;
          box-shadow: 0 8px 30px rgba(0, 0, 0, 0.35);
          border-radius: 4px;
          color: #000000;
          font-family: Arial, Helvetica, sans-serif;
          box-sizing: border-box;
          transform-origin: top center;
        }

        .sf1-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 8.5px;
          margin-top: 6px;
        }

        .sf1-table th, .sf1-table td {
          border: 1px solid #000000;
          padding: 3px 4px;
          text-align: center;
          vertical-align: middle;
        }

        .sf1-table th {
          background-color: #f1f5f9;
          font-weight: bold;
        }

        .sf1-header-title {
          text-align: center;
          line-height: 1.2;
        }

        /* Print Media Setup */
        @media print {
          body * {
            visibility: hidden;
          }
          .sf1-paper, .sf1-paper * {
            visibility: visible;
          }
          .sf1-paper {
            position: absolute;
            left: 0;
            top: 0;
            width: 100% !important;
            margin: 0 !important;
            padding: 10mm !important;
            box-shadow: none !important;
            transform: none !important;
          }
          .no-print {
            display: none !important;
          }
          @page {
            size: legal landscape;
            margin: 5mm;
          }
        }
      `}</style>

      {/* Floating Modern Document Control Bar */}
      <div
        className="no-print"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 16px',
          backgroundColor: '#1e293b', // Deep charcoal toolbar
          color: '#ffffff',
          flexShrink: 0,
          boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
          zIndex: 10,
        }}
      >
        {/* Left: Document Info Pill */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <FileCheck2 size={16} color="#38bdf8" />
          <span style={{ fontSize: '0.82rem', fontWeight: 700 }}>
            DepEd SF1 School Register
          </span>
          <span style={{ fontSize: '0.72rem', backgroundColor: '#334155', padding: '2px 8px', borderRadius: 4, color: '#cbd5e1' }}>
            {data.grade_level} - {data.section_name}
          </span>
        </div>

        {/* Center: Interactive Zoom Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button
            onClick={handleZoomOut}
            title="Zoom Out"
            style={toolbarBtnStyle}
          >
            <ZoomOut size={15} />
          </button>

          <span
            onClick={handleResetZoom}
            title="Click to reset zoom"
            style={{
              fontSize: '0.75rem',
              fontWeight: 700,
              minWidth: '48px',
              textAlign: 'center',
              cursor: 'pointer',
              color: '#f8fafc',
            }}
          >
            {zoom}%
          </span>

          <button
            onClick={handleZoomIn}
            title="Zoom In"
            style={toolbarBtnStyle}
          >
            <ZoomIn size={15} />
          </button>

          <button
            onClick={handleResetZoom}
            title="Reset to 80%"
            style={{ ...toolbarBtnStyle, fontSize: '0.72rem', padding: '4px 8px' }}
          >
            <RefreshCcw size={13} style={{ marginRight: 4 }} /> Fit
          </button>
        </div>

        {/* Right: Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={toggleFullScreen}
            title="Toggle Fullscreen"
            style={toolbarBtnStyle}
          >
            {isFullScreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
          </button>

          <button
            onClick={handlePrint}
            title="Print Official SF1"
            style={{
              ...toolbarBtnStyle,
              backgroundColor: '#0284c7',
              color: '#ffffff',
              border: 'none',
              padding: '5px 12px',
              fontWeight: 700,
            }}
          >
            <Printer size={15} style={{ marginRight: 5 }} /> Print / PDF
          </button>
        </div>
      </div>

      {/* Document Scroll Area */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'auto',
          display: 'flex',
          justifyContent: 'center',
          padding: '10px 20px',
        }}
      >
        <div
          className="sf1-paper"
          style={{
            transform: `scale(${zoom / 100})`,
            marginBottom: `${(zoom / 100) * 120}px`, // Prevents scroll cutoff on zoom
          }}
        >
          {/* Official DepEd Header */}
          <div className="sf1-header-title">
            <div style={{ fontSize: '9px', fontWeight: 600 }}>REPUBLIC OF THE PHILIPPINES • DEPARTMENT OF EDUCATION</div>
            <div style={{ fontSize: '13px', fontWeight: 'bold', margin: '2px 0' }}>
              SCHOOL FORM 1 (SF 1) SCHOOL REGISTER
            </div>
            <div style={{ fontSize: '8px', color: '#475569' }}>
              (This replaces Form 1, Master List & STS Form 2-Family Background and Profile)
            </div>
          </div>

          {/* School & Section Metadata Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.2fr 1fr 1.2fr 1fr', gap: 6, fontSize: '8.5px', marginTop: 10, borderBottom: '1px solid #000', paddingBottom: 6 }}>
            <div><strong>School ID:</strong> {data.school_id || '304033'}</div>
            <div><strong>Region:</strong> X</div>
            <div><strong>Division:</strong> Cagayan de Oro City</div>
            <div><strong>District:</strong> Central District</div>
            <div><strong>School Year:</strong> {data.academic_year || '2026 - 2027'}</div>
            <div><strong>School Name:</strong> {data.school_name || 'Lapasan National High School'}</div>
            <div><strong>Grade Level:</strong> {data.grade_level || 'Grade 7'}</div>
            <div><strong>Section:</strong> {data.section_name || 'Diamond'}</div>
          </div>

          {/* SF1 Master Learner Table */}
          <table className="sf1-table">
            <thead>
              <tr>
                <th rowSpan={2} style={{ width: '22px' }}>#</th>
                <th rowSpan={2} style={{ width: '75px' }}>LRN</th>
                <th rowSpan={2} style={{ width: '130px' }}>LEARNER'S NAME<br/><span style={{ fontSize: '7px', fontWeight: 'normal' }}>(Last Name, First Name, Middle Name)</span></th>
                <th rowSpan={2} style={{ width: '25px' }}>Sex</th>
                <th rowSpan={2} style={{ width: '48px' }}>Birth Date<br/><span style={{ fontSize: '7px' }}>(mm/dd/yyyy)</span></th>
                <th rowSpan={2} style={{ width: '25px' }}>Age</th>
                <th rowSpan={2} style={{ width: '60px' }}>Mother Tongue</th>
                <th rowSpan={2} style={{ width: '55px' }}>IP (Ethnic Group)</th>
                <th rowSpan={2} style={{ width: '60px' }}>Religion</th>
                <th colSpan={4}>ADDRESS</th>
                <th colSpan={2}>PARENTS' NAME</th>
                <th colSpan={2}>GUARDIAN</th>
                <th rowSpan={2} style={{ width: '65px' }}>Contact Number</th>
                <th rowSpan={2} style={{ width: '70px' }}>REMARKS</th>
              </tr>
              <tr>
                <th>House # / Street</th>
                <th>Barangay</th>
                <th>Municipality / City</th>
                <th>Province</th>
                <th>Father's Name</th>
                <th>Mother's Maiden Name</th>
                <th>Name</th>
                <th>Relationship</th>
              </tr>
            </thead>
            <tbody>
              {/* MALE LEARNERS */}
              <tr style={{ backgroundColor: '#e2e8f0', fontWeight: 'bold', textAlign: 'left' }}>
                <td colSpan={20} style={{ textAlign: 'left', paddingLeft: 8 }}>MALE</td>
              </tr>
              {data.males.length > 0 ? (
                data.males.map((m, idx) => (
                  <tr key={m.lrn || idx}>
                    <td>{idx + 1}</td>
                    <td style={{ fontWeight: 600 }}>{m.lrn}</td>
                    <td style={{ textAlign: 'left', fontWeight: 600 }}>{m.name}</td>
                    <td>M</td>
                    <td>{m.birthdate || '—'}</td>
                    <td>{m.age || '—'}</td>
                    <td>{m.mother_tongue || 'Cebuano / Bisaya'}</td>
                    <td>{m.ip_ethnic || '—'}</td>
                    <td>{m.religion || 'Roman Catholic'}</td>
                    <td colSpan={4}>{m.address || 'Cagayan de Oro City'}</td>
                    <td>{m.father_name || '—'}</td>
                    <td>{m.mother_name || '—'}</td>
                    <td>{m.guardian_name || '—'}</td>
                    <td>{m.guardian_relationship || '—'}</td>
                    <td>{m.parent_contact || '—'}</td>
                    <td>{m.remarks || '—'}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={20} style={{ padding: 6, color: '#64748b' }}>No male learners enrolled in this section.</td>
                </tr>
              )}
              <tr style={{ backgroundColor: '#f8fafc', fontWeight: 'bold' }}>
                <td colSpan={3} style={{ textAlign: 'right' }}>TOTAL MALE:</td>
                <td>{data.total_male}</td>
                <td colSpan={16}></td>
              </tr>

              {/* FEMALE LEARNERS */}
              <tr style={{ backgroundColor: '#e2e8f0', fontWeight: 'bold', textAlign: 'left' }}>
                <td colSpan={20} style={{ textAlign: 'left', paddingLeft: 8 }}>FEMALE</td>
              </tr>
              {data.females.length > 0 ? (
                data.females.map((f, idx) => (
                  <tr key={f.lrn || idx}>
                    <td>{idx + 1}</td>
                    <td style={{ fontWeight: 600 }}>{f.lrn}</td>
                    <td style={{ textAlign: 'left', fontWeight: 600 }}>{f.name}</td>
                    <td>F</td>
                    <td>{f.birthdate || '—'}</td>
                    <td>{f.age || '—'}</td>
                    <td>{f.mother_tongue || 'Cebuano / Bisaya'}</td>
                    <td>{f.ip_ethnic || '—'}</td>
                    <td>{f.religion || 'Roman Catholic'}</td>
                    <td colSpan={4}>{f.address || 'Cagayan de Oro City'}</td>
                    <td>{f.father_name || '—'}</td>
                    <td>{f.mother_name || '—'}</td>
                    <td>{f.guardian_name || '—'}</td>
                    <td>{f.guardian_relationship || '—'}</td>
                    <td>{f.parent_contact || '—'}</td>
                    <td>{f.remarks || '—'}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={20} style={{ padding: 6, color: '#64748b' }}>No female learners enrolled in this section.</td>
                </tr>
              )}
              <tr style={{ backgroundColor: '#f8fafc', fontWeight: 'bold' }}>
                <td colSpan={3} style={{ textAlign: 'right' }}>TOTAL FEMALE:</td>
                <td>{data.total_female}</td>
                <td colSpan={16}></td>
              </tr>

              {/* COMBINED TOTAL */}
              <tr style={{ backgroundColor: '#e2e8f0', fontWeight: 'bold' }}>
                <td colSpan={3} style={{ textAlign: 'right' }}>COMBINED TOTAL:</td>
                <td>{data.total_combined}</td>
                <td colSpan={16}></td>
              </tr>
            </tbody>
          </table>

          {/* Signatures & Certification Footer */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr', gap: 20, marginTop: 18, fontSize: '8.5px' }}>
            <div style={{ border: '1px solid #000', padding: 6, lineHeight: 1.3 }}>
              <strong>List and Code of Indicators under REMARKS column:</strong><br/>
              • <strong>Transferred Out:</strong> Name of Public (P) / Private (PR) School & Effective Date<br/>
              • <strong>Transferred In:</strong> Name of Public (P) / Private (PR) School & Effective Date<br/>
              • <strong>DRP:</strong> Dropped Out (Reason & Effective Date)
            </div>

            <div style={{ textAlign: 'center', marginTop: 10 }}>
              <div style={{ borderBottom: '1px solid #000', width: '85%', margin: '0 auto 4px auto', height: 18 }}></div>
              <strong>Class Adviser</strong><br/>
              <span style={{ fontSize: '7.5px' }}>(Signature over Printed Name)</span>
            </div>

            <div style={{ textAlign: 'center', marginTop: 10 }}>
              <div style={{ borderBottom: '1px solid #000', width: '85%', margin: '0 auto 4px auto', height: 18 }}></div>
              <strong>School Head / Principal</strong><br/>
              <span style={{ fontSize: '7.5px' }}>(Signature over Printed Name)</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const toolbarBtnStyle: React.CSSProperties = {
  background: '#334155',
  border: '1px solid #475569',
  color: '#ffffff',
  borderRadius: '4px',
  padding: '4px 8px',
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '0.75rem',
  transition: 'background 0.15s ease',
};
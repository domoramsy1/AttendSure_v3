import React, { useState, useEffect } from 'react';
import apiClient from '../../api/client';
import { 
  X, 
  Calendar, 
  Users, 
  DoorOpen, 
  Layers, 
  Loader2, 
  AlertCircle 
} from 'lucide-react';

export type AcademicTabType = 'SCHEDULE' | 'SECTION' | 'ROOM' | 'YEAR_LEVEL';

interface Props {
  isOpen: boolean;
  initialTab?: AcademicTabType;
  onClose: () => void;
  onSuccess: () => void;
}

// ---------------------------------------------------------------------------
// DEBUG HELPER: Unpack Django REST Framework errors & log full context
// ---------------------------------------------------------------------------
function formatApiError(err: any, contextName: string): string {
  const status = err?.response?.status;
  const data = err?.response?.data;
  const config = err?.config;

  // Log detailed grouping for browser DevTools
  console.group(`[AttendSure Debug: ${contextName}]`);
  console.error(`Endpoint: [${config?.method?.toUpperCase() || 'UNKNOWN'}] ${config?.url || 'N/A'}`);
  console.error(`Status Code: ${status || 'No Response (Network / CORS error)'}`);
  console.error('Payload Sent:', config?.data ? JSON.parse(config.data) : 'None');
  console.error('Response Data:', data);
  console.groupEnd();

  if (!err.response) {
    return 'Cannot reach the backend server. Please check your internet or Django server terminal.';
  }

  if (typeof data === 'string') {
    return `[${status}] ${data.slice(0, 150)}`;
  }

  if (data?.detail) {
    return `[${status}] ${data.detail}`;
  }

  if (data?.error) {
    return `[${status}] ${data.error}`;
  }

  // Handle Django validation dictionary: e.g. { "name": ["This field is required"] }
  if (typeof data === 'object' && data !== null) {
    const errorEntries = Object.entries(data)
      .map(([field, messages]) => {
        const msg = Array.isArray(messages) ? messages.join(', ') : String(messages);
        return `${field}: ${msg}`;
      });

    if (errorEntries.length > 0) {
      return `[${status}] ${errorEntries.join(' | ')}`;
    }
  }

  return `[${status}] An unexpected server error occurred. Check browser console for full details.`;
}

// ---------------------------------------------------------------------------
// MAIN MODAL CONTAINER
// ---------------------------------------------------------------------------
export const AcademicSetupModal: React.FC<Props> = ({
  isOpen,
  initialTab = 'SCHEDULE',
  onClose,
  onSuccess,
}) => {
  const [activeTab, setActiveTab] = useState<AcademicTabType>(initialTab);

  useEffect(() => {
    if (isOpen) {
      console.log(`[AcademicSetupModal] Modal opened. Initial tab: ${initialTab}`);
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab]);

  if (!isOpen) return null;

  return (
    <div style={backdropStyle}>
      <div style={modalStyle}>
        {/* Header */}
        <div style={headerStyle}>
          <div>
            <h3 style={titleStyle}>Academic Setup</h3>
            <p style={subtitleStyle}>Manage schedules, sections, classrooms, and year levels</p>
          </div>
          <button 
            onClick={onClose} 
            style={closeBtnStyle} 
            title="Close modal"
            type="button"
          >
            <X size={18} />
          </button>
        </div>

        {/* Tab Navigation */}
        <div style={tabBarStyle}>
          <button
            type="button"
            onClick={() => setActiveTab('SCHEDULE')}
            style={activeTab === 'SCHEDULE' ? activeTabBtn : inactiveTabBtn}
          >
            <Calendar size={14} /> Schedule Period
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('SECTION')}
            style={activeTab === 'SECTION' ? activeTabBtn : inactiveTabBtn}
          >
            <Users size={14} /> Section
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('ROOM')}
            style={activeTab === 'ROOM' ? activeTabBtn : inactiveTabBtn}
          >
            <DoorOpen size={14} /> Room
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('YEAR_LEVEL')}
            style={activeTab === 'YEAR_LEVEL' ? activeTabBtn : inactiveTabBtn}
          >
            <Layers size={14} /> Year Level
          </button>
        </div>

        {/* Tab Forms */}
        <div style={{ marginTop: 14 }}>
          {activeTab === 'SCHEDULE' && (
            <ScheduleForm 
              onSuccess={() => { onSuccess(); onClose(); }} 
              onSwitchTab={setActiveTab}
            />
          )}
          {activeTab === 'SECTION' && (
            <SectionForm 
              onSuccess={() => { onSuccess(); onClose(); }} 
              onSwitchTab={setActiveTab}
            />
          )}
          {activeTab === 'ROOM' && (
            <RoomForm onSuccess={() => { onSuccess(); onClose(); }} />
          )}
          {activeTab === 'YEAR_LEVEL' && (
            <YearLevelForm onSuccess={() => { onSuccess(); onClose(); }} />
          )}
        </div>
      </div>
    </div>
  );
};

// ===========================================================================
// 1. SCHEDULE PERIOD FORM
// ===========================================================================
const ScheduleForm: React.FC<{ 
  onSuccess: () => void; 
  onSwitchTab: (tab: AcademicTabType) => void;
}> = ({ onSuccess, onSwitchTab }) => {
  const [code, setCode] = useState('');
  const [sectionId, setSectionId] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [facultyId, setFacultyId] = useState('');
  const [roomId, setRoomId] = useState('');
  const [daysOfWeek, setDaysOfWeek] = useState('MON-FRI');
  const [startTime, setStartTime] = useState('07:30');
  const [endTime, setEndTime] = useState('08:30');

  const [sections, setSections] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [facultyList, setFacultyList] = useState<any[]>([]);
  const [rooms, setRooms] = useState<any[]>([]);

  const [loadingData, setLoadingData] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;
    const fetchOptions = async () => {
      setLoadingData(true);
      setError('');
      try {
        console.log('[ScheduleForm] Loading dependencies (/sections/, /subjects/, /teachers/, /rooms/)...');
        const [secRes, subRes, facRes, rmRes] = await Promise.all([
          apiClient.get('/sections/'),
          apiClient.get('/subjects/'),
          apiClient.get('/teachers/'),
          apiClient.get('/rooms/'),
        ]);

        if (mounted) {
          const parsedSections = Array.isArray(secRes.data) ? secRes.data : secRes.data.results || [];
          const parsedSubjects = Array.isArray(subRes.data) ? subRes.data : subRes.data.results || [];
          const parsedFaculty = Array.isArray(facRes.data) ? facRes.data : facRes.data.results || [];
          const parsedRooms = Array.isArray(rmRes.data) ? rmRes.data : rmRes.data.results || [];

          setSections(parsedSections);
          setSubjects(parsedSubjects);
          setFacultyList(parsedFaculty);
          setRooms(parsedRooms);

          console.log('[ScheduleForm] Loaded dependencies count:', {
            sections: parsedSections.length,
            subjects: parsedSubjects.length,
            faculty: parsedFaculty.length,
            rooms: parsedRooms.length,
          });
        }
      } catch (err: any) {
        if (mounted) {
          setError(formatApiError(err, 'ScheduleForm:fetchDependencies'));
        }
      } finally {
        if (mounted) setLoadingData(false);
      }
    };

    fetchOptions();
    return () => { mounted = false; };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');

    const payload = {
      code: code.trim(),
      section_id: parseInt(sectionId, 10),
      subject_id: parseInt(subjectId, 10),
      teacher_id: parseInt(facultyId, 10),
      room_id: roomId ? parseInt(roomId, 10) : null,
      days_of_week: daysOfWeek,
      start_time: startTime,
      end_time: endTime,
    };

    console.log('[ScheduleForm:handleSubmit] Submitting payload:', payload);

    try {
      const response = await apiClient.post('/schedules/', payload);
      console.log('[ScheduleForm:handleSubmit] Created schedule:', response.data);
      onSuccess();
    } catch (err: any) {
      setError(formatApiError(err, 'ScheduleForm:handleSubmit'));
    } finally {
      setSubmitting(false);
    }
  };

  if (loadingData) {
    return (
      <div style={centerSpinnerStyle}>
        <Loader2 size={24} className="animate-spin" color="#0284c7" />
        <span style={{ fontSize: '0.80rem', color: '#64748b' }}>Querying database dependencies...</span>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} style={formStyle}>
      {error && <div style={errorStyle}><AlertCircle size={15} style={{ flexShrink: 0 }} /> {error}</div>}

      <div style={rowStyle}>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>Schedule Code</label>
          <input
            type="text"
            required
            placeholder="e.g. SCH-007"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            style={inputStyle}
          />
        </div>

        <div style={{ flex: 1 }}>
          <label style={labelStyle}>Section</label>
          <select 
            required 
            value={sectionId} 
            onChange={(e) => setSectionId(e.target.value)} 
            style={inputStyle}
          >
            <option value="">-- Select Section --</option>
            {sections.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} {s.grade_level_name ? `(${s.grade_level_name})` : ''}
              </option>
            ))}
          </select>
          {sections.length === 0 && (
            <p style={hintStyle}>
              No sections exist.{' '}
              <span style={linkStyle} onClick={() => onSwitchTab('SECTION')}>Create section first</span>
            </p>
          )}
        </div>
      </div>

      <div style={rowStyle}>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>Subject</label>
          <select 
            required 
            value={subjectId} 
            onChange={(e) => setSubjectId(e.target.value)} 
            style={inputStyle}
          >
            <option value="">-- Select Subject --</option>
            {subjects.map((sub) => (
              <option key={sub.id} value={sub.id}>
                {sub.code ? `${sub.code} - ` : ''}{sub.name}
              </option>
            ))}
          </select>
        </div>

        <div style={{ flex: 1 }}>
          <label style={labelStyle}>Assigned Faculty</label>
          <select 
            required 
            value={facultyId} 
            onChange={(e) => setFacultyId(e.target.value)} 
            style={inputStyle}
          >
            <option value="">-- Select Faculty --</option>
            {facultyList.map((f) => (
              <option key={f.id} value={f.id}>
                {f.full_name || f.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div style={rowStyle}>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>Room</label>
          <select 
            value={roomId} 
            onChange={(e) => setRoomId(e.target.value)} 
            style={inputStyle}
          >
            <option value="">-- Optional: Select Room --</option>
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name || r.room_number} {r.building ? `(${r.building})` : ''}
              </option>
            ))}
          </select>
          {rooms.length === 0 && (
            <p style={hintStyle}>
              No rooms found.{' '}
              <span style={linkStyle} onClick={() => onSwitchTab('ROOM')}>Add a room</span>
            </p>
          )}
        </div>

        <div style={{ flex: 1 }}>
          <label style={labelStyle}>Days of Week</label>
          <select 
            value={daysOfWeek} 
            onChange={(e) => setDaysOfWeek(e.target.value)} 
            style={inputStyle}
          >
            <option value="MON-FRI">Monday to Friday</option>
            <option value="MWF">Mon / Wed / Fri</option>
            <option value="TTH">Tue / Thu</option>
            <option value="SAT">Saturday Only</option>
          </select>
        </div>
      </div>

      <div style={rowStyle}>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>Start Time</label>
          <input 
            type="time" 
            required 
            value={startTime} 
            onChange={(e) => setStartTime(e.target.value)} 
            style={inputStyle} 
          />
        </div>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>End Time</label>
          <input 
            type="time" 
            required 
            value={endTime} 
            onChange={(e) => setEndTime(e.target.value)} 
            style={inputStyle} 
          />
        </div>
      </div>

      <button type="submit" disabled={submitting} style={primaryBtnStyle}>
        {submitting ? <Loader2 size={16} className="animate-spin" /> : 'Create Schedule Period'}
      </button>
    </form>
  );
};

// ===========================================================================
// 2. SECTION FORM
// ===========================================================================
const SectionForm: React.FC<{ 
  onSuccess: () => void;
  onSwitchTab: (tab: AcademicTabType) => void;
}> = ({ onSuccess, onSwitchTab }) => {
  const [name, setName] = useState('');
  const [gradeLevelId, setGradeLevelId] = useState('');
  const [adviserId, setAdviserId] = useState('');
  const [roomId, setRoomId] = useState('');

  const [gradeLevels, setGradeLevels] = useState<any[]>([]);
  const [facultyList, setFacultyList] = useState<any[]>([]);
  const [rooms, setRooms] = useState<any[]>([]);

  const [loadingData, setLoadingData] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;
    const fetchDropdowns = async () => {
      setLoadingData(true);
      setError('');
      try {
        console.log('[SectionForm] Fetching /grade-levels/, /teachers/, /rooms/...');
        const [glRes, facRes, rmRes] = await Promise.all([
          apiClient.get('/grade-levels/'),
          apiClient.get('/teachers/'),
          apiClient.get('/rooms/'),
        ]);

        if (mounted) {
          const parsedGL = Array.isArray(glRes.data) ? glRes.data : glRes.data.results || [];
          const parsedFac = Array.isArray(facRes.data) ? facRes.data : facRes.data.results || [];
          const parsedRm = Array.isArray(rmRes.data) ? rmRes.data : rmRes.data.results || [];

          setGradeLevels(parsedGL);
          setFacultyList(parsedFac);
          setRooms(parsedRm);

          console.log('[SectionForm] Dropdown items:', {
            yearLevels: parsedGL.length,
            faculty: parsedFac.length,
            rooms: parsedRm.length,
          });
        }
      } catch (err: any) {
        if (mounted) {
          setError(formatApiError(err, 'SectionForm:fetchDropdowns'));
        }
      } finally {
        if (mounted) setLoadingData(false);
      }
    };

    fetchDropdowns();
    return () => { mounted = false; };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');

    const payload = {
      name: name.trim(),
      grade_level_id: parseInt(gradeLevelId, 10),
      adviser_id: adviserId ? parseInt(adviserId, 10) : null,
      room_id: roomId ? parseInt(roomId, 10) : null,
    };

    console.log('[SectionForm:handleSubmit] Submitting payload:', payload);

    try {
      const response = await apiClient.post('/sections/', payload);
      console.log('[SectionForm:handleSubmit] Created section:', response.data);
      onSuccess();
    } catch (err: any) {
      setError(formatApiError(err, 'SectionForm:handleSubmit'));
    } finally {
      setSubmitting(false);
    }
  };

  if (loadingData) {
    return (
      <div style={centerSpinnerStyle}>
        <Loader2 size={24} className="animate-spin" color="#0284c7" />
        <span style={{ fontSize: '0.80rem', color: '#64748b' }}>Querying database dependencies...</span>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} style={formStyle}>
      {error && <div style={errorStyle}><AlertCircle size={15} style={{ flexShrink: 0 }} /> {error}</div>}

      <div>
        <label style={labelStyle}>Section Name</label>
        <input
          type="text"
          required
          placeholder="e.g. Diamond, Emerald, Ruby"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={inputStyle}
        />
      </div>

      <div>
        <label style={labelStyle}>Year Level</label>
        <select 
          required 
          value={gradeLevelId} 
          onChange={(e) => setGradeLevelId(e.target.value)} 
          style={inputStyle}
        >
          <option value="">-- Select Year Level --</option>
          {gradeLevels.map((gl) => (
            <option key={gl.id} value={gl.id}>
              {gl.name}
            </option>
          ))}
        </select>
        {gradeLevels.length === 0 && (
          <p style={hintStyle}>
            No year levels found.{' '}
            <span style={linkStyle} onClick={() => onSwitchTab('YEAR_LEVEL')}>Add year level first</span>
          </p>
        )}
      </div>

      <div style={rowStyle}>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>Assigned Adviser</label>
          <select 
            value={adviserId} 
            onChange={(e) => setAdviserId(e.target.value)} 
            style={inputStyle}
          >
            <option value="">-- Optional: Select Faculty --</option>
            {facultyList.map((f) => (
              <option key={f.id} value={f.id}>
                {f.full_name || f.name}
              </option>
            ))}
          </select>
        </div>

        <div style={{ flex: 1 }}>
          <label style={labelStyle}>Default Home Room</label>
          <select 
            value={roomId} 
            onChange={(e) => setRoomId(e.target.value)} 
            style={inputStyle}
          >
            <option value="">-- Optional: Select Room --</option>
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name || r.room_number}
              </option>
            ))}
          </select>
        </div>
      </div>

      <button type="submit" disabled={submitting} style={primaryBtnStyle}>
        {submitting ? <Loader2 size={16} className="animate-spin" /> : 'Create Section'}
      </button>
    </form>
  );
};

// ===========================================================================
// 3. ROOM FORM
// ===========================================================================
const RoomForm: React.FC<{ onSuccess: () => void }> = ({ onSuccess }) => {
  const [name, setName] = useState('');
  const [building, setBuilding] = useState('');
  const [capacity, setCapacity] = useState('45');
  const [roomType, setRoomType] = useState('LECTURE');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');

    const payload = {
      name: name.trim(),
      building: building.trim(),
      capacity: parseInt(capacity, 10),
      room_type: roomType,
    };

    console.log('[RoomForm:handleSubmit] Submitting payload:', payload);

    try {
      const response = await apiClient.post('/rooms/', payload);
      console.log('[RoomForm:handleSubmit] Created room:', response.data);
      onSuccess();
    } catch (err: any) {
      setError(formatApiError(err, 'RoomForm:handleSubmit'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} style={formStyle}>
      {error && <div style={errorStyle}><AlertCircle size={15} style={{ flexShrink: 0 }} /> {error}</div>}

      <div>
        <label style={labelStyle}>Room Name / Number</label>
        <input
          type="text"
          required
          placeholder="e.g. Rm 101, Sci-Lab 1, Computer Lab"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={inputStyle}
        />
      </div>

      <div>
        <label style={labelStyle}>Building Name</label>
        <input
          type="text"
          placeholder="e.g. Main Academic Building"
          value={building}
          onChange={(e) => setBuilding(e.target.value)}
          style={inputStyle}
        />
      </div>

      <div style={rowStyle}>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>Capacity (Seats)</label>
          <input
            type="number"
            required
            min="1"
            max="300"
            value={capacity}
            onChange={(e) => setCapacity(e.target.value)}
            style={inputStyle}
          />
        </div>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>Room Type</label>
          <select 
            value={roomType} 
            onChange={(e) => setRoomType(e.target.value)} 
            style={inputStyle}
          >
            <option value="LECTURE">Classroom / Lecture</option>
            <option value="LAB">Science / Computer Lab</option>
            <option value="SPECIAL">Special Room / Hall</option>
          </select>
        </div>
      </div>

      <button type="submit" disabled={submitting} style={primaryBtnStyle}>
        {submitting ? <Loader2 size={16} className="animate-spin" /> : 'Save Room'}
      </button>
    </form>
  );
};

// ===========================================================================
// 4. YEAR LEVEL FORM
// ===========================================================================
const YearLevelForm: React.FC<{ onSuccess: () => void }> = ({ onSuccess }) => {
  const [name, setName] = useState('');
  const [levelNumber, setLevelNumber] = useState('7');
  const [stage, setStage] = useState('JHS');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');

    const payload = {
      name: name.trim(),
      level_number: parseInt(levelNumber, 10),
      stage,
    };

    console.log('[YearLevelForm:handleSubmit] Submitting payload:', payload);

    try {
      const response = await apiClient.post('/grade-levels/', payload);
      console.log('[YearLevelForm:handleSubmit] Created year level:', response.data);
      onSuccess();
    } catch (err: any) {
      setError(formatApiError(err, 'YearLevelForm:handleSubmit'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} style={formStyle}>
      {error && <div style={errorStyle}><AlertCircle size={15} style={{ flexShrink: 0 }} /> {error}</div>}

      <div>
        <label style={labelStyle}>Year Level Name</label>
        <input
          type="text"
          required
          placeholder="e.g. Grade 7, Grade 8"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={inputStyle}
        />
      </div>

      <div style={rowStyle}>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>Numeric Level</label>
          <input
            type="number"
            required
            min="1"
            max="12"
            value={levelNumber}
            onChange={(e) => setLevelNumber(e.target.value)}
            style={inputStyle}
          />
        </div>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>School Stage</label>
          <select 
            value={stage} 
            onChange={(e) => setStage(e.target.value)} 
            style={inputStyle}
          >
            <option value="JHS">Junior High School</option>
            <option value="SHS">Senior High School</option>
            <option value="ELEM">Elementary</option>
          </select>
        </div>
      </div>

      <button type="submit" disabled={submitting} style={primaryBtnStyle}>
        {submitting ? <Loader2 size={16} className="animate-spin" /> : 'Save Year Level'}
      </button>
    </form>
  );
};

// ===========================================================================
// STYLES
// ===========================================================================
const backdropStyle: React.CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  width: '100vw',
  height: '100vh',
  backgroundColor: 'rgba(15, 23, 42, 0.60)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 9999,
};

const modalStyle: React.CSSProperties = {
  backgroundColor: '#ffffff',
  borderRadius: 10,
  width: 480,
  maxHeight: '90vh',
  overflowY: 'auto',
  padding: '20px 24px',
  boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
  fontFamily: 'sans-serif',
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  marginBottom: 12,
};

const titleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: '1.05rem',
  fontWeight: 800,
  color: '#0f172a',
};

const subtitleStyle: React.CSSProperties = {
  margin: '2px 0 0 0',
  fontSize: '0.74rem',
  color: '#64748b',
};

const closeBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  color: '#64748b',
  padding: 4,
};

const tabBarStyle: React.CSSProperties = {
  display: 'flex',
  gap: 4,
  backgroundColor: '#f1f5f9',
  padding: 3,
  borderRadius: 8,
};

const baseTabBtn: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 5,
  border: 'none',
  padding: '7px 4px',
  borderRadius: 6,
  fontSize: '0.74rem',
  fontWeight: 700,
  cursor: 'pointer',
  transition: 'all 0.15s ease',
};

const activeTabBtn: React.CSSProperties = {
  ...baseTabBtn,
  backgroundColor: '#ffffff',
  color: '#0284c7',
  boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
};

const inactiveTabBtn: React.CSSProperties = {
  ...baseTabBtn,
  backgroundColor: 'transparent',
  color: '#64748b',
};

const formStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
};

const rowStyle: React.CSSProperties = {
  display: 'flex',
  gap: 10,
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '0.72rem',
  fontWeight: 700,
  color: '#334155',
  marginBottom: 4,
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  borderRadius: 6,
  border: '1px solid #cbd5e1',
  fontSize: '0.80rem',
  boxSizing: 'border-box',
  outline: 'none',
};

const primaryBtnStyle: React.CSSProperties = {
  marginTop: 6,
  padding: '10px',
  backgroundColor: '#0284c7',
  color: '#ffffff',
  border: 'none',
  borderRadius: 6,
  fontWeight: 700,
  fontSize: '0.82rem',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
};

const errorStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '8px 10px',
  borderRadius: 6,
  fontSize: '0.76rem',
  backgroundColor: '#fef2f2',
  color: '#991b1b',
  border: '1px solid #fecaca',
};

const centerSpinnerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  padding: '40px 0',
};

const hintStyle: React.CSSProperties = {
  fontSize: '0.68rem',
  color: '#94a3b8',
  margin: '3px 0 0 0',
};

const linkStyle: React.CSSProperties = {
  color: '#0284c7',
  textDecoration: 'underline',
  cursor: 'pointer',
  fontWeight: 600,
};
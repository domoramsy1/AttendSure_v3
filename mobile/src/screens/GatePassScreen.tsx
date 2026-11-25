// AttendSure Mobile - Gate Pass Screen
// File: D:\AttendSure_V3\mobile\src\screens\GatePassScreen.tsx

/**
 * AttendSure Mobile - Authorized Exit Passes & Official Locator Slips (100% Web Parity)
 * File: mobile/src/screens/GatePassScreen.tsx
 *
 * - Parents submit a physical hardcopy excuse letter to the school; the student's class
 *   adviser or a school leader reviews it, optionally attaches a photo/scan/PDF of that
 *   hardcopy as proof, and issues the Student Exit Pass.
 * - Teacher Official Locator Slips requested by non-leaders start as PENDING_APPROVAL until
 *   approved by a school leader (Admin, Principal, or Department Head).
 * - Supports Camera Photo, Gallery Image, and Document/File Picker (PDF or Image, <= 2 MB),
 *   proof replacement/removal (clear_proof=true), image preview vs PDF document card + Open.
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Modal,
  TextInput,
  ActivityIndicator,
  ScrollView,
  Platform,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import AsyncStorage from '@react-native-async-storage/async-storage';
import QRCode from 'react-native-qrcode-svg';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { apiClient } from '../api/client';
import { ENDPOINTS } from '../api/endpoints';
import { useAuth } from '../context/AuthContext';
import { useThemeMode } from '../context/ThemeContext';
import {
  cleanText,
  getFriendlyErrorMessage,
  isSafeUrl,
  QR_COLORS,
  type ThemePalette,
} from '../constants/theme';
import { canApproveOrCancelLocatorSlip, canIssueStudentExitPass } from '../utils/permissions';
import { formatDateTime12h, formatTime12h } from '../utils/formatters';
import { confirmAction, isCanceledError, resolveMediaUrl, showNotice } from '../utils/helpers';
import { getServerBaseUrl } from '../services/configService';
import ChipRow from '../components/common/ChipRow';

const PASSES_CACHE_KEY = 'attendsure_cached_exit_passes_v5';
const MAX_PROOF_BYTES = 2 * 1024 * 1024;
const ALLOWED_PROOF_EXTENSIONS = new Set(['.pdf', '.jpg', '.jpeg', '.png', '.webp']);
const ALLOWED_PROOF_MIMES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
]);

export interface ExitPassItem {
  id: number;
  pass_number: string;
  pass_scope: 'STUDENT' | 'TEACHER';
  student?: number | null;
  teacher?: number | null;
  person_name: string;
  section_name?: string;
  pass_type?: string;
  destination: string;
  reason: string;
  attachment?: string | null;
  attachment_url?: string | null;
  issued_by?: number | null;
  issued_by_name?: string;
  is_approved?: boolean;
  approved_by?: number | null;
  approved_by_name?: string;
  approved_at?: string | null;
  issued_at: string;
  valid_until: string;
  returned_at?: string | null;
  is_cancelled?: boolean;
  pass_status: 'PENDING_APPROVAL' | 'ACTIVE' | 'RETURNED' | 'OVERDUE' | 'CANCELLED';
}

interface StudentChoice {
  id: number;
  lrn: string;
  full_name: string;
  section_name?: string;
}

interface TeacherChoice {
  id: number;
  employee_id: string;
  full_name: string;
  department?: string;
}

interface PendingProofSelection {
  kind: 'image' | 'pdf';
  name: string;
  mimeType: string;
  sizeBytes?: number;
  dataUrl?: string;
  nativeUri?: string;
  webFile?: File;
}

interface GatePassScreenProps {
  onBack?: () => void;
}

const STUDENT_PASS_TYPES = [
  'Parent Hardcopy Excuse Letter',
  'Clinic / Medical Clearance',
  'Parent Pickup',
  'Official Activity',
  'Emergency Family Matter',
] as const;

const TEACHER_PASS_TYPES = [
  'Official Travel Order',
  'Division Seminar',
  'Official Errand',
  'DepEd Meeting',
] as const;

const STATUS_FILTER_OPTIONS = [
  { key: 'PENDING_APPROVAL', label: 'Pending Approval' },
  { key: 'ACTIVE', label: 'Active' },
  { key: 'OVERDUE', label: 'Overdue' },
  { key: 'RETURNED', label: 'Returned' },
  { key: 'CANCELLED', label: 'Cancelled' },
  { key: 'ALL', label: 'All' },
] as const;

const formatPassStatusLabel = (st: ExitPassItem['pass_status']): string => {
  if (st === 'PENDING_APPROVAL') return 'PENDING APPROVAL';
  return st;
};

const isPdfReference = (urlOrName?: string | null, mimeType?: string | null): boolean => {
  const mime = String(mimeType || '').trim().toLowerCase();
  if (mime === 'application/pdf') return true;
  const raw = String(urlOrName || '').trim().toLowerCase();
  if (!raw) return false;
  if (raw.startsWith('data:application/pdf')) return true;
  return raw.split('?')[0].split('#')[0].endsWith('.pdf');
};

const extractFilenameFromUrl = (raw?: string | null): string => {
  if (!raw) return 'Attached Document';
  if (raw.startsWith('data:')) {
    return raw.startsWith('data:application/pdf') ? 'excuse_letter.pdf' : 'proof_image.jpg';
  }
  const clean = raw.split('?')[0].split('#')[0];
  const seg = clean.substring(clean.lastIndexOf('/') + 1);
  try {
    return decodeURIComponent(seg || 'Attached Document');
  } catch {
    return seg || 'Attached Document';
  }
};

const formatFileSize = (bytes?: number): string => {
  if (!bytes || !Number.isFinite(bytes) || bytes <= 0) return '';
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
};

const estimateBase64Bytes = (rawBase64: string): number => {
  const clean = rawBase64.replace(/\s+/g, '');
  const padding = clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((clean.length * 3) / 4) - padding);
};

const getLowerExtension = (nameOrUri?: string | null): string => {
  const clean = String(nameOrUri || '').trim().toLowerCase().split('?')[0].split('#')[0];
  const dot = clean.lastIndexOf('.');
  return dot >= 0 ? clean.slice(dot) : '';
};

const readFileAsDataUrlWeb = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read the selected file.'));
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Could not read the selected file.'));
      }
    };
    reader.readAsDataURL(file);
  });

export const GatePassScreen: React.FC<GatePassScreenProps> = ({ onBack }) => {
  const { user } = useAuth();
  const { palette, fonts } = useThemeMode();
  const styles = useMemo(() => createStyles(palette, fonts), [palette, fonts]);

  const isLeader = canApproveOrCancelLocatorSlip(user);
  const allowStudentPass = canIssueStudentExitPass(user);

  const [passes, setPasses] = useState<ExitPassItem[]>([]);
  const [studentChoices, setStudentChoices] = useState<StudentChoice[]>([]);
  const [teacherChoices, setTeacherChoices] = useState<TeacherChoice[]>([]);
  const [serverBase, setServerBase] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  const [selectedPass, setSelectedPass] = useState<ExitPassItem | null>(null);
  const [showIssueModal, setShowIssueModal] = useState(false);
  const [editingPass, setEditingPass] = useState<ExitPassItem | null>(null);
  const [passScope, setPassScope] = useState<'STUDENT' | 'TEACHER'>(
    allowStudentPass ? 'STUDENT' : 'TEACHER'
  );
  const [studentPickerSearch, setStudentPickerSearch] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [pickingProof, setPickingProof] = useState(false);

  const [pendingProof, setPendingProof] = useState<PendingProofSelection | null>(null);
  const [existingProofUrl, setExistingProofUrl] = useState<string | null>(null);
  const [clearExistingProof, setClearExistingProof] = useState<boolean>(false);

  const [form, setForm] = useState({
    student_id: '',
    teacher_id: user?.teacher_id ? String(user.teacher_id) : '',
    pass_type: STUDENT_PASS_TYPES[0] as string,
    destination: '',
    reason: '',
    duration_hours: '2',
  });

  const isMountedRef = useRef(true);
  const abortRef = useRef<AbortController | null>(null);

  const fetchPasses = useCallback(async (silent = false) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    if (!silent) {
      if (isMountedRef.current) setLoading(true);
      try {
        const [cached, base] = await Promise.all([
          AsyncStorage.getItem(PASSES_CACHE_KEY),
          getServerBaseUrl(),
        ]);
        if (isMountedRef.current && !controller.signal.aborted) {
          if (base) setServerBase(base);
          if (cached) {
            const parsed = JSON.parse(cached);
            if (Array.isArray(parsed)) setPasses(parsed);
          }
        }
      } catch {}
    }

    try {
      const [passRes, stuRes, teaRes] = await Promise.allSettled([
        apiClient.get<{ results?: ExitPassItem[] } | ExitPassItem[]>(ENDPOINTS.EXIT_PASSES, {
          signal: controller.signal,
        }),
        allowStudentPass
          ? apiClient.get(ENDPOINTS.STUDENT_DROPDOWN, { signal: controller.signal })
          : Promise.resolve({ data: [] }),
        isLeader
          ? apiClient.get(ENDPOINTS.TEACHERS_DROPDOWN, { signal: controller.signal })
          : Promise.resolve({ data: [] }),
      ]);

      if (!isMountedRef.current || controller.signal.aborted) return;

      if (passRes.status === 'fulfilled' && passRes.value?.data) {
        const data = passRes.value.data;
        const list = Array.isArray(data)
          ? data
          : Array.isArray(data?.results)
            ? data.results
            : [];
        setPasses(list);
        AsyncStorage.setItem(PASSES_CACHE_KEY, JSON.stringify(list)).catch(() => {});
      }

      if (stuRes.status === 'fulfilled' && stuRes.value?.data) {
        const raw = stuRes.value.data;
        const list = Array.isArray(raw) ? raw : Array.isArray(raw?.results) ? raw.results : [];
        setStudentChoices(list);
      }

      if (teaRes.status === 'fulfilled' && teaRes.value?.data) {
        const raw = teaRes.value.data;
        const list = Array.isArray(raw) ? raw : Array.isArray(raw?.results) ? raw.results : [];
        setTeacherChoices(list);
      }
    } catch (err: unknown) {
      if (!isMountedRef.current || isCanceledError(err)) return;
      if (!silent) {
        showNotice('Notice', getFriendlyErrorMessage(err, 'Could not load exit passes right now.'));
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [allowStudentPass, isLeader]);

  useEffect(() => {
    isMountedRef.current = true;
    void fetchPasses(false);
    return () => {
      isMountedRef.current = false;
      abortRef.current?.abort();
    };
  }, [fetchPasses]);

  const filteredPasses = useMemo(() => {
    const q = cleanText(searchQuery, 80).toLowerCase();
    return passes.filter((p) => {
      const matchesStatus = statusFilter === 'ALL' || p.pass_status === statusFilter;
      const hay = `${p.pass_number || ''} ${p.person_name || ''} ${p.pass_type || ''} ${p.destination || ''} ${p.reason || ''}`.toLowerCase();
      return matchesStatus && (!q || hay.includes(q));
    });
  }, [passes, statusFilter, searchQuery]);

  const filteredStudentChoices = useMemo(() => {
    const q = studentPickerSearch.trim().toLowerCase();
    if (!q) return studentChoices.slice(0, 30);
    return studentChoices
      .filter((s) =>
        `${s.full_name} ${s.lrn} ${s.section_name || ''}`.toLowerCase().includes(q)
      )
      .slice(0, 30);
  }, [studentChoices, studentPickerSearch]);

  const openCreateModal = () => {
    const nextScope: 'STUDENT' | 'TEACHER' = allowStudentPass ? 'STUDENT' : 'TEACHER';
    setEditingPass(null);
    setPassScope(nextScope);
    setStudentPickerSearch('');
    setPendingProof(null);
    setExistingProofUrl(null);
    setClearExistingProof(false);
    setForm({
      student_id: '',
      teacher_id: user?.teacher_id ? String(user.teacher_id) : '',
      pass_type: nextScope === 'STUDENT' ? STUDENT_PASS_TYPES[0] : TEACHER_PASS_TYPES[0],
      destination: '',
      reason: '',
      duration_hours: '2',
    });
    setShowIssueModal(true);
  };

  const openEditModal = (pass: ExitPassItem) => {
    setEditingPass(pass);
    setPassScope(pass.pass_scope);
    setStudentPickerSearch('');
    setPendingProof(null);
    setExistingProofUrl(pass.attachment_url || pass.attachment || null);
    setClearExistingProof(false);
    const issuedMs = pass.issued_at ? new Date(pass.issued_at).getTime() : NaN;
    const validMs = pass.valid_until ? new Date(pass.valid_until).getTime() : NaN;
    const diffHours =
      Number.isFinite(issuedMs) && Number.isFinite(validMs) && validMs > issuedMs
        ? Math.round((validMs - issuedMs) / 3600000)
        : 2;
    setForm({
      student_id: pass.student ? String(pass.student) : '',
      teacher_id: pass.teacher ? String(pass.teacher) : '',
      pass_type:
        pass.pass_type ||
        (pass.pass_scope === 'STUDENT' ? STUDENT_PASS_TYPES[0] : TEACHER_PASS_TYPES[0]),
      destination: pass.destination || '',
      reason: pass.reason || '',
      duration_hours: String(Math.max(1, Math.min(12, diffHours || 2))),
    });
    setSelectedPass(null);
    setShowIssueModal(true);
  };

  const handleOpenExternalDocument = async (rawUrl: string | null) => {
    const safe = resolveMediaUrl(rawUrl, serverBase);
    if (!safe || !isSafeUrl(safe)) {
      showNotice('Cannot Open File', 'This attachment link is missing or invalid.');
      return;
    }
    try {
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.open(safe, '_blank', 'noopener,noreferrer');
        return;
      }
      const supported = await Linking.canOpenURL(safe);
      if (supported) {
        await Linking.openURL(safe);
      } else {
        showNotice('No Viewer Available', 'Install a PDF or document viewer app on your phone to open this file.');
      }
    } catch {
      showNotice('Open Failed', 'Could not open this document right now.');
    }
  };

  const handlePickProofFromCamera = async () => {
    if (pickingProof || submitting) return;
    if (Platform.OS === 'web') {
      await handlePickProofDocument();
      return;
    }
    setPickingProof(true);
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        showNotice(
          'Camera Permission Needed',
          'Allow camera access in your phone settings to photograph the hardcopy excuse letter.'
        );
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        quality: 0.78,
        base64: true,
        cameraType: ImagePicker.CameraType.back,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      if (typeof asset.fileSize === 'number' && asset.fileSize > MAX_PROOF_BYTES) {
        showNotice('File Too Large', 'Please attach a photo smaller than 2 MB.');
        return;
      }
      if (!asset.base64 || estimateBase64Bytes(asset.base64) > MAX_PROOF_BYTES) {
        showNotice('File Too Large', 'Captured photo exceeded 2 MB. Please retake closer or clearer.');
        return;
      }
      const mime = asset.mimeType && ALLOWED_PROOF_MIMES.has(asset.mimeType.toLowerCase())
        ? asset.mimeType.toLowerCase()
        : 'image/jpeg';
      const dataUrl = `data:${mime};base64,${asset.base64}`;
      setPendingProof({
        kind: 'image',
        name: asset.fileName || 'excuse_letter_photo.jpg',
        mimeType: mime,
        sizeBytes: asset.fileSize ?? estimateBase64Bytes(asset.base64),
        dataUrl,
        nativeUri: asset.uri,
      });
      setClearExistingProof(false);
    } catch {
      showNotice('Camera Error', 'Could not take a photo right now. Please try again.');
    } finally {
      setPickingProof(false);
    }
  };

  const handlePickProofFromGallery = async () => {
    if (pickingProof || submitting) return;
    if (Platform.OS === 'web') {
      await handlePickProofDocument();
      return;
    }
    setPickingProof(true);
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        showNotice(
          'Photo Library Permission Needed',
          'Allow photo library access in your phone settings to pick a proof image.'
        );
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.8,
        base64: true,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      if (typeof asset.fileSize === 'number' && asset.fileSize > MAX_PROOF_BYTES) {
        showNotice('File Too Large', 'Please choose an image smaller than 2 MB.');
        return;
      }
      if (!asset.base64 || estimateBase64Bytes(asset.base64) > MAX_PROOF_BYTES) {
        showNotice('File Too Large', 'Please choose a smaller image (under 2 MB).');
        return;
      }
      const mime = asset.mimeType && ALLOWED_PROOF_MIMES.has(asset.mimeType.toLowerCase())
        ? asset.mimeType.toLowerCase()
        : 'image/jpeg';
      const dataUrl = `data:${mime};base64,${asset.base64}`;
      setPendingProof({
        kind: 'image',
        name: asset.fileName || 'proof_image.jpg',
        mimeType: mime,
        sizeBytes: asset.fileSize ?? estimateBase64Bytes(asset.base64),
        dataUrl,
        nativeUri: asset.uri,
      });
      setClearExistingProof(false);
    } catch {
      showNotice('Gallery Error', 'Could not open your photo gallery right now.');
    } finally {
      setPickingProof(false);
    }
  };

  const handlePickProofDocument = async () => {
    if (pickingProof || submitting) return;
    setPickingProof(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const doc = result.assets[0];
      const ext = getLowerExtension(doc.name || doc.uri);
      const cleanMime = String(doc.mimeType || '').trim().toLowerCase();
      const mimeAllowed = cleanMime ? ALLOWED_PROOF_MIMES.has(cleanMime) : false;
      const extAllowed = ext ? ALLOWED_PROOF_EXTENSIONS.has(ext) : false;

      if (!mimeAllowed && !extAllowed) {
        showNotice('Unsupported File', 'Please select a PDF, JPG, PNG, or WebP file.');
        return;
      }
      if (typeof doc.size === 'number' && doc.size > MAX_PROOF_BYTES) {
        showNotice('File Too Large', 'Please choose a document or image smaller than 2 MB.');
        return;
      }

      const isPdf = cleanMime === 'application/pdf' || ext === '.pdf';
      const resolvedMime = isPdf
        ? 'application/pdf'
        : cleanMime || (ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg');

      if (Platform.OS === 'web' && doc.file) {
        const dataUrl = await readFileAsDataUrlWeb(doc.file);
        setPendingProof({
          kind: isPdf ? 'pdf' : 'image',
          name: doc.name || (isPdf ? 'excuse_letter.pdf' : 'proof_image.jpg'),
          mimeType: resolvedMime,
          sizeBytes: doc.size ?? doc.file.size,
          dataUrl: isPdf ? undefined : dataUrl,
          webFile: doc.file,
        });
      } else {
        setPendingProof({
          kind: isPdf ? 'pdf' : 'image',
          name: doc.name || (isPdf ? 'excuse_letter.pdf' : 'proof_image.jpg'),
          mimeType: resolvedMime,
          sizeBytes: doc.size,
          dataUrl: !isPdf && doc.base64 ? `data:${resolvedMime};base64,${doc.base64}` : undefined,
          nativeUri: doc.uri,
        });
      }
      setClearExistingProof(false);
    } catch {
      showNotice('File Picker Error', 'Could not open your file picker right now. Please try again.');
    } finally {
      setPickingProof(false);
    }
  };

  const handleRemoveProofSelection = () => {
    setPendingProof(null);
    setExistingProofUrl(null);
    setClearExistingProof(true);
  };

  const handleIssueSubmit = async () => {
    let parsedStudentId: number | null = null;
    if (!editingPass && passScope === 'STUDENT') {
      const cleanId = cleanText(form.student_id, 12);
      parsedStudentId = Number.parseInt(cleanId, 10);
      if (!cleanId || !Number.isFinite(parsedStudentId) || parsedStudentId <= 0) {
        showNotice('Required', 'Please select a student from the list.');
        return;
      }
    }

    const cleanedDest = cleanText(form.destination, 160);
    const cleanedReason = cleanText(form.reason, 300);
    if (!cleanedDest || !cleanedReason) {
      showNotice('Required', 'Please enter both destination and reason.');
      return;
    }

    const parsedHours = Number.parseInt(cleanText(form.duration_hours, 2), 10);
    const hours = Math.max(1, Math.min(12, Number.isFinite(parsedHours) ? parsedHours : 2));
    // Anchor from max(issued_at, now) so editing an overdue pass actually extends it into the future
    const issuedMs =
      editingPass && editingPass.issued_at ? new Date(editingPass.issued_at).getTime() : NaN;
    const baseMs =
      editingPass && Number.isFinite(issuedMs) ? Math.max(issuedMs, Date.now()) : Date.now();
    const expiry = new Date(baseMs + hours * 3600000);

    setSubmitting(true);
    try {
      const needsMultipart = Boolean(
        pendingProof && (pendingProof.kind === 'pdf' || !pendingProof.dataUrl)
      );

      let requestBody: FormData | Record<string, string | number | boolean | null>;
      if (needsMultipart && pendingProof) {
        const fd = new FormData();
        fd.append('pass_scope', passScope);
        fd.append('pass_type', cleanText(form.pass_type, 80));
        fd.append('destination', cleanedDest);
        fd.append('reason', cleanedReason);
        fd.append('valid_until', expiry.toISOString());
        if (!editingPass) {
          if (passScope === 'STUDENT' && parsedStudentId !== null) {
            fd.append('student_id', String(parsedStudentId));
          } else if (form.teacher_id) {
            fd.append('teacher_id', String(Number(form.teacher_id)));
          } else if (user?.teacher_id) {
            fd.append('teacher_id', String(Number(user.teacher_id)));
          }
        }
        if (Platform.OS === 'web' && pendingProof.webFile) {
          fd.append('attachment', pendingProof.webFile, pendingProof.name);
        } else if (pendingProof.nativeUri) {
          fd.append('attachment', {
            uri: pendingProof.nativeUri,
            name: pendingProof.name,
            type: pendingProof.mimeType,
          } as unknown as Blob);
        }
        requestBody = fd;
      } else {
        const payload: Record<string, string | number | boolean | null> = {
          pass_scope: passScope,
          pass_type: cleanText(form.pass_type, 80),
          destination: cleanedDest,
          reason: cleanedReason,
          valid_until: expiry.toISOString(),
        };
        if (!editingPass) {
          if (passScope === 'STUDENT' && parsedStudentId !== null) {
            payload.student_id = parsedStudentId;
          } else if (form.teacher_id) {
            payload.teacher_id = Number(form.teacher_id);
          } else if (user?.teacher_id) {
            payload.teacher_id = Number(user.teacher_id);
          }
        }
        if (pendingProof?.dataUrl) {
          payload.attachment = pendingProof.dataUrl;
        } else if (editingPass && clearExistingProof) {
          payload.clear_proof = true;
        }
        requestBody = payload;
      }

      if (editingPass) {
        await apiClient.patch(
          `${ENDPOINTS.EXIT_PASSES}${encodeURIComponent(String(editingPass.id))}/`,
          requestBody,
          { timeout: needsMultipart ? 20000 : 12000 }
        );
        showNotice('Updated', `Exit pass ${editingPass.pass_number} updated.`);
      } else {
        const res = await apiClient.post<ExitPassItem>(ENDPOINTS.EXIT_PASSES, requestBody, {
          timeout: needsMultipart ? 20000 : 12000,
        });
        const isPending = res.data?.pass_status === 'PENDING_APPROVAL';
        showNotice(
          isPending ? 'Request Submitted' : 'Exit Pass Issued',
          isPending
            ? 'Your Official Locator Slip has been submitted and is waiting for school leader approval.'
            : 'The authorized exit pass is now active.'
        );
      }

      if (!isMountedRef.current) return;
      setShowIssueModal(false);
      setEditingPass(null);
      setPendingProof(null);
      setExistingProofUrl(null);
      setClearExistingProof(false);
      void fetchPasses(true);
    } catch (err: unknown) {
      if (!isMountedRef.current) return;
      showNotice('Could Not Save Pass', getFriendlyErrorMessage(err, 'Unable to save exit pass.'));
    } finally {
      if (isMountedRef.current) setSubmitting(false);
    }
  };

  const handleMarkReturned = async (pass: ExitPassItem) => {
    if (actionBusy) return;
    setActionBusy(true);
    try {
      await apiClient.post(
        `${ENDPOINTS.EXIT_PASSES}${encodeURIComponent(String(pass.id))}/mark-returned/`
      );
      if (!isMountedRef.current) return;
      showNotice('Returned', 'Return to campus has been recorded.');
      setSelectedPass(null);
      void fetchPasses(true);
    } catch (err: unknown) {
      if (isMountedRef.current) {
        showNotice('Error', getFriendlyErrorMessage(err, 'Could not mark pass as returned.'));
      }
    } finally {
      if (isMountedRef.current) setActionBusy(false);
    }
  };

  const handleApprovePass = async (pass: ExitPassItem) => {
    if (actionBusy || !isLeader) return;
    setActionBusy(true);
    try {
      await apiClient.post(
        `${ENDPOINTS.EXIT_PASSES}${encodeURIComponent(String(pass.id))}/approve/`
      );
      if (!isMountedRef.current) return;
      showNotice('Approved', `Official Locator Slip ${pass.pass_number} is now active.`);
      setSelectedPass(null);
      void fetchPasses(true);
    } catch (err: unknown) {
      if (isMountedRef.current) {
        showNotice('Error', getFriendlyErrorMessage(err, 'Could not approve this locator slip.'));
      }
    } finally {
      if (isMountedRef.current) setActionBusy(false);
    }
  };

  const handleCancelPass = async (pass: ExitPassItem) => {
    if (actionBusy) return;
    setActionBusy(true);
    try {
      await apiClient.post(
        `${ENDPOINTS.EXIT_PASSES}${encodeURIComponent(String(pass.id))}/cancel/`
      );
      if (!isMountedRef.current) return;
      showNotice('Cancelled', `Pass ${pass.pass_number} has been cancelled.`);
      setSelectedPass(null);
      void fetchPasses(true);
    } catch (err: unknown) {
      if (isMountedRef.current) {
        showNotice('Error', getFriendlyErrorMessage(err, 'Could not cancel this pass.'));
      }
    } finally {
      if (isMountedRef.current) setActionBusy(false);
    }
  };

  const handleDeletePass = (pass: ExitPassItem) => {
    const run = async () => {
      setActionBusy(true);
      try {
        await apiClient.delete(`${ENDPOINTS.EXIT_PASSES}${encodeURIComponent(String(pass.id))}/`);
        if (!isMountedRef.current) return;
        showNotice('Deleted', `Exit pass ${pass.pass_number} removed.`);
        setSelectedPass(null);
        void fetchPasses(true);
      } catch (err: unknown) {
        if (isMountedRef.current) {
          showNotice('Delete Failed', getFriendlyErrorMessage(err, 'Could not delete pass.'));
        }
      } finally {
        if (isMountedRef.current) setActionBusy(false);
      }
    };
    confirmAction('Delete Pass', `Delete exit pass ${pass.pass_number}?`, 'Delete', () => void run());
  };

  const getStatusStyle = (st: ExitPassItem['pass_status']) => {
    if (st === 'PENDING_APPROVAL') return { bg: palette.warningLight, text: palette.warning };
    if (st === 'ACTIVE') return { bg: palette.successLight, text: palette.success };
    if (st === 'OVERDUE') return { bg: palette.dangerLight, text: palette.danger };
    if (st === 'RETURNED') return { bg: palette.infoLight, text: palette.info };
    return { bg: palette.surfaceSubtle, text: palette.textMuted };
  };

  const passTypePresets = passScope === 'STUDENT' ? STUDENT_PASS_TYPES : TEACHER_PASS_TYPES;
  const resolvedExistingProof = !clearExistingProof
    ? resolveMediaUrl(existingProofUrl, serverBase)
    : null;
  const hasAnyProofInForm = Boolean(pendingProof || resolvedExistingProof);
  const formProofIsPdf = pendingProof
    ? pendingProof.kind === 'pdf'
    : isPdfReference(resolvedExistingProof);
  const formProofImageUri = pendingProof
    ? pendingProof.kind === 'image'
      ? pendingProof.dataUrl || pendingProof.nativeUri || null
      : null
    : !formProofIsPdf
      ? resolvedExistingProof
      : null;

  const selectedPassProofUrl = selectedPass
    ? resolveMediaUrl(selectedPass.attachment_url || selectedPass.attachment, serverBase)
    : null;
  const selectedPassProofIsPdf = isPdfReference(selectedPassProofUrl);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          {onBack && (
            <TouchableOpacity style={styles.backBtn} onPress={onBack} accessibilityLabel="Go back">
              <Ionicons name="arrow-back" size={20} color={palette.primary} />
            </TouchableOpacity>
          )}
          <View>
            <Text style={styles.headerTitle}>Authorized Exit Passes</Text>
            <Text style={styles.headerSubtitle}>Student Exit Passes &amp; Teacher Locator Slips</Text>
          </View>
        </View>

        <TouchableOpacity style={styles.newBtn} onPress={openCreateModal}>
          <Ionicons name="add" size={16} color={palette.onPrimary} />
          <Text style={styles.newBtnText}>{allowStudentPass ? 'New Pass' : 'Locator Slip'}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.searchBox}>
        <Ionicons name="search" size={16} color={palette.textMuted} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search pass number, name, destination..."
          placeholderTextColor={palette.textMuted}
          value={searchQuery}
          onChangeText={setSearchQuery}
          maxLength={80}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Ionicons name="close-circle" size={16} color={palette.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.filterRow}>
        <ChipRow
          options={STATUS_FILTER_OPTIONS.map((opt) => ({
            key: opt.key,
            label: opt.label,
          }))}
          selected={statusFilter}
          onSelect={setStatusFilter}
        />
      </View>

      {loading && passes.length === 0 ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="small" color={palette.primary} />
          <Text style={styles.centerText}>Loading exit passes...</Text>
        </View>
      ) : (
        <FlatList
          style={styles.listFlex}
          data={filteredPasses}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                void fetchPasses(true);
              }}
              colors={[palette.primary]}
              tintColor={palette.primary}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Ionicons name="document-text-outline" size={38} color={palette.textMuted} />
              <Text style={styles.emptyTitle}>No exit passes here right now</Text>
              <Text style={styles.emptySub}>
                Tap &ldquo;{allowStudentPass ? 'New Pass' : 'Locator Slip'}&rdquo; at the top right to issue an approved campus exit or travel slip.
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const pillColors = getStatusStyle(item.pass_status);
            const hasProof = Boolean(item.attachment_url || item.attachment);
            return (
              <TouchableOpacity
                style={styles.card}
                activeOpacity={0.75}
                onPress={() => setSelectedPass(item)}
              >
                <View style={styles.cardTop}>
                  <View style={{ flex: 1, marginRight: 8 }}>
                    <Text style={styles.passCode}>{item.pass_number}</Text>
                    <Text style={styles.holderType}>
                      {item.pass_scope === 'TEACHER' ? 'TEACHER LOCATOR SLIP' : 'STUDENT EXIT PASS'}
                      {item.pass_type ? ` • ${item.pass_type}` : ''}
                    </Text>
                  </View>
                  <View style={[styles.statusPill, { backgroundColor: pillColors.bg }]}>
                    <Text style={[styles.statusPillText, { color: pillColors.text }]}>
                      {formatPassStatusLabel(item.pass_status)}
                    </Text>
                  </View>
                </View>

                <Text style={styles.holderName}>{item.person_name || 'Pass Holder'}</Text>
                <Text style={styles.reasonText} numberOfLines={2}>
                  {item.destination} — {item.reason}
                </Text>

                <View style={styles.cardBottom}>
                  <Text style={styles.dateText}>
                    Valid until: {formatTime12h(item.valid_until)}
                  </Text>
                  <Text style={styles.cardAction}>
                    {hasProof
                      ? isPdfReference(item.attachment_url || item.attachment)
                        ? 'PDF Proof • '
                        : 'Photo Proof • '
                      : ''}
                    View Pass &gt;
                  </Text>
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}

      {/* Create / Edit Exit Pass Modal */}
      <Modal
        visible={showIssueModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowIssueModal(false)}
      >
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalHeading}>
                {editingPass ? `Edit Pass ${editingPass.pass_number}` : 'Issue Authorized Exit Pass'}
              </Text>
              <TouchableOpacity onPress={() => setShowIssueModal(false)}>
                <Ionicons name="close" size={22} color={palette.textPrimary} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {!editingPass && allowStudentPass && (
                <View style={styles.switchRow}>
                  <TouchableOpacity
                    style={[styles.switchBtn, passScope === 'STUDENT' && styles.switchBtnActive]}
                    onPress={() => {
                      setPassScope('STUDENT');
                      setForm((p) => ({ ...p, pass_type: STUDENT_PASS_TYPES[0] }));
                    }}
                  >
                    <Text
                      style={[styles.switchText, passScope === 'STUDENT' && styles.switchTextActive]}
                    >
                      Student Exit Pass
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.switchBtn, passScope === 'TEACHER' && styles.switchBtnActive]}
                    onPress={() => {
                      setPassScope('TEACHER');
                      setForm((p) => ({ ...p, pass_type: TEACHER_PASS_TYPES[0] }));
                    }}
                  >
                    <Text
                      style={[styles.switchText, passScope === 'TEACHER' && styles.switchTextActive]}
                    >
                      Official Locator Slip
                    </Text>
                  </TouchableOpacity>
                </View>
              )}

              {!isLeader && passScope === 'TEACHER' && !editingPass && (
                <View style={styles.infoNoteBanner}>
                  <Ionicons name="information-circle-outline" size={16} color={palette.warning} />
                  <Text style={styles.infoNoteText}>
                    Teacher Locator Slips start as Pending Approval until approved by a school leader (Admin, Principal, or Department Head).
                  </Text>
                </View>
              )}

              {/* Searchable Student Picker */}
              {!editingPass && allowStudentPass && passScope === 'STUDENT' && (
                <>
                  <Text style={styles.inputLabel}>Select Student *</Text>
                  <TextInput
                    style={styles.inputField}
                    placeholder="Type student name or LRN to filter..."
                    placeholderTextColor={palette.textMuted}
                    value={studentPickerSearch}
                    onChangeText={setStudentPickerSearch}
                  />
                  <ChipRow
                    options={filteredStudentChoices.map((st) => ({
                      key: String(st.id),
                      label: `${st.full_name} (${st.section_name || st.lrn})`,
                    }))}
                    selected={form.student_id}
                    onSelect={(id) => setForm((p) => ({ ...p, student_id: id }))}
                    contentContainerStyle={{ paddingVertical: 6 }}
                  />
                </>
              )}

              {/* Teacher Picker for School Leaders issuing Official Locator Slips */}
              {!editingPass && passScope === 'TEACHER' && isLeader && teacherChoices.length > 0 && (
                <>
                  <Text style={styles.inputLabel}>Select Teacher *</Text>
                  <ChipRow
                    options={teacherChoices.map((t) => ({
                      key: String(t.id),
                      label: t.full_name,
                    }))}
                    selected={form.teacher_id}
                    onSelect={(id) => setForm((p) => ({ ...p, teacher_id: id }))}
                    contentContainerStyle={{ paddingVertical: 6 }}
                  />
                </>
              )}

              <Text style={styles.inputLabel}>Pass Type</Text>
              <ChipRow
                options={passTypePresets.map((pt) => ({ key: pt, label: pt }))}
                selected={form.pass_type}
                onSelect={(pt) => setForm((p) => ({ ...p, pass_type: pt }))}
                contentContainerStyle={{ paddingVertical: 4 }}
              />

              <Text style={styles.inputLabel}>Destination *</Text>
              <TextInput
                style={styles.inputField}
                placeholder="e.g. School Clinic, Division Office"
                placeholderTextColor={palette.textMuted}
                maxLength={160}
                value={form.destination}
                onChangeText={(val) => setForm({ ...form, destination: val })}
              />

              <Text style={styles.inputLabel}>Official Reason *</Text>
              <TextInput
                style={[styles.inputField, { height: 70, textAlignVertical: 'top', paddingTop: 8 }]}
                placeholder="Enter reason for leaving campus..."
                placeholderTextColor={palette.textMuted}
                multiline
                maxLength={300}
                value={form.reason}
                onChangeText={(val) => setForm({ ...form, reason: val })}
              />

              <Text style={styles.inputLabel}>Allowed Duration (Hours, 1 to 12)</Text>
              <TextInput
                style={styles.inputField}
                placeholder="2"
                placeholderTextColor={palette.textMuted}
                keyboardType="numeric"
                maxLength={2}
                value={form.duration_hours}
                onChangeText={(val) => setForm({ ...form, duration_hours: val })}
              />

              {/* Flexible Proof Attachment Picker (Camera, Gallery, or PDF/File) */}
              <View style={styles.proofPickerCard}>
                <Text style={styles.inputLabel}>
                  {passScope === 'STUDENT'
                    ? 'Hardcopy Excuse Letter / Proof (Photo or PDF)'
                    : 'Travel Order / Supporting Proof (Photo or PDF)'}
                </Text>
                <Text style={styles.proofHelperText}>
                  {passScope === 'STUDENT'
                    ? 'Optional: attach a photo, gallery image, or PDF scan of the parent’s hardcopy excuse letter (up to 2 MB).'
                    : 'Optional: attach a photo, gallery image, or PDF of your travel order or memo (up to 2 MB).'}
                </Text>

                {hasAnyProofInForm && (
                  formProofIsPdf ? (
                    <View style={styles.docPreviewCard}>
                      <View style={styles.docBadge}>
                        <Ionicons name="document-text-outline" size={20} color={palette.primary} />
                        <Text style={styles.docBadgeText}>PDF</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.docFileName} numberOfLines={1}>
                          {pendingProof?.name || extractFilenameFromUrl(resolvedExistingProof)}
                        </Text>
                        <Text style={styles.docMetaText}>
                          {pendingProof?.sizeBytes
                            ? `PDF Document • ${formatFileSize(pendingProof.sizeBytes)}`
                            : 'Attached PDF Document'}
                        </Text>
                      </View>
                      {resolvedExistingProof && !pendingProof && (
                        <TouchableOpacity
                          style={styles.openDocSmallBtn}
                          onPress={() => void handleOpenExternalDocument(resolvedExistingProof)}
                        >
                          <Text style={styles.openDocSmallBtnText}>Open</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  ) : formProofImageUri ? (
                    <View style={styles.imagePreviewWrap}>
                      <Image
                        source={{ uri: formProofImageUri }}
                        style={styles.proofFormImage}
                        contentFit="contain"
                      />
                    </View>
                  ) : null
                )}

                <View style={styles.proofActionRow}>
                  {Platform.OS !== 'web' && (
                    <>
                      <TouchableOpacity
                        style={[styles.proofActionBtn, (pickingProof || submitting) && { opacity: 0.6 }]}
                        onPress={() => void handlePickProofFromCamera()}
                        disabled={pickingProof || submitting}
                      >
                        <Ionicons name="camera-outline" size={14} color={palette.primary} />
                        <Text style={styles.proofActionBtnText}>Camera</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.proofActionBtn, (pickingProof || submitting) && { opacity: 0.6 }]}
                        onPress={() => void handlePickProofFromGallery()}
                        disabled={pickingProof || submitting}
                      >
                        <Ionicons name="images-outline" size={14} color={palette.primary} />
                        <Text style={styles.proofActionBtnText}>Gallery</Text>
                      </TouchableOpacity>
                    </>
                  )}
                  <TouchableOpacity
                    style={[styles.proofActionBtn, (pickingProof || submitting) && { opacity: 0.6 }]}
                    onPress={() => void handlePickProofDocument()}
                    disabled={pickingProof || submitting}
                  >
                    <Ionicons name="document-attach-outline" size={14} color={palette.primary} />
                    <Text style={styles.proofActionBtnText}>
                      {Platform.OS === 'web' ? 'Choose Photo or PDF' : 'PDF / File'}
                    </Text>
                  </TouchableOpacity>
                </View>

                {hasAnyProofInForm && (
                  <TouchableOpacity
                    style={styles.removeProofBtn}
                    onPress={handleRemoveProofSelection}
                    disabled={submitting}
                  >
                    <Ionicons name="trash-outline" size={14} color={palette.danger} />
                    <Text style={styles.removeProofBtnText}>Remove Attached Proof</Text>
                  </TouchableOpacity>
                )}
              </View>

              <TouchableOpacity
                style={[styles.submitBtn, submitting && { opacity: 0.65 }]}
                onPress={() => void handleIssueSubmit()}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator size="small" color={palette.onPrimary} />
                ) : (
                  <Text style={styles.submitBtnText}>
                    {editingPass
                      ? 'Save Pass Changes'
                      : !isLeader && passScope === 'TEACHER'
                        ? 'Submit Locator Slip for Approval'
                        : 'Issue Exit Pass'}
                  </Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Pass Slip Detail Modal */}
      <Modal
        visible={Boolean(selectedPass)}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedPass(null)}
      >
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalHeading}>Exit Pass Details</Text>
              <TouchableOpacity onPress={() => setSelectedPass(null)}>
                <Ionicons name="close" size={22} color={palette.textPrimary} />
              </TouchableOpacity>
            </View>

            {selectedPass && (
              <ScrollView showsVerticalScrollIndicator={false}>
                <View style={styles.qrArea}>
                  <View style={styles.qrQuietZone}>
                    <QRCode
                      value={`ATTENDSURE-PASS:${cleanText(selectedPass.pass_number, 64)}`}
                      size={155}
                      color={QR_COLORS.foreground}
                      backgroundColor={QR_COLORS.background}
                    />
                  </View>
                  <Text style={styles.qrHint}>
                    {selectedPass.pass_status === 'PENDING_APPROVAL'
                      ? 'Waiting for a school leader (Admin, Principal, or Department Head) to approve this locator slip.'
                      : selectedPass.pass_scope === 'STUDENT'
                        ? 'Student exit pass issued after verifying the parent’s hardcopy excuse letter at school.'
                        : 'Approved official locator slip protecting the teacher from false alerts until the scheduled return time.'}
                  </Text>
                </View>

                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Pass Number:</Text>
                  <Text style={styles.infoVal}>{selectedPass.pass_number}</Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Holder:</Text>
                  <Text style={styles.infoVal}>{selectedPass.person_name}</Text>
                </View>
                {selectedPass.pass_type ? (
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>Pass Type:</Text>
                    <Text style={styles.infoVal}>{selectedPass.pass_type}</Text>
                  </View>
                ) : null}
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Destination:</Text>
                  <Text style={styles.infoVal}>{selectedPass.destination}</Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Reason:</Text>
                  <Text style={styles.infoVal}>{selectedPass.reason}</Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Valid Until:</Text>
                  <Text style={styles.infoVal}>{formatDateTime12h(selectedPass.valid_until)}</Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Status:</Text>
                  <Text style={styles.infoVal}>{formatPassStatusLabel(selectedPass.pass_status)}</Text>
                </View>
                {selectedPass.issued_by_name ? (
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>Issued / Requested By:</Text>
                    <Text style={styles.infoVal}>{selectedPass.issued_by_name}</Text>
                  </View>
                ) : null}
                {selectedPass.approved_by_name ? (
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>Approved By:</Text>
                    <Text style={styles.infoVal}>{selectedPass.approved_by_name}</Text>
                  </View>
                ) : null}

                {selectedPassProofUrl ? (
                  <View style={styles.proofBox}>
                    <Text style={styles.infoLabel}>
                      {selectedPass.pass_scope === 'STUDENT'
                        ? 'Attached Hardcopy Excuse Letter / Proof:'
                        : 'Attached Supporting Proof Document:'}
                    </Text>
                    {selectedPassProofIsPdf ? (
                      <View style={styles.docPreviewCard}>
                        <View style={styles.docBadge}>
                          <Ionicons name="document-text-outline" size={20} color={palette.primary} />
                          <Text style={styles.docBadgeText}>PDF</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.docFileName} numberOfLines={1}>
                            {extractFilenameFromUrl(selectedPassProofUrl)}
                          </Text>
                          <Text style={styles.docMetaText}>PDF Proof Document</Text>
                        </View>
                        <TouchableOpacity
                          style={styles.openDocSmallBtn}
                          onPress={() => void handleOpenExternalDocument(selectedPassProofUrl)}
                        >
                          <Text style={styles.openDocSmallBtnText}>Open / View</Text>
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <>
                        <Image
                          source={{ uri: selectedPassProofUrl }}
                          style={styles.proofImage}
                          contentFit="contain"
                        />
                        <TouchableOpacity
                          style={[styles.proofActionBtn, { marginTop: 4 }]}
                          onPress={() => void handleOpenExternalDocument(selectedPassProofUrl)}
                        >
                          <Ionicons name="open-outline" size={14} color={palette.primary} />
                          <Text style={styles.proofActionBtnText}>Open Full Image</Text>
                        </TouchableOpacity>
                      </>
                    )}
                  </View>
                ) : null}

                {(selectedPass.pass_status === 'ACTIVE' || selectedPass.pass_status === 'OVERDUE') && (
                  <TouchableOpacity
                    style={[styles.confirmExitBtn, actionBusy && { opacity: 0.6 }]}
                    onPress={() => void handleMarkReturned(selectedPass)}
                    disabled={actionBusy}
                  >
                    <Ionicons name="checkmark-circle" size={16} color={palette.onPrimary} />
                    <Text style={styles.confirmExitBtnText}>Mark Returned to Campus</Text>
                  </TouchableOpacity>
                )}

                {isLeader &&
                  selectedPass.pass_scope === 'TEACHER' &&
                  selectedPass.pass_status === 'PENDING_APPROVAL' && (
                    <TouchableOpacity
                      style={[
                        styles.confirmExitBtn,
                        { backgroundColor: palette.success, marginTop: 8 },
                        actionBusy && { opacity: 0.6 },
                      ]}
                      onPress={() => void handleApprovePass(selectedPass)}
                      disabled={actionBusy}
                    >
                      <Ionicons name="shield-checkmark-outline" size={16} color={palette.onPrimary} />
                      <Text style={styles.confirmExitBtnText}>Approve Official Locator Slip</Text>
                    </TouchableOpacity>
                  )}

                {(() => {
                  const isIssuer =
                    user?.id !== undefined &&
                    selectedPass.issued_by !== undefined &&
                    selectedPass.issued_by !== null &&
                    Number(selectedPass.issued_by) === Number(user.id);
                  const isOwnStudentPass =
                    allowStudentPass && selectedPass.pass_scope === 'STUDENT' && isIssuer;
                  const isOwnPendingTeacherSlip =
                    selectedPass.pass_scope === 'TEACHER' &&
                    selectedPass.pass_status === 'PENDING_APPROVAL' &&
                    isIssuer;
                  const canEditOrDelete =
                    isLeader ||
                    isOwnPendingTeacherSlip ||
                    (isOwnStudentPass && selectedPass.pass_status !== 'RETURNED');
                  const canCancelSelected =
                    (selectedPass.pass_status === 'PENDING_APPROVAL' ||
                      selectedPass.pass_status === 'ACTIVE' ||
                      selectedPass.pass_status === 'OVERDUE') &&
                    (isLeader || isOwnStudentPass);
                  if (!canEditOrDelete && !canCancelSelected) return null;
                  return (
                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                      {canEditOrDelete && (
                        <TouchableOpacity
                          style={[
                            styles.confirmExitBtn,
                            { flex: 1, marginTop: 0, backgroundColor: palette.primarySoft },
                          ]}
                          onPress={() => openEditModal(selectedPass)}
                          disabled={actionBusy}
                        >
                          <Ionicons name="create-outline" size={15} color={palette.primary} />
                          <Text style={[styles.confirmExitBtnText, { color: palette.primary }]}>
                            Edit
                          </Text>
                        </TouchableOpacity>
                      )}
                      {canCancelSelected && (
                        <TouchableOpacity
                          style={[
                            styles.confirmExitBtn,
                            { flex: 1, marginTop: 0, backgroundColor: palette.warning },
                          ]}
                          onPress={() => void handleCancelPass(selectedPass)}
                          disabled={actionBusy}
                        >
                          <Text style={styles.confirmExitBtnText}>Cancel Pass</Text>
                        </TouchableOpacity>
                      )}
                      {canEditOrDelete && (
                        <TouchableOpacity
                          style={[
                            styles.confirmExitBtn,
                            { width: 46, marginTop: 0, backgroundColor: palette.danger },
                          ]}
                          onPress={() => handleDeletePass(selectedPass)}
                          disabled={actionBusy}
                          accessibilityLabel="Delete Exit Pass"
                        >
                          <Ionicons name="trash-outline" size={16} color={palette.onPrimary} />
                        </TouchableOpacity>
                      )}
                    </View>
                  );
                })()}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const createStyles = (palette: ThemePalette, fonts: ReturnType<typeof useThemeMode>['fonts']) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: palette.background },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 14,
      paddingVertical: 10,
      backgroundColor: palette.surface,
      borderBottomWidth: 1,
      borderBottomColor: palette.border,
    },
    headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
    backBtn: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: palette.surfaceSubtle,
      borderWidth: 1,
      borderColor: palette.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerTitle: { fontSize: fonts.lg, fontWeight: fonts.weight.extrabold, color: palette.textPrimary },
    headerSubtitle: { fontSize: fonts.xs, color: palette.textSecondary },
    newBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: palette.buttonBg,
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: 10,
    },
    newBtnText: { color: palette.onPrimary, fontSize: fonts.xs, fontWeight: fonts.weight.extrabold },
    searchBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginHorizontal: 14,
      marginTop: 10,
      paddingHorizontal: 12,
      height: 42,
      borderRadius: 12,
      backgroundColor: palette.surface,
      borderWidth: 1,
      borderColor: palette.border,
    },
    searchInput: { flex: 1, fontSize: fonts.sm, color: palette.textPrimary },
    filterRow: { flexShrink: 0, paddingHorizontal: 14, paddingVertical: 10 },
    listFlex: { flex: 1 },
    centerBox: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
    centerText: { fontSize: fonts.sm, color: palette.textSecondary },
    listContent: { paddingHorizontal: 14, paddingBottom: 115, gap: 10 },
    emptyBox: { alignItems: 'center', paddingVertical: 44, gap: 6 },
    emptyTitle: { fontSize: fonts.md, fontWeight: fonts.weight.extrabold, color: palette.textPrimary },
    emptySub: { fontSize: fonts.xs, color: palette.textSecondary, textAlign: 'center' },
    card: {
      backgroundColor: palette.surface,
      borderRadius: 14,
      padding: 14,
      borderWidth: 1,
      borderColor: palette.border,
      gap: 6,
    },
    cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
    passCode: { fontSize: fonts.xs, fontWeight: fonts.weight.extrabold, color: palette.primary },
    holderType: { fontSize: fonts.xxs, fontWeight: fonts.weight.bold, color: palette.textMuted },
    statusPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
    statusPillText: { fontSize: fonts.xxs, fontWeight: fonts.weight.extrabold },
    holderName: { fontSize: fonts.md, fontWeight: fonts.weight.extrabold, color: palette.textPrimary },
    reasonText: { fontSize: fonts.xs, color: palette.textSecondary, lineHeight: 17 },
    cardBottom: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingTop: 6,
      borderTopWidth: 1,
      borderTopColor: palette.border,
    },
    dateText: { fontSize: fonts.xs, color: palette.textMuted },
    cardAction: { fontSize: fonts.xs, fontWeight: fonts.weight.extrabold, color: palette.primary },
    modalBg: {
      flex: 1,
      backgroundColor: 'rgba(15, 23, 42, 0.72)',
      justifyContent: 'center',
      padding: 16,
    },
    modalCard: {
      backgroundColor: palette.surface,
      borderRadius: 18,
      padding: 16,
      maxHeight: '88%',
      borderWidth: 1,
      borderColor: palette.border,
    },
    modalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 10,
    },
    modalHeading: { fontSize: fonts.lg, fontWeight: fonts.weight.extrabold, color: palette.textPrimary },
    switchRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
    switchBtn: {
      flex: 1,
      paddingVertical: 9,
      borderRadius: 10,
      backgroundColor: palette.surfaceSubtle,
      borderWidth: 1,
      borderColor: palette.border,
      alignItems: 'center',
    },
    switchBtnActive: { backgroundColor: palette.buttonBg, borderColor: palette.buttonBg },
    switchText: { fontSize: fonts.xs, fontWeight: fonts.weight.extrabold, color: palette.textSecondary },
    switchTextActive: { color: palette.onPrimary },
    infoNoteBanner: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 8,
      padding: 10,
      borderRadius: 10,
      backgroundColor: palette.warningLight,
      borderWidth: 1,
      borderColor: palette.warning,
      marginBottom: 6,
    },
    infoNoteText: { flex: 1, fontSize: fonts.xxs, color: palette.textPrimary, lineHeight: 15 },
    inputLabel: {
      fontSize: fonts.xs,
      fontWeight: fonts.weight.bold,
      color: palette.textSecondary,
      marginTop: 8,
      marginBottom: 4,
    },
    inputField: {
      backgroundColor: palette.surfaceSubtle,
      borderWidth: 1,
      borderColor: palette.borderStrong,
      borderRadius: 10,
      paddingHorizontal: 12,
      height: 42,
      fontSize: fonts.sm,
      color: palette.textPrimary,
    },
    proofPickerCard: {
      marginTop: 10,
      padding: 12,
      borderRadius: 12,
      backgroundColor: palette.surfaceSubtle,
      borderWidth: 1,
      borderColor: palette.border,
      gap: 8,
    },
    proofHelperText: { fontSize: fonts.xxs, color: palette.textMuted, lineHeight: 15 },
    proofActionRow: { flexDirection: 'row', gap: 6 },
    proofActionBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 5,
      height: 38,
      borderRadius: 9,
      backgroundColor: palette.primarySoft,
      borderWidth: 1,
      borderColor: palette.primary,
      paddingHorizontal: 8,
    },
    proofActionBtnText: { fontSize: fonts.xs, fontWeight: fonts.weight.extrabold, color: palette.primary },
    removeProofBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 5,
      height: 34,
      borderRadius: 8,
      backgroundColor: palette.dangerLight,
    },
    removeProofBtnText: { fontSize: fonts.xs, fontWeight: fonts.weight.bold, color: palette.danger },
    docPreviewCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      padding: 10,
      borderRadius: 10,
      backgroundColor: palette.surface,
      borderWidth: 1,
      borderColor: palette.borderStrong,
    },
    docBadge: {
      width: 44,
      height: 44,
      borderRadius: 10,
      backgroundColor: palette.primarySoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    docBadgeText: { fontSize: 9, fontWeight: fonts.weight.black, color: palette.primary },
    docFileName: { fontSize: fonts.xs, fontWeight: fonts.weight.extrabold, color: palette.textPrimary },
    docMetaText: { fontSize: fonts.xxs, color: palette.textSecondary, marginTop: 1 },
    openDocSmallBtn: {
      paddingVertical: 6,
      paddingHorizontal: 10,
      borderRadius: 8,
      backgroundColor: palette.buttonBg,
    },
    openDocSmallBtnText: { fontSize: fonts.xxs, fontWeight: fonts.weight.extrabold, color: palette.onPrimary },
    imagePreviewWrap: {
      borderRadius: 10,
      overflow: 'hidden',
      backgroundColor: palette.surface,
      borderWidth: 1,
      borderColor: palette.borderStrong,
      padding: 6,
    },
    proofFormImage: { width: '100%', height: 130, borderRadius: 8 },
    submitBtn: {
      backgroundColor: palette.buttonBg,
      height: 46,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 14,
    },
    submitBtnText: { color: palette.onPrimary, fontSize: fonts.sm, fontWeight: fonts.weight.extrabold },
    qrArea: { alignItems: 'center', marginBottom: 12 },
    qrQuietZone: {
      backgroundColor: QR_COLORS.background,
      padding: 12,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: palette.border,
      marginBottom: 8,
    },
    qrHint: { fontSize: fonts.xs, color: palette.textSecondary, textAlign: 'center' },
    infoRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingVertical: 7,
      borderBottomWidth: 1,
      borderBottomColor: palette.border,
      gap: 10,
    },
    infoLabel: { fontSize: fonts.xs, fontWeight: fonts.weight.bold, color: palette.textMuted },
    infoVal: {
      fontSize: fonts.xs,
      fontWeight: fonts.weight.extrabold,
      color: palette.textPrimary,
      flex: 1,
      textAlign: 'right',
    },
    proofBox: {
      marginTop: 10,
      gap: 6,
      padding: 10,
      borderRadius: 10,
      backgroundColor: palette.surfaceSubtle,
      borderWidth: 1,
      borderColor: palette.border,
    },
    proofImage: { width: '100%', height: 150, borderRadius: 8 },
    confirmExitBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      height: 42,
      borderRadius: 10,
      backgroundColor: palette.buttonBg,
      marginTop: 12,
    },
    confirmExitBtnText: {
      color: palette.onPrimary,
      fontSize: fonts.xs,
      fontWeight: fonts.weight.extrabold,
    },
  });

export default GatePassScreen;

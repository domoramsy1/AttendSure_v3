import React, { useState, useEffect, useRef, useMemo } from 'react';
import apiClient from '../../api/client';
import { KagawaranNgEdukasyonLogo } from '../ui/KagawaranNgEdukasyonLogo';
import { 
  Printer, 
  Download,
  ChevronDown,
  FileSpreadsheet, 
  FileText, 
  Table as TableIcon,
  FileCode,
  ExternalLink,
  Loader2, 
  AlertCircle 
} from 'lucide-react';

interface Learner {
  id: number;
  lrn: string;
  name: string;
  sex: string;
  birthdate: string;
  age: number | string;
  birth_place?: string;
  mother_tongue: string;
  ethnic_group: string;
  religion: string;
  house_street: string;
  barangay: string;
  municipality_city: string;
  province: string;
  father_name: string;
  mother_maiden_name: string;
  guardian_name: string;
  guardian_relationship: string;
  parent_contact: string;
  remarks: string;
}

interface SF1Data {
  school_id: string;
  school_name: string;
  region: string;
  division: string;
  district: string;
  school_head: string;
  adviser_name: string;
  academic_year: string;
  section_name: string;
  grade_level: string;
  left_logo: string | null;
  right_logo: string | null;
  total_male: number;
  total_female: number;
  total_combined: number;
  males: Learner[];
  females: Learner[];
}

export interface SF1ReportTabProps {
  sectionId?: number | string;
}

// Fallback Base64 PNG for Kagawaran ng Edukasyon seal
const KAGAWARAN_SEAL_BASE64 = 
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAHgAAAB4CAYAAAA5ZDbSAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAGXRFWHRTb2Z0d2FyZQB3d3cuaW5rc2NhcGUub3Jnm+48GgAAIABJREFUeJztnXmUXFWd7z/n3lvdvdduqrqrO1t3OgkkISwBA0gUGEBB1Bk33MfvjXF0Rn1eXl+ecZl35/l4fN59" +
  "g3PnvVdEnZkRFcQVBAYQEEQggZCEOkl3p9PJ1tVdd6vOue8fbqeT0NWpTqeTkPruWmvVqlvVdZ79+7v799vf/r3L8zy8" +
  "vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLzy8v/sA7y8vLz+fyL8rT7AqwtE" +
  "b86mU/PZTCY9m2vNZnw6053NJ1Ld+XQ2nZqbmk1n0ql8JpHKzWbT6VQ2lZ5L5RLp7mwqn85mJmYy2UwmM51M5bNpj5tN" +
  "56ZmU9n0RCadmc5l8pmM52QzmUwqlZ2dmprJpnOzqfRsIpnKJFPZjOek/12Z30uEV41+VyeISiF6c/Z/7e8jEZEQESmF" +
  "iEglIiIi8/6dRCQhIhFReG7O49l89n/lff4f4VWjP2kQvTkbu9n/7v/4n0m+m/135P/yZ0T6b/V/hFeNfi/xqtGfNIje" +
  "nP2/j/47+W529n8j/y/hVaPfS7xq9CcN+k705u/Z/9uI/17hVaPfS7xq9HupL4je6s7+47x/z/CrRn/UeNXo9xL/v0Vv" +
  "zibf6vf9fxevGv1R41Wj30t874nevJXw/zReNfqjxqtGv5f45z/Bv6/4VaM/arxq9HuJV43+pPGq0R81/kU1+l9u+wM3" +
  "7/h3hFeNfq/wqtGfNF41+qPGP79G/1s66b96eNXo9xKvGv1J41WjP2r8y2v0X1y8avR7hVeN/qTxqtEfNf7FNfrfE141" +
  "+r3Eq0Z/0njV6I8a/5vX6H9feNXo9xKvGv1J41WjP2r8C2r0v0+8avR7hVeN/qTxqtEfNf75NfrfE141+r3Eq0Z/0njV" +
  "6I8a/4Ia/e8Trxr9XuFVo99LvGr0J41/qUb/8b3E/84a/S/Nq0Z/pHjV6PcSrxr9SeNVo//q+N/Z6H+heNXojxKvGv1e" +
  "4lWjP2m8avT/NfjfrdH/QvGq0R8lXjX6vcSrRn/SeNXovxr+72z0P1e8avRHiVeNfi/xqtGfNF41+q+G/52N/peKV43+" +
  "KPGq0e8lXjX6k8arRv9V8b+z0f9C8arRHyVeNfq9xKtGf9J41ei/Ov53NvpfKF41+qPEq0a/l3jV6E8arxr9l8b/tkb/" +
  "c8WrRn+UeNXo9xKvGv1J41Wj/9L439bofy541eiPEq8a/V7iVaM/abxq9F8a/9sa/c8Frxr9UeJVo99LvGr0J41Xjf5L" +
  "439bo/+54FWjP0q8avR7iVeN/qTxqtF/afxva/Q/F7xq9EeJV41+L/Gq0Z80/nU0+p/Kq0Z/lHjV6PcSrxr9SeNVo//S" +
  "+N/W6H8ueNXojxKvGv1e4lWjP2m8avRfGv/bGv3PBa8a/VHiVaPfS7xq9CeNV43+S+N/W6P/ueBVoz9KvGr0e4lXjf6k" +
  "8arRf2n8b2v0Pxe8avRHiVeNfi/xqtGfNP61NPrf1KtGf5R41ej3Eq8a/UnjVaP/0vjf1uh/LnjV6I8Srxr9XuJVo//i" +
  "+Kfr0X9drxr9UeJVo99LvGr0J41/2kb/W3rV6I8Srxr9XuJVo//S+Kfr0f9Grxr9UeJVo99LvGr0Xxv/9I3+N3vV6I8S" +
  "rxr9XuJVo//K+Kfr0X+rV43+KPGq0e8l/n/W6H+3+NX4/wH+L41XjX4v8X8Akc8bN/D4YlAAAAAElFTkSuQmCC";

export const SF1ReportTab: React.FC<SF1ReportTabProps> = ({ sectionId }) => {
  const [sections, setSections] = useState<any[]>([]);
  const [selectedSectionId, setSelectedSectionId] = useState<string>(
    sectionId ? String(sectionId) : ''
  );
  const [reportData, setReportData] = useState<SF1Data | null>(null);
  const [loading, setLoading] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isExportDropdownOpen, setIsExportDropdownOpen] = useState(false);

  const reportRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsExportDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (sectionId) {
      setSelectedSectionId(String(sectionId));
    }
  }, [sectionId]);

  useEffect(() => {
    const fetchSections = async () => {
      try {
        const res = await apiClient.get('/sections/');
        setSections(res.data);
        if (!selectedSectionId && res.data.length > 0) {
          setSelectedSectionId(String(res.data[0].id));
        }
      } catch (err) {
        console.error('Failed to load sections:', err);
      }
    };
    fetchSections();
  }, [selectedSectionId]);

  useEffect(() => {
    if (!selectedSectionId) return;
    const fetchSF1 = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await apiClient.get<SF1Data>(`/reports/sf1/${selectedSectionId}/`);
        setReportData(res.data);
      } catch (err: any) {
        setError(err.response?.data?.error || 'Failed to generate official DepEd SF1 report.');
      } finally {
        setLoading(false);
      }
    };
    fetchSF1();
  }, [selectedSectionId]);

  // Unified alphabetical roster: sorted strictly by learner name from A to Z
  const sortedLearners = useMemo(() => {
    if (!reportData) return [];
    const combined = [
      ...(reportData.males || []),
      ...(reportData.females || []),
    ];
    return combined.sort((a, b) => a.name.localeCompare(b.name));
  }, [reportData]);

  const parseGuardian = (name: string, rel: string) => {
    const commonRel = ['MOTHER', 'FATHER', 'AUNT', 'UNCLE', 'GRANDMOTHER', 'GRANDFATHER', 'GUARDIAN'];
    const cleanName = (name || '').trim();
    const cleanRel = (rel || '').trim();

    if (commonRel.includes(cleanName.toUpperCase()) && !commonRel.includes(cleanRel.toUpperCase())) {
      return { gName: cleanRel, gRel: cleanName };
    }
    return { gName: cleanName, gRel: cleanRel === 'Mather' ? 'Mother' : cleanRel };
  };

  // Generates filename formatted strictly by: Report Type, Grade, Section, and Timestamp
  const getBaseFilename = () => {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;

    const rawGrade = reportData?.grade_level ? String(reportData.grade_level).trim() : 'Grade';
    const cleanGrade = rawGrade.toLowerCase().startsWith('grade')
      ? rawGrade.replace(/[^a-zA-Z0-9]/g, '_')
      : `Grade_${rawGrade.replace(/[^a-zA-Z0-9]/g, '_')}`;

    const cleanSection = reportData?.section_name 
      ? String(reportData.section_name).trim().replace(/[^a-zA-Z0-9]/g, '_') 
      : 'Section';

    return `SF1_Report_${cleanGrade}_${cleanSection}_${timestamp}`;
  };

  // Directory Picker Engine (prompts user for directory/folder, then saves)
  const saveFileWithPicker = async (
    blob: Blob,
    suggestedName: string,
    mimeType: string,
    extension: string,
    description: string
  ) => {
    if ('showSaveFilePicker' in window) {
      try {
        const handle = await (window as any).showSaveFilePicker({
          suggestedName,
          types: [
            {
              description,
              accept: { [mimeType]: [`.${extension}`] },
            },
          ],
        });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        return;
      } catch (err: any) {
        if (err.name === 'AbortError') return; // User cancelled prompt
        console.warn('showSaveFilePicker fallback:', err);
      }
    }

    // Standard download fallback
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = suggestedName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Dedicated Print Action
  const handlePrint = () => {
    setIsExportDropdownOpen(false);
    window.print();
  };

  // Extract base64 logo from DOM canvas or fallback to constant
  const getLogoBase64DataUrl = (): string => {
    if (reportData?.left_logo && reportData.left_logo.startsWith('data:image')) {
      return reportData.left_logo;
    }
    const imgEl = reportRef.current?.querySelector('img') as HTMLImageElement | null;
    if (imgEl && imgEl.complete && imgEl.naturalWidth > 0) {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = imgEl.naturalWidth;
        canvas.height = imgEl.naturalHeight;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(imgEl, 0, 0);
          const dataUrl = canvas.toDataURL('image/png');
          if (dataUrl && dataUrl.length > 500) {
            return dataUrl;
          }
        }
      } catch {
        // canvas conversion fallback
      }
    }
    return KAGAWARAN_SEAL_BASE64;
  };

  // 1. PDF Download Engine: Generates vector PDF and prompts for directory
  const handleDownloadPDF = async () => {
    if (!reportRef.current || !reportData) return;
    setIsExportDropdownOpen(false);
    setExportingPdf(true);

    try {
      let html2pdfInstance = (window as any).html2pdf;
      if (!html2pdfInstance) {
        await new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
          script.onload = () => resolve((window as any).html2pdf);
          script.onerror = reject;
          document.head.appendChild(script);
        });
        html2pdfInstance = (window as any).html2pdf;
      }

      const opt = {
        margin: [0.25, 0.25, 0.25, 0.25], // Equal 0.25in margins on all 4 sides
        filename: `${getBaseFilename()}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, logging: false },
        jsPDF: { unit: 'in', format: 'legal', orientation: 'landscape' },
      };

      const pdfBlob: Blob = await html2pdfInstance()
        .from(reportRef.current)
        .set(opt)
        .outputPdf('blob');

      await saveFileWithPicker(
        pdfBlob,
        `${getBaseFilename()}.pdf`,
        'application/pdf',
        'pdf',
        'PDF Document (*.pdf)'
      );
    } catch (err) {
      console.error('PDF generation error:', err);
      alert('Unable to generate PDF directly. Please use the Print button and choose "Save as PDF".');
    } finally {
      setExportingPdf(false);
    }
  };

  // Build 20-Column Semantic HTML Table Document String for Word/Excel/Google Docs/Sheets
  const buildExactOfficeHtmlDocument = (): string => {
    if (!reportData) return '';
    const logoDataUrl = getLogoBase64DataUrl();

    let learnerRowsHtml = '';
    sortedLearners.forEach((l, idx) => {
      const { gName, gRel } = parseGuardian(l.guardian_name, l.guardian_relationship);
      learnerRowsHtml += `
        <tr style="height: 17px; page-break-inside: avoid;">
          <td style="border: 1px solid #000000; text-align: center; vertical-align: middle; font-size: 5.2pt;">${idx + 1}</td>
          <td style="border: 1px solid #000000; text-align: center; vertical-align: middle; font-size: 5.2pt; font-family: monospace; font-weight: bold; mso-number-format: '\\@';">${l.lrn}</td>
          <td style="border: 1px solid #000000; text-align: left; vertical-align: middle; font-size: 5.2pt; font-weight: bold; padding-left: 2px;">${l.name}</td>
          <td style="border: 1px solid #000000; text-align: center; vertical-align: middle; font-size: 5.2pt;">${l.sex}</td>
          <td style="border: 1px solid #000000; text-align: center; vertical-align: middle; font-size: 5.2pt;">${l.birthdate}</td>
          <td style="border: 1px solid #000000; text-align: center; vertical-align: middle; font-size: 5.2pt;">${l.age}</td>
          <td style="border: 1px solid #000000; text-align: center; vertical-align: middle; font-size: 5.2pt;">${l.birth_place || l.province || ''}</td>
          <td style="border: 1px solid #000000; text-align: center; vertical-align: middle; font-size: 5.2pt;">${l.mother_tongue}</td>
          <td style="border: 1px solid #000000; text-align: center; vertical-align: middle; font-size: 5.2pt;">${l.ethnic_group}</td>
          <td style="border: 1px solid #000000; text-align: center; vertical-align: middle; font-size: 5.2pt;">${l.religion}</td>
          <td style="border: 1px solid #000000; text-align: left; vertical-align: middle; font-size: 5.2pt; padding-left: 2px;">${l.house_street}</td>
          <td style="border: 1px solid #000000; text-align: left; vertical-align: middle; font-size: 5.2pt; padding-left: 2px;">${l.barangay}</td>
          <td style="border: 1px solid #000000; text-align: left; vertical-align: middle; font-size: 5.2pt; padding-left: 2px;">${l.municipality_city}</td>
          <td style="border: 1px solid #000000; text-align: left; vertical-align: middle; font-size: 5.2pt; padding-left: 2px;">${l.province}</td>
          <td style="border: 1px solid #000000; text-align: left; vertical-align: middle; font-size: 5.2pt; padding-left: 2px;">${l.father_name}</td>
          <td style="border: 1px solid #000000; text-align: left; vertical-align: middle; font-size: 5.2pt; padding-left: 2px;">${l.mother_maiden_name}</td>
          <td style="border: 1px solid #000000; text-align: left; vertical-align: middle; font-size: 5.2pt; padding-left: 2px;">${gName}</td>
          <td style="border: 1px solid #000000; text-align: center; vertical-align: middle; font-size: 5.2pt;">${gRel}</td>
          <td style="border: 1px solid #000000; text-align: center; vertical-align: middle; font-size: 5.2pt; font-family: monospace; mso-number-format: '\\@';">${l.parent_contact}</td>
          <td style="border: 1px solid #000000; text-align: center; vertical-align: middle; font-size: 5.2pt;">${l.remarks}</td>
        </tr>
      `;
    });

    return `
      <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
      <head>
        <meta http-equiv="content-type" content="application/vnd.ms-excel; charset=UTF-8"/>
        <!--[if gte mso 9]>
        <xml>
          <x:ExcelWorkbook>
            <x:ExcelWorksheets>
              <x:ExcelWorksheet>
                <x:Name>School Form 1</x:Name>
                <x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions>
              </x:ExcelWorksheet>
            </x:ExcelWorksheets>
          </x:ExcelWorkbook>
          <w:WordDocument>
            <w:View>Print</w:View>
            <w:Zoom>100</w:Zoom>
            <w:DoNotOptimizeForBrowser/>
          </w:WordDocument>
        </xml>
        <![endif]-->
        <style>
          @page {
            size: 14.0in 8.5in;
            mso-page-orientation: landscape;
            margin: 0.25in 0.25in 0.25in 0.25in;
          }
          @page Section1 {
            size: 14.0in 8.5in;
            mso-page-orientation: landscape;
            margin: 0.25in 0.25in 0.25in 0.25in;
          }
          div.Section1 { page: Section1; }
          * { box-sizing: border-box; font-family: Arial, sans-serif; }
          body { margin: 0; padding: 0.25in; background: #ffffff; color: #000000; }
          table { border-collapse: collapse; table-layout: fixed; width: 100%; font-family: Arial, sans-serif; }
          .header-cell { border: 1px solid #000000; background-color: #ffffff; font-weight: bold; text-align: center; vertical-align: middle; color: #000000; }
          .meta-box { border: 1.2px solid #000000; background-color: #ffffff; text-align: center; font-weight: bold; font-size: 7.4pt; color: #000000; padding: 1px 4px; }
          .meta-label { font-weight: bold; font-size: 7.2pt; color: #000000; }
        </style>
      </head>
      <body>
        <div class="Section1" style="width: 13.5in; margin: 0 auto;">
          <table border="0" cellpadding="0" cellspacing="0" style="width: 100%; margin-bottom: 8px;">
            <colgroup>
              <col style="width: 1.8%;"/>
              <col style="width: 6.6%;"/>
              <col style="width: 13.0%;"/>
              <col style="width: 2.4%;"/>
              <col style="width: 4.6%;"/>
              <col style="width: 3.4%;"/>
              <col style="width: 4.6%;"/>
              <col style="width: 4.2%;"/>
              <col style="width: 4.0%;"/>
              <col style="width: 4.2%;"/>
              <col style="width: 4.8%;"/>
              <col style="width: 4.0%;"/>
              <col style="width: 4.4%;"/>
              <col style="width: 4.0%;"/>
              <col style="width: 6.8%;"/>
              <col style="width: 6.8%;"/>
              <col style="width: 4.6%;"/>
              <col style="width: 3.6%;"/>
              <col style="width: 6.0%;"/>
              <col style="width: 6.2%;"/>
            </colgroup>
            <!-- TOP LOGO & FORM TITLE -->
            <tr>
              <td rowspan="3" colspan="2" style="text-align: center; vertical-align: middle; border: none; padding-right: 8px;">
                <img src="${logoDataUrl}" width="76" height="76" style="width: 76px; height: 76px; object-fit: contain; display: block; margin: 0 auto;" alt="Kagawaran ng Edukasyon Seal"/>
              </td>
              <td colspan="18" style="text-align: center; border: none;">
                <div style="font-size: 8pt; font-weight: bold; letter-spacing: 0.4px;">Republic of the Philippines &bull; Department of Education</div>
                <div style="font-size: 11.8pt; font-weight: 900; text-transform: uppercase; margin: 1px 0; letter-spacing: 0.4px;">School Form 1 (SF 1) School Register</div>
                <div style="font-size: 6.2pt; font-style: italic; color: #111;">(This replaces Form 1, Master List &amp; STS Form 2-Family Background and Profile)</div>
              </td>
            </tr>
            <!-- METADATA ROW 1 -->
            <tr>
              <td colspan="1" class="meta-label" style="border: none; text-align: left;">School ID</td>
              <td colspan="2" class="meta-box">${reportData.school_id}</td>
              <td colspan="2" style="border: none;">&nbsp;</td>
              <td colspan="1" class="meta-label" style="border: none; text-align: left;">Division</td>
              <td colspan="4" class="meta-box" style="text-align: left; padding-left: 6px;">${reportData.division}</td>
              <td colspan="2" style="border: none;">&nbsp;</td>
              <td colspan="1" class="meta-label" style="border: none; text-align: left;">District</td>
              <td colspan="4" class="meta-box" style="text-align: left; padding-left: 6px;">${reportData.district}</td>
              <td colspan="1" style="border: none;">&nbsp;</td>
            </tr>
            <!-- METADATA ROW 2 -->
            <tr>
              <td colspan="1" class="meta-label" style="border: none; text-align: left;">School Name</td>
              <td colspan="2" class="meta-box" style="text-align: left; padding-left: 6px;">${reportData.school_name}</td>
              <td colspan="2" style="border: none;">&nbsp;</td>
              <td colspan="1" class="meta-label" style="border: none; text-align: left;">School Year</td>
              <td colspan="4" class="meta-box">${reportData.academic_year}</td>
              <td colspan="2" style="border: none;">&nbsp;</td>
              <td colspan="1" class="meta-label" style="border: none; text-align: left;">Grade Level</td>
              <td colspan="1" class="meta-box">${reportData.grade_level}</td>
              <td colspan="1" class="meta-label" style="border: none; text-align: left; padding-left: 4px;">Section</td>
              <td colspan="2" class="meta-box" style="text-align: left; padding-left: 6px;">${reportData.section_name}</td>
            </tr>
            <!-- SPACING -->
            <tr><td colspan="20" style="border: none; height: 6px;"></td></tr>
            <!-- TABLE HEADERS -->
            <tr>
              <th rowspan="2" class="header-cell" style="width: 1.8%; font-size: 5.2pt;">#</th>
              <th rowspan="2" class="header-cell" style="width: 6.6%; font-size: 5.2pt;">LRN</th>
              <th rowspan="2" class="header-cell" style="width: 13.0%; font-size: 5.2pt;">NAME<br/><span style="font-size: 4.4pt; font-weight: normal; font-style: italic;">(Last Name, First Name, Middle Name)</span></th>
              <th rowspan="2" class="header-cell" style="width: 2.4%; font-size: 5.2pt;">Sex (M/F)</th>
              <th rowspan="2" class="header-cell" style="width: 4.6%; font-size: 5.2pt;">BIRTH DATE<br/><span style="font-size: 4.4pt; font-weight: normal; font-style: italic;">(mm/dd/yyyy)</span></th>
              <th rowspan="2" class="header-cell" style="width: 3.4%; font-size: 5.2pt;">AGE as of 1st<br/><span style="font-size: 4.4pt; font-weight: normal; font-style: italic;">Friday June</span></th>
              <th rowspan="2" class="header-cell" style="width: 4.6%; font-size: 5.2pt;">BIRTH PLACE<br/><span style="font-size: 4.4pt; font-weight: normal; font-style: italic;">(Province)</span></th>
              <th rowspan="2" class="header-cell" style="width: 4.2%; font-size: 5.2pt;">MOTHER TONGUE</th>
              <th rowspan="2" class="header-cell" style="width: 4.0%; font-size: 5.2pt;">IP<br/><span style="font-size: 4.4pt; font-weight: normal; font-style: italic;">(Ethnic Group)</span></th>
              <th rowspan="2" class="header-cell" style="width: 4.2%; font-size: 5.2pt;">RELIGION</th>
              <th colspan="4" class="header-cell" style="font-size: 5.2pt;">ADDRESS</th>
              <th colspan="2" class="header-cell" style="font-size: 5.2pt;">PARENTS</th>
              <th colspan="2" class="header-cell" style="font-size: 5.2pt;">GUARDIAN (if not Parent)</th>
              <th rowspan="2" class="header-cell" style="width: 6.0%; font-size: 5.2pt;">Contact Number of Parent or<br/>Guardian</th>
              <th class="header-cell" style="width: 6.2%; font-size: 5.2pt;">REMARKS</th>
            </tr>
            <tr>
              <th class="header-cell" style="font-size: 5.2pt;">House #/ Street/ Sitio/ Purok</th>
              <th class="header-cell" style="font-size: 5.2pt;">Barangay</th>
              <th class="header-cell" style="font-size: 5.2pt;">Municipality/ City</th>
              <th class="header-cell" style="font-size: 5.2pt;">Province</th>
              <th class="header-cell" style="font-size: 5.2pt;">Father's Name (Last Name, First Name, Middle Name)</th>
              <th class="header-cell" style="font-size: 5.2pt;">Mother's Maiden Name (Last Name, First Name, Middle Name)</th>
              <th class="header-cell" style="font-size: 5.2pt;">Name</th>
              <th class="header-cell" style="font-size: 5.2pt;">Relation-ship</th>
              <th class="header-cell" style="font-size: 4.1pt; font-weight: normal; line-height: 1.05;">(Please refer to the<br/>legend on last page)</th>
            </tr>
            <!-- STUDENT ROSTER ROWS -->
            ${learnerRowsHtml}
            <!-- SPACING -->
            <tr><td colspan="20" style="border: none; height: 6px;"></td></tr>
            <!-- FOOTER ROW (20 COLUMNS EXACTLY) -->
            <tr>
              <!-- Panel 1: Indicators (Col 1..11, 57.8%) -->
              <td colspan="11" style="border: none; padding-right: 6px; vertical-align: bottom;">
                <div style="font-weight: 800; font-size: 5.8pt; text-align: center; margin-bottom: 2px;">List and Code of Indicators under REMARKS column</div>
                <table border="1" style="width: 100%; border-collapse: collapse; font-size: 4.8pt;">
                  <thead>
                    <tr style="background-color: #ffffff; font-weight: bold;">
                      <th style="width: 15%; border: 1px solid black; padding: 1px 2px;">Indicator</th>
                      <th style="width: 5%; border: 1px solid black; padding: 1px; text-align: center;">Code</th>
                      <th style="width: 30%; border: 1px solid black; padding: 1px 2px;">Required Information</th>
                      <th style="width: 15%; border: 1px solid black; padding: 1px 2px;">Indicator</th>
                      <th style="width: 5%; border: 1px solid black; padding: 1px; text-align: center;">Code</th>
                      <th style="width: 30%; border: 1px solid black; padding: 1px 2px;">Required Information</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td style="border: 1px solid black; font-weight: 600; padding: 1px 2px;">Transferred Out</td>
                      <td style="border: 1px solid black; text-align: center; font-weight: bold;">T/O</td>
                      <td style="border: 1px solid black; padding: 1px 2px;">Name of Public (P) Private (PR) School &amp; Effectivity Date</td>
                      <td style="border: 1px solid black; font-weight: 600; padding: 1px 2px;">CCT Recipient</td>
                      <td style="border: 1px solid black; text-align: center; font-weight: bold;">CCT</td>
                      <td style="border: 1px solid black; padding: 1px 2px;">CCT Control/reference number &amp; Effectivity Date</td>
                    </tr>
                    <tr>
                      <td style="border: 1px solid black; font-weight: 600; padding: 1px 2px;">Transferred IN</td>
                      <td style="border: 1px solid black; text-align: center; font-weight: bold;">T/I</td>
                      <td style="border: 1px solid black; padding: 1px 2px;">Name of Public (P) Private (PR) School &amp; Effectivity Date</td>
                      <td style="border: 1px solid black; font-weight: 600; padding: 1px 2px;">Balik-Aral</td>
                      <td style="border: 1px solid black; text-align: center; font-weight: bold;">B/A</td>
                      <td style="border: 1px solid black; padding: 1px 2px;">Name of school last attended &amp; Year</td>
                    </tr>
                    <tr>
                      <td style="border: 1px solid black; font-weight: 600; padding: 1px 2px;">Dropped</td>
                      <td style="border: 1px solid black; text-align: center; font-weight: bold;">DRP</td>
                      <td style="border: 1px solid black; padding: 1px 2px;">Reason and Effectivity Date</td>
                      <td style="border: 1px solid black; font-weight: 600; padding: 1px 2px;">Learner With Disability</td>
                      <td style="border: 1px solid black; text-align: center; font-weight: bold;">LWD</td>
                      <td style="border: 1px solid black; padding: 1px 2px;">Specify</td>
                    </tr>
                    <tr>
                      <td style="border: 1px solid black; font-weight: 600; padding: 1px 2px;">Late Enrollment</td>
                      <td style="border: 1px solid black; text-align: center; font-weight: bold;">LE</td>
                      <td style="border: 1px solid black; padding: 1px 2px;">Reason (Enrollment beyond 1st Friday of June)</td>
                      <td style="border: 1px solid black; font-weight: 600; padding: 1px 2px;">Accelerated</td>
                      <td style="border: 1px solid black; text-align: center; font-weight: bold;">ACL</td>
                      <td style="border: 1px solid black; padding: 1px 2px;">Specify Level &amp; Effectivity Date</td>
                    </tr>
                  </tbody>
                </table>
              </td>
              <!-- Panel 2: Summary (Col 12..14, 12.8%) -->
              <td colspan="3" style="border: none; padding-right: 6px; vertical-align: bottom;">
                <table border="1" style="width: 100%; border-collapse: collapse; font-size: 4.9pt; text-align: center;">
                  <thead>
                    <tr style="background-color: #ffffff; font-weight: bold;">
                      <th style="width: 40%; border: 1px solid black; padding: 1px 2px;">REGISTERED</th>
                      <th style="width: 30%; border: 1px solid black; padding: 1px 2px;">BoSY</th>
                      <th style="width: 30%; border: 1px solid black; padding: 1px 2px;">EoSY</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr><td style="border: 1px solid black; font-weight: 700;">MALE</td><td style="border: 1px solid black;">${reportData.total_male}</td><td style="border: 1px solid black;"></td></tr>
                    <tr><td style="border: 1px solid black; font-weight: 700;">FEMALE</td><td style="border: 1px solid black;">${reportData.total_female}</td><td style="border: 1px solid black;"></td></tr>
                    <tr><td style="border: 1px solid black; font-weight: 800;">TOTAL</td><td style="border: 1px solid black; font-weight: 800;">${reportData.total_combined}</td><td style="border: 1px solid black;"></td></tr>
                  </tbody>
                </table>
              </td>
              <!-- Panel 3: Adviser (Col 15..17, 14.7%) -->
              <td colspan="3" style="border: none; padding-right: 6px; vertical-align: bottom;">
                <div style="font-size: 5.2pt; font-weight: 700; text-align: left; margin-bottom: 12px;">Prepared by :</div>
                <div style="border-bottom: 1px solid black; min-height: 14px; text-align: center; font-weight: 800; font-size: 5.8pt; text-transform: uppercase;">${reportData.adviser_name}</div>
                <div style="font-size: 4.8pt; text-align: center; margin-top: 1px;">(Signature of Adviser over Printed Name)</div>
                <div style="font-size: 4.8pt; margin-top: 4px; display: flex; justify-content: space-between;">
                  <span>BoSY Date:</span><span>EoSY Date:</span>
                </div>
              </td>
              <!-- Panel 4: School Head (Col 18..20, 14.7% - ends at Col 20 Remarks edge) -->
              <td colspan="3" style="border: none; vertical-align: bottom;">
                <div style="font-size: 5.2pt; font-weight: 700; text-align: left; margin-bottom: 12px;">Certified Correct:</div>
                <div style="border-bottom: 1px solid black; min-height: 14px; text-align: center; font-weight: 800; font-size: 5.8pt; text-transform: uppercase;">${reportData.school_head}</div>
                <div style="font-size: 4.8pt; text-align: center; margin-top: 1px;">(Signature of School Head over Printed Name)</div>
                <div style="font-size: 4.8pt; margin-top: 4px; display: flex; justify-content: space-between;">
                  <span>BoSY Date:</span><span>EoSY Date:</span>
                </div>
              </td>
            </tr>
            <!-- AUDIT FOOTER -->
            <tr>
              <td colspan="20" style="border: none; font-size: 4.8pt; color: #475569; text-align: right; font-style: italic; padding-top: 4px;">
                Generated via AttendSure School Management System &bull; DepEd Form SF1 (Legal Landscape) &bull; Page 1 of 1
              </td>
            </tr>
          </table>
        </div>
      </body>
      </html>
    `;
  };

  // 2. Microsoft Excel Workbook (.xls format) — Writes the exact 20-column document
  const handleExportExcel = async () => {
    if (!reportData) return;
    setIsExportDropdownOpen(false);
    const html = buildExactOfficeHtmlDocument();
    const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8;' });
    await saveFileWithPicker(blob, `${getBaseFilename()}.xls`, 'application/vnd.ms-excel', 'xls', 'Excel Worksheet (*.xls)');
  };

  // 3. Microsoft Word Document (.doc format) — Writes the exact 20-column document
  const handleExportWord = async () => {
    if (!reportData) return;
    setIsExportDropdownOpen(false);
    const html = buildExactOfficeHtmlDocument();
    const blob = new Blob([html], { type: 'application/msword;charset=utf-8;' });
    await saveFileWithPicker(blob, `${getBaseFilename()}.doc`, 'application/msword', 'doc', 'Word Document (*.doc)');
  };

  // 4. Google Sheets Export (Downloads exact .xls & launches sheets.new)
  const handleExportGoogleSheets = () => {
    handleExportExcel();
    window.open('https://sheets.new', '_blank');
  };

  // 5. Google Docs Export (Downloads exact .doc & launches docs.new)
  const handleExportGoogleDocs = () => {
    handleExportWord();
    window.open('https://docs.new', '_blank');
  };

  // 6. Standard DepEd CSV Export (for LIS data uploads)
  const handleExportCSV = async () => {
    if (!reportData) return;
    setIsExportDropdownOpen(false);

    const headers = [
      'No',
      'LRN',
      'Learner Name',
      'Sex',
      'Birth Date',
      'Age',
      'Birth Place',
      'Mother Tongue',
      'IP Ethnic Group',
      'Religion',
      'House Street',
      'Barangay',
      'Municipality City',
      'Province',
      'Father Name',
      'Mother Maiden Name',
      'Guardian Name',
      'Guardian Relationship',
      'Contact Number',
      'Remarks',
    ];

    const rows = sortedLearners.map((l, idx) => {
      const { gName, gRel } = parseGuardian(l.guardian_name, l.guardian_relationship);
      return [
        idx + 1,
        `"${l.lrn}"`,
        `"${l.name.replace(/"/g, '""')}"`,
        l.sex,
        l.birthdate,
        l.age,
        `"${(l.birth_place || l.province || '').replace(/"/g, '""')}"`,
        `"${l.mother_tongue.replace(/"/g, '""')}"`,
        `"${l.ethnic_group.replace(/"/g, '""')}"`,
        `"${l.religion.replace(/"/g, '""')}"`,
        `"${l.house_street.replace(/"/g, '""')}"`,
        `"${l.barangay.replace(/"/g, '""')}"`,
        `"${l.municipality_city.replace(/"/g, '""')}"`,
        `"${l.province.replace(/"/g, '""')}"`,
        `"${l.father_name.replace(/"/g, '""')}"`,
        `"${l.mother_maiden_name.replace(/"/g, '""')}"`,
        `"${gName.replace(/"/g, '""')}"`,
        `"${gRel.replace(/"/g, '""')}"`,
        `"${l.parent_contact}"`,
        `"${l.remarks.replace(/"/g, '""')}"`,
      ].join(',');
    });

    const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    await saveFileWithPicker(blob, `${getBaseFilename()}.csv`, 'text/csv', 'csv', 'CSV Document (*.csv)');
  };

  // 7. Raw JSON Data Export
  const handleExportJSON = async () => {
    if (!reportData) return;
    setIsExportDropdownOpen(false);
    const jsonString = JSON.stringify(reportData, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8;' });
    await saveFileWithPicker(blob, `${getBaseFilename()}.json`, 'application/json', 'json', 'JSON Document (*.json)');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: '#f1f5f9' }}>
      {/* On-Screen Action Toolbar: Clean with No Zoom Controls */}
      <div className="no-print" style={toolbarStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#1e293b' }}>
            Class Section:
          </span>
          <select
            value={selectedSectionId}
            onChange={(e) => setSelectedSectionId(e.target.value)}
            style={selectStyle}
          >
            {sections.map((sec) => (
              <option key={sec.id} value={sec.id}>
                {sec.display_label} {sec.adviser_name ? `(Adviser: ${sec.adviser_name})` : ''}
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Export Formats Dropdown */}
          <div style={{ position: 'relative' }} ref={dropdownRef}>
            <button
              onClick={() => setIsExportDropdownOpen((prev) => !prev)}
              style={btnDropdownTriggerStyle}
              disabled={exportingPdf}
            >
              {exportingPdf ? (
                <>
                  <Loader2 size={15} className="animate-spin" />
                  <span>Preparing PDF...</span>
                </>
              ) : (
                <>
                  <Download size={15} />
                  <span>Download Report</span>
                  <ChevronDown size={14} />
                </>
              )}
            </button>

            {isExportDropdownOpen && (
              <div style={dropdownMenuStyle}>
                <div style={dropdownSectionHeader}>FILE DOWNLOADS</div>
                <button onClick={handleDownloadPDF} style={dropdownItemStyle}>
                  <Download size={15} color="#0284c7" />
                  <div style={{ flex: 1, textAlign: 'left' }}>
                    <div style={{ fontWeight: 700, color: '#0f172a' }}>Adobe PDF (.pdf)</div>
                    <div style={{ fontSize: '0.68rem', color: '#64748b' }}>Select folder &amp; save PDF file</div>
                  </div>
                </button>

                <div style={dropdownSectionHeader}>OFFICIAL SPREADSHEETS</div>
                <button onClick={handleExportExcel} style={dropdownItemStyle}>
                  <FileSpreadsheet size={15} color="#059669" />
                  <div style={{ flex: 1, textAlign: 'left' }}>
                    <div style={{ fontWeight: 700, color: '#0f172a' }}>Microsoft Excel (.xlsx / .xls)</div>
                    <div style={{ fontSize: '0.68rem', color: '#64748b' }}>Formatted DepEd spreadsheet</div>
                  </div>
                </button>
                <button onClick={handleExportGoogleSheets} style={dropdownItemStyle}>
                  <ExternalLink size={15} color="#16a34a" />
                  <div style={{ flex: 1, textAlign: 'left' }}>
                    <div style={{ fontWeight: 700, color: '#0f172a' }}>Google Sheets</div>
                    <div style={{ fontSize: '0.68rem', color: '#64748b' }}>Opens in web spreadsheet</div>
                  </div>
                </button>

                <div style={dropdownSectionHeader}>DOCUMENT FORMATS</div>
                <button onClick={handleExportWord} style={dropdownItemStyle}>
                  <FileText size={15} color="#2563eb" />
                  <div style={{ flex: 1, textAlign: 'left' }}>
                    <div style={{ fontWeight: 700, color: '#0f172a' }}>Microsoft Word (.docx / .doc)</div>
                    <div style={{ fontSize: '0.68rem', color: '#64748b' }}>Editable landscape document</div>
                  </div>
                </button>
                <button onClick={handleExportGoogleDocs} style={dropdownItemStyle}>
                  <ExternalLink size={15} color="#3b82f6" />
                  <div style={{ flex: 1, textAlign: 'left' }}>
                    <div style={{ fontWeight: 700, color: '#0f172a' }}>Google Docs</div>
                    <div style={{ fontSize: '0.68rem', color: '#64748b' }}>Opens in web document editor</div>
                  </div>
                </button>

                <div style={dropdownSectionHeader}>DATA EXCHANGE</div>
                <button onClick={handleExportCSV} style={dropdownItemStyle}>
                  <TableIcon size={15} color="#d97706" />
                  <div style={{ flex: 1, textAlign: 'left' }}>
                    <div style={{ fontWeight: 700, color: '#0f172a' }}>LIS CSV Spreadsheet (.csv)</div>
                    <div style={{ fontSize: '0.68rem', color: '#64748b' }}>Standard DepEd data exchange</div>
                  </div>
                </button>
                <button onClick={handleExportJSON} style={dropdownItemStyle}>
                  <FileCode size={15} color="#7c3aed" />
                  <div style={{ flex: 1, textAlign: 'left' }}>
                    <div style={{ fontWeight: 700, color: '#0f172a' }}>Raw JSON Data (.json)</div>
                    <div style={{ fontSize: '0.68rem', color: '#64748b' }}>Database export &amp; backup</div>
                  </div>
                </button>
              </div>
            )}
          </div>

          {/* Dedicated Standalone Print Button */}
          <button onClick={handlePrint} style={btnPrimaryStyle}>
            <Printer size={15} />
            <span>Print</span>
          </button>
        </div>
      </div>

      {/* Screen Canvas Viewport: Exactly 100% Scale with Natural 0.25in Margins */}
      <div style={viewerScrollContainerStyle}>
        {loading ? (
          <div style={loadingStateStyle}>
            <Loader2 className="animate-spin" size={28} color="#0284c7" />
            <span>Compiling official DepEd SF1 School Register...</span>
          </div>
        ) : error ? (
          <div style={errorStateStyle}>
            <AlertCircle size={24} color="#dc2626" />
            <span>{error}</span>
          </div>
        ) : reportData ? (
          <div
            id="sf1-print-document"
            ref={reportRef}
            style={sheetWrapperStyle}
          >
            {/* Header: Left Logo & Precision Aligned Field Boxes */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 8, width: '100%' }}>
              {/* Kagawaran ng Edukasyon Logo */}
              <div style={{ flexShrink: 0, paddingTop: 4 }}>
                <KagawaranNgEdukasyonLogo size={78} />
              </div>

              {/* Form Title & Metadata Rows */}
              <div style={{ flex: 1, minWidth: 0 }}>
                {/* Form Title */}
                <div style={{ textAlign: 'center', marginBottom: 6 }}>
                  <div style={{ fontSize: '11.8pt', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.4px', margin: 0 }}>
                    School Form 1 (SF 1) School Register
                  </div>
                  <div style={{ fontSize: '6.2pt', fontStyle: 'italic', color: '#111', marginTop: 1 }}>
                    (This replaces Form 1, Master List &amp; STS Form 2-Family Background and Profile)
                  </div>
                </div>

                {/* Form Header Input Boxes Grid */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, width: '100%' }}>
                  {/* Row 1: School ID, Division, District */}
                  <div style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                    {/* School ID */}
                    <div style={{ display: 'flex', alignItems: 'center', width: '25%' }}>
                      <span style={{ fontWeight: 700, fontSize: '7.2pt', width: 68, flexShrink: 0 }}>School ID</span>
                      <div style={{ ...fieldBoxStyle, width: 100 }}>{reportData.school_id}</div>
                    </div>

                    {/* Division */}
                    <div style={{ display: 'flex', alignItems: 'center', width: '28%', paddingRight: 12 }}>
                      <span style={{ fontWeight: 700, fontSize: '7.2pt', width: 54, flexShrink: 0 }}>Division</span>
                      <div style={{ ...fieldBoxStyle, flex: 1, textAlign: 'left', paddingLeft: 6 }}>
                        {reportData.division}
                      </div>
                    </div>

                    {/* District: Ends exactly aligned with the right border of GUARDIAN (if not Parent) */}
                    <div style={{ display: 'flex', alignItems: 'center', width: '47%' }}>
                      <div style={{ display: 'flex', alignItems: 'center', width: '74%' }}>
                        <span style={{ fontWeight: 700, fontSize: '7.2pt', width: 54, flexShrink: 0 }}>District</span>
                        <div style={{ ...fieldBoxStyle, flex: 1, textAlign: 'left', paddingLeft: 6 }}>
                          {reportData.district}
                        </div>
                      </div>
                      <div style={{ width: '26%' }} />
                    </div>
                  </div>

                  {/* Row 2: School Name, School Year, Grade Level & Section */}
                  <div style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                    {/* School Name */}
                    <div style={{ display: 'flex', alignItems: 'center', width: '25%' }}>
                      <span style={{ fontWeight: 700, fontSize: '7.2pt', width: 68, flexShrink: 0 }}>School Name</span>
                      <div style={{ ...fieldBoxStyle, flex: 1, textAlign: 'left', paddingLeft: 6, marginRight: 8 }}>
                        {reportData.school_name}
                      </div>
                    </div>

                    {/* School Year */}
                    <div style={{ display: 'flex', alignItems: 'center', width: '28%', paddingRight: 12 }}>
                      <span style={{ fontWeight: 700, fontSize: '7.2pt', width: 68, flexShrink: 0 }}>School Year</span>
                      <div style={{ ...fieldBoxStyle, width: 110 }}>{reportData.academic_year}</div>
                    </div>

                    {/* Grade Level & Section: Section extends to the rightmost Remarks edge */}
                    <div style={{ display: 'flex', alignItems: 'center', width: '47%' }}>
                      <span style={{ fontWeight: 700, fontSize: '7.2pt', width: 64, flexShrink: 0 }}>Grade Level</span>
                      <div style={{ ...fieldBoxStyle, width: 52, flexShrink: 0, marginRight: 8 }}>
                        {reportData.grade_level}
                      </div>
                      <span style={{ fontWeight: 700, fontSize: '7.2pt', width: 44, flexShrink: 0 }}>Section</span>
                      <div style={{ ...fieldBoxStyle, flex: 1, textAlign: 'left', paddingLeft: 6 }}>
                        {reportData.section_name}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Main SF1 Learner Register Table */}
            <table style={mainTableStyle}>
              <thead>
                <tr>
                  <th rowSpan={2} style={{ width: '1.8%', ...headerCell }}>#</th>
                  <th rowSpan={2} style={{ width: '6.6%', ...headerCell }}>LRN</th>
                  <th rowSpan={2} style={{ width: '13.0%', ...headerCell }}>
                    NAME<br />
                    <span style={subHeaderSpan}>(Last Name, First Name, Middle Name)</span>
                  </th>
                  <th rowSpan={2} style={{ width: '2.4%', ...headerCell }}>Sex (M/F)</th>
                  <th rowSpan={2} style={{ width: '4.6%', ...headerCell }}>
                    BIRTH DATE<br />
                    <span style={subHeaderSpan}>(mm/dd/yyyy)</span>
                  </th>
                  <th rowSpan={2} style={{ width: '3.4%', ...headerCell }}>
                    AGE as of 1st<br />
                    <span style={subHeaderSpan}>Friday June</span>
                  </th>
                  <th rowSpan={2} style={{ width: '4.6%', ...headerCell }}>
                    BIRTH PLACE<br />
                    <span style={subHeaderSpan}>(Province)</span>
                  </th>
                  <th rowSpan={2} style={{ width: '4.2%', ...headerCell }}>MOTHER TONGUE</th>
                  <th rowSpan={2} style={{ width: '4.0%', ...headerCell }}>
                    IP<br />
                    <span style={subHeaderSpan}>(Ethnic Group)</span>
                  </th>
                  <th rowSpan={2} style={{ width: '4.2%', ...headerCell }}>RELIGION</th>
                  <th colSpan={4} style={{ textAlign: 'center', ...headerCell }}>ADDRESS</th>
                  <th colSpan={2} style={{ textAlign: 'center', ...headerCell }}>PARENTS</th>
                  <th colSpan={2} style={{ textAlign: 'center', ...headerCell }}>GUARDIAN (if not Parent)</th>
                  <th rowSpan={2} style={{ width: '6.0%', ...headerCell }}>
                    Contact Number of Parent or<br />Guardian
                  </th>
                  <th style={{ width: '6.2%', ...headerCell }}>REMARKS</th>
                </tr>
                <tr>
                  <th style={{ width: '4.8%', ...headerCell }}>House #/ Street/ Sitio/ Purok</th>
                  <th style={{ width: '4.0%', ...headerCell }}>Barangay</th>
                  <th style={{ width: '4.4%', ...headerCell }}>Municipality/ City</th>
                  <th style={{ width: '4.0%', ...headerCell }}>Province</th>
                  <th style={{ width: '6.8%', ...headerCell }}>Father's Name (Last Name, First Name, Middle Name)</th>
                  <th style={{ width: '6.8%', ...headerCell }}>Mother's Maiden Name (Last Name, First Name, Middle Name)</th>
                  <th style={{ width: '4.6%', ...headerCell }}>Name</th>
                  <th style={{ width: '3.6%', ...headerCell }}>Relation-ship</th>
                  <th style={{ width: '6.2%', ...headerCell, fontSize: '4.1pt', lineHeight: 1.05 }}>
                    (Please refer to the<br />legend on last page)
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedLearners.map((learner, idx) => {
                  const { gName, gRel } = parseGuardian(learner.guardian_name, learner.guardian_relationship);
                  return (
                    <tr key={`learner-${learner.id}`} style={dataRowStyle}>
                      <td style={centerCell}>{idx + 1}</td>
                      <td style={{ ...centerCell, fontFamily: 'monospace', fontWeight: 700 }}>{learner.lrn}</td>
                      <td style={{ ...leftCell, fontWeight: 700 }}>{learner.name}</td>
                      <td style={centerCell}>{learner.sex}</td>
                      <td style={centerCell}>{learner.birthdate}</td>
                      <td style={centerCell}>{learner.age}</td>
                      <td style={centerCell}>{learner.birth_place || learner.province || ''}</td>
                      <td style={centerCell}>{learner.mother_tongue}</td>
                      <td style={centerCell}>{learner.ethnic_group}</td>
                      <td style={centerCell}>{learner.religion}</td>
                      <td style={leftCell}>{learner.house_street}</td>
                      <td style={leftCell}>{learner.barangay}</td>
                      <td style={leftCell}>{learner.municipality_city}</td>
                      <td style={leftCell}>{learner.province}</td>
                      <td style={leftCell}>{learner.father_name}</td>
                      <td style={leftCell}>{learner.mother_maiden_name}</td>
                      <td style={leftCell}>{gName}</td>
                      <td style={centerCell}>{gRel}</td>
                      <td style={{ ...centerCell, fontFamily: 'monospace' }}>{learner.parent_contact}</td>
                      <td style={centerCell}>{learner.remarks}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Official DepEd Footer Block: Aligned directly with the Remarks column boundary */}
            <div style={footerLayoutGridStyle}>
              {/* 1. Indicators Section (Side-by-side 6 columns with centered title) */}
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <div style={{ fontWeight: 800, fontSize: '5.8pt', textAlign: 'center', marginBottom: 2 }}>
                  List and Code of Indicators under REMARKS column
                </div>
                <table style={indicatorsTableStyle}>
                  <thead>
                    <tr>
                      <th style={{ width: '15%', ...indicatorHeaderCell }}>Indicator</th>
                      <th style={{ width: '5%', ...indicatorHeaderCell }}>Code</th>
                      <th style={{ width: '30%', ...indicatorHeaderCell }}>Required Information</th>
                      <th style={{ width: '15%', ...indicatorHeaderCell }}>Indicator</th>
                      <th style={{ width: '5%', ...indicatorHeaderCell }}>Code</th>
                      <th style={{ width: '30%', ...indicatorHeaderCell }}>Required Information</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td style={indicatorCellBold}>Transferred Out</td>
                      <td style={indicatorCellCenter}>T/O</td>
                      <td style={indicatorCellText}>Name of Public (P) Private (PR) School &amp; Effectivity Date</td>
                      <td style={indicatorCellBold}>CCT Recipient</td>
                      <td style={indicatorCellCenter}>CCT</td>
                      <td style={indicatorCellText}>CCT Control/reference number &amp; Effectivity Date</td>
                    </tr>
                    <tr>
                      <td style={indicatorCellBold}>Transferred IN</td>
                      <td style={indicatorCellCenter}>T/I</td>
                      <td style={indicatorCellText}>Name of Public (P) Private (PR) School &amp; Effectivity Date</td>
                      <td style={indicatorCellBold}>Balik-Aral</td>
                      <td style={indicatorCellCenter}>B/A</td>
                      <td style={indicatorCellText}>Name of school last attended &amp; Year</td>
                    </tr>
                    <tr>
                      <td style={indicatorCellBold}>Dropped</td>
                      <td style={indicatorCellCenter}>DRP</td>
                      <td style={indicatorCellText}>Reason and Effectivity Date</td>
                      <td style={indicatorCellBold}>Learner With Disability</td>
                      <td style={indicatorCellCenter}>LWD</td>
                      <td style={indicatorCellText}>Specify</td>
                    </tr>
                    <tr>
                      <td style={indicatorCellBold}>Late Enrollment</td>
                      <td style={indicatorCellCenter}>LE</td>
                      <td style={indicatorCellText}>Reason (Enrollment beyond 1st Friday of June)</td>
                      <td style={indicatorCellBold}>Accelerated</td>
                      <td style={indicatorCellCenter}>ACL</td>
                      <td style={indicatorCellText}>Specify Level &amp; Effectivity Date</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* 2. Registered Summary Box (MALE, FEMALE, TOTAL vs BoSY, EoSY) */}
              <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
                <table style={summaryTableStyle}>
                  <thead>
                    <tr>
                      <th style={{ width: '40%', ...indicatorHeaderCell, fontSize: '4.8pt' }}>REGISTERED</th>
                      <th style={{ width: '30%', ...indicatorHeaderCell }}>BoSY</th>
                      <th style={{ width: '30%', ...indicatorHeaderCell }}>EoSY</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td style={{ ...indicatorCellCenter, fontWeight: 700, fontSize: '4.8pt' }}>MALE</td>
                      <td style={indicatorCellCenter}>{reportData.total_male}</td>
                      <td style={indicatorCellCenter}></td>
                    </tr>
                    <tr>
                      <td style={{ ...indicatorCellCenter, fontWeight: 700, fontSize: '4.8pt' }}>FEMALE</td>
                      <td style={indicatorCellCenter}>{reportData.total_female}</td>
                      <td style={indicatorCellCenter}></td>
                    </tr>
                    <tr>
                      <td style={{ ...indicatorCellCenter, fontWeight: 700, fontSize: '4.8pt' }}>TOTAL</td>
                      <td style={{ ...indicatorCellCenter, fontWeight: 800 }}>{reportData.total_combined}</td>
                      <td style={indicatorCellCenter}></td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* 3. Prepared by Signature Block */}
              <div style={signatureBlockStyle}>
                <div style={{ fontSize: '5.2pt', fontWeight: 700, textAlign: 'left', marginBottom: 12 }}>
                  Prepared by :
                </div>
                <div style={signatureLineStyle}>
                  {reportData.adviser_name}
                </div>
                <div style={{ fontSize: '4.8pt', textAlign: 'center', marginTop: 1 }}>
                  (Signature of Adviser over Printed Name)
                </div>
                <div style={datesRowStyle}>
                  <span>BoSY Date:</span>
                  <span>EoSY Date:</span>
                </div>
              </div>

              {/* 4. Certified Correct Signature Block */}
              <div style={signatureBlockStyle}>
                <div style={{ fontSize: '5.2pt', fontWeight: 700, textAlign: 'left', marginBottom: 12 }}>
                  Certified Correct:
                </div>
                <div style={signatureLineStyle}>
                  {reportData.school_head}
                </div>
                <div style={{ fontSize: '4.8pt', textAlign: 'center', marginTop: 1 }}>
                  (Signature of School Head over Printed Name)
                </div>
                <div style={datesRowStyle}>
                  <span>BoSY Date:</span>
                  <span>EoSY Date:</span>
                </div>
              </div>
            </div>

            <div style={auditFooterTextStyle}>
              Generated via AttendSure School Management System &bull; DepEd Form SF1 (Legal Landscape) &bull; Page 1 of 1
            </div>
          </div>
        ) : null}
      </div>

      {/* Strict Print CSS for Legal Landscape Paper: Equal 0.25in margins */}
      <style>{`
        @media print {
          @page {
            size: legal landscape;
            margin: 0.25in;
          }
          
          html, body {
            margin: 0 !important;
            padding: 0 !important;
            height: auto !important;
            background: #ffffff !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          .no-print,
          nav,
          aside,
          header {
            display: none !important;
          }

          main {
            margin: 0 !important;
            padding: 0 !important;
            overflow: visible !important;
            height: auto !important;
            display: block !important;
            width: 100% !important;
          }

          div {
            overflow: visible !important;
          }

          #sf1-print-document {
            position: static !important;
            display: block !important;
            width: 100% !important;
            max-width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            transform: none !important;
            box-shadow: none !important;
            border: none !important;
            background: #ffffff !important;
          }

          table {
            page-break-inside: auto;
          }

          tr {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
        }
      `}</style>
    </div>
  );
};

// ==========================================
// STYLES
// ==========================================

const fieldBoxStyle: React.CSSProperties = {
  minHeight: 18,
  lineHeight: '18px',
  border: '1.2px solid #000000',
  backgroundColor: '#ffffff',
  textAlign: 'center',
  fontWeight: 700,
  fontSize: '7.4pt',
  color: '#000000',
  padding: '0 4px',
  boxSizing: 'border-box',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const toolbarStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '8px 24px',
  backgroundColor: '#ffffff',
  borderBottom: '1px solid #cbd5e1',
};

const selectStyle: React.CSSProperties = {
  padding: '5px 12px',
  borderRadius: 6,
  border: '1px solid #cbd5e1',
  fontSize: '0.82rem',
  fontWeight: 600,
  backgroundColor: '#f8fafc',
  color: '#0f172a',
  outline: 'none',
  cursor: 'pointer',
};

const btnDropdownTriggerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '6px 12px',
  backgroundColor: '#ecfdf5',
  border: '1px solid #a7f3d0',
  borderRadius: 6,
  fontSize: '0.8rem',
  fontWeight: 700,
  color: '#065f46',
  cursor: 'pointer',
  transition: 'all 0.15s ease',
};

const dropdownMenuStyle: React.CSSProperties = {
  position: 'absolute',
  top: 'calc(100% + 6px)',
  right: 0,
  width: 270,
  backgroundColor: '#ffffff',
  borderRadius: 8,
  boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.15), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
  border: '1px solid #e2e8f0',
  padding: '6px 0',
  zIndex: 1000,
  display: 'flex',
  flexDirection: 'column',
};

const dropdownSectionHeader: React.CSSProperties = {
  padding: '6px 14px 2px 14px',
  fontSize: '0.62rem',
  fontWeight: 800,
  color: '#94a3b8',
  letterSpacing: '0.5px',
};

const dropdownItemStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '8px 14px',
  border: 'none',
  backgroundColor: 'transparent',
  cursor: 'pointer',
  fontSize: '0.78rem',
  transition: 'background-color 0.12s ease',
};

const btnPrimaryStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '6px 16px',
  backgroundColor: '#0284c7',
  border: 'none',
  borderRadius: 6,
  fontSize: '0.8rem',
  fontWeight: 700,
  color: '#ffffff',
  cursor: 'pointer',
  transition: 'background-color 0.15s ease',
};

const viewerScrollContainerStyle: React.CSSProperties = {
  flex: 1,
  overflow: 'auto',
  padding: '24px',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'flex-start',
};

const sheetWrapperStyle: React.CSSProperties = {
  width: '13.5in', // 14in legal landscape minus 2 * 0.25in equal margins
  backgroundColor: '#ffffff',
  boxShadow: '0 4px 24px rgba(0,0,0,0.14)',
  padding: '0.25in', // Equal 0.25in margin on all 4 sides
  margin: '0 auto 40px auto',
  boxSizing: 'border-box',
  fontFamily: 'Arial, sans-serif',
  color: '#000000',
};

const mainTableStyle: React.CSSProperties = {
  width: '100%',
  tableLayout: 'fixed',
  borderCollapse: 'collapse',
  fontSize: '5.2pt',
  border: '1.5px solid #000',
};

const headerCell: React.CSSProperties = {
  border: '1px solid #000',
  padding: '2px 1px',
  backgroundColor: '#ffffff',
  fontWeight: 700,
  textAlign: 'center',
  verticalAlign: 'middle',
  color: '#000000',
};

const subHeaderSpan: React.CSSProperties = {
  fontSize: '4.4pt',
  fontWeight: 400,
  fontStyle: 'italic',
};

const dataRowStyle: React.CSSProperties = {
  borderBottom: '1px solid #000',
  verticalAlign: 'middle',
  height: '17px',
};

const centerCell: React.CSSProperties = {
  textAlign: 'center',
  border: '1px solid #000',
  padding: '1px 1px',
  whiteSpace: 'normal',
  wordBreak: 'break-word',
  lineHeight: 1.1,
};

const leftCell: React.CSSProperties = {
  textAlign: 'left',
  border: '1px solid #000',
  padding: '1px 2px',
  whiteSpace: 'normal',
  wordBreak: 'break-word',
  lineHeight: 1.1,
};

// Proportional fractional columns summing strictly to 100% width, aligned with REMARKS edge
const footerLayoutGridStyle: React.CSSProperties = {
  width: '100%',
  display: 'grid',
  gridTemplateColumns: '57.8fr 12.8fr 14.7fr 14.7fr',
  gap: '8px',
  marginTop: '6px',
  alignItems: 'end',
  boxSizing: 'border-box',
};

const indicatorsTableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: '4.8pt',
  border: '1px solid #000',
};

const indicatorHeaderCell: React.CSSProperties = {
  border: '1px solid #000',
  padding: '1px 2px',
  fontWeight: 700,
  textAlign: 'center',
  backgroundColor: '#ffffff',
};

const indicatorCellBold: React.CSSProperties = {
  border: '1px solid #000',
  padding: '1px 2px',
  fontWeight: 600,
  fontSize: '4.7pt',
};

const indicatorCellCenter: React.CSSProperties = {
  border: '1px solid #000',
  padding: '1px',
  textAlign: 'center',
  fontWeight: 700,
  fontSize: '4.8pt',
  fontFamily: 'Arial, sans-serif',
};

const indicatorCellText: React.CSSProperties = {
  border: '1px solid #000',
  padding: '1px 2px',
  fontSize: '4.6pt',
  lineHeight: 1.05,
};

const summaryTableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  border: '1px solid #000',
  fontSize: '4.9pt',
};

const signatureBlockStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  width: '100%',
  boxSizing: 'border-box',
};

const signatureLineStyle: React.CSSProperties = {
  borderBottom: '1px solid #000',
  minHeight: 14,
  display: 'flex',
  alignItems: 'flex-end',
  justifyContent: 'center',
  fontWeight: 800,
  fontSize: '5.8pt',
  textTransform: 'uppercase',
  paddingBottom: 1,
};

const datesRowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  fontSize: '4.8pt',
  marginTop: 4,
};

const auditFooterTextStyle: React.CSSProperties = {
  fontSize: '4.8pt',
  color: '#475569',
  marginTop: 3,
  textAlign: 'right',
  fontStyle: 'italic',
};

const loadingStateStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 12,
  marginTop: 80,
  color: '#475569',
  fontWeight: 600,
};

const errorStateStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  marginTop: 80,
  color: '#dc2626',
  fontWeight: 600,
  backgroundColor: '#fef2f2',
  padding: '12px 20px',
  borderRadius: 8,
  border: '1px solid #fecaca',
};
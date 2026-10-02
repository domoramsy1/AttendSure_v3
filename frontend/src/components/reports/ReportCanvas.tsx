import React, { useState, useEffect, useRef, useCallback } from 'react';
import { theme } from '../../theme/tokens';
import { Button } from '../ui/Button';
import { Printer, Maximize2, Minimize2, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';

interface ReportCanvasProps {
  title: string;
  canvasWidth?: number;
  canvasHeight?: number;
  onRefresh?: () => void;
  children: React.ReactNode;
}

export const ReportCanvas: React.FC<ReportCanvasProps> = ({
  title,
  canvasWidth = 1680,
  canvasHeight = 1020,
  children,
}) => {
  const [zoomScale, setZoomScale] = useState<number>(1);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const calculateAutoFit = useCallback(() => {
    if (!containerRef.current) return;
    const { clientWidth, clientHeight } = containerRef.current;
    if (clientWidth === 0 || clientHeight === 0) return;

    const availableW = clientWidth - 24;
    const availableH = clientHeight - 24;
    const optimalScale = Math.min(availableW / canvasWidth, availableH / canvasHeight);
    setZoomScale(Number(optimalScale.toFixed(3)));
  }, [canvasWidth, canvasHeight]);

  useEffect(() => {
    calculateAutoFit();
    window.addEventListener('resize', calculateAutoFit);
    return () => window.removeEventListener('resize', calculateAutoFit);
  }, [calculateAutoFit, isFullscreen]);

  const toggleFullscreen = () => {
    if (!containerRef.current) return;

    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => {
        setIsFullscreen(true);
        setTimeout(calculateAutoFit, 150);
      });
    } else {
      document.exitFullscreen().then(() => {
        setIsFullscreen(false);
        setTimeout(calculateAutoFit, 150);
      });
    }
  };

  return (
    <div style={{ width: '100%', height: isFullscreen ? '100vh' : 'calc(100vh - 145px)', display: 'flex', flexDirection: 'column' }}>
      <style>{`
        @page { size: 14in 8.5in; margin: 6mm 5mm; }
        @media print {
          .no-print { display: none !important; }
          body, html { margin: 0; padding: 0; background: #fff !important; overflow: visible !important; }
          .report-viewport { position: static !important; width: 100% !important; height: auto !important; overflow: visible !important; background: #fff !important; }
          .report-paper { transform: none !important; width: 100% !important; box-shadow: none !important; padding: 0 !important; }
        }
      `}</style>

      {/* Standardized Control Toolbar */}
      <div
        className="no-print"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '8px 16px',
          backgroundColor: '#1e293b',
          color: theme.colors.textWhite,
          borderRadius: isFullscreen ? 0 : `${theme.radius.md} ${theme.radius.md} 0 0`,
          fontSize: '0.85rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontWeight: 700 }}>{title}</span>
          <span style={{ color: theme.colors.textMuted }}>Zoom: {Math.round(zoomScale * 100)}%</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Button variant="dark" size="sm" onClick={() => setZoomScale(s => Math.max(Number((s - 0.1).toFixed(2)), 0.3))} icon={<ZoomOut size={15} />} />
          <Button variant="dark" size="sm" onClick={() => setZoomScale(s => Math.min(Number((s + 0.1).toFixed(2)), 2.5))} icon={<ZoomIn size={15} />} />
          <Button variant="dark" size="sm" onClick={calculateAutoFit} icon={<RotateCcw size={14} />}>Fit Screen</Button>
          <Button variant="secondary" size="sm" onClick={toggleFullscreen} icon={isFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}>
            {isFullscreen ? 'Exit Fullscreen' : 'Full Screen'}
          </Button>
          <Button variant="primary" size="sm" onClick={() => window.print()} icon={<Printer size={15} />}>
            Print / Export
          </Button>
        </div>
      </div>

      {/* Screen Viewport (Locked Zero-Scroll Container) */}
      <div
        ref={containerRef}
        className="report-viewport"
        style={{
          flex: 1,
          width: '100%',
          overflow: 'hidden',
          position: 'relative',
          backgroundColor: theme.colors.canvasBg,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: isFullscreen ? 0 : `0 0 ${theme.radius.md} ${theme.radius.md}`,
        }}
      >
        <div
          className="report-paper"
          style={{
            width: `${canvasWidth}px`,
            height: `${canvasHeight}px`,
            minWidth: `${canvasWidth}px`,
            minHeight: `${canvasHeight}px`,
            transform: `scale(${zoomScale})`,
            transformOrigin: 'center center',
            transition: 'transform 0.12s ease-out',
            backgroundColor: theme.colors.surface,
            boxShadow: theme.shadows.canvas,
            padding: '24px 30px',
            boxSizing: 'border-box',
            fontFamily: theme.fonts.sans,
            color: theme.colors.borderDark,
            userSelect: 'none',
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
};
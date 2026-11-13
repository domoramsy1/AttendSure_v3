/**
 * AttendSure V3 - Floating Framed Layout
 * File: web/src/components/layout/AppLayout.tsx
 */

import React, { useState, useMemo } from 'react';
import { useTheme } from '../../context/ThemeContext';
import Sidebar, { type NavItemKey } from './Sidebar';
import Header from './Header';
import Footer from './Footer';
import type { UserSession } from '../../types/section';

interface AppLayoutProps {
  children: React.ReactNode;
  activeTab: NavItemKey;
  onSelectTab: (tab: NavItemKey) => void;
  title?: string;
  session?: UserSession | null;
}

export const AppLayout: React.FC<AppLayoutProps> = ({
  children,
  activeTab,
  onSelectTab,
  title = 'Dashboard',
  session = null,
}) => {
  const { tokens } = useTheme();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);

  // Safely resolve active user session matching the exact UserSession type
  const activeSession: UserSession | null = useMemo(() => {
    if (session) return session;
    try {
      const rawUser = localStorage.getItem('attendsure_user') || localStorage.getItem('user');
      const token =
        localStorage.getItem('attendsure_token') ||
        localStorage.getItem('auth_token') ||
        localStorage.getItem('token') ||
        '';

      if (rawUser) {
        const parsed = JSON.parse(rawUser);
        const resolved: UserSession = {
          user_id: parsed.id || parsed.user_id || 0,
          username: parsed.username || 'staff',
          role: String(parsed.role || parsed.system_role || 'FACULTY').toUpperCase() as any,
          token,
          faculty_name: parsed.faculty_name || parsed.full_name || parsed.username || 'Staff User',
        };
        return resolved;
      }
    } catch {
      // Fallback if local storage is empty or unparseable
    }
    return null;
  }, [session]);

  return (
    <div
      style={{
        width: '100%',
        minHeight: '100vh',
        height: '100vh',
        padding: 'clamp(6px, 1.2vw, 14px)',
        backgroundColor: tokens.bgApp || '#f1f5f9',
        display: 'flex',
        gap: 'clamp(6px, 1.2vw, 14px)',
        boxSizing: 'border-box',
        overflow: 'hidden',
        transition: 'background-color 0.2s ease',
      }}
    >
      {/* 1. Collapsible Sidebar Navigation */}
      <Sidebar
        activeTab={activeTab}
        onSelectTab={onSelectTab}
        session={activeSession}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed((prev) => !prev)}
        schoolName="Lapasan National High School"
        schoolId="55555"
      />

      {/* 2. Floating Main Workspace Card */}
      <div
        style={{
          flex: 1,
          minWidth: 0,
          height: '100%',
          backgroundColor: tokens.bgSurface || '#ffffff',
          border: `1px solid ${tokens.borderSubtle || '#e2e8f0'}`,
          borderRadius: 16,
          boxShadow: tokens.cardShadow || '0 4px 6px -1px rgba(0, 0, 0, 0.05)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          transition: 'background-color 0.2s ease, border-color 0.2s ease',
        }}
      >
        {/* Top Header */}
        <Header
          currentTitle={title}
          activeTab={activeTab}
          onNavigateTab={onSelectTab}
          session={activeSession}
        />

        {/* Scrollable Main Content Area */}
        <main
          style={{
            flex: 1,
            minHeight: 0,
            backgroundColor: tokens.bgSurfaceSubtle || '#f8fafc',
            padding: 'clamp(12px, 2vw, 20px)',
            overflowY: 'auto',
            overflowX: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            userSelect: 'text',
            boxSizing: 'border-box',
          }}
        >
          <div style={{ flex: '1 0 auto', width: '100%', maxWidth: '100%' }}>
            {children}
          </div>
        </main>

        {/* Responsive System Footer */}
        <Footer />
      </div>
    </div>
  );
};

export default AppLayout;
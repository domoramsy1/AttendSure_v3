/**
 * AttendSure V3 - Floating Framed Layout (Space From Screen Sides)
 * File: web/src/components/layout/AppLayout.tsx
 */

import React, { useState } from 'react';
import { useTheme } from '../../context/ThemeContext';
import Sidebar, { type NavItemKey } from './Sidebar';
import Header from './Header';
import Footer from './Footer';

interface AppLayoutProps {
  children: React.ReactNode;
  activeTab: NavItemKey;
  onSelectTab: (tab: NavItemKey) => void;
  title?: string;
}

export const AppLayout: React.FC<AppLayoutProps> = ({
  children,
  activeTab,
  onSelectTab,
  title = 'Dashboard',
}) => {
  const { tokens } = useTheme();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);

  return (
    // Outer canvas provides clean whitespace around all 4 monitor edges
    <div
      style={{
        width: '100vw',
        height: '100vh',
        padding: '14px',
        backgroundColor: tokens.bgApp,
        display: 'flex',
        gap: '14px',
        boxSizing: 'border-box',
        overflow: 'hidden',
        userSelect: 'none',
        transition: 'background-color 0.2s ease',
      }}
    >
      {/* 1. Floating Sidebar Card */}
      <Sidebar
        activeTab={activeTab}
        onSelectTab={onSelectTab}
        session={null}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed((prev) => !prev)}
        schoolName="Lapasan National High School"
        schoolId="55555"
      />

      {/* 2. Floating Main Workspace Card */}
      <div
        style={{
          flex: 1,
          height: '100%',
          backgroundColor: tokens.bgSurface,
          border: `1px solid ${tokens.borderSubtle}`,
          borderRadius: 16,
          boxShadow: tokens.cardShadow,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          transition: 'background-color 0.2s ease, border-color 0.2s ease',
        }}
      >
        {/* Top Header */}
        <Header
          currentTitle={title}
          onNavigateTab={onSelectTab}
        />

        {/* Scrollable Workspace */}
        <main
          style={{
            flex: 1,
            backgroundColor: tokens.bgSurfaceSubtle,
            padding: '20px 24px',
            overflowY: 'auto',
            overflowX: 'hidden',
          }}
        >
          {children}
        </main>

        {/* Institutional Telemetry Footer */}
        <Footer />
      </div>
    </div>
  );
};

export default AppLayout;
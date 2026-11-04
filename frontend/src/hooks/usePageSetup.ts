import { useState, useEffect, useCallback } from 'react';
import { DEFAULT_PAGE_SETUP } from '../types/pageSetup';
import type { PageSetupConfig } from '../types/pageSetup';

const GLOBAL_DEFAULT_KEY = 'attendsure_page_setup_default';

export const usePageSetup = (reportKey: string = 'general') => {
  const specificKey = `attendsure_page_setup_${reportKey}`;

  const loadInitial = (): PageSetupConfig => {
    try {
      const specific = localStorage.getItem(specificKey);
      if (specific) return JSON.parse(specific);

      const globalDefault = localStorage.getItem(GLOBAL_DEFAULT_KEY);
      if (globalDefault) return JSON.parse(globalDefault);
    } catch (e) {
      console.warn('Failed to parse page setup from local storage', e);
    }
    return DEFAULT_PAGE_SETUP;
  };

  const [config, setConfig] = useState<PageSetupConfig>(loadInitial);

  // Sync state if localStorage changes from another tab/window
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === specificKey || e.key === GLOBAL_DEFAULT_KEY) {
        setConfig(loadInitial());
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [specificKey]);

  const saveConfig = useCallback(
    (newConfig: PageSetupConfig, setAsGlobalDefault: boolean = false) => {
      setConfig(newConfig);
      localStorage.setItem(specificKey, JSON.stringify(newConfig));
      if (setAsGlobalDefault) {
        localStorage.setItem(GLOBAL_DEFAULT_KEY, JSON.stringify(newConfig));
      }
    },
    [specificKey]
  );

  return { config, saveConfig };
};
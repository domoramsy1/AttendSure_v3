import React, { createContext, useContext, useState, type ReactNode } from 'react';
import { AlertDialog, type AlertType } from '../components/ui/AlertDialog';

interface AlertOptions {
  title?: string;
  message: string;
  type?: AlertType;
  confirmLabel?: string;
  actionLabel?: string;
  onAction?: () => void;
}

interface AlertContextValue {
  showAlert: (options: AlertOptions | string) => void;
  closeAlert: () => void;
}

const AlertContext = createContext<AlertContextValue | undefined>(undefined);

export const AlertProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [alertConfig, setAlertConfig] = useState<AlertOptions | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  const showAlert = (options: AlertOptions | string) => {
    if (typeof options === 'string') {
      setAlertConfig({ message: options, type: 'info' });
    } else {
      setAlertConfig(options);
    }
    setIsOpen(true);
  };

  const closeAlert = () => {
    setIsOpen(false);
  };

  return (
    <AlertContext.Provider value={{ showAlert, closeAlert }}>
      {children}
      {alertConfig && (
        <AlertDialog
          isOpen={isOpen}
          title={alertConfig.title}
          message={alertConfig.message}
          type={alertConfig.type || 'info'}
          confirmLabel={alertConfig.confirmLabel}
          actionLabel={alertConfig.actionLabel}
          onAction={alertConfig.onAction}
          onClose={closeAlert}
        />
      )}
    </AlertContext.Provider>
  );
};

export const useAlert = (): AlertContextValue => {
  const context = useContext(AlertContext);
  if (!context) {
    throw new Error('useAlert must be used within an AlertProvider');
  }
  return context;
};
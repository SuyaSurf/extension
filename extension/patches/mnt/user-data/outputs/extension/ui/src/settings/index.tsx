import React from 'react';
import { createRoot } from 'react-dom/client';
import SettingsPage from './SettingsPage';

const root = createRoot(document.getElementById('root')!);
root.render(<SettingsPage />);

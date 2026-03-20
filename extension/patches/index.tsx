import React from 'react';
import { createRoot } from 'react-dom/client';
import NewTabPage from './NewTabPage';

const root = createRoot(document.getElementById('root')!);
root.render(<NewTabPage />);

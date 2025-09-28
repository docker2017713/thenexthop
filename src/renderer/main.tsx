import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './pages/App';
import Settings from './pages/Settings';
import './styles.css';

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root element not found');
}

// Check if we're in a standalone settings window opened from the menu
const queryParams = new URLSearchParams(window.location.search);
const isStandaloneSettings = queryParams.get('view') === 'settings';
const isStandaloneFlag = (window as any).isStandaloneSettings === true;

const root = createRoot(container);
root.render(
  <React.StrictMode>
    {isStandaloneSettings || isStandaloneFlag ? <Settings standalone /> : <App />}
  </React.StrictMode>
);

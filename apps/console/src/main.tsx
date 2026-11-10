/** Entry point: fonts and styles (self-hosted, CSP 'self'), then the app. */
import '@fontsource/hanken-grotesk/300.css';
import '@fontsource/hanken-grotesk/400.css';
import '@fontsource/hanken-grotesk/500.css';
import '@fontsource/hanken-grotesk/600.css';
import '@fontsource/hanken-grotesk/700.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';
import './styles/pages.css';
import './styles/admin.css';
import './styles/platform.css';
import './styles/office.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';

const root = document.getElementById('root');
if (root === null) throw new Error('The page has no #root element.');
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

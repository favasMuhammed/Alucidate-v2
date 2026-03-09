import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Global Styles & Fonts
import '@fontsource/geist-sans/400.css';
import '@fontsource/geist-sans/600.css';
import '@fontsource/geist-sans/700.css';
import '@fontsource/geist-mono/400.css';
import '@fontsource/instrument-serif/400-italic.css';
import './index.css';
const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

import React from 'react';
import ReactDOM from 'react-dom/client';
import { useDocumentSession } from './app/session/useDocumentSession';
import { RendererBootstrap } from './RendererBootstrap';
import './styles/tailwind.css';

const searchParams = new URLSearchParams(window.location.search);
const activeWindow = searchParams.get('window');
const initialThemeMode = window.prettypretty?.app.initialThemeMode ?? null;

if (initialThemeMode) {
  useDocumentSession.setState({ themeMode: initialThemeMode });
  document.documentElement.dataset.theme = initialThemeMode;
}

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
root.render(
  <React.StrictMode>
    <RendererBootstrap activeWindow={activeWindow} />
  </React.StrictMode>,
);

import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { LogWindowApp } from './LogWindowApp';
import { useDocumentSession } from './app/session/useDocumentSession';
import './styles/tailwind.css';

const searchParams = new URLSearchParams(window.location.search);
const activeWindow = searchParams.get('window');
const rootElement = activeWindow === 'log' ? <LogWindowApp /> : <App />;
const initialThemeMode = window.prettypretty?.app.initialThemeMode ?? null;

if (initialThemeMode) {
  useDocumentSession.setState({ themeMode: initialThemeMode });
  document.documentElement.dataset.theme = initialThemeMode;
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>{rootElement}</React.StrictMode>,
);

import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { LogWindowApp } from './LogWindowApp';
import './styles/tailwind.css';

const searchParams = new URLSearchParams(window.location.search);
const activeWindow = searchParams.get('window');
const rootElement = activeWindow === 'log' ? <LogWindowApp /> : <App />;

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>{rootElement}</React.StrictMode>,
);

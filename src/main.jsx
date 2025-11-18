// src/main.jsx (or src/main.tsx)
import React from 'react';
import ReactDOM from 'react-dom/client';
import MangaReader from './App.jsx'; // Make sure the path is correct
import './App.css'; // This is often the global CSS file

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <MangaReader />
  </React.StrictMode>,
);
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Menu, Book, Upload, Maximize2, Columns, Square } from 'lucide-react';
import './App.css';

const MangaReader = () => {
  const [selectedTorrentFile, setSelectedTorrentFile] = useState(null);
  const [torrent, setTorrent] = useState(null);
  const [files, setFiles] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [pages, setPages] = useState([]);
  const [currentPage, setCurrentPage] = useState(0);
  const [viewMode, setViewMode] = useState('single'); // single, double, fit
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [status, setStatus] = useState('');

  const clientRef = useRef(null);
  const viewerRef = useRef(null);
  const fileInputRef = useRef(null);
  const bridgeUrl = '/api/bridge';

  // Initialize WebTorrent client
  useEffect(() => {
    const loadWebTorrent = async () => {
      // Dynamically load WebTorrent
      if (typeof window !== 'undefined' && !window.WebTorrent) {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/webtorrent@latest/webtorrent.min.js';
        script.async = true;
        script.onload = () => {
          clientRef.current = new window.WebTorrent();
        };
        document.body.appendChild(script);
      } else if (window.WebTorrent) {
        clientRef.current = new window.WebTorrent();
      }
    };

    // Load JSZip for CBZ extraction
    if (!window.JSZip) {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
      script.async = true;
      document.body.appendChild(script);
    }

    loadWebTorrent();

    return () => {
      if (clientRef.current) {
        clientRef.current.destroy();
      }
    };
  }, []);

  const previousPage = useCallback(() => {
    const decrement = viewMode === 'double' ? 2 : 1;
    setCurrentPage(prev => Math.max(0, prev - decrement));
    if (viewerRef.current) {
      viewerRef.current.scrollTop = 0;
    }
  }, [viewMode]);

  const nextPage = useCallback(() => {
    const increment = viewMode === 'double' ? 2 : 1;
    setCurrentPage(prev =>
      Math.min(pages.length - 1, prev + increment)
    );
    if (viewerRef.current) {
      viewerRef.current.scrollTop = 0;
    }
  }, [viewMode, pages.length]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyPress = (e) => {
      if (pages.length === 0) return;

      switch (e.key) {
        case 'ArrowLeft':
          previousPage();
          break;
        case 'ArrowRight':
        case ' ':
          e.preventDefault();
          nextPage();
          break;
        case 's':
        case 'S':
          setSidebarOpen(prev => !prev);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [pages.length, previousPage, nextPage]);

  const handleFileSelect = (event) => {
    const file = event.target.files[0];
    if (file) {
      if (!file.name.endsWith('.torrent')) {
        setError('Please select a .torrent file');
        return;
      }
      setSelectedTorrentFile(file);
      loadTorrent(file);
    }
  };

  const loadTorrent = (torrentFile) => {
    if (!torrentFile) {
      setError('Please select a torrent file');
      return;
    }

    if (!clientRef.current) {
      setError('WebTorrent is still loading, please try again');
      return;
    }

    setLoading(true);
    setError('');
    setStatus('Loading torrent file...');
    setProgress(0);

    // Clean up existing torrent
    if (torrent) {
      torrent.destroy();
    }

    // --- CHANGE START: List of public WebSocket trackers ---
    const announceList = [
      // Existing trackers
      'wss://tracker.openwebtorrent.com',
      'wss://tracker.btorrent.xyz',
      'wss://tracker.webtorrent.dev',
      'wss://tracker.files.fm:7073/announce',

      // New additions (more coverage)
      'wss://ws.bittorrent.com/tracker',
      'wss://d.webtorrent.dev/tracker',
      'wss://tracker.sloppy.zone/announce'
      // You can search for more public wss:// trackers and add them here
    ];
    // -----------------------------------------------------

    try {
      // Pass the 'announce' list in the options object
      clientRef.current.add(torrentFile, { announce: announceList }, (torrent) => {

        // Trigger the bridge
        console.log('Asking bridge to help with:', torrent.infoHash);
        fetch(bridgeUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ magnetURI: torrent.magnetURI })
        }).catch(err => console.error('Bridge error:', err));

        setTorrent(torrent);
        setStatus(`Loading: ${torrent.name}`);

        // Progress tracking
        torrent.on('download', () => {
          const percent = Math.round(torrent.progress * 100);
          setProgress(percent);
          setStatus(`Downloading: ${percent}% (${torrent.numPeers} peers)`);
        });

        torrent.on('done', () => {
          setLoading(false);
          setStatus('');
        });

        // Filter for CBZ/CBR files
        const mangaFiles = torrent.files.filter(file =>
          /\.(cbz|cbr|zip)$/i.test(file.name)
        );

        if (mangaFiles.length === 0) {
          setError('No CBZ/CBR files found in torrent');
          setLoading(false);
          return;
        }

        // Sort files naturally
        mangaFiles.sort((a, b) =>
          a.name.localeCompare(b.name, undefined, { numeric: true })
        );

        setFiles(mangaFiles);

        // IMPORTANT: Do not auto-load here if the file is huge. 
        if (mangaFiles.length > 0) {
          loadCBZ(mangaFiles[0]);
        }
      }); // <-- This correctly closes the clientRef.current.add call.

      clientRef.current.on('error', (err) => {
        setError(`Error: ${err.message}`);
        setLoading(false);
      });

    } catch (err) {
      setError(`Error adding torrent: ${err.message}`);
      setLoading(false);
    }
  }; // <--- This brace closes the loadTorrent function

  const loadCBZ = async (file) => {
    // 1. Setup initial state
    setSelectedFile(file);
    setPages([]);
    setCurrentPage(0);
    setProgress(0);

    // Check if file is already fully downloaded
    if (file.progress < 1) {
      setStatus(`Downloading: ${Math.round(file.progress * 100)}%`);
    } else {
      setStatus('Reading file...');
    }

    // 2. Create a progress interval to show download status while getBuffer waits
    const progressInterval = setInterval(() => {
      if (file.progress < 1) {
        const percent = Math.round(file.progress * 100);
        setStatus(`Downloading: ${percent}% (${clientRef.current?.torrents[0]?.numPeers || 0} peers)`);
        setProgress(percent);
      } else {
        setStatus('Finalizing download...');
      }
    }, 500);

    // 3. Start fetching the buffer (this triggers the download priority)
    file.getBuffer(async (err, buffer) => {
      // Stop tracking download progress once we have the buffer
      clearInterval(progressInterval);

      if (err) {
        setError(`Error loading file: ${err.message}`);
        setStatus('Error');
        return;
      }

      try {
        if (!window.JSZip) {
          setError('JSZip is still loading, please try again');
          return;
        }

        setStatus('Unzipping content...');
        const zip = await window.JSZip.loadAsync(buffer);
        const imageFiles = [];

        // Extract all image files
        for (let [path, zipEntry] of Object.entries(zip.files)) {
          if (!zipEntry.dir && /\.(jpg|jpeg|png|gif|webp)$/i.test(path)) {
            imageFiles.push({ path, zipEntry });
          }
        }

        // Sort images naturally
        imageFiles.sort((a, b) =>
          a.path.localeCompare(b.path, undefined, {
            numeric: true,
            sensitivity: 'base'
          })
        );

        // Process images with percentage updates for the UI
        const pageUrls = [];
        const totalImages = imageFiles.length;
        let processedCount = 0;

        for (let imgFile of imageFiles) {
          const blob = await imgFile.zipEntry.async('blob');
          const dataUrl = await blobToDataURL(blob);
          pageUrls.push(dataUrl);

          // Update progress for processing
          processedCount++;
          const currentProgress = Math.round((processedCount / totalImages) * 100);
          setProgress(currentProgress);
          setStatus(`Processing pages: ${currentProgress}%`);
        }

        setPages(pageUrls);
        setCurrentPage(0);
        setStatus(''); // Clear status when fully done
        setProgress(0);

        if (viewerRef.current) {
          viewerRef.current.scrollTop = 0;
        }

      } catch (error) {
        setError(`Error extracting CBZ: ${error.message}`);
        setProgress(0);
      }
    });
  };

  const blobToDataURL = (blob) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  const canGoNext = () => {
    if (viewMode === 'double') {
      return currentPage < pages.length - 2;
    }
    return currentPage < pages.length - 1;
  };

  const canGoPrev = () => {
    return currentPage > 0;
  };

  return (
    <div className="manga-reader-app">
      {/* Header */}
      <div className="header">
        <div className="logo">
          <Book size={20} />
          <span>Manga Stream</span>
        </div>
        <div className="input-group">
          <input
            ref={fileInputRef}
            type="file"
            accept=".torrent"
            onChange={handleFileSelect}
            style={{ display: 'none' }}
            id="torrent-file-input"
            disabled={loading}
          />
          <label
            htmlFor="torrent-file-input"
            className="btn file-upload-btn"
            style={{
              cursor: loading ? 'not-allowed' : 'pointer',
              margin: 0,
              opacity: loading ? 0.5 : 1
            }}
          >
            <Upload size={16} />
            <span className="file-upload-text">
              {loading ? 'Loading...' : (selectedTorrentFile ? selectedTorrentFile.name : 'Select Torrent File')}
            </span>
          </label>
        </div>
      </div>

      {/* Main Container */}
      <div className="main-container">
        {/* Sidebar Backdrop (Mobile) */}
        <div
          className={`sidebar-backdrop ${!sidebarOpen ? 'closed' : ''}`}
          onClick={() => setSidebarOpen(false)}
        />
        {/* Sidebar */}
        <div className={`sidebar ${!sidebarOpen ? 'closed' : ''}`}>
          <div className="sidebar-header">Chapter List</div>
          <div className="file-list">
            {files.length > 0 ? (
              files.map((file, index) => (
                <div
                  key={index}
                  className={`file-item ${selectedFile === file ? 'active' : ''}`}
                  onClick={() => loadCBZ(file)}
                >
                  <Book size={14} />
                  <span>{file.name}</span>
                </div>
              ))
            ) : (
              <div className="empty-state">No chapters loaded</div>
            )}
          </div>
        </div>

        {/* Reader Area */}
        <div className="reader-area">
          {/* Controls Bar */}
          <div className="controls-bar">
            <button
              className="icon-btn"
              onClick={() => setSidebarOpen(!sidebarOpen)}
            >
              <Menu size={16} />
            </button>

            {selectedFile && (
              <span className="page-info">
                Page {currentPage + 1} / {pages.length}
              </span>
            )}

            <div className="view-modes">
              <button
                className={`mode-btn ${viewMode === 'single' ? 'active' : ''}`}
                onClick={() => setViewMode('single')}
              >
                <Square size={14} />
                Single
              </button>
              <button
                className={`mode-btn ${viewMode === 'double' ? 'active' : ''}`}
                onClick={() => setViewMode('double')}
              >
                <Columns size={14} />
                Double
              </button>
              <button
                className={`mode-btn ${viewMode === 'fit' ? 'active' : ''}`}
                onClick={() => setViewMode('fit')}
              >
                <Maximize2 size={14} />
                Fit
              </button>
            </div>
          </div>

          {/* Manga Viewer */}
          <div
            className={`manga-viewer ${viewMode}`}
            ref={viewerRef}
          >
            {pages.length > 0 ? (
              <>
                {viewMode === 'double' && currentPage < pages.length - 1 ? (
                  <>
                    <img
                      src={pages[currentPage + 1]}
                      className="page-image"
                      alt={`Page ${currentPage + 2}`}
                    />
                    <img
                      src={pages[currentPage]}
                      className="page-image"
                      alt={`Page ${currentPage + 1}`}
                    />
                  </>
                ) : (
                  <img
                    src={pages[currentPage]}
                    className="page-image"
                    alt={`Page ${currentPage + 1}`}
                  />
                )}

                {/* Navigation Overlay */}
                <div className="nav-overlay">
                  <button
                    className="nav-btn-round"
                    onClick={previousPage}
                    disabled={!canGoPrev()}
                  >
                    <ChevronLeft size={24} />
                  </button>
                  <button
                    className="nav-btn-round"
                    onClick={nextPage}
                    disabled={!canGoNext()}
                  >
                    <ChevronRight size={24} />
                  </button>
                </div>
              </>
            ) : (
              <div className="welcome-screen">
                <h1>Manga Stream Reader</h1>
                <p>Read manga directly from torrents in your browser. No downloads, no waiting.</p>
                <div className="feature-grid">
                  <div className="feature-card">
                    <h3>🚀 Instant Streaming</h3>
                    <p>Start reading while downloading</p>
                  </div>
                  <div className="feature-card">
                    <h3>📚 CBZ Support</h3>
                    <p>Opens CBZ, CBR, and ZIP files</p>
                  </div>
                  <div className="feature-card">
                    <h3>👀 Multiple Views</h3>
                    <p>Single, double page, or fit width</p>
                  </div>
                  <div className="feature-card">
                    <h3>⌨️ Keyboard Controls</h3>
                    <p>Navigate with arrow keys</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Status Messages */}
      {(status || error) && (
        <div className={`status-message ${error ? 'error-message' : ''}`}>
          <div className="status-content">
            {!error && <div className="spinner"></div>}
            <span>{error || status}</span>
          </div>
          {progress > 0 && !error && (
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${progress}%` }}></div>
            </div>
          )}
        </div>
      )}

      {/* Keyboard Hints */}
      <div className="keyboard-hints">
        <span className="kbd">←</span> Previous |
        <span className="kbd">→</span> Next |
        <span className="kbd">Space</span> Next |
        <span className="kbd">S</span> Sidebar
      </div>
    </div>
  );
};

export default MangaReader;
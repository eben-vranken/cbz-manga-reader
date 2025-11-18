// bridge.js
import express from 'express';
import WebTorrent from 'webtorrent-hybrid';
import cors from 'cors';
import path from 'path'; // NEW
import {
    fileURLToPath
} from 'url'; // NEW

// Fix for __dirname in ES Modules (type: "module")
const __filename = fileURLToPath(
    import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
// Use Railway's dynamic port, default to 3000 for local development
const PORT = process.env.PORT || 3000;

// When deploying to a single service, we can remove the explicit cors origin
app.use(cors());
app.use(express.json());

// --- PRODUCTION: Serve the React Frontend ---
// 1. Serve built static assets from the 'dist' folder
app.use(express.static(path.join(__dirname, 'dist')));

// 2. Fallback to index.html for client-side routing (for the React app)
app.get('*', (req, res, next) => {
    // Skip this logic if the request is explicitly for the API
    if (req.path.startsWith('/api/')) {
        return next();
    }
    // Serve the index.html for all other routes (React handles routing from there)
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});
// ------------------------------------------

// Initialize the Hybrid Client (Talks to both TCP and WebRTC)
const client = new WebTorrent();

// ... (Rest of your WebTorrent and app.post('/api/bridge') logic remains the same)

app.listen(PORT, () => {
    console.log(`🌉 Full-Stack Server running on port ${PORT}`);
});
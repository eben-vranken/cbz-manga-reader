// bridge.js
import express from 'express';
import WebTorrent from 'webtorrent-hybrid';
import cors from 'cors';

const app = express();
const PORT = 3000;

// Allow your Vite frontend (running on port 5173) to talk to this server
app.use(cors({
    origin: 'http://localhost:5173'
}));
app.use(express.json());

// Initialize the Hybrid Client (Talks to both TCP and WebRTC)
const client = new WebTorrent();

client.on('error', (err) => {
    console.error('⚠️ Client Error:', err.message);
});

console.log('🚀 Torrent Bridge initializing...');

app.post('/api/bridge', (req, res) => {
    const {
        magnetURI
    } = req.body;

    if (!magnetURI) {
        return res.status(400).json({
            error: 'No magnet URI provided'
        });
    }

    // Check if we are already seeding this
    const existing = client.get(magnetURI);
    if (existing) {
        console.log(`Example: Already seeding ${existing.infoHash}`);
        return res.json({
            status: 'active',
            infoHash: existing.infoHash
        });
    }

    console.log(`📥 Bridging: ${magnetURI.slice(0, 30)}...`);

    // Add torrent to the bridge
    // The path '/tmp/webtorrent' is where files are temporarily stored
    client.add(magnetURI, {
        path: '/tmp/webtorrent'
    }, (torrent) => {
        console.log(`✅ Metadata fetched for: ${torrent.name}`);
        console.log(`   - InfoHash: ${torrent.infoHash}`);
        console.log(`   - Peers: ${torrent.numPeers}`);

        // The client automatically starts seeding to WebRTC peers (your browser)
        // just by existing in this process.
    });

    res.json({
        status: 'started'
    });
});

app.listen(PORT, () => {
    console.log(`🌉 Bridge Server running on http://localhost:${PORT}`);
});
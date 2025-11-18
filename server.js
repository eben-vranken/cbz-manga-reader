// server.js
const {
    createServer
} = require('http');
const {
    parse
} = require('url');
const next = require('next');
const WebTorrent = require('webtorrent-hybrid');

const dev = process.env.NODE_ENV !== 'production';
const app = next({
    dev
});
const handle = app.getRequestHandler();

// Initialize the "Bridge" Client
// This client runs on the server and talks to both TCP (internet) and WebRTC (browser)
const client = new WebTorrent();

// Log errors to keep server alive
client.on('error', (err) => console.error('Server Torrent Error:', err.message));

app.prepare().then(() => {
    const server = createServer(async (req, res) => {
        const parsedUrl = parse(req.url, true);
        const {
            pathname,
            query
        } = parsedUrl;

        // API Endpoint to trigger the bridge
        if (pathname === '/api/bridge' && req.method === 'POST') {
            let body = '';
            req.on('data', chunk => {
                body += chunk.toString();
            });
            req.on('end', () => {
                try {
                    const {
                        magnetURI
                    } = JSON.parse(body);

                    // Check if we are already seeding this
                    const existing = client.get(magnetURI);
                    if (existing) {
                        res.statusCode = 200;
                        res.end(JSON.stringify({
                            status: 'already_seeding',
                            infoHash: existing.infoHash
                        }));
                        return;
                    }

                    console.log('Bridge: Starting download for', magnetURI);

                    // Add torrent to server client
                    client.add(magnetURI, {
                        path: './tmp/downloads'
                    }, (torrent) => {
                        console.log(`Bridge: Fetching metadata for ${torrent.infoHash}`);

                        // Prioritize metadata so peers can find us
                        torrent.on('metadata', () => {
                            console.log('Bridge: Metadata acquired, now seeding to peers');
                        });
                    });

                    res.statusCode = 200;
                    res.end(JSON.stringify({
                        status: 'started_bridging'
                    }));

                } catch (e) {
                    res.statusCode = 500;
                    res.end(JSON.stringify({
                        error: 'Invalid request'
                    }));
                }
            });
        } else {
            // Handle all other requests with Next.js
            await handle(req, res, parsedUrl);
        }
    });

    server.listen(3000, (err) => {
        if (err) throw err;
        console.log('> Ready on http://localhost:3000');
        console.log('> WebTorrent Bridge Active');
    });
});
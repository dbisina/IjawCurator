import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;
const DIST = path.join(__dirname, 'dist');

// ── Security / compatibility headers ─────────────────────────────────────────
//
// COOP must be "same-origin-allow-popups" (NOT "same-origin") so the Google
// Sign-in popup can post its auth result back to the opener window.
// "same-origin" severs that channel, leaving Firebase with no provider info.
//
app.use((_req, res, next) => {
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  res.setHeader('Cross-Origin-Embedder-Policy', 'unsafe-none');
  next();
});

// ── Serve Vite build output ───────────────────────────────────────────────────
app.use(express.static(DIST));

// SPA fallback — send index.html for every non-asset route
app.get('*', (_req, res) => {
  res.sendFile(path.join(DIST, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Izonate running on port ${PORT}`);
});

const express = require('express');
const path = require('path');
const { nanoid } = require('nanoid');
const {
    insertLink,
    getLinkByCode,
    getAllLinks,
    insertVisit,
    getVisitsByCode,
    deleteLinkByCode,
    deleteVisitsByCode,
} = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

// Trust proxy for correct IP behind reverse proxies
app.set('trust proxy', true);

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── Helper: extract real IP ─────────────────────────────────────
function getClientIp(req) {
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
        return forwarded.split(',')[0].trim();
    }
    return req.ip || req.socket.remoteAddress || 'unknown';
}

// ─── API Routes ──────────────────────────────────────────────────

// Create a new tracking link
app.post('/api/links', (req, res) => {
    try {
        const { url } = req.body;

        if (!url) {
            return res.status(400).json({ error: 'URL es requerido' });
        }

        // Basic URL validation
        let parsedUrl;
        try {
            parsedUrl = new URL(url.startsWith('http') ? url : `https://${url}`);
        } catch {
            return res.status(400).json({ error: 'URL inválido' });
        }

        const code = nanoid(8);
        insertLink.run(code, parsedUrl.href);

        const trackingUrl = `${req.protocol}://${req.get('host')}/r/${code}`;

        res.json({
            success: true,
            code,
            trackingUrl,
            originalUrl: parsedUrl.href,
        });
    } catch (err) {
        console.error('Error creating link:', err);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// List all links with visit counts
app.get('/api/links', (req, res) => {
    try {
        const links = getAllLinks.all();
        res.json(links);
    } catch (err) {
        console.error('Error fetching links:', err);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Get visits for a specific link
app.get('/api/links/:code/visits', (req, res) => {
    try {
        const { code } = req.params;
        const link = getLinkByCode.get(code);

        if (!link) {
            return res.status(404).json({ error: 'Link no encontrado' });
        }

        const visits = getVisitsByCode.all(code);
        res.json({ link, visits });
    } catch (err) {
        console.error('Error fetching visits:', err);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Delete a link and its visits
app.delete('/api/links/:code', (req, res) => {
    try {
        const { code } = req.params;
        const link = getLinkByCode.get(code);

        if (!link) {
            return res.status(404).json({ error: 'Link no encontrado' });
        }

        deleteVisitsByCode.run(code);
        deleteLinkByCode.run(code);

        res.json({ success: true, message: 'Link eliminado correctamente' });
    } catch (err) {
        console.error('Error deleting link:', err);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// ─── Redirect Route ──────────────────────────────────────────────
app.get('/r/:code', (req, res) => {
    try {
        const { code } = req.params;
        const link = getLinkByCode.get(code);

        if (!link) {
            return res.status(404).send(`
        <!DOCTYPE html>
        <html lang="es">
        <head><meta charset="UTF-8"><title>Link no encontrado</title>
        <style>body{background:#0a0a0f;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;font-family:Inter,sans-serif;}
        .box{text-align:center;}.box h1{font-size:4rem;background:linear-gradient(135deg,#6366f1,#8b5cf6);-webkit-background-clip:text;-webkit-text-fill-color:transparent;}
        .box p{color:#94a3b8;margin-top:1rem;}</style></head>
        <body><div class="box"><h1>404</h1><p>Este link no existe o fue eliminado.</p></div></body></html>
      `);
        }

        // Log the visit
        const ip = getClientIp(req);
        const userAgent = req.headers['user-agent'] || 'unknown';
        const referer = req.headers['referer'] || null;

        insertVisit.run(code, ip, userAgent, referer);

        // Redirect to original URL
        res.redirect(302, link.original_url);
    } catch (err) {
        console.error('Error during redirect:', err);
        res.status(500).send('Error interno del servidor');
    }
});

// ─── Catch-all: serve index.html ────────────────────────────────
app.get('{*splat}', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── Start Server ────────────────────────────────────────────────
app.listen(PORT, () => {
    console.log(`\n  🚀 Servidor corriendo en http://localhost:${PORT}\n`);
});

const express = require('express');
const path = require('path');
const dns = require('dns').promises;
const crypto = require('crypto');
const net = require('net');
const { nanoid } = require('nanoid');
const whois = require('whois-json');
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

app.set('trust proxy', true);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── Helper: extract real IP ─────────────────────────────────────
function getClientIp(req) {
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) return forwarded.split(',')[0].trim();
    return req.ip || req.socket.remoteAddress || 'unknown';
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 1. IP TRACKER (existing)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

app.post('/api/links', (req, res) => {
    try {
        const { url } = req.body;
        if (!url) return res.status(400).json({ error: 'URL es requerido' });

        let parsedUrl;
        try {
            parsedUrl = new URL(url.startsWith('http') ? url : `https://${url}`);
        } catch {
            return res.status(400).json({ error: 'URL inválido' });
        }

        const code = nanoid(8);
        insertLink.run(code, parsedUrl.href);
        const trackingUrl = `${req.protocol}://${req.get('host')}/r/${code}`;

        res.json({ success: true, code, trackingUrl, originalUrl: parsedUrl.href });
    } catch (err) {
        console.error('Error creating link:', err);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

app.get('/api/links', (req, res) => {
    try {
        res.json(getAllLinks.all());
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

app.get('/api/links/:code/visits', (req, res) => {
    try {
        const link = getLinkByCode.get(req.params.code);
        if (!link) return res.status(404).json({ error: 'Link no encontrado' });
        const visits = getVisitsByCode.all(req.params.code);
        res.json({ link, visits });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

app.delete('/api/links/:code', (req, res) => {
    try {
        const link = getLinkByCode.get(req.params.code);
        if (!link) return res.status(404).json({ error: 'Link no encontrado' });
        deleteVisitsByCode.run(req.params.code);
        deleteLinkByCode.run(req.params.code);
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

app.get('/r/:code', (req, res) => {
    try {
        const link = getLinkByCode.get(req.params.code);
        if (!link) {
            return res.status(404).send(`<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>404</title>
        <style>body{background:#0a0a0f;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;font-family:Inter,sans-serif}
        .box{text-align:center} .box h1{font-size:4rem;background:linear-gradient(135deg,#6366f1,#8b5cf6);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
        .box p{color:#94a3b8;margin-top:1rem}</style></head>
        <body><div class="box"><h1>404</h1><p>Este link no existe o fue eliminado.</p></div></body></html>`);
        }
        const ip = getClientIp(req);
        const userAgent = req.headers['user-agent'] || 'unknown';
        const referer = req.headers['referer'] || null;
        insertVisit.run(req.params.code, ip, userAgent, referer);
        res.redirect(302, link.original_url);
    } catch (err) {
        console.error(err);
        res.status(500).send('Error interno del servidor');
    }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 2. IP LOOKUP
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

app.get('/api/ip-lookup/:ip', async (req, res) => {
    try {
        const { ip } = req.params;
        // Validate IP format (basic)
        if (!ip || ip.length > 45) {
            return res.status(400).json({ error: 'IP inválida' });
        }

        const response = await fetch(`http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,message,country,countryCode,region,regionName,city,zip,lat,lon,timezone,isp,org,as,query`);
        const data = await response.json();

        if (data.status === 'fail') {
            return res.status(400).json({ error: data.message || 'IP inválida' });
        }

        res.json(data);
    } catch (err) {
        console.error('IP Lookup error:', err);
        res.status(500).json({ error: 'Error al buscar la IP' });
    }
});

// Get requester's own IP
app.get('/api/my-ip', (req, res) => {
    res.json({ ip: getClientIp(req) });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 3. WHOIS LOOKUP
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

app.get('/api/whois/:domain', async (req, res) => {
    try {
        const { domain } = req.params;
        if (!domain || domain.length > 255) {
            return res.status(400).json({ error: 'Dominio inválido' });
        }

        // Clean the domain
        const cleanDomain = domain.replace(/^https?:\/\//, '').replace(/\/.*$/, '').trim();
        const result = await whois(cleanDomain);

        res.json({ domain: cleanDomain, data: result });
    } catch (err) {
        console.error('WHOIS error:', err);
        res.status(500).json({ error: 'Error al consultar WHOIS' });
    }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 4. DNS LOOKUP
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

app.get('/api/dns/:domain', async (req, res) => {
    try {
        const { domain } = req.params;
        if (!domain || domain.length > 255) {
            return res.status(400).json({ error: 'Dominio inválido' });
        }

        const cleanDomain = domain.replace(/^https?:\/\//, '').replace(/\/.*$/, '').trim();
        const results = {};

        // Resolve all record types in parallel
        const types = [
            { type: 'A', fn: () => dns.resolve4(cleanDomain) },
            { type: 'AAAA', fn: () => dns.resolve6(cleanDomain) },
            { type: 'MX', fn: () => dns.resolveMx(cleanDomain) },
            { type: 'NS', fn: () => dns.resolveNs(cleanDomain) },
            { type: 'TXT', fn: () => dns.resolveTxt(cleanDomain) },
            { type: 'CNAME', fn: () => dns.resolveCname(cleanDomain) },
            { type: 'SOA', fn: () => dns.resolveSoa(cleanDomain) },
        ];

        await Promise.all(
            types.map(async ({ type, fn }) => {
                try {
                    results[type] = await fn();
                } catch {
                    results[type] = null;
                }
            })
        );

        res.json({ domain: cleanDomain, records: results });
    } catch (err) {
        console.error('DNS error:', err);
        res.status(500).json({ error: 'Error al consultar DNS' });
    }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 5. PORT SCANNER
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function scanPort(host, port, timeout = 2000) {
    return new Promise((resolve) => {
        const socket = new net.Socket();
        socket.setTimeout(timeout);

        socket.on('connect', () => {
            socket.destroy();
            resolve({ port, status: 'open' });
        });

        socket.on('timeout', () => {
            socket.destroy();
            resolve({ port, status: 'closed' });
        });

        socket.on('error', () => {
            socket.destroy();
            resolve({ port, status: 'closed' });
        });

        socket.connect(port, host);
    });
}

// Well-known port services
const PORT_SERVICES = {
    21: 'FTP', 22: 'SSH', 23: 'Telnet', 25: 'SMTP', 53: 'DNS',
    80: 'HTTP', 110: 'POP3', 143: 'IMAP', 443: 'HTTPS', 445: 'SMB',
    993: 'IMAPS', 995: 'POP3S', 3306: 'MySQL', 3389: 'RDP',
    5432: 'PostgreSQL', 5900: 'VNC', 6379: 'Redis', 8080: 'HTTP-Alt',
    8443: 'HTTPS-Alt', 27017: 'MongoDB',
};

app.post('/api/port-scan', async (req, res) => {
    try {
        let { host, startPort, endPort } = req.body;

        if (!host) return res.status(400).json({ error: 'Host es requerido' });

        startPort = parseInt(startPort) || 1;
        endPort = parseInt(endPort) || 1024;

        // Limit range to max 200 ports
        if (endPort - startPort > 200) {
            endPort = startPort + 200;
        }

        if (startPort < 1) startPort = 1;
        if (endPort > 65535) endPort = 65535;

        // Clean host
        const cleanHost = host.replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/:.*$/, '').trim();

        // Scan ports in parallel batches of 50
        const results = [];
        const batchSize = 50;

        for (let i = startPort; i <= endPort; i += batchSize) {
            const batch = [];
            for (let p = i; p < Math.min(i + batchSize, endPort + 1); p++) {
                batch.push(scanPort(cleanHost, p, 1500));
            }
            const batchResults = await Promise.all(batch);
            results.push(...batchResults);
        }

        // Add service names
        const enriched = results.map(r => ({
            ...r,
            service: PORT_SERVICES[r.port] || '',
        }));

        res.json({
            host: cleanHost,
            scanned: `${startPort}-${endPort}`,
            results: enriched,
            openPorts: enriched.filter(r => r.status === 'open'),
        });
    } catch (err) {
        console.error('Port scan error:', err);
        res.status(500).json({ error: 'Error al escanear puertos' });
    }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 6. HASH GENERATOR
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

app.post('/api/hash', (req, res) => {
    try {
        const { text, algorithm } = req.body;

        if (!text) return res.status(400).json({ error: 'Texto es requerido' });

        const allowed = ['md5', 'sha1', 'sha256', 'sha512'];
        const algo = allowed.includes(algorithm) ? algorithm : 'sha256';

        const hash = crypto.createHash(algo).update(text, 'utf8').digest('hex');

        res.json({ algorithm: algo, hash, length: hash.length });
    } catch (err) {
        console.error('Hash error:', err);
        res.status(500).json({ error: 'Error al generar hash' });
    }
});

// Generate all hashes at once
app.post('/api/hash-all', (req, res) => {
    try {
        const { text } = req.body;
        if (!text) return res.status(400).json({ error: 'Texto es requerido' });

        const algorithms = ['md5', 'sha1', 'sha256', 'sha512'];
        const hashes = {};
        for (const algo of algorithms) {
            hashes[algo] = crypto.createHash(algo).update(text, 'utf8').digest('hex');
        }

        res.json({ hashes });
    } catch (err) {
        console.error('Hash-all error:', err);
        res.status(500).json({ error: 'Error al generar hashes' });
    }
});

// ─── Catch-all ───────────────────────────────────────────────────
app.get('{*splat}', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── Start Server ────────────────────────────────────────────────
app.listen(PORT, () => {
    console.log(`\n  🚀 NetTools corriendo en http://localhost:${PORT}\n`);
});

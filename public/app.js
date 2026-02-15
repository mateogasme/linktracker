// ─── Utilities ─────────────────────────────────────────────────
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);
let toastTimeout;

function showToast(message, duration = 2500) {
    const toast = $('#toast');
    const toastMsg = $('#toast-message');
    toastMsg.textContent = message;
    toast.classList.remove('hidden');
    requestAnimationFrame(() => toast.classList.add('visible'));
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
        toast.classList.remove('visible');
        setTimeout(() => toast.classList.add('hidden'), 200);
    }, duration);
}

async function api(method, path, body) {
    const opts = { method, headers: { 'Content-Type': 'application/json' } };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(path, opts);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error del servidor');
    return data;
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function copyText(text) {
    if (navigator.clipboard) {
        navigator.clipboard.writeText(text);
    } else {
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
    }
    showToast('📋 Copiado al portapapeles');
}

function showLoading(container) {
    container.classList.remove('hidden');
    container.innerHTML = `<div class="loading-spinner"><div class="spinner"></div>Procesando...</div>`;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// NAVIGATION
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const navItems = $$('.nav-item');
const panels = $$('.tool-panel');

navItems.forEach(item => {
    item.addEventListener('click', () => {
        const tool = item.dataset.tool;
        navItems.forEach(n => n.classList.remove('active'));
        panels.forEach(p => p.classList.remove('active'));
        item.classList.add('active');
        $(`#panel-${tool}`).classList.add('active');
        // Close mobile sidebar
        $('#sidebar').classList.remove('open');
        const overlay = document.querySelector('.sidebar-overlay');
        if (overlay) overlay.classList.remove('visible');
    });
});

// Mobile menu
const hamburger = $('#hamburger-btn');
if (hamburger) {
    // Create overlay
    const overlay = document.createElement('div');
    overlay.className = 'sidebar-overlay';
    document.body.appendChild(overlay);

    hamburger.addEventListener('click', () => {
        $('#sidebar').classList.toggle('open');
        overlay.classList.toggle('visible');
    });

    overlay.addEventListener('click', () => {
        $('#sidebar').classList.remove('open');
        overlay.classList.remove('visible');
    });
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 1. IP TRACKER
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const createForm = $('#create-form');
const urlInput = $('#url-input');
const createBtn = $('#create-btn');
const resultDiv = $('#result');
const trackingUrlEl = $('#tracking-url');
const originalUrlEl = $('#original-url');
const copyBtn = $('#copy-btn');
const refreshBtn = $('#refresh-btn');
const linksList = $('#links-list');
const emptyState = $('#empty-state');
const totalLinksEl = $('#total-links');
const totalVisitsEl = $('#total-visits');

createForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const url = urlInput.value.trim();
    if (!url) return;
    createBtn.disabled = true;
    createBtn.querySelector('span').textContent = 'Generando...';
    try {
        const data = await api('POST', '/api/links', { url });
        trackingUrlEl.textContent = data.trackingUrl;
        originalUrlEl.href = data.originalUrl;
        originalUrlEl.textContent = data.originalUrl;
        resultDiv.classList.remove('hidden');
        urlInput.value = '';
        showToast('✅ Link creado');
        loadLinks();
    } catch (err) {
        showToast('❌ ' + err.message);
    } finally {
        createBtn.disabled = false;
        createBtn.querySelector('span').textContent = 'Generar';
    }
});

copyBtn.addEventListener('click', () => copyText(trackingUrlEl.textContent));

async function loadLinks() {
    try {
        const links = await api('GET', '/api/links');
        totalLinksEl.textContent = links.length;
        const totalV = links.reduce((s, l) => s + (l.visit_count || 0), 0);
        totalVisitsEl.textContent = totalV;

        if (links.length === 0) {
            emptyState.classList.remove('hidden');
            linksList.innerHTML = '';
            return;
        }
        emptyState.classList.add('hidden');
        linksList.innerHTML = links.map(createLinkItem).join('');
    } catch (err) {
        console.error(err);
    }
}

function createLinkItem(link) {
    const host = window.location.origin;
    const trackUrl = `${host}/r/${link.code}`;
    return `
    <div class="link-item" data-code="${link.code}">
      <div class="link-item-header" onclick="toggleExpand(this)">
        <div class="link-item-info">
          <div class="link-item-url">${escapeHtml(link.original_url)}</div>
          <div class="link-item-meta">
            <span class="link-item-code">/r/${link.code}</span>
            <span class="visit-badge">👁 ${link.visit_count || 0}</span>
          </div>
        </div>
        <div class="link-item-actions">
          <button class="btn-sm" onclick="event.stopPropagation(); copyText('${trackUrl}')">📋</button>
          <button class="btn-danger" onclick="event.stopPropagation(); deleteLink('${link.code}')">🗑</button>
          <span class="chevron">▼</span>
        </div>
      </div>
      <div class="visits-panel" id="visits-${link.code}">
        <div class="loading-spinner"><div class="spinner"></div>Cargando...</div>
      </div>
    </div>`;
}

async function toggleExpand(header) {
    const item = header.closest('.link-item');
    const isExpanded = item.classList.contains('expanded');
    $$('.link-item').forEach(i => i.classList.remove('expanded'));
    if (isExpanded) return;
    item.classList.add('expanded');

    const code = item.dataset.code;
    const panel = $(`#visits-${code}`);

    try {
        const data = await api('GET', `/api/links/${code}/visits`);
        if (!data.visits || data.visits.length === 0) {
            panel.innerHTML = `<div class="visits-empty">Sin visitas aún</div>`;
            return;
        }
        panel.innerHTML = `
      <table class="data-table">
        <thead><tr><th>IP</th><th>Navegador</th><th>Fecha</th></tr></thead>
        <tbody>${data.visits.map(v => `
          <tr>
            <td class="mono">${escapeHtml(v.ip_address)}</td>
            <td>${escapeHtml(parseBrowser(v.user_agent))}</td>
            <td>${new Date(v.visited_at).toLocaleString('es')}</td>
          </tr>`).join('')}
        </tbody>
      </table>`;
    } catch (err) {
        panel.innerHTML = `<div class="visits-empty">Error al cargar visitas</div>`;
    }
}

async function deleteLink(code) {
    if (!confirm('¿Eliminar este link?')) return;
    try {
        await api('DELETE', `/api/links/${code}`);
        showToast('🗑 Link eliminado');
        loadLinks();
    } catch (err) {
        showToast('❌ ' + err.message);
    }
}

function parseBrowser(ua) {
    if (!ua) return 'Desconocido';
    if (ua.includes('Firefox')) return 'Firefox';
    if (ua.includes('Edg/')) return 'Edge';
    if (ua.includes('OPR') || ua.includes('Opera')) return 'Opera';
    if (ua.includes('Chrome')) return 'Chrome';
    if (ua.includes('Safari')) return 'Safari';
    return 'Otro';
}

refreshBtn.addEventListener('click', () => {
    showToast('↻ Actualizando...');
    loadLinks();
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 2. IP LOOKUP
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

$('#ip-lookup-btn').addEventListener('click', async () => {
    const ip = $('#ip-lookup-input').value.trim();
    if (!ip) return showToast('Ingresa una IP');
    const container = $('#ip-lookup-result');
    showLoading(container);

    try {
        const data = await api('GET', `/api/ip-lookup/${encodeURIComponent(ip)}`);
        container.innerHTML = `
      <div class="info-grid">
        <div class="info-item"><div class="info-label">IP</div><div class="info-value">${escapeHtml(data.query)}</div></div>
        <div class="info-item"><div class="info-label">País</div><div class="info-value">${data.countryCode ? flagEmoji(data.countryCode) + ' ' : ''}${escapeHtml(data.country || 'N/A')}</div></div>
        <div class="info-item"><div class="info-label">Región</div><div class="info-value">${escapeHtml(data.regionName || 'N/A')}</div></div>
        <div class="info-item"><div class="info-label">Ciudad</div><div class="info-value">${escapeHtml(data.city || 'N/A')}</div></div>
        <div class="info-item"><div class="info-label">Código Postal</div><div class="info-value">${escapeHtml(data.zip || 'N/A')}</div></div>
        <div class="info-item"><div class="info-label">Zona Horaria</div><div class="info-value">${escapeHtml(data.timezone || 'N/A')}</div></div>
        <div class="info-item"><div class="info-label">ISP</div><div class="info-value">${escapeHtml(data.isp || 'N/A')}</div></div>
        <div class="info-item"><div class="info-label">Organización</div><div class="info-value">${escapeHtml(data.org || 'N/A')}</div></div>
        <div class="info-item"><div class="info-label">AS</div><div class="info-value">${escapeHtml(data.as || 'N/A')}</div></div>
        <div class="info-item"><div class="info-label">Coordenadas</div><div class="info-value">${data.lat}, ${data.lon}</div></div>
      </div>
      ${data.lat && data.lon ? `<div style="margin-top:1rem;border-radius:var(--radius-sm);overflow:hidden;border:1px solid var(--border-subtle)">
        <iframe width="100%" height="250" frameborder="0" style="border:0;filter:invert(0.9) hue-rotate(180deg)" loading="lazy"
          src="https://www.openstreetmap.org/export/embed.html?bbox=${data.lon - 0.05},${data.lat - 0.05},${data.lon + 0.05},${data.lat + 0.05}&layer=mapnik&marker=${data.lat},${data.lon}">
        </iframe>
      </div>` : ''}
    `;
    } catch (err) {
        container.innerHTML = `<p class="text-muted">❌ ${escapeHtml(err.message)}</p>`;
    }
});

$('#my-ip-btn').addEventListener('click', async () => {
    try {
        const data = await api('GET', '/api/my-ip');
        $('#ip-lookup-input').value = data.ip;
        showToast('📡 Tu IP: ' + data.ip);
    } catch (err) {
        showToast('❌ No se pudo detectar tu IP');
    }
});

function flagEmoji(countryCode) {
    if (!countryCode || countryCode.length !== 2) return '';
    const offset = 127397;
    return String.fromCodePoint(...[...countryCode.toUpperCase()].map(c => c.charCodeAt(0) + offset));
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 3. WHOIS LOOKUP
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

$('#whois-btn').addEventListener('click', async () => {
    const domain = $('#whois-input').value.trim();
    if (!domain) return showToast('Ingresa un dominio');
    const container = $('#whois-result');
    showLoading(container);

    try {
        const data = await api('GET', `/api/whois/${encodeURIComponent(domain)}`);
        const info = data.data;

        // Pick the important fields
        const fields = [
            { label: 'Dominio', key: 'domainName' },
            { label: 'Registrante', key: 'registrantOrganization' },
            { label: 'Registrador', key: 'registrar' },
            { label: 'Fecha Creación', key: 'creationDate' },
            { label: 'Fecha Expiración', key: 'registrarRegistrationExpirationDate' },
            { label: 'Última Actualización', key: 'updatedDate' },
            { label: 'Nameservers', key: 'nameServer' },
            { label: 'Estado', key: 'domainStatus' },
            { label: 'DNSSEC', key: 'dnssec' },
        ];

        let html = '<div class="info-grid">';
        for (const f of fields) {
            let val = info[f.key] || info[f.key.charAt(0).toLowerCase() + f.key.slice(1)] || 'N/A';
            if (typeof val === 'object') val = Array.isArray(val) ? val.join(', ') : JSON.stringify(val);
            html += `<div class="info-item"><div class="info-label">${f.label}</div><div class="info-value">${escapeHtml(String(val))}</div></div>`;
        }
        html += '</div>';
        container.innerHTML = html;
    } catch (err) {
        container.innerHTML = `<p class="text-muted">❌ ${escapeHtml(err.message)}</p>`;
    }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 4. DNS LOOKUP
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

$('#dns-btn').addEventListener('click', async () => {
    const domain = $('#dns-input').value.trim();
    if (!domain) return showToast('Ingresa un dominio');
    const container = $('#dns-result');
    showLoading(container);

    try {
        const data = await api('GET', `/api/dns/${encodeURIComponent(domain)}`);
        const records = data.records;
        let html = '';

        const sections = [
            { type: 'A', icon: '🌐' },
            { type: 'AAAA', icon: '🔗' },
            { type: 'MX', icon: '📧' },
            { type: 'NS', icon: '🏷️' },
            { type: 'CNAME', icon: '↪️' },
            { type: 'TXT', icon: '📝' },
            { type: 'SOA', icon: '🏛️' },
        ];

        for (const sec of sections) {
            const recs = records[sec.type];
            if (!recs) continue;

            html += `<div class="dns-section"><div class="dns-section-title">${sec.icon} ${sec.type} Records</div>`;

            if (sec.type === 'SOA' && typeof recs === 'object') {
                for (const [k, v] of Object.entries(recs)) {
                    html += `<div class="dns-record"><strong>${k}:</strong> ${escapeHtml(String(v))}</div>`;
                }
            } else if (sec.type === 'MX') {
                for (const r of recs) {
                    html += `<div class="dns-record">Priority: ${r.priority} → ${escapeHtml(r.exchange)}</div>`;
                }
            } else if (sec.type === 'TXT') {
                for (const r of recs) {
                    const val = Array.isArray(r) ? r.join('') : r;
                    html += `<div class="dns-record">${escapeHtml(val)}</div>`;
                }
            } else if (Array.isArray(recs)) {
                for (const r of recs) {
                    html += `<div class="dns-record">${escapeHtml(String(r))}</div>`;
                }
            }

            html += '</div>';
        }

        container.innerHTML = html || '<p class="text-muted">No se encontraron registros DNS</p>';
    } catch (err) {
        container.innerHTML = `<p class="text-muted">❌ ${escapeHtml(err.message)}</p>`;
    }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 5. PORT SCANNER
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

$('#port-scan-btn').addEventListener('click', async () => {
    const host = $('#port-host-input').value.trim();
    const startPort = parseInt($('#port-start-input').value) || 1;
    const endPort = parseInt($('#port-end-input').value) || 100;

    if (!host) return showToast('Ingresa un host');

    const container = $('#port-scan-result');
    showLoading(container);
    container.querySelector('.loading-spinner').innerHTML = `<div class="spinner"></div>Escaneando puertos ${startPort}-${endPort}... Esto puede tardar.`;

    try {
        const data = await api('POST', '/api/port-scan', { host, startPort, endPort });

        let html = `
      <div class="port-summary">
        <div class="port-summary-item">Host: <strong>${escapeHtml(data.host)}</strong></div>
        <div class="port-summary-item">Rango: <strong>${escapeHtml(data.scanned)}</strong></div>
        <div class="port-summary-item">Abiertos: <strong style="color:var(--success)">${data.openPorts.length}</strong></div>
      </div>`;

        if (data.openPorts.length > 0) {
            html += `<table class="data-table">
        <thead><tr><th>Puerto</th><th>Estado</th><th>Servicio</th></tr></thead>
        <tbody>`;
            for (const p of data.openPorts) {
                html += `<tr>
          <td class="mono">${p.port}</td>
          <td class="port-open">● Abierto</td>
          <td>${escapeHtml(p.service || 'Desconocido')}</td>
        </tr>`;
            }
            html += `</tbody></table>`;
        } else {
            html += `<p class="text-muted" style="text-align:center;padding:1rem">No se encontraron puertos abiertos en este rango</p>`;
        }

        container.innerHTML = html;
    } catch (err) {
        container.innerHTML = `<p class="text-muted">❌ ${escapeHtml(err.message)}</p>`;
    }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 6. PASSWORD GENERATOR (frontend only)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const pwLength = $('#pw-length');
const pwLengthVal = $('#pw-length-val');
pwLength.addEventListener('input', () => { pwLengthVal.textContent = pwLength.value; });

$('#pw-generate-btn').addEventListener('click', () => {
    const len = parseInt(pwLength.value) || 16;
    const useUpper = $('#pw-upper').checked;
    const useLower = $('#pw-lower').checked;
    const useNumbers = $('#pw-numbers').checked;
    const useSymbols = $('#pw-symbols').checked;

    let charset = '';
    if (useUpper) charset += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    if (useLower) charset += 'abcdefghijklmnopqrstuvwxyz';
    if (useNumbers) charset += '0123456789';
    if (useSymbols) charset += '!@#$%^&*()_+-=[]{}|;:,.<>?';

    if (!charset) return showToast('Selecciona al menos un tipo de carácter');

    // Use crypto.getRandomValues for secure randomness
    const array = new Uint32Array(len);
    crypto.getRandomValues(array);
    let password = '';
    for (let i = 0; i < len; i++) {
        password += charset[array[i] % charset.length];
    }

    $('#pw-output').textContent = password;
    $('#pw-result').classList.remove('hidden');

    // Strength meter
    const strengthEl = $('#pw-strength');
    let score = 0;
    if (len >= 8) score++;
    if (len >= 16) score++;
    if (len >= 24) score++;
    if (useUpper) score++;
    if (useLower) score++;
    if (useNumbers) score++;
    if (useSymbols) score++;

    if (score <= 3) {
        strengthEl.className = 'pw-strength weak';
        strengthEl.textContent = '⚠️ Débil — Aumenta la longitud y variedad de caracteres';
    } else if (score <= 5) {
        strengthEl.className = 'pw-strength medium';
        strengthEl.textContent = '🟡 Media — Puede ser más segura';
    } else {
        strengthEl.className = 'pw-strength strong';
        strengthEl.textContent = '🟢 Fuerte — Excelente seguridad';
    }
});

$('#pw-copy-btn').addEventListener('click', () => {
    const pw = $('#pw-output').textContent;
    if (pw) copyText(pw);
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 7. HASH GENERATOR
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

$('#hash-btn').addEventListener('click', async () => {
    const text = $('#hash-input').value;
    if (!text) return showToast('Ingresa texto para hashear');
    const container = $('#hash-result');
    showLoading(container);

    try {
        const data = await api('POST', '/api/hash-all', { text });
        let html = '';
        for (const [algo, hash] of Object.entries(data.hashes)) {
            html += `
        <div class="hash-item">
          <div class="hash-label">${algo.toUpperCase()}</div>
          <div class="hash-value" onclick="copyText('${hash}')" title="Click para copiar">${hash}</div>
        </div>`;
        }
        container.innerHTML = html;
    } catch (err) {
        container.innerHTML = `<p class="text-muted">❌ ${escapeHtml(err.message)}</p>`;
    }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// INIT
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

loadLinks();

// ─── DOM Elements ──────────────────────────────────────────────
const createForm = document.getElementById('create-form');
const urlInput = document.getElementById('url-input');
const createBtn = document.getElementById('create-btn');
const resultDiv = document.getElementById('result');
const trackingUrlEl = document.getElementById('tracking-url');
const originalUrlEl = document.getElementById('original-url');
const copyBtn = document.getElementById('copy-btn');
const refreshBtn = document.getElementById('refresh-btn');
const linksList = document.getElementById('links-list');
const emptyState = document.getElementById('empty-state');
const totalLinksEl = document.getElementById('total-links');
const totalVisitsEl = document.getElementById('total-visits');
const toast = document.getElementById('toast');
const toastMessage = document.getElementById('toast-message');

// ─── Toast ─────────────────────────────────────────────────────
let toastTimeout;
function showToast(message, duration = 2500) {
    toastMessage.textContent = message;
    toast.classList.remove('hidden');
    requestAnimationFrame(() => {
        toast.classList.add('visible');
    });
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
        toast.classList.remove('visible');
        setTimeout(() => toast.classList.add('hidden'), 300);
    }, duration);
}

// ─── API Helpers ───────────────────────────────────────────────
async function api(method, path, body) {
    const opts = {
        method,
        headers: { 'Content-Type': 'application/json' },
    };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(path, opts);
    return res.json();
}

// ─── Create Link ───────────────────────────────────────────────
createForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const url = urlInput.value.trim();
    if (!url) return;

    createBtn.disabled = true;
    createBtn.querySelector('span').textContent = 'Generando...';

    try {
        const data = await api('POST', '/api/links', { url });

        if (data.error) {
            showToast('⚠️ ' + data.error);
            return;
        }

        // Show result
        trackingUrlEl.textContent = data.trackingUrl;
        originalUrlEl.textContent = data.originalUrl;
        originalUrlEl.href = data.originalUrl;
        resultDiv.classList.remove('hidden');

        urlInput.value = '';
        showToast('✅ Link generado correctamente');

        // Refresh dashboard
        loadLinks();
    } catch (err) {
        showToast('❌ Error al crear el link');
        console.error(err);
    } finally {
        createBtn.disabled = false;
        createBtn.querySelector('span').textContent = 'Generar';
    }
});

// ─── Copy to Clipboard ────────────────────────────────────────
copyBtn.addEventListener('click', async () => {
    const url = trackingUrlEl.textContent;
    try {
        await navigator.clipboard.writeText(url);
        copyBtn.classList.add('copied');
        copyBtn.querySelector('span').textContent = '¡Copiado!';
        showToast('📋 Link copiado al portapapeles');
        setTimeout(() => {
            copyBtn.classList.remove('copied');
            copyBtn.querySelector('span').textContent = 'Copiar';
        }, 2000);
    } catch {
        // Fallback
        const textArea = document.createElement('textarea');
        textArea.value = url;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        showToast('📋 Link copiado');
    }
});

// ─── Load Links ────────────────────────────────────────────────
async function loadLinks() {
    try {
        const links = await api('GET', '/api/links');

        // Update stats
        totalLinksEl.textContent = links.length;
        const totalVisits = links.reduce((sum, l) => sum + (l.visit_count || 0), 0);
        totalVisitsEl.textContent = totalVisits;

        if (links.length === 0) {
            emptyState.classList.remove('hidden');
            linksList.innerHTML = '';
            return;
        }

        emptyState.classList.add('hidden');
        linksList.innerHTML = links.map(link => createLinkItem(link)).join('');

        // Attach event listeners
        document.querySelectorAll('.link-item-header').forEach(header => {
            header.addEventListener('click', () => toggleExpand(header));
        });

        document.querySelectorAll('.delete-link-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                deleteLink(btn.dataset.code);
            });
        });

        document.querySelectorAll('.copy-link-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                copyLinkUrl(btn);
            });
        });
    } catch (err) {
        console.error('Error loading links:', err);
    }
}

// ─── Create Link Item HTML ─────────────────────────────────────
function createLinkItem(link) {
    const date = new Date(link.created_at).toLocaleDateString('es-AR', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });

    const host = getHost();

    return `
    <div class="link-item" data-code="${link.code}">
      <div class="link-item-header">
        <div class="link-item-info">
          <div class="link-item-url" title="${escapeHtml(link.original_url)}">${escapeHtml(link.original_url)}</div>
          <div class="link-item-meta">
            <span class="link-item-code">${host}/r/${link.code}</span>
            <span>·</span>
            <span>${date}</span>
          </div>
        </div>
        <div class="link-item-actions">
          <span class="visit-badge">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            ${link.visit_count}
          </span>
          <button class="btn-copy copy-link-btn" data-url="${host}/r/${link.code}" title="Copiar link">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          </button>
          <button class="btn-danger delete-link-btn" data-code="${link.code}" title="Eliminar link">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
          <span class="chevron">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
          </span>
        </div>
      </div>
      <div class="visits-panel">
        <div class="visits-loading loading">Cargando visitas...</div>
      </div>
    </div>
  `;
}

// ─── Toggle Expand ─────────────────────────────────────────────
async function toggleExpand(header) {
    const item = header.closest('.link-item');
    const isExpanded = item.classList.contains('expanded');

    // Close all others
    document.querySelectorAll('.link-item.expanded').forEach(el => {
        if (el !== item) el.classList.remove('expanded');
    });

    if (isExpanded) {
        item.classList.remove('expanded');
        return;
    }

    item.classList.add('expanded');

    const code = item.dataset.code;
    const panel = item.querySelector('.visits-panel');

    try {
        const data = await api('GET', `/api/links/${code}/visits`);
        const visits = data.visits || [];

        if (visits.length === 0) {
            panel.innerHTML = '<div class="visits-empty">Sin visitas aún</div>';
            return;
        }

        panel.innerHTML = `
      <table class="visits-table">
        <thead>
          <tr>
            <th>IP</th>
            <th>Navegador</th>
            <th>Fecha</th>
          </tr>
        </thead>
        <tbody>
          ${visits.map(v => {
            const visitDate = new Date(v.visited_at).toLocaleDateString('es-AR', {
                day: '2-digit', month: 'short', year: 'numeric',
                hour: '2-digit', minute: '2-digit', second: '2-digit',
            });
            const browser = parseBrowser(v.user_agent);
            return `
              <tr>
                <td class="ip-cell">${escapeHtml(v.ip_address)}</td>
                <td>${escapeHtml(browser)}</td>
                <td>${visitDate}</td>
              </tr>
            `;
        }).join('')}
        </tbody>
      </table>
    `;
    } catch (err) {
        panel.innerHTML = '<div class="visits-empty">Error al cargar visitas</div>';
        console.error(err);
    }
}

// ─── Delete Link ───────────────────────────────────────────────
async function deleteLink(code) {
    if (!confirm('¿Estás seguro de eliminar este link y todas sus visitas?')) return;

    try {
        await api('DELETE', `/api/links/${code}`);
        showToast('🗑️ Link eliminado');
        loadLinks();
    } catch (err) {
        showToast('❌ Error al eliminar');
        console.error(err);
    }
}

// ─── Copy Link URL ─────────────────────────────────────────────
async function copyLinkUrl(btn) {
    const url = btn.dataset.url;
    try {
        await navigator.clipboard.writeText(url);
        showToast('📋 Link copiado al portapapeles');
    } catch {
        showToast('❌ No se pudo copiar');
    }
}

// ─── Helpers ───────────────────────────────────────────────────
function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function getHost() {
    return window.location.origin;
}

function parseBrowser(ua) {
    if (!ua) return 'Desconocido';
    if (ua.includes('Firefox')) return 'Firefox';
    if (ua.includes('Edg/')) return 'Edge';
    if (ua.includes('OPR') || ua.includes('Opera')) return 'Opera';
    if (ua.includes('Chrome') && !ua.includes('Edg')) return 'Chrome';
    if (ua.includes('Safari') && !ua.includes('Chrome')) return 'Safari';
    if (ua.includes('curl')) return 'curl';
    return 'Otro';
}

// ─── Refresh Button ────────────────────────────────────────────
refreshBtn.addEventListener('click', () => {
    refreshBtn.classList.add('loading');
    loadLinks().finally(() => {
        setTimeout(() => refreshBtn.classList.remove('loading'), 500);
    });
});

// ─── Init ──────────────────────────────────────────────────────
loadLinks();

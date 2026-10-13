// ===== TAB 4: ASSET & REBALANCING (v1.4.0) =====
// Architettura: gli ETF si configurano UNA volta (ISIN + quota di allocazione %).
// Il valore corrente si misura a ogni misurazione nel Tab 1 (storicoMesi.etfValori).
// L'allocazione geografica proviene dall'API FMP (etf-country-distribution),
// senza fallback benchmark: se non sincronizzata i dati restano vuoti.

let chartGeoBreakdownInstance = null;
let chartPerformanceAssetsInstance = null;
let popupChartInstance = null;
let popupEtfId = null;

// ---------- Configurazione ETF: salva / modifica / elimina ----------

function salvaETF() {
    const nome = document.getElementById('asset-nome').value.trim();
    const isin = document.getElementById('asset-isin').value.trim().toUpperCase();
    const quotaPct = parseFloat(document.getElementById('asset-quota-pct').value) || 0;
    const ticker = document.getElementById('asset-ticker').value.trim();

    if (!nome) { alert("Inserisci il nome dell'ETF."); return; }
    if (!isin) { alert("Inserisci l'ISIN dell'ETF (necessario per la sincronizzazione geografica)."); return; }

    const etfs = dbRadice.configurazioneTarget.etfs || [];
    const editIdx = parseInt(document.getElementById('asset-edit-index').value);

    if (editIdx >= 0 && etfs[editIdx]) {
        const prec = etfs[editIdx];
        etfs[editIdx] = { ...prec, nome, isin, quotaPct, ticker: ticker || prec.ticker };
        if (prec.isin !== isin) {
            // ISIN cambiato: i dati geografici sincronizzati non valgono più
            etfs[editIdx].geo = null;
            etfs[editIdx].geoData = undefined;
            etfs[editIdx].ticker = ticker || undefined;
        }
    } else {
        etfs.push({ id: Date.now(), nome, isin, quotaPct, ticker: ticker || undefined, attivo: true, geo: null });
    }

    salvaNelLocalStorage();

    const sommaQuote = etfs.reduce((a, e) => a + (e.quotaPct || 0), 0);
    if (Math.abs(sommaQuote - 100) > 0.5) {
        alert(`Attenzione: la somma delle quote di allocazione è ${sommaQuote.toFixed(1)}% (atteso 100%). L'asset allocation potrebbe risultare sbilanciata.`);
    }

    annullaModificaETF();
    renderizzaTutto();
}

function annullaModificaETF() {
    document.getElementById('asset-edit-index').value = "-1";
    document.getElementById('asset-nome').value = '';
    document.getElementById('asset-isin').value = '';
    document.getElementById('asset-ticker').value = '';
    document.getElementById('asset-quota-pct').value = '';
    const btn = document.getElementById('btn-save-etf');
    if (btn) btn.innerText = 'Salva ETF';
    const btnCancel = document.getElementById('btn-cancel-etf-edit');
    if (btnCancel) btnCancel.style.display = 'none';
}

function modificaETF(index) {
    const etf = (dbRadice.configurazioneTarget.etfs || [])[index];
    if (!etf) return;
    document.getElementById('asset-edit-index').value = index;
    document.getElementById('asset-nome').value = etf.nome;
    document.getElementById('asset-isin').value = etf.isin || '';
    document.getElementById('asset-ticker').value = etf.ticker || '';
    document.getElementById('asset-quota-pct').value = etf.quotaPct || '';
    const btn = document.getElementById('btn-save-etf');
    if (btn) btn.innerText = 'Aggiorna ETF';
    const btnCancel = document.getElementById('btn-cancel-etf-edit');
    if (btnCancel) btnCancel.style.display = 'inline-block';
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function eliminaETF(index) {
    if (confirm("Eliminare questo ETF dalla configurazione? Le misurazioni già salvate restano nello storico.")) {
        dbRadice.configurazioneTarget.etfs.splice(index, 1);
        salvaNelLocalStorage();
        renderizzaTutto();
    }
}

// ---------- Monitoraggio rebalancing ----------

function renderizzaRebalancingTab() {
    const etfs = dbRadice.configurazioneTarget.etfs || [];
    const tbody = document.getElementById('table-assets-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    const ultimo = ultimoMeseMisurato();
    const valori = {};
    etfs.forEach(e => {
        valori[e.id] = (ultimo && ultimo.etfValori && ultimo.etfValori[e.id] !== undefined) ? ultimo.etfValori[e.id] : 0;
    });
    const valoreTotale = Object.values(valori).reduce((a, v) => a + v, 0);

    const sommaQuote = etfs.reduce((a, e) => a + (e.quotaPct || 0), 0);
    const warningEl = document.getElementById('rebalancing-warning');
    if (warningEl) {
        if (etfs.length > 0 && Math.abs(sommaQuote - 100) > 0.5) {
            warningEl.style.display = 'block';
            warningEl.innerHTML = `⚠️ <strong>Attenzione:</strong> la somma delle quote di allocazione è <strong>${sommaQuote.toFixed(1)}%</strong> (atteso 100%). L'asset allocation potrebbe risultare sbilanciata.`;
        } else {
            warningEl.style.display = 'none';
        }
    }

    etfs.forEach((etf, idx) => {
        const quotaAttesa = etf.quotaPct || 0;
        const valoreAttuale = valori[etf.id] || 0;
        const pesoAttualePct = valoreTotale > 0 ? (valoreAttuale / valoreTotale) * 100 : 0;
        const scostamentoPp = pesoAttualePct - quotaAttesa;
        const valoreTargetEuro = valoreTotale * (quotaAttesa / 100);
        const riallocazioneEuro = valoreTargetEuro - valoreAttuale;

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>
                <strong>${escapeHtml(etf.nome)}</strong>
                <br><small class="text-muted">${escapeHtml(etf.isin || '')}${etf.ticker ? ' · ' + escapeHtml(etf.ticker) : ''}</small>
            </td>
            <td>${quotaAttesa.toFixed(1)} %</td>
            <td>${valoreAttuale.toLocaleString()} €</td>
            <td style="color: ${Math.abs(scostamentoPp) > 0.5 ? 'var(--accent-warning)' : 'var(--accent-success)'}">
                ${pesoAttualePct.toFixed(1)} %
                <small class="text-muted">(${scostamentoPp >= 0 ? '+' : ''}${scostamentoPp.toFixed(1)} p.p. vs atteso)</small>
            </td>
            <td style="font-weight:bold; color: ${riallocazioneEuro >= 0 ? 'var(--accent-success)' : 'var(--accent-danger)'}">
                ${riallocazioneEuro >= 0 ? 'Aggiungi ' : 'Riduci '}${Math.abs(Math.round(riallocazioneEuro)).toLocaleString()} €
            </td>
            <td>
                <button class="btn-secondary w-auto" style="padding:4px 8px; margin:0;" title="Allocazione geografica (popup)" onclick="apriPopupETF(${etf.id})">🌐</button>
                <button class="btn-secondary w-auto" style="padding:4px 8px; margin:0;" title="Modifica ETF" onclick="modificaETF(${idx})">✏️</button>
                <button class="btn-danger w-auto" style="padding:4px 8px; margin:0;" title="Elimina ETF" onclick="eliminaETF(${idx})">🗑️</button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    renderizzaGraficoGeografico(etfs);
    renderizzaGraficoQuotaPac(etfs);
}

function renderizzaGraficoQuotaPac(etfs) {
    const ctx = document.getElementById('chartPerformanceAssets').getContext('2d');
    if (chartPerformanceAssetsInstance) chartPerformanceAssetsInstance.destroy();

    const labels = etfs.map(e => e.nome);
    const quoteAllocazione = etfs.map(e => e.quotaPct || 0);

    chartPerformanceAssetsInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{ label: 'Quota di Allocazione (%)', data: quoteAllocazione, backgroundColor: '#3b82f6' }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: { ticks: { color: '#94a3b8' }, grid: { color: '#334155' } },
                y: { ticks: { color: '#94a3b8' }, grid: { color: '#334155' }, max: 100 }
            },
            plugins: { legend: { labels: { color: '#f8fafc' } } }
        }
    });
}

// Esposizione geografica TOTALE ponderata sulle quote di allocazione.
// Se nessun ETF è sincronizzato il grafico resta vuoto (nessun dato fittizio).
function renderizzaGraficoGeografico(etfs) {
    const ctx = document.getElementById('chartGeoBreakdown').getContext('2d');
    if (chartGeoBreakdownInstance) chartGeoBreakdownInstance.destroy();

    const aggregato = {};
    etfs.forEach(e => {
        if (!e.geo || Object.keys(e.geo).length === 0) return;
        const quota = (e.quotaPct || 0) / 100;
        Object.entries(e.geo).forEach(([paese, peso]) => {
            aggregato[paese] = (aggregato[paese] || 0) + quota * peso;
        });
    });

    const chiavi = Object.keys(aggregato);
    chartGeoBreakdownInstance = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: chiavi.length ? chiavi : ['Nessun dato — sincronizza gli ETF online'],
            datasets: [{
                data: chiavi.length ? Object.values(aggregato) : [1],
                backgroundColor: ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#06b6d4']
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: 'bottom', labels: { color: '#f8fafc' } } }
        }
    });
}


// ---------- API FMP / Yahoo: allocazione geografica ----------

function salvaApiKeyFmp() {
    const input = document.getElementById('fmp-api-key');
    dbRadice.configurazioneTarget.fmpApiKey = (input && input.value.trim()) || '';
    salvaNelLocalStorage();
    alert('Chiave API FMP salvata localmente (mai inviata altrove).');
}

// ISIN → ticker: Yahoo Finance (gratis, senza chiave) → fallback ricerca FMP con la stessa chiave API.
async function risolviTickerDaIsin(isin) {
    const yahooUrl = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(isin)}&quotesCount=5&newsCount=0`;
    try {
        const resp = await fetch(yahooUrl, { headers: { 'Accept': 'application/json' } });
        if (resp.ok) {
            const data = await resp.json();
            const quotes = (data && data.quotes) || [];
            const q = quotes.find(x => x.quoteType === 'ETF') || quotes[0];
            if (q && q.symbol) return q.symbol;
        }
    } catch (e) { /* prosegue con FMP */ }

    const chiave = dbRadice.configurazioneTarget.fmpApiKey;
    if (chiave) {
        try {
            const resp = await fetch(`https://financialmodelingprep.com/api/v3/search?query=${encodeURIComponent(isin)}&limit=5&apikey=${encodeURIComponent(chiave)}`);
            if (resp.ok) {
                const data = await resp.json();
                const simbolo = Array.isArray(data) && data[0] && data[0].symbol ? data[0].symbol : null;
                if (simbolo) return simbolo;
            }
        } catch (e) { /* nessun risultato */ }
    }

    throw new Error("Impossibile risolvere il ticker dall'ISIN. Inserisci il ticker manualmente nel campo dedicato (es. VWCE).");
}

function normalizzaPesi(data) {
    const righe = (Array.isArray(data) ? data : [])
        .map(o => ({
            paese: o.country || o.Country || 'Altro',
            peso: parseFloat(o.weight ?? o.Weight ?? o.weightPercentage ?? 0)
        }))
        .filter(r => r.peso > 0);
    if (righe.length === 0) throw new Error("Nessun dato per-paese restituito dall'API.");
    const somma = righe.reduce((a, r) => a + r.peso, 0);
    const fattore = somma > 0 ? 100 / somma : 1;
    const out = {};
    righe.forEach(r => { out[r.paese] = Math.round(r.peso * fattore * 10) / 10; });
    return out;
}

async function getAllocazionePaesi(ticker) {
    const chiave = dbRadice.configurazioneTarget.fmpApiKey;
    if (!chiave) throw new Error('Manca la chiave API FMP: inseriscila nel campo dedicato e salva.');

    const candidati = [ticker];
    if (ticker.includes('.')) {
        candidati.push(ticker.split('.')[0]);
    } else {
        ['DE', 'MI', 'AS', 'IR', 'PA'].forEach(suf => candidati.push(ticker + '.' + suf));
    }

    let ultimoErrore = null;
    for (const s of [...new Set(candidati)]) {
        try {
            const resp = await fetch(`https://financialmodelingprep.com/api/v3/etf-country-distribution/${encodeURIComponent(s)}?apikey=${encodeURIComponent(chiave)}`);
            if (!resp.ok) { ultimoErrore = new Error(`FMP errore ${resp.status} per ${s}`); continue; }
            const data = await resp.json();
            if (Array.isArray(data) && data.length > 0) return normalizzaPesi(data);
            ultimoErrore = new Error('Nessun dato country per ' + s);
        } catch (e) { ultimoErrore = e; }
    }
    throw ultimoErrore || new Error('Nessun dato disponibile.');
}

async function sincronizzaTuttiETF() {
    const etfs = (dbRadice.configurazioneTarget.etfs || []).filter(e => e.isin);
    if (etfs.length === 0) { alert("Nessun ETF con ISIN da sincronizzare."); return; }
    let ok = 0, ko = 0;
    for (const etf of etfs) {
        try {
            const ticker = await risolviTickerDaIsin(etf.isin);
            etf.ticker = ticker;
            const pesi = await getAllocazionePaesi(ticker);
            etf.geo = pesi;
            etf.geoData = new Date().toISOString().slice(0, 10);
            ok++;
        } catch (e) {
            ko++;
        }
        salvaNelLocalStorage();
    }
    renderizzaTutto();
    alert(`Sincronizzazione completata: ${ok} riusciti, ${ko} falliti.`);
}


// ---------- Popup: allocazione geografica del singolo ETF ----------

function apriPopupETF(id) {
    popupEtfId = id;
    const overlay = document.getElementById('etf-modal');
    if (!overlay) return;
    overlay.style.display = 'flex';
    renderizzaPopupETF();
}

function chiudiPopupETF() {
    const overlay = document.getElementById('etf-modal');
    if (overlay) overlay.style.display = 'none';
    popupEtfId = null;
    if (popupChartInstance) { popupChartInstance.destroy(); popupChartInstance = null; }
}

function renderizzaPopupETF() {
    const etf = (dbRadice.configurazioneTarget.etfs || []).find(e => e.id === popupEtfId);
    if (!etf) return;

    const titolo = document.getElementById('etf-modal-title');
    const status = document.getElementById('etf-modal-status');
    const tbody = document.querySelector('#etf-modal-table tbody');
    if (titolo) titolo.innerText = etf.nome + ' — Allocazione Geografica';
    if (tbody) tbody.innerHTML = '';

    if (etf.geo && Object.keys(etf.geo).length > 0) {
        if (status) status.innerText = `ISIN: ${etf.isin} · Ticker: ${etf.ticker || '—'} · Sincronizzato il ${etf.geoData || '—'}. Pesi per paese in % dell'ETF.`;
        if (tbody) Object.entries(etf.geo).forEach(([paese, peso]) => {
            const tr = document.createElement('tr');
            tr.innerHTML = `<td>${escapeHtml(paese)}</td><td>${peso.toFixed(1)} %</td>`;
            tbody.appendChild(tr);
        });
    } else {
        if (status) status.innerText = 'Non ancora sincronizzato. Clicca su "Sincronizza ora" per scaricare i pesi per paese (richiede connessione e chiave API FMP salvata).';
    }

    renderizzaPiePopup(etf);
}

function renderizzaPiePopup(etf) {
    const canvas = document.getElementById('etf-popup-chart');
    if (!canvas) return;
    if (popupChartInstance) popupChartInstance.destroy();
    const ctx = canvas.getContext('2d');
    const geo = (etf && etf.geo) ? etf.geo : {};
    const chiavi = Object.keys(geo);
    popupChartInstance = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: chiavi.length ? chiavi : ['Nessun dato'],
            datasets: [{
                data: chiavi.length ? Object.values(geo) : [1],
                backgroundColor: ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#06b6d4']
            }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: '#f8fafc' } } } }
    });
}

async function sincronizzaETFDaPopup() {
    if (popupEtfId === null) return;
    const pulsanti = document.querySelectorAll('#etf-modal button');
    const testiOriginali = [];
    pulsanti.forEach(b => { testiOriginali.push(b.innerText); b.disabled = true; b.innerText = '⏳ Sincronizzazione...'; });
    try {
        const etf = (dbRadice.configurazioneTarget.etfs || []).find(e => e.id === popupEtfId);
        if (!etf) throw new Error('ETF non trovato.');
        const ticker = await risolviTickerDaIsin(etf.isin);
        etf.ticker = ticker;
        const pesi = await getAllocazionePaesi(ticker);
        etf.geo = pesi;
        etf.geoData = new Date().toISOString().slice(0, 10);
        salvaNelLocalStorage();
        renderizzaPopupETF();
        renderizzaRebalancingTab();
    } catch (e) {
        alert('Sincronizzazione fallita: ' + e.message);
    } finally {
        pulsanti.forEach((b, i) => { b.disabled = false; b.innerText = testiOriginali[i]; });
    }
}


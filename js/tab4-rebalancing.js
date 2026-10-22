// ===== TAB 4: ASSET & REBALANCING (v1.5.0) =====
// Architettura: gli ETF si configurano UNA volta (nome + ISIN + quota di versamento
// mensile in €). Il peso target deriva dalle quote mensili (es. 50€ su 200€/mese = 25%).
// Il valore corrente si misura a ogni misurazione nella pagina 5 e vive nell'archivio
// dedicato dbRadice.misurazioniEtf, completamente SEPARATO dallo storico pagine 1-3.
// La pagina 4 è slegata dalle altre: i pesi si calcolano SOLO sugli ETF attivi.
// L'allocazione geografica proviene dall'API FMP (etf-country-distribution),
// senza fallback benchmark: se non sincronizzata i dati restano vuoti.

let chartGeoBreakdownInstance = null;
let chartPerformanceAssetsInstance = null;
let popupChartInstance = null;
let popupEtfId = null;
let chartPerformanceEtfInstance = null;

// ---------- Configurazione ETF: salva / modifica / elimina ----------

function salvaETF() {
    const nome = document.getElementById('asset-nome').value.trim();
    const isin = document.getElementById('asset-isin').value.trim().toUpperCase();
    const quotaMensile = parseFloat(document.getElementById('asset-quota-mensile').value) || 0;
    const ticker = document.getElementById('asset-ticker').value.trim();

    if (!nome) { alert("Inserisci il nome dell'ETF."); return; }
    if (!isin) { alert("Inserisci l'ISIN dell'ETF (necessario per la sincronizzazione geografica)."); return; }
    if (quotaMensile < 0) { alert("La quota di versamento mensile non può essere negativa."); return; }

    const etfs = dbRadice.configurazioneTarget.etfs || [];
    const editIdx = parseInt(document.getElementById('asset-edit-index').value);

    if (editIdx >= 0 && etfs[editIdx]) {
        const prec = etfs[editIdx];
        etfs[editIdx] = { ...prec, nome, isin, quotaMensile, ticker: ticker || prec.ticker };
        if (prec.isin !== isin) {
            // ISIN cambiato: i dati geografici sincronizzati non valgono più
            etfs[editIdx].geo = null;
            etfs[editIdx].geoData = undefined;
            etfs[editIdx].ticker = ticker || undefined;
        }
    } else {
        etfs.push({ id: Date.now(), nome, isin, quotaMensile, ticker: ticker || undefined, attivo: true, geo: null });
    }

    salvaNelLocalStorage();
    annullaModificaETF();
    renderizzaTutto();
}

function annullaModificaETF() {
    document.getElementById('asset-edit-index').value = "-1";
    document.getElementById('asset-nome').value = '';
    document.getElementById('asset-isin').value = '';
    document.getElementById('asset-ticker').value = '';
    document.getElementById('asset-quota-mensile').value = '';
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
    document.getElementById('asset-quota-mensile').value = etf.quotaMensile || '';
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

function toggleETF(index) {
    const etfs = dbRadice.configurazioneTarget.etfs || [];
    if (!etfs[index]) return;
    etfs[index].attivo = !etfs[index].attivo;
    salvaNelLocalStorage();
    renderizzaTutto();
}

function salvaSogliaScostamento() {
    const input = document.getElementById('soglia-scostamento-etf');
    const val = input ? parseFloat(input.value) : NaN;
    dbRadice.configurazioneTarget.sogliaScostamentoEtf = (!isNaN(val) && val >= 0) ? val : 10;
    salvaNelLocalStorage();
    renderizzaRebalancingTab();
}

function etfAttivi() {
    return (dbRadice.configurazioneTarget.etfs || []).filter(e => e.attivo);
}

// Valori correnti degli ETF (ultima misurazione dalla pagina 5, inclusi gli inattivi: restano visibili)
function valoriCorrentiETF() {
    const ultimo = ultimaMisurazioneEtf();
    const valori = {};
    (dbRadice.configurazioneTarget.etfs || []).forEach(e => {
        valori[e.id] = (ultimo && ultimo.etfValori && ultimo.etfValori[e.id] !== undefined) ? ultimo.etfValori[e.id] : 0;
    });
    return valori;
}

// Peso target % derivato dalle quote mensili degli ETF ATTIVI (somma = 100%)
function pesiTargetETF(etfs) {
    const somma = etfs.reduce((a, e) => a + (e.quotaMensile || 0), 0);
    const mappa = {};
    etfs.forEach(e => {
        mappa[e.id] = somma > 0 ? ((e.quotaMensile || 0) / somma) * 100 : 0;
    });
    return mappa;
}

// ---------- Monitoraggio rebalancing ----------

function renderizzaRebalancingTab() {
    const tbody = document.getElementById('table-assets-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    const inputSoglia = document.getElementById('soglia-scostamento-etf');
    if (inputSoglia && (inputSoglia.value === '' || inputSoglia.value === null)) inputSoglia.value = dbRadice.configurazioneTarget.sogliaScostamentoEtf;

    const etfs = dbRadice.configurazioneTarget.etfs || [];
    const attivi = etfAttivi();
    const valori = valoriCorrentiETF();
    const pesiTarget = pesiTargetETF(attivi);

    // Capitale investito = SOLO il valore degli ETF attivi (pagina slegata dalle altre)
    const totaleInvestito = attivi.reduce((a, e) => a + (valori[e.id] || 0), 0);

    const soglia = dbRadice.configurazioneTarget.sogliaScostamentoEtf;

    etfs.forEach((etf) => {
        const attivo = !!etf.attivo;
        const pesoTarget = attivo ? (pesiTarget[etf.id] || 0) : 0;
        const valoreAttuale = valori[etf.id] || 0;
        const pesoAttualePct = (attivo && totaleInvestito > 0) ? (valoreAttuale / totaleInvestito) * 100 : 0;
        const diffPp = pesoAttualePct - pesoTarget;
        // Soglia RELATIVA al singolo ETF (NON al portafoglio): la banda è la soglia %
        // applicata al TARGET dell'ETF. Es. target 10%, soglia 20% → banda ±2 p.p. →
        // su un portafoglio di 10000€ l'ETF (target 1000€) deve restare tra 800€ e 1200€.
        const bandaPp = (soglia / 100) * pesoTarget;
        const inSoglia = Math.abs(diffPp) <= bandaPp;
        // Se non c'è ancora nessuna misurazione (totale 0) nessun ETF è realmente fuori
        // banda: il warning di allocazione è stato rimosso (lo scostamento è già visibile
        // nella colonna dedicata della tabella).

        // Freccia di stato accanto al peso attuale (▲ sopra, ▼ sotto, = in target entro ±2 p.p.)
        let freccia = '=';
        let colFreccia = 'var(--text-muted)';
        if (diffPp > 2) { freccia = '▲'; colFreccia = 'var(--accent-success)'; }
        else if (diffPp < -2) { freccia = '▼'; colFreccia = 'var(--accent-danger)'; }

        // Scostamento in colonna: deviazione in € dal target + % RELATIVA al target del
        // singolo ETF (coerente con la soglia relativa di warning), non p.p. assoluti.
        let testoScostamento = '—';
        if (totaleInvestito === 0) {
            testoScostamento = '<span class="text-muted" title="Nessuna misurazione: inserisci i valori nella pagina 5">—</span>';
        } else {
            const colScostamento = inSoglia ? 'var(--accent-success)' : 'var(--accent-warning)';
            const targetEuro = (pesoTarget / 100) * totaleInvestito;
            const diffEuro = valoreAttuale - targetEuro;
            if (targetEuro > 0) {
                const relPct = (diffEuro / targetEuro) * 100;
                testoScostamento =
                    `<span style="color:${colScostamento};font-weight:600;">${diffEuro >= 0 ? '+' : ''}${diffEuro.toLocaleString()} €</span>` +
                    `<span style="color:${colScostamento};">&nbsp;(${relPct >= 0 ? '+' : ''}${relPct.toFixed(1)}% vs target)</span>` +
                    (inSoglia ? '' : ' ⚠️');
            } else if (valoreAttuale > 0) {
                // Target 0% ma posizione aperta: la % relativa non è definita, resta la deviazione in p.p.
                testoScostamento = `<span style="color:${colScostamento};">${diffPp >= 0 ? '+' : ''}${diffPp.toFixed(1)} p.p.</span> ⚠️`;
            }
            // Caso target 0% e nessuna posizione: resta "—"
        }

        // Valore in SOLA LETTURA: arriva dall'ultima misurazione della pagina 5
        // (misurazioniEtf). Per modificarlo bisogna salvare una nuova
        // misurazione in "ETF - Inserimenti" (pagina 5), mai direttamente qui.
        const tdValore = `${valoreAttuale.toLocaleString()} €`;

        const tr = document.createElement('tr');
        tr.className = attivo ? '' : 'etf-row-inactive';
        tr.innerHTML = `
            <td>
                <strong>${escapeHtml(etf.nome)}</strong>
                <br><small class="text-muted">${escapeHtml(etf.isin || '')}${etf.ticker ? ' · ' + escapeHtml(etf.ticker) : ''}</small>
                ${attivo ? '' : '<br><small class="text-muted">escluso dalla valutazione</small>'}
            </td>
            <td>${(etf.quotaMensile || 0).toLocaleString()} €</td>
            <td>${attivo ? pesoTarget.toFixed(1) + ' %' : '—'}</td>
            <td>${tdValore}</td>
            <td>${attivo ? `<span style="font-weight:bold; color: ${colFreccia};">${freccia}</span> ${pesoAttualePct.toFixed(1)} %` : '—'}</td>
            <td>${attivo ? testoScostamento : '—'}</td>
            <td>
                <span class="toggle-switch ${attivo ? 'toggle-active' : 'toggle-inactive'}" onclick="toggleETF(${etfs.indexOf(etf)})">${attivo ? 'Attivo' : 'Inattivo'}</span>
                <button class="btn-secondary w-auto" style="padding:4px 8px; margin:0;" title="Allocazione geografica (popup)" onclick="apriPopupETF(${etf.id})">🌐</button>
                <button class="btn-secondary w-auto" style="padding:4px 8px; margin:0;" title="Modifica ETF" onclick="modificaETF(${etfs.indexOf(etf)})">✏️</button>
                <button class="btn-danger w-auto" style="padding:4px 8px; margin:0;" title="Elimina ETF" onclick="eliminaETF(${etfs.indexOf(etf)})">🗑️</button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    // ---------- Riga riepilogativa in coda all'elenco asset ----------
    // Patrimonio = somma dei valori correnti degli ETF attivi; versato = capitale
    // complessivamente versato (cumulato dalla pagina 5); rendimento da patrimonio/versato.
    const totaleQuotaMensile = attivi.reduce((a, e) => a + (e.quotaMensile || 0), 0);
    let totaleVersato = 0;
    attivi.forEach(e => {
        const serie = versamentiCumulatiETF(e.id);
        if (serie.length > 0) totaleVersato += serie[serie.length - 1].versato;
    });
    const rendimentoEuro = totaleVersato > 0 ? totaleInvestito - totaleVersato : null;
    const rendimentoPct = (rendimentoEuro !== null && totaleVersato > 0) ? ((totaleInvestito / totaleVersato) - 1) * 100 : null;

    const trTot = document.createElement('tr');
    trTot.className = 'tr-totale';
    trTot.innerHTML = `
        <td><strong>TOTALE ETF ATTIVI</strong><br><small class="text-muted">patrimonio e versato cumulati dagli ETF attivi</small></td>
        <td><strong>${totaleQuotaMensile.toLocaleString()} €</strong><br><small class="text-muted">al mese</small></td>
        <td>100 %</td>
        <td><strong>${totaleInvestito.toLocaleString()} €</strong></td>
        <td>100 %</td>
        <td>${rendimentoPct !== null
            ? `<strong style="color:${rendimentoEuro >= 0 ? 'var(--accent-success)' : 'var(--accent-danger)'};">${rendimentoEuro >= 0 ? '+' : ''}${rendimentoEuro.toLocaleString()} €</strong>&nbsp;<span style="color:${rendimentoEuro >= 0 ? 'var(--accent-success)' : 'var(--accent-danger)'};font-weight:600;">(${rendimentoPct >= 0 ? '+' : ''}${rendimentoPct.toFixed(2)}%)</span><br>`
            : '<span class="text-muted">—</span>'}</td>
        <td></td>
    `;
    tbody.appendChild(trTot);

    renderizzaGraficoGeografico(attivi);
    renderizzaGraficoQuotaPac(attivi, valori, totaleInvestito, pesiTarget);
    renderizzaPerformanceETF();
}

// Ribilanciamento SOLO-ACQUISTI (nessuna vendita): trova il capitale minimo da
// aggiungere per riportare ogni ETF attivo al peso target.
// T* = max(V_i / w_i); aggiunta_i = w_i * T* - V_i (>= 0; il più sovraponderato ha 0).
function calcolaRibilanciamento() {
    const resultEl = document.getElementById('rebalancing-result');
    if (!resultEl) return;

    const attivi = etfAttivi().filter(e => (e.quotaMensile || 0) > 0);
    if (attivi.length === 0) {
        resultEl.className = 'banner-alert banner-warning';
        resultEl.style.display = 'block';
        resultEl.innerHTML = '⚠️ Nessun ETF attivo con quota di versamento mensile > 0: impossibile calcolare il ribilanciamento.';
        return;
    }

    const valori = valoriCorrentiETF();
    const totaleCorrente = attivi.reduce((a, e) => a + (valori[e.id] || 0), 0);
    if (totaleCorrente <= 0) {
        resultEl.className = 'banner-alert banner-warning';
        resultEl.style.display = 'block';
        resultEl.innerHTML = '⚠️ Nessuna misurazione disponibile per gli ETF attivi: inserisci i valori correnti nella pagina 5 (ETF - Inserimenti) prima di calcolare il ribilanciamento.';
        return;
    }

    const sommaQuote = attivi.reduce((a, e) => a + (e.quotaMensile || 0), 0);
    let T = 0;
    attivi.forEach(e => {
        const w = (e.quotaMensile || 0) / sommaQuote;
        const V = valori[e.id] || 0;
        if (w > 0 && V / w > T) T = V / w;
    });

    const piano = attivi.map(e => {
        const w = (e.quotaMensile || 0) / sommaQuote;
        const V = valori[e.id] || 0;
        const aggiungi = Math.max(0, w * T - V);
        const nuovoValore = V + aggiungi;
        const nuovoPeso = T > 0 ? (nuovoValore / T) * 100 : 0;
        return { nome: e.nome, V, w, aggiungi, nuovoValore, nuovoPeso };
    });

    const totaleDaVersare = piano.reduce((a, p) => a + p.aggiungi, 0);

    let html = `<strong>⚖️ Piano di ribilanciamento (solo acquisti, nessuna vendita):</strong> versa complessivamente <strong>${totaleDaVersare.toLocaleString()} €</strong> per portare il portafoglio ETF da <strong>${totaleCorrente.toLocaleString()} €</strong> a <strong>${T.toLocaleString()} €</strong>, riportando ogni ETF al suo peso target.<br><br>`;
    piano.forEach(p => {
        const pesoCorrentePct = totaleCorrente > 0 ? (p.V / totaleCorrente) * 100 : 0;
        if (p.aggiungi > 0) {
            html += `➤ <strong>${escapeHtml(p.nome)}</strong>: versa <strong>${p.aggiungi.toLocaleString()} €</strong> (peso da ${pesoCorrentePct.toFixed(1)}% a ${p.nuovoPeso.toFixed(1)}%)<br>`;
        } else {
            html += `➤ <strong>${escapeHtml(p.nome)}</strong>: <strong>nessuna aggiunta</strong> (vincolo: è l'ETF più sovraponderato; peso ${pesoCorrentePct.toFixed(1)}%)<br>`;
        }
    });

    const esclusi = etfAttivi().filter(e => (e.quotaMensile || 0) <= 0);
    if (esclusi.length > 0) {
        html += `<br><small class="text-muted">Esclusi dal calcolo perché senza quota mensile (non ribilanciabili senza vendite): ${esclusi.map(e => escapeHtml(e.nome)).join(', ')}.</small>`;
    }

    resultEl.className = 'banner-alert banner-info';
    resultEl.style.display = 'block';
    resultEl.innerHTML = html;
}

// Il "Valore Attuale" della tabella è SOLO in lettura: proviene dall'ultima
// misurazione salvata nella pagina 5 (misurazioniEtf). Le modifiche si
// fanno esclusivamente in "ETF - Inserimenti", quindi qui non c'è più un input.

// ---------- Performance ETF: rendimento al netto del PAC ----------

// Serie mensile cumulativa di un ETF: { data, valore (null se non misurato), versato (cumulato) }
function versamentiCumulatiETF(etfId) {
    const mesi = [...(dbRadice.misurazioniEtf || [])].sort((a, b) => new Date(a.data) - new Date(b.data));
    const serie = [];
    let cumulato = 0;
    mesi.forEach(m => {
        cumulato += (m.etfVersamenti && m.etfVersamenti[etfId]) ? m.etfVersamenti[etfId] : 0;
        serie.push({
            data: m.data,
            valore: (m.etfValori && m.etfValori[etfId] !== undefined) ? m.etfValori[etfId] : null,
            versato: cumulato
        });
    });
    return serie;
}

function datiPerformancePerETF() {
    const dati = {};
    (dbRadice.configurazioneTarget.etfs || []).forEach(etf => {
        const serie = versamentiCumulatiETF(etf.id);
        const ultimoPunto = serie.length > 0 ? serie[serie.length - 1] : null;
        const valoreAttuale = (ultimoPunto && ultimoPunto.valore !== null) ? ultimoPunto.valore : 0;
        const versatoTot = ultimoPunto ? ultimoPunto.versato : 0;
        const rendimento = versatoTot > 0 ? (valoreAttuale - versatoTot) : null;
        const rendimentoPct = rendimento !== null && versatoTot > 0 ? (rendimento / versatoTot) * 100 : null;
        dati[etf.id] = { serie, valoreAttuale, versatoTot, rendimento, rendimentoPct };
    });
    return dati;
}

function renderizzaPerformanceETF() {
    const tbody = document.getElementById('table-performance-etf-body');
    if (!tbody) return;

    const etfs = dbRadice.configurazioneTarget.etfs || [];
    const dati = datiPerformancePerETF();
    tbody.innerHTML = '';

    etfs.forEach(etf => {
        const d = dati[etf.id];
        const tr = document.createElement('tr');
        tr.className = etf.attivo ? '' : 'etf-row-inactive';
        tr.innerHTML = `
            <td><strong>${escapeHtml(etf.nome)}</strong> ${etf.attivo ? '' : '<small class="text-muted">(inattivo)</small>'}</td>
            <td>${d.versatoTot.toLocaleString()} €</td>
            <td>${d.valoreAttuale.toLocaleString()} €</td>
            <td style="font-weight:bold; color: ${d.rendimento !== null ? (d.rendimento >= 0 ? 'var(--accent-success)' : 'var(--accent-danger)') : 'var(--text-muted)'};">${d.rendimento !== null ? (d.rendimento >= 0 ? '+' : '') + d.rendimento.toLocaleString() + ' €' : '—'}</td>
            <td style="color: ${d.rendimentoPct !== null ? (d.rendimentoPct >= 0 ? 'var(--accent-success)' : 'var(--accent-danger)') : 'var(--text-muted)'};">${d.rendimentoPct !== null ? (d.rendimentoPct >= 0 ? '+' : '') + d.rendimentoPct.toFixed(2) + ' %' : '—'}</td>
        `;
        tbody.appendChild(tr);
    });

    const select = document.getElementById('select-etf-performance');
    if (select) {
        const precedente = select.value;
        select.innerHTML = '';
        etfs.forEach(etf => {
            const opt = document.createElement('option');
            opt.value = etf.id;
            opt.innerText = etf.nome;
            select.appendChild(opt);
        });
        if (precedente && dati[precedente]) select.value = precedente;
    }
    renderizzaGraficoPerformanceETF(select ? select.value : null, dati);
}

function selezionaEtfPerformance() {
    const select = document.getElementById('select-etf-performance');
    if (!select) return;
    renderizzaGraficoPerformanceETF(select.value, datiPerformancePerETF());
}

function renderizzaGraficoPerformanceETF(etfId, dati) {
    const canvas = document.getElementById('chartPerformanceEtf');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (chartPerformanceEtfInstance) chartPerformanceEtfInstance.destroy();
    chartPerformanceEtfInstance = null;

    const d = (etfId && dati[etfId]) ? dati[etfId] : null;
    if (!d || d.serie.length === 0) {
        chartPerformanceEtfInstance = new Chart(ctx, {
            type: 'line',
            data: { labels: ['Inserisci almeno una misurazione nella pagina 5 (ETF - Inserimenti)'], datasets: [{ label: 'Dati insufficienti', data: [0] }] },
            options: { responsive: true, maintainAspectRatio: false, ...ZOOM_PAN_OPTIONS }
        });
        return;
    }

    const labels = d.serie.map(p => p.data);
    const valori = d.serie.map(p => p.valore);
    const versati = d.serie.map(p => p.versato);
    const rendimenti = d.serie.map(p => p.valore !== null ? p.valore - p.versato : null);

    chartPerformanceEtfInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                { label: 'Valore di mercato (€)', data: valori, borderColor: '#3b82f6', tension: 0.2, fill: false },
                { label: 'Capitale versato cumulato (€)', data: versati, borderColor: '#f59e0b', tension: 0.2, fill: false },
                { label: 'Rendimento (€)', data: rendimenti, borderColor: '#10b981', tension: 0.2, fill: false }
            ]
        },
        options: { responsive: true, maintainAspectRatio: false, ...ZOOM_PAN_OPTIONS }
    });
}

function renderizzaGraficoQuotaPac(attivi, valori, totaleInvestito, pesiTarget) {
    const ctx = document.getElementById('chartPerformanceAssets').getContext('2d');
    if (chartPerformanceAssetsInstance) chartPerformanceAssetsInstance.destroy();

    const labels = attivi.map(e => e.nome);
    const pesoTargetData = attivi.map(e => pesiTarget[e.id] || 0);
    const pesoAttualeData = attivi.map(e => totaleInvestito > 0 ? ((valori[e.id] || 0) / totaleInvestito) * 100 : 0);

    chartPerformanceAssetsInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                { label: 'Peso Target (%)', data: pesoTargetData, backgroundColor: '#3b82f6' },
                { label: 'Peso Attuale (%)', data: pesoAttualeData, backgroundColor: '#10b981' }
            ]
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

// Esposizione geografica TOTALE ponderata sui pesi target (da quote mensili).
// Se nessun ETF è sincronizzato il grafico resta vuoto (nessun dato fittizio).
function renderizzaGraficoGeografico(attivi) {
    const ctx = document.getElementById('chartGeoBreakdown').getContext('2d');
    if (chartGeoBreakdownInstance) chartGeoBreakdownInstance.destroy();

    const pesiTarget = pesiTargetETF(attivi);
    const aggregato = {};
    attivi.forEach(e => {
        if (!e.geo || Object.keys(e.geo).length === 0) return;
        const quota = (pesiTarget[e.id] || 0) / 100;
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

// ISIN → ticker. Nel browser NON si può chiamare Yahoo Finance direttamente (a origine diversa
// da finance.yahoo.com Yahoo NON invia Access-Control-Allow-Origin → il browser blocca), quindi
// la ricerca viene instradata attraverso una lista di proxy CORS pubblici e gratuiti, provati
// in rotazione con timeout: appena uno restituisce un simbolo ci si ferma. Ultimo fallback:
// /search di FMP (solo se è salvata una chiave API).
async function risolviTickerDaIsin(isin) {
    isin = String(isin || '').trim().toUpperCase();
    if (!isin) throw new Error("ISIN mancante.");

    // Preferisce i risultati ETF; altrimenti usa il primo simbolo valido trovato.
    const estraiSymbol = (data) => {
        const quotes = (data && data.quotes) || [];
        const q = quotes.find(x => x.quoteType === 'ETF') || quotes[0];
        return (q && q.symbol) ? q.symbol : null;
    };

    const yahooUrl = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(isin)}&quotesCount=5&newsCount=0`;

    // Proxy che passano il JSON di Yahoo così com'è.
    const rawProxies = [
        (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
        (u) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}`,
        (u) => `https://api.cors.lol/?url=${encodeURIComponent(u)}`,
        (u) => `https://corsproxy.org/?url=${encodeURIComponent(u)}`
    ];
    // Proxy che restituiscono un wrapper { contents: "<json di Yahoo>" }. Richiedono l'header
    // Origin, che il browser invia automaticamente alle richieste cross-origin.
    const wrapperProxies = [
        (u) => `https://api.allorigins.win/get?url=${encodeURIComponent(u)}`,
        (u) => `https://whateverorigin.org/get?url=${encodeURIComponent(u)}`
    ];

    const fetchConTimeout = async (url, ms) => {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), ms);
        try { return await fetch(url, { signal: ctrl.signal }); }
        finally { clearTimeout(t); }
    };
    const tenta = async (fn) => {
        try { return await fn(); } catch (e) { return null; }
    };
    const bodyJson = async (resp) => {
        if (!resp || !resp.ok) return null;
        const text = await tenta(() => resp.text());
        if (!text || !String(text).trim().startsWith('{')) return null;
        return JSON.parse(text);
    };
    const normalizza = async (resp) => {
        const data = await bodyJson(resp);
        return data ? estraiSymbol(data) : null;
    };
    const normalizzaWrapper = async (resp) => {
        const wrapper = await bodyJson(resp);
        return (wrapper && wrapper.contents) ? estraiSymbol(JSON.parse(wrapper.contents)) : null;
    };

    // Rotazione sui proxy "raw", poi sui "wrapper", con limite di tempo complessivo
    // per non rallentare troppo la sincronizzazione di più ETF.
    const MAX_MS = 20000;
    const inizio = Date.now();
    for (const build of rawProxies) {
        if (Date.now() - inizio > MAX_MS) break;
        const symbol = await tenta(async () => normalizza(await fetchConTimeout(build(yahooUrl), 3000)));
        if (symbol) return symbol;
    }
    for (const build of wrapperProxies) {
        if (Date.now() - inizio > MAX_MS) break;
        const symbol = await tenta(async () => normalizzaWrapper(await fetchConTimeout(build(yahooUrl), 3000)));
        if (symbol) return symbol;
    }

    // Fallback FMP: solo se è salvata una chiave. Nota: il /search di FMP cerca per
    // simbolo/nome, non per ISIN, quindi spesso non restituisce nulla: è un ultimo tentativo.
    const chiave = dbRadice.configurazioneTarget.fmpApiKey;
    if (chiave) {
        const symbol = await tenta(async () => {
            const resp = await fetch(`https://financialmodelingprep.com/api/v3/search?query=${encodeURIComponent(isin)}&limit=5&apikey=${encodeURIComponent(chiave)}`);
            if (!resp.ok) return null;
            const data = await resp.json();
            return (Array.isArray(data) && data[0] && data[0].symbol) ? data[0].symbol : null;
        });
        if (symbol) return symbol;
    }

    throw new Error("Impossibile risolvere il ticker dall'ISIN tramite i servizi gratuiti (temporaneamente instabili). Inserisci il ticker manualmente nel campo dedicato (es. EXUS.L) e salva l'ETF prima di sincronizzare.");
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
    let ok = 0;
    const falliti = [];
    for (const etf of etfs) {
        try {
            // Priorità al ticker inserito manualmente: non va risolto dall'ISIN.
            let ticker = etf.ticker;
            if (!ticker) ticker = await risolviTickerDaIsin(etf.isin);
            etf.ticker = ticker;
            const pesi = await getAllocazionePaesi(ticker);
            etf.geo = pesi;
            etf.geoData = new Date().toISOString().slice(0, 10);
            ok++;
        } catch (e) {
            falliti.push(etf.nome);
        }
        salvaNelLocalStorage();
    }
    renderizzaTutto();
    let msg = `Sincronizzazione completata: ${ok} riusciti, ${falliti.length} falliti.`;
    if (falliti.length > 0) {
        msg += '\n\nFalliti: ' + falliti.join(', ') +
            '\nSuggerimento: per questi ETF inserisci il ticker nel campo "Ticker (per API, se noto)" (es. VWCE), salva e riprova.';
    }
    alert(msg);
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
        // Priorità al ticker manuale già salvato (es. VWCE); la risoluzione da ISIN è il fallback.
        let ticker = etf.ticker;
        if (!ticker) ticker = await risolviTickerDaIsin(etf.isin);
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


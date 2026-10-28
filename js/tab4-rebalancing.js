// ===== TAB 4: ASSET & REBALANCING (v1.5.0) =====
// Architettura: gli ETF si configurano UNA volta (nome + ISIN + quota di versamento
// mensile in €). Il peso target deriva dalle quote mensili (es. 50€ su 200€/mese = 25%).
// Il valore corrente si misura a ogni misurazione nella pagina 5 e vive nell'archivio
// dedicato dbRadice.misurazioniEtf, completamente SEPARATO dallo storico pagine 1-3.
// La pagina 4 è slegata dalle altre: i pesi si calcolano SOLO sugli ETF attivi.
// L'allocazione geografica proviene dal profilo pubblico justETF (tabella "Countries"),
// senza fallback benchmark: se non sincronizzata i dati restano vuoti.

let chartGeoBreakdownInstance = null;
let chartGeoCountriesInstance = null;
let chartEtfGeoTortaInstance = null;
let chartPerformanceAssetsInstance = null;
let chartPesoTargetPieInstance = null;
let chartPesoAttualePieInstance = null;
let popupChartInstance = null;
let popupEtfId = null;
let chartPerformanceEtfInstance = null;

// ---------- Configurazione ETF: salva / modifica / elimina ----------

function salvaETF() {
    const nome = document.getElementById('asset-nome').value.trim();
    const isin = document.getElementById('asset-isin').value.trim().toUpperCase();
    const quotaMensile = parseFloat(document.getElementById('asset-quota-mensile').value) || 0;

    if (!nome) { alert("Inserisci il nome dell'ETF."); return; }
    if (!isin) { alert("Inserisci l'ISIN dell'ETF (necessario per la sincronizzazione geografica)."); return; }
    if (quotaMensile < 0) { alert("La quota di versamento mensile non può essere negativa."); return; }

    const etfs = dbRadice.configurazioneTarget.etfs || [];
    const editIdx = parseInt(document.getElementById('asset-edit-index').value);

    if (editIdx >= 0 && etfs[editIdx]) {
        const prec = etfs[editIdx];
        // Il ticker non è più modificabile dal form: si conserva quello già risolto, e si
        // azzera solo se cambia l'ISIN (il simbolo precedente apparterrebbe a un altro ETF).
        etfs[editIdx] = { ...prec, nome, isin, quotaMensile, ticker: prec.isin === isin ? prec.ticker : undefined };
        if (prec.isin !== isin) {
            // ISIN cambiato: i dati geografici sincronizzati non valgono più
            etfs[editIdx].geo = null;
            etfs[editIdx].geoData = undefined;
        }
    } else {
        etfs.push({ id: Date.now(), nome, isin, quotaMensile, ticker: undefined, attivo: true, geo: null });
    }

    salvaNelLocalStorage();
    annullaModificaETF();
    renderizzaTutto();
}

function annullaModificaETF() {
    document.getElementById('asset-edit-index').value = "-1";
    document.getElementById('asset-nome').value = '';
    document.getElementById('asset-isin').value = '';
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
    // Patrimonio = somma dei valori correnti degli ETF attivi. La cella dello scostamento
    // resta vuota: lo scostamento aggregato non è significativo (è già mostrato per singolo ETF).
    const totaleQuotaMensile = attivi.reduce((a, e) => a + (e.quotaMensile || 0), 0);

    const trTot = document.createElement('tr');
    trTot.className = 'tr-totale';
    trTot.innerHTML = `
        <td><strong>TOTALE ETF ATTIVI</strong><br><small class="text-muted">patrimonio cumulato dagli ETF attivi</small></td>
        <td><strong>${totaleQuotaMensile.toLocaleString()} €</strong><br><small class="text-muted">al mese</small></td>
        <td>100 %</td>
        <td><strong>${totaleInvestito.toLocaleString()} €</strong></td>
        <td>100 %</td>
        <td></td>
        <td></td>
    `;
    tbody.appendChild(trTot);

    renderizzaGraficoGeografico(attivi);
    renderizzaGraficoQuotaPac(attivi, valori, totaleInvestito, pesiTarget);
    renderizzaGraficiTortePesi(attivi, valori, totaleInvestito, pesiTarget);
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

// Serie per la performance di un ETF: { data, valore (null se non misurato), versato (TOTALE) }.
// Da v1.6.24 "Versato" in pagina 5 è il totale cumulativo versato nell'ETF: la serie NON
// somma i mesi, riporta il totale dell'ultima misurazione (propagandolo nei mesi in cui il
// campo non è stato compilato).
function versamentiCumulatiETF(etfId) {
    const mesi = [...(dbRadice.misurazioniEtf || [])].sort((a, b) => new Date(a.data) - new Date(b.data));
    const serie = [];
    let totaleVersato = 0;
    mesi.forEach(m => {
        const versatoMese = (m.etfVersamenti && m.etfVersamenti[etfId] !== undefined) ? parseFloat(m.etfVersamenti[etfId]) : NaN;
        if (!isNaN(versatoMese)) totaleVersato = versatoMese;
        serie.push({
            data: m.data,
            valore: (m.etfValori && m.etfValori[etfId] !== undefined) ? m.etfValori[etfId] : null,
            versato: totaleVersato
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
    renderizzaGraficoTortaGeoEtf(select ? select.value : null);
}

function selezionaEtfPerformance() {
    const select = document.getElementById('select-etf-performance');
    if (!select) return;
    const dati = datiPerformancePerETF();
    renderizzaGraficoPerformanceETF(select.value, dati);
    renderizzaGraficoTortaGeoEtf(select.value);
}

// Torta dell'allocazione geografica dell'ETF scelto nella tendina "ETF da visualizzare".
// Riusa lo stesso dato sincronizzato (etf.geo) del grafico d'insieme: nessuna chiamata extra.
function renderizzaGraficoTortaGeoEtf(etfId) {
    const canvas = document.getElementById('chartEtfGeoPie');
    if (!canvas) return;
    if (chartEtfGeoTortaInstance) chartEtfGeoTortaInstance.destroy();
    const ctx = canvas.getContext('2d');

    const etf = (dbRadice.configurazioneTarget.etfs || []).find(e => String(e.id) === String(etfId));
    const geo = (etf && etf.geo) ? etf.geo : {};
    const voci = Object.entries(geo).sort((a, b) => b[1] - a[1]);
    const etichette = voci.map(v => v[0]);
    const valori = voci.map(v => v[1]);

    // Se l'ETF non è ancora stato sincronizzato lo si dice esplicitamente, senza dati fittizi.
    if (etichette.length === 0) {
        chartEtfGeoTortaInstance = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: [etf ? 'Allocazione non ancora scaricata' : 'Nessun ETF selezionato'],
                datasets: [{ data: [1], backgroundColor: ['#334155'] }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { position: 'bottom', labels: { color: '#94a3b8' } } }
            }
        });
        return;
    }

    chartEtfGeoTortaInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: etichette,
            datasets: [{
                data: valori,
                backgroundColor: COLORI_GEO,
                borderColor: '#1e293b',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom', labels: { color: '#f8fafc', boxWidth: 12, font: { size: 11 } } },
                tooltip: {
                    callbacks: { label: (c) => `${c.label}: ${Number(c.parsed).toFixed(1)} %` }
                }
            }
        }
    });
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

// ---------- Torte di ripartizione del portafoglio: peso target vs peso attuale ----------
// Ogni ETF ha lo stesso colore nei due grafici (indice nella lista degli attivi), così il
// confronto è immediato. Se non esiste ancora una misurazione (totale 0) la torta del peso
// attuale lo dice esplicitamente, senza disegnare fette fittizie.
const COLORI_TORTE_PESI = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6',
    '#f97316', '#06b6d4', '#ef4444', '#84cc16', '#a855f7', '#eab308',
    '#0ea5e9', '#22c55e', '#d946ef', '#fb7185', '#facc15', '#64748b'];

function coloreTortaPesi(index) {
    return COLORI_TORTE_PESI[index % COLORI_TORTE_PESI.length];
}

// Le torte sono popolate in % (peso target) oppure in € (peso attuale): il tooltip deve
// sempre mostrare la QUOTA PERCENTUALE, quindi si rapporta la fetta al totale del dataset
// invece di usare il valore grezzo (che nell'attuale sarebbe l'importo in euro).
function percentualeFetta(c) {
    const dati = (c.dataset && Array.isArray(c.dataset.data)) ? c.dataset.data
        : ((c.chart && c.chart.data && c.chart.data.datasets && c.chart.data.datasets[0])
            ? c.chart.data.datasets[0].data : []);
    const totale = dati.reduce((a, v) => a + (Number(v) || 0), 0);
    return totale > 0 ? (Number(c.parsed) / totale) * 100 : 0;
}

function opzioniTortaPesi(senzaDati) {
    return {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { position: 'bottom', labels: { color: '#f8fafc', boxWidth: 12, font: { size: 11 } } },
            tooltip: {
                callbacks: {
                    label: (c) => senzaDati ? c.label : `${c.label}: ${percentualeFetta(c).toFixed(1)} %`
                }
            }
        }
    };
}

function renderizzaGraficiTortePesi(attivi, valori, totaleInvestito, pesiTarget) {
    const canvasTarget = document.getElementById('chartPesoTargetPie');
    const canvasAttuale = document.getElementById('chartPesoAttualePie');
    if (!canvasTarget || !canvasAttuale) return;
    if (chartPesoTargetPieInstance) chartPesoTargetPieInstance.destroy();
    if (chartPesoAttualePieInstance) chartPesoAttualePieInstance.destroy();

    // Etichette/colori condivisi: la fetta dello stesso ETF ha lo stesso colore in entrambe le torte.
    const etichette = attivi.map(e => e.nome);
    const colori = attivi.map((e, i) => coloreTortaPesi(i));

    // Torta del PESO TARGET: deriva dalle quote mensili, quindi esiste anche senza misurazioni.
    const senzaDatiTarget = etichette.length === 0;
    chartPesoTargetPieInstance = new Chart(canvasTarget.getContext('2d'), {
        type: 'pie',
        data: {
            labels: senzaDatiTarget ? ['Nessun ETF attivo configurato'] : etichette,
            datasets: [{
                data: senzaDatiTarget ? [1] : attivi.map(e => pesiTarget[e.id] || 0),
                backgroundColor: senzaDatiTarget ? ['#334155'] : colori,
                borderColor: '#1e293b',
                borderWidth: 1
            }]
        },
        options: opzioniTortaPesi(senzaDatiTarget)
    });

    // Torta del PESO ATTUALE: richiede l'ultima misurazione della pagina 5.
    const senzaDatiAttuale = etichette.length === 0 || totaleInvestito <= 0;
    const messaggioAttuale = etichette.length === 0
        ? 'Nessun ETF attivo configurato'
        : 'Nessuna misurazione — inserisci i valori nella pagina 5';
    chartPesoAttualePieInstance = new Chart(canvasAttuale.getContext('2d'), {
        type: 'pie',
        data: {
            labels: senzaDatiAttuale ? [messaggioAttuale] : etichette,
            datasets: [{
                data: senzaDatiAttuale ? [1] : attivi.map(e => valori[e.id] || 0),
                backgroundColor: senzaDatiAttuale ? ['#334155'] : colori,
                borderColor: '#1e293b',
                borderWidth: 1
            }]
        },
        options: opzioniTortaPesi(senzaDatiAttuale)
    });
}

// ---------- Macro-regioni geografiche ----------
// justETF restituisce i singoli paesi (e una voce "Other" che accorpa il resto). Per la vista
// d'insieme i paesi vengono raggruppati in macro-aree confrontabili tra portafogli diversi.
const MACRO_REGIONI = {
    'Nord America': ['United States', 'United States of America', 'USA', 'Canada'],
    'Europa': ['Germany', 'France', 'Netherlands', 'Switzerland', 'Spain', 'Italy', 'Sweden',
        'Denmark', 'Norway', 'Finland', 'Belgium', 'Austria', 'Ireland', 'Portugal', 'Poland',
        'Greece', 'Luxembourg', 'Czech Republic', 'Hungary', 'Romania', 'Estonia', 'Latvia',
        'Lithuania', 'Slovenia', 'Croatia', 'Iceland', 'Turkey', 'Malta', 'Cyprus', 'Slovakia',
        'Bulgaria', 'Russia'],
    'Regno Unito': ['United Kingdom', 'UK', 'Great Britain', 'Jersey', 'Guernsey', 'Isle of Man'],
    'Asia': ['Japan', 'South Korea', 'Korea', 'Taiwan', 'India', 'Indonesia', 'Thailand',
        'Malaysia', 'Singapore', 'Philippines', 'Vietnam', 'Hong Kong', 'Pakistan',
        'Bangladesh', 'Sri Lanka', 'Macao', 'Macau', 'Cambodia', 'Mongolia', 'Kazakhstan'],
    'Cina': ['China', 'Chinese mainland', 'PRC'],
    'Sud America': ['Brazil', 'Chile', 'Colombia', 'Peru', 'Argentina', 'Mexico', 'Uruguay',
        'Ecuador', 'Venezuela', 'Panama', 'Costa Rica', 'Cayman Islands', 'Bermuda',
        'British Virgin Islands', 'Bahamas', 'Dominican Republic', 'Jamaica', 'Guatemala',
        'El Salvador', 'Honduras', 'Paraguay', 'Bolivia', 'Trinidad and Tobago'],
    'Oceania': ['Australia', 'New Zealand'],
    'Africa': ['South Africa', 'Egypt', 'Morocco', 'Nigeria', 'Kenya', 'Ghana', 'Tunisia',
        'Mauritius', 'Zambia', 'Tanzania', 'Uganda', 'Ivory Coast', 'Senegal', 'Botswana',
        'Namibia', 'Zimbabwe', 'Angola', 'Mozambique', 'Ethiopia', 'Algeria'],
    'Medio Oriente': ['Saudi Arabia', 'United Arab Emirates', 'Israel', 'Qatar', 'Kuwait',
        'Bahrain', 'Oman', 'Jordan', 'Lebanon', 'Iraq', 'Iran']
};

// Paese/voce → macro-regione. Restituisce null per "Other" e per voci non mappate.
function macroRegione(paese) {
    const nome = String(paese || '').trim();
    if (!nome) return null;
    if (/^(other|others|altro|altri)$/i.test(nome)) return null;
    for (const [regione, paesi] of Object.entries(MACRO_REGIONI)) {
        if (paesi.some(p => p.toLowerCase() === nome.toLowerCase())) return regione;
    }
    return null;
}

// Aggrega { paese: % } in { macro-regione: % }.
// La voce "Other" (paesi oltre i primi 4 mostrati da justETF) viene ridistribuita in
// proporzione alle regioni già note: le somme restano 100% e il grafico non "perde" peso.
// Se "Other" è il 100% del dato (nessun paese noto) viene mostrato come voce a sé.
function aggregaMacroRegioni(geo) {
    const perRegione = {};
    let altroPeso = 0;
    let altroNonMappato = 0;
    Object.entries(geo || {}).forEach(([paese, peso]) => {
        const regione = macroRegione(paese);
        if (regione) perRegione[regione] = (perRegione[regione] || 0) + peso;
        else if (/^(other|others|altro|altri)$/i.test(paese.trim())) altroPeso += peso;
        else altroNonMappato += peso;
    });

    const noto = Object.values(perRegione).reduce((a, v) => a + v, 0);
    const daRidistribuire = altroPeso + altroNonMappato;

    if (noto > 0) {
        // Ridistribuzione proporzionale dei pesi non attribuiti (arrotondata a 1 decimale)
        Object.keys(perRegione).forEach(r => {
            perRegione[r] = perRegione[r] + (perRegione[r] / noto) * daRidistribuire;
            perRegione[r] = Math.round(perRegione[r] * 10) / 10;
        });
    } else if (daRidistribuire > 0) {
        perRegione['Altro / non specificato'] = Math.round(daRidistribuire * 10) / 10;
    }

    // Ordina dalla macro-regione più esposta alla meno esposta
    return Object.fromEntries(Object.entries(perRegione).sort((a, b) => b[1] - a[1]));
}


// Palette condivisa dai grafici geografici (stessa regione = stesso colore ovunque).
const COLORI_GEO = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6',
    '#f97316', '#06b6d4', '#ef4444', '#84cc16', '#a855f7', '#eab308'];

// Esposizione geografica TOTALE ponderata sui pesi target (da quote mensili).
// Mostra le MACRO-REGIONI (Nord America, Europa, Asia, ...) così il portafoglio è leggibile
// a colpo d'occhio; l'aggiornamento ai singoli paesi è nel grafico affiancato.
function renderizzaGraficoGeografico(attivi) {
    const ctx = document.getElementById('chartGeoBreakdown').getContext('2d');
    if (chartGeoBreakdownInstance) chartGeoBreakdownInstance.destroy();

    // 1) Esposizione al singolo paese, ponderata sul peso target di ogni ETF
    const pesiTarget = pesiTargetETF(attivi);
    const perPaese = {};
    attivi.forEach(e => {
        if (!e.geo || Object.keys(e.geo).length === 0) return;
        const quota = (pesiTarget[e.id] || 0) / 100;
        Object.entries(e.geo).forEach(([paese, peso]) => {
            perPaese[paese] = (perPaese[paese] || 0) + quota * peso;
        });
    });

    // 2) Aggregazione in macro-regioni
    const macro = aggregaMacroRegioni(perPaese);
    const chiaviMacro = Object.keys(macro);

    chartGeoBreakdownInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: chiaviMacro.length ? chiaviMacro : ['Nessun dato — sincronizza gli ETF'],
            datasets: [{
                data: chiaviMacro.length ? Object.values(macro) : [1],
                backgroundColor: chiaviMacro.length ? COLORI_GEO : ['#334155'],
                borderColor: '#1e293b',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom', labels: { color: '#f8fafc' } },
                tooltip: {
                    callbacks: {
                        label: (c) => chiaviMacro.length ? `${c.label}: ${Number(c.parsed).toFixed(1)} %` : c.label
                    }
                }
            }
        }
    });

    renderizzaGraficoGeoPerPaese(perPaese);
}

// Dettaglio per singolo paese, affiancato alle macro-regioni (stessa ponderazione).
// Le voci sotto lo 0,5% confluiscono in "Other" per non affollare la legenda.
function renderizzaGraficoGeoPerPaese(perPaese) {
    const canvas = document.getElementById('chartGeoCountries');
    if (!canvas) return;
    if (chartGeoCountriesInstance) chartGeoCountriesInstance.destroy();
    const ctx = canvas.getContext('2d');

    const voci = Object.entries(perPaese || {}).sort((a, b) => b[1] - a[1]);
    const etichette = [];
    const valori = [];
    let altri = 0;
    voci.forEach(([paese, peso]) => {
        if (peso >= 0.5) { etichette.push(paese); valori.push(peso); }
        else altri += peso;
    });
    if (altri > 0) { etichette.push('Altri paesi'); valori.push(Math.round(altri * 10) / 10); }

    chartGeoCountriesInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: etichette.length ? etichette : ['Nessun dato — sincronizza gli ETF'],
            datasets: [{
                data: valori.length ? valori : [1],
                backgroundColor: etichette.length ? COLORI_GEO : ['#334155'],
                borderColor: '#1e293b',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom', labels: { color: '#f8fafc', boxWidth: 12, font: { size: 10 } } },
                tooltip: {
                    callbacks: {
                        label: (c) => etichette.length ? `${c.label}: ${Number(c.parsed).toFixed(1)} %` : c.label
                    }
                }
            }
        }
    });
}


// ---------- Allocazione geografica (justETF) ----------

// justETF: composizione geografica dell'ETF, GRATUITA e senza chiave API.
// La tabella "Countries" è renderizzata lato server nell'HTML del profilo ETF, quindi basta
// una richiesta passando l'ISIN: il ticker non serve più. I pesi sono in % e sommano a 100,
// dove la voce "Other" accorpa tutti i paesi oltre i primi quattro mostrati da justETF.
const JUSTETF_BASE = 'https://www.justetf.com/en/etf-profile.html?isin=';

function parsePaesiJustEtf(html) {
    if (typeof html !== 'string' || html.indexOf('etf-holdings_countries_table') === -1) return [];
    const inizio = html.indexOf('etf-holdings_countries_table');
    const fine = html.indexOf('</table>', inizio);
    if (fine === -1) return [];
    const tabella = html.slice(inizio, fine);
    const righe = [...tabella.matchAll(/countries_value_name">([^<]+)<[\s\S]*?countries_value_percentage">([\d.,]+)%/g)];
    return righe.map(m => ({
        paese: m[1].trim(),
        peso: parseFloat(m[2].replace(',', '.'))
    })).filter(r => r.paese && r.peso > 0);
}

// Converte le righe justETF nell'oggetto { paese: peso } usato dai grafici.
function normalizzaPesi(righe) {
    if (!Array.isArray(righe) || righe.length === 0) {
        throw new Error("nessun dato geografico disponibile per questo ETF");
    }
    const somma = righe.reduce((a, r) => a + r.peso, 0);
    const fattore = somma > 0 ? 100 / somma : 1;
    const out = {};
    righe.forEach(r => { out[r.paese] = Math.round(r.peso * fattore * 10) / 10; });
    return out;
}

// justETF non invia Access-Control-Allow-Origin: la pagina viene letta tramite r.jina.ai, che
// restituisce il contenuto con header CORS. Serve l'HTML GREZZO (X-Respond-With: html), perché
// il formato testo converte la pagina in Markdown perdendo gli attributi con i pesi per paese.
async function scaricaPaginaJustEtf(isin) {
    const url = JUSTETF_BASE + encodeURIComponent(isin);
    const tenta = async () => {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 12000);
        try {
            const resp = await fetch(`https://r.jina.ai/${url}`, {
                signal: ctrl.signal,
                headers: { 'X-Respond-With': 'html' }
            });
            return resp && resp.ok ? await resp.text() : '';
        } catch (e) {
            return '';
        } finally { clearTimeout(t); }
    };
    let html = await tenta();
    if (html.indexOf('countries_value_name') === -1) html = await tenta();
    return html;
}

async function getAllocazionePaesi(isin) {
    if (!isin) throw new Error("ISIN mancante: senza ISIN non si può scaricare la composizione geografica");
    const html = await scaricaPaginaJustEtf(isin);
    if (html.indexOf('countries_value_name') === -1) {
        throw new Error("nessun dato geografico trovato (l'ISIN potrebbe non essere un ETF europeo, oppure il servizio non ha risposto)");
    }
    return normalizzaPesi(parsePaesiJustEtf(html));
}

async function sincronizzaTuttiETF() {
    const etfs = (dbRadice.configurazioneTarget.etfs || []).filter(e => e.isin);
    if (etfs.length === 0) { alert("Nessun ETF con ISIN da sincronizzare."); return; }

    const tasto = confermaSincronizzazione();

    let ok = 0;
    const senzaDati = [];
    const erroriApi = [];
    for (const etf of etfs) {
        try {
            // justETF lavora direttamente con l'ISIN: nessun ticker da risolvere.
            etf.geo = await getAllocazionePaesi(etf.isin);
            etf.geoData = new Date().toISOString().slice(0, 10);
            ok++;
        } catch (e) {
            const msg = (e && e.message) ? e.message : 'errore sconosciuto';
            if (/nessun dato geografico/i.test(msg)) senzaDati.push(etf.nome);
            else erroriApi.push(etf.nome);
        }
        salvaNelLocalStorage();
    }
    if (ok > 0) dbRadice.configurazioneTarget.ultimaSincroEtf = new Date().toISOString();
    renderizzaTutto();

    // Messaggio finale: niente suggerimenti tecnici, solo cosa è successo e cosa fare.
    let msg = `Sincronizzazione completata: ${ok} su ${etfs.length} ETF aggiornati.`;
    if (senzaDati.length > 0) {
        msg += `\n\nComposizione geografica non trovata per: ${senzaDati.join(', ')}.` +
            '\nControlla che l\'ISIN sia corretto: justETF copre gli ETF europei (UCITS). Se l\'ISIN è giusto, riprova più tardi.';
    }
    if (erroriApi.length > 0) {
        msg += `\n\nServizio non raggiungibile per: ${erroriApi.join(', ')}. Riprova tra qualche minuto.`;
    }
    if (tasto && ok < etfs.length) {
        msg += `\n\nRestano ${etfs.length - ok} ETF da aggiornare: ${tasto}.`;
    }
    alert(msg);
}

// Se l'ultima sincronizzazione è recente avvisa che i dati possono essere già validi: le API
// gratuite hanno un numero limitato di richieste al giorno e i proxy pubblici si "scaricano".
function confermaSincronizzazione() {
    const dataUltima = dbRadice.configurazioneTarget.ultimaSincroEtf;
    if (!dataUltima) return null;
    const giorni = Math.floor((Date.now() - new Date(dataUltima).getTime()) / 86400000);
    if (isNaN(giorni) || giorni > 7) return null;
    return `ultima sincronizzazione ${giorni === 0 ? 'oggi' : giorni + ' giorni fa'}`;
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
        if (status) status.innerText = `ISIN: ${etf.isin} · Aggiornato il ${etf.geoData || '—'} · fonte justETF. Pesi in % dell'ETF; la voce "Other" accorpa i paesi oltre i primi quattro.`;
        if (tbody) Object.entries(etf.geo).forEach(([paese, peso]) => {
            const tr = document.createElement('tr');
            tr.innerHTML = `<td>${escapeHtml(paese)}</td><td>${peso.toFixed(1)} %</td>`;
            tbody.appendChild(tr);
        });
    } else {
        if (status) status.innerText = 'Non ancora scaricato. Clicca su "Sincronizza ora" per leggere la composizione geografica dal profilo justETF dell\'ISIN. Nessuna chiave API necessaria.';
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

        // justETF usa l'ISIN: nessun ticker da cercare o digitare.
        etf.geo = await getAllocazionePaesi(etf.isin);
        etf.geoData = new Date().toISOString().slice(0, 10);
        dbRadice.configurazioneTarget.ultimaSincroEtf = new Date().toISOString();
        salvaNelLocalStorage();
        renderizzaPopupETF();
        renderizzaRebalancingTab();
    } catch (e) {
        const status = document.getElementById('etf-modal-status');
        const dettaglio = (e && e.message) ? e.message : 'errore sconosciuto';
        if (status) status.innerText = 'Sincronizzazione non riuscita: ' + dettaglio;
    } finally {
        pulsanti.forEach((b, i) => { b.disabled = false; b.innerText = testiOriginali[i]; });
    }
}


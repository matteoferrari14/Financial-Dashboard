let chartPatrimonioInstance = null;
let chartLiquiditaInstance = null;
let chartInvestimentiStoricoInstance = null;
let chartDebitiStoricoInstance = null;
let chartSovrappostoInstance = null;
let isSovrapposto = false;

// Somma dei valori di un ramo (banca/investimenti/debiti) di un mese
function totaleBranca(m, ramo) {
    return Object.values(m[ramo] || {}).reduce((a, x) => a + x, 0);
}

function inizializzaFiltriDateSeNecessario() {
    const dati = [...dbRadice.storicoMesi].sort((a,b) => new Date(a.data) - new Date(b.data));
    if (dati.length === 0) return;

    const startInput = document.getElementById('filter-date-start');
    const endInput = document.getElementById('filter-date-end');
    const startDet = document.getElementById('filter-date-start-det');
    const endDet = document.getElementById('filter-date-end-det');

    const primaData = dati[0].data;
    const ultimaData = dati[dati.length - 1].data;

    if (startInput && !startInput.value) startInput.value = primaData;
    if (endInput && !endInput.value) endInput.value = ultimaData;
    if (startDet && !startDet.value) startDet.value = primaData;
    if (endDet && !endDet.value) endDet.value = ultimaData;
}

function toggleLayoutGraficiDashboard() {
    isSovrapposto = !isSovrapposto;
    const btn = document.getElementById('btn-toggle-layout');
    if (btn) {
        btn.innerText = isSovrapposto ? "🔀 Grafici: Sovrapposti" : "🔀 Grafici: Separati";
        btn.className = isSovrapposto ? "btn-primary" : "btn-secondary";
    }
    renderizzaVisualizzazioni();
}

function aggiornaFiltriCondivisi(tipo, valore) {
    const start1 = document.getElementById('filter-date-start');
    const start2 = document.getElementById('filter-date-start-det');
    const end1 = document.getElementById('filter-date-end');
    const end2 = document.getElementById('filter-date-end-det');
    const mode1 = document.getElementById('metric-mode');
    const mode2 = document.getElementById('metric-mode-det');

    if (tipo === 'start') { if(start1) start1.value = valore; if(start2) start2.value = valore; }
    if (tipo === 'end') { if(end1) end1.value = valore; if(end2) end2.value = valore; }
    if (tipo === 'mode') { if(mode1) mode1.value = valore; if(mode2) mode2.value = valore; }

    renderizzaVisualizzazioni();
}

function resetFiltriDate() {
    const dati = [...dbRadice.storicoMesi].sort((a,b) => new Date(a.data) - new Date(b.data));
    if (dati.length > 0) {
        const primaData = dati[0].data;
        const ultimaData = dati[dati.length - 1].data;
        ['filter-date-start', 'filter-date-start-det'].forEach(id => { if(document.getElementById(id)) document.getElementById(id).value = primaData; });
        ['filter-date-end', 'filter-date-end-det'].forEach(id => { if(document.getElementById(id)) document.getElementById(id).value = ultimaData; });
    }
    if(document.getElementById('metric-mode')) document.getElementById('metric-mode').value = 'valore';
    if(document.getElementById('metric-mode-det')) document.getElementById('metric-mode-det').value = 'valore';
    renderizzaVisualizzazioni();
}

function OTTIENI_DATI_FILTRATI() {
    inizializzaFiltriDateSeNecessario();
    let dati = [...dbRadice.storicoMesi].sort((a,b) => new Date(a.data) - new Date(b.data));
    const start = document.getElementById('filter-date-start')?.value;
    const end = document.getElementById('filter-date-end')?.value;

    if (start) dati = dati.filter(d => d.data >= start);
    if (end) dati = dati.filter(d => d.data <= end);
    return dati;
}

function valutaStatoLiquidita(liquiditaAttuale) {
    const banner = document.getElementById('banner-liquidita-status');
    if (!banner) return;

    const speseTargetTotali = (dbRadice.configurazioneTarget.spese || [])
        .filter(s => s.attivo)
        .reduce((a,b) => a + (b.importo || 0), 0);
    const mesi = dbRadice.configurazioneTarget.mesiEmergenza || 6;
    const fondoTarget = speseTargetTotali * mesi;
    const sogliaExtra = dbRadice.configurazioneTarget.sogliaExtraLiquidita || 5000;
    const tettoMax = fondoTarget + sogliaExtra;

    if (liquiditaAttuale < fondoTarget) {
        const mancanti = fondoTarget - liquiditaAttuale;
        banner.className = "banner-alert banner-warning";
        banner.innerHTML = `⚠️ <strong>Fondo d'Emergenza Incompleto:</strong> La liquidità attuale (${liquiditaAttuale.toLocaleString()} €) è inferiore al bersaglio di ${mesi} mesi di spese (${fondoTarget.toLocaleString()} €). Mancano <strong>${mancanti.toLocaleString()} €</strong> per la copertura totale.`;
    } else if (liquiditaAttuale > tettoMax) {
        const surplus = liquiditaAttuale - tettoMax;
        banner.className = "banner-alert banner-info";
        banner.innerHTML = `🚀 <strong>Surplus di Liquidità Rilevato:</strong> Hai un'eccedenza di <strong>${surplus.toLocaleString()} €</strong> oltre il Fondo d'Emergenza (${fondoTarget.toLocaleString()} €). Si consiglia di allocarli negli investimenti (Tab 4).`;
    } else {
        banner.className = "banner-alert banner-success";
        banner.innerHTML = `🟢 <strong>Liquidità in Equilibrio:</strong> Fondo d'Emergenza (${fondoTarget.toLocaleString()} € per ${mesi} mesi di spese) interamente coperto.`;
    }
}

function renderizzaVisualizzazioni() {
    const dati = OTTIENI_DATI_FILTRATI();
    const container = document.getElementById('container-grafici-dashboard');
    const mode = document.getElementById('metric-mode')?.value || 'valore';
    if (!container) return;

    if (dati.length > 0) {
        const ultimo = dati[dati.length - 1];
        const totB = Object.values(ultimo.bancaDettaglio || {}).reduce((a,b)=>a+b, 0);
        const totI = investimentiTotali(ultimo);
        const totD = Object.values(ultimo.debiti || {}).reduce((a,b)=>a+b, 0);

        const elNetto = document.getElementById('kpi-netto');
        const elLiq = document.getElementById('kpi-liquidita');
        const elInv = document.getElementById('kpi-investimenti');
        const elDeb = document.getElementById('kpi-debiti');

        if (elNetto) elNetto.innerText = (totB + totI - totD).toLocaleString() + " €";
        if (elLiq) elLiq.innerText = totB.toLocaleString() + " €";
        if (elInv) elInv.innerText = totI.toLocaleString() + " €";
        if (elDeb) elDeb.innerText = totD.toLocaleString() + " €";

        valutaStatoLiquidita(totB);
    }

    let datiGrafico = [...dati];
    if (mode === 'mom' && dati.length >= 2) {
        // Variazione mensile (MoM) calcolata per singola branca,
        // così ogni grafico mostra la sua variazione (niente linee a zero).
        datiGrafico = [];
        for (let i = 1; i < dati.length; i++) {
            const mPrev = dati[i-1];
            const mCurr = dati[i];
            datiGrafico.push({
                data: mCurr.data,
                bancaDettaglio: { 'Var. Liquidità': totaleBranca(mCurr, 'bancaDettaglio') - totaleBranca(mPrev, 'bancaDettaglio') },
                investimentiDettaglio: { 'Var. Investimenti': totaleBranca(mCurr, 'investimentiDettaglio') - totaleBranca(mPrev, 'investimentiDettaglio') },
                debiti: { 'Var. Debiti': totaleBranca(mCurr, 'debiti') - totaleBranca(mPrev, 'debiti') }
            });
        }
    } else if (mode === 'delta' && dati.length >= 2) {
        // Delta rispetto al primo mese del periodo filtrato, per singola branca
        const base = dati[0];
        datiGrafico = dati.map(m => ({
            data: m.data,
            bancaDettaglio: { 'Delta Liquidità': totaleBranca(m, 'bancaDettaglio') - totaleBranca(base, 'bancaDettaglio') },
            investimentiDettaglio: { 'Delta Investimenti': totaleBranca(m, 'investimentiDettaglio') - totaleBranca(base, 'investimentiDettaglio') },
            debiti: { 'Delta Debiti': totaleBranca(m, 'debiti') - totaleBranca(base, 'debiti') }
        }));
    }

    if (isSovrapposto) {
        container.innerHTML = `
            <div class="card">
                <h2>Andamento Storico Sovrapposto (Patrimonio, Liquidità, Investimenti, Debiti)</h2>
                <div class="chart-container"><canvas id="chartSovrapposto"></canvas></div>
            </div>
        `;
        renderizzaGraficoSovrapposto(datiGrafico);
    } else {
        container.innerHTML = `
            <div class="grid-2">
                <div class="card">
                    <h2>Andamento Patrimoniale Storico</h2>
                    <div class="chart-container"><canvas id="chartPatrimonio"></canvas></div>
                </div>
                <div class="card">
                    <h2>Andamento Liquidità Storico</h2>
                    <div class="chart-container"><canvas id="chartLiquidita"></canvas></div>
                </div>
            </div>
            <div class="grid-2">
                <div class="card">
                    <h2>Andamento Investimenti Storico</h2>
                    <div class="chart-container"><canvas id="chartInvestimentiStorico"></canvas></div>
                </div>
                <div class="card">
                    <h2>Andamento Debiti Storico</h2>
                    <div class="chart-container"><canvas id="chartDebitiStorico"></canvas></div>
                </div>
            </div>
        `;
        renderizzaGraficoPatrimonio(datiGrafico);
        renderizzaGraficoLiquidita(datiGrafico);
        renderizzaGraficoInvestimentiDebitiStorico(datiGrafico);
    }

    if (typeof renderizzaGraficiDettaglio === 'function') {
        renderizzaGraficiDettaglio(dati);
    }
}

// Configurazione zoom/pan/tooltip condivisa (definita in app.js)
const zoomPanOptions = ZOOM_PAN_OPTIONS;

function renderizzaGraficoPatrimonio(dati) {
    const canvas = document.getElementById('chartPatrimonio');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (chartPatrimonioInstance) chartPatrimonioInstance.destroy();

    const mode = document.getElementById('metric-mode')?.value || 'valore';
    const etichetta = mode === 'mom' ? 'Variazione Patrimonio Netto (€/mese)'
                    : mode === 'delta' ? 'Delta Patrimonio Netto dal Periodo (€)'
                    : 'Patrimonio Netto (€)';

    const labels = dati.map(d => d.data);
    const netti = dati.map(d => totaleBranca(d, 'bancaDettaglio') + investimentiTotali(d) - totaleBranca(d, 'debiti'));

    chartPatrimonioInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{ label: etichetta, data: netti, borderColor: '#3b82f6', backgroundColor: 'rgba(59, 130, 246, 0.1)', fill: true, tension: 0.2 }]
        },
        options: { responsive: true, maintainAspectRatio: false, ...zoomPanOptions }
    });
}

function renderizzaGraficoLiquidita(dati) {
    const canvas = document.getElementById('chartLiquidita');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (chartLiquiditaInstance) chartLiquiditaInstance.destroy();

    const mode = document.getElementById('metric-mode')?.value || 'valore';
    const etichetta = mode === 'mom' ? 'Variazione Liquidità (€/mese)'
                    : mode === 'delta' ? 'Delta Liquidità dal Periodo (€)'
                    : 'Liquidità Totale (€)';

    const labels = dati.map(d => d.data);
    const liquidita = dati.map(d => totaleBranca(d, 'bancaDettaglio'));

    chartLiquiditaInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{ label: etichetta, data: liquidita, borderColor: '#10b981', backgroundColor: 'rgba(16, 185, 129, 0.1)', fill: true, tension: 0.2 }]
        },
        options: { responsive: true, maintainAspectRatio: false, ...zoomPanOptions }
    });
}

function renderizzaGraficoInvestimentiDebitiStorico(dati) {
    const ctxInv = document.getElementById('chartInvestimentiStorico')?.getContext('2d');
    const ctxDeb = document.getElementById('chartDebitiStorico')?.getContext('2d');
    
    if (chartInvestimentiStoricoInstance) chartInvestimentiStoricoInstance.destroy();
    if (chartDebitiStoricoInstance) chartDebitiStoricoInstance.destroy();

    const mode = document.getElementById('metric-mode')?.value || 'valore';
    const etichettaInv = mode === 'mom' ? 'Variazione Investimenti (€/mese)'
                       : mode === 'delta' ? 'Delta Investimenti dal Periodo (€)'
                       : 'Investimenti Totali (€)';
    const etichettaDeb = mode === 'mom' ? 'Variazione Debiti (€/mese)'
                       : mode === 'delta' ? 'Delta Debiti dal Periodo (€)'
                       : 'Debiti Totali (€)';

    const labels = dati.map(d => d.data);
    const totInv = dati.map(d => investimentiTotali(d));
    const totDeb = dati.map(d => totaleBranca(d, 'debiti'));

    if (ctxInv) {
        chartInvestimentiStoricoInstance = new Chart(ctxInv, {
            type: 'line',
            data: { labels: labels, datasets: [{ label: etichettaInv, data: totInv, borderColor: '#f59e0b', backgroundColor: 'rgba(245, 158, 11, 0.1)', fill: true, tension: 0.2 }] },
            options: { responsive: true, maintainAspectRatio: false, ...zoomPanOptions }
        });
    }

    if (ctxDeb) {
        chartDebitiStoricoInstance = new Chart(ctxDeb, {
            type: 'line',
            data: { labels: labels, datasets: [{ label: etichettaDeb, data: totDeb, borderColor: '#ef4444', backgroundColor: 'rgba(239, 68, 68, 0.1)', fill: true, tension: 0.2 }] },
            options: { responsive: true, maintainAspectRatio: false, ...zoomPanOptions }
        });
    }
}

function renderizzaGraficoSovrapposto(dati) {
    const canvas = document.getElementById('chartSovrapposto');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (chartSovrappostoInstance) chartSovrappostoInstance.destroy();

    const mode = document.getElementById('metric-mode')?.value || 'valore';
    const lblNetto = mode === 'mom' ? 'Var. Patrimonio Netto' : mode === 'delta' ? 'Delta Patrimonio Netto' : 'Patrimonio Netto';
    const lblLiq   = mode === 'mom' ? 'Var. Liquidità'      : mode === 'delta' ? 'Delta Liquidità'      : 'Liquidità';
    const lblInv   = mode === 'mom' ? 'Var. Investimenti'   : mode === 'delta' ? 'Delta Investimenti'   : 'Investimenti';
    const lblDeb   = mode === 'mom' ? 'Var. Debiti'         : mode === 'delta' ? 'Delta Debiti'         : 'Debiti';

    const labels = dati.map(d => d.data);
    const liquidita = dati.map(d => totaleBranca(d, 'bancaDettaglio'));
    const investimenti = dati.map(d => investimentiTotali(d));
    const debiti = dati.map(d => totaleBranca(d, 'debiti'));
    const netto = dati.map((d, idx) => liquidita[idx] + investimenti[idx] - debiti[idx]);

    chartSovrappostoInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                { label: lblNetto, data: netto, borderColor: '#3b82f6', tension: 0.2 },
                { label: lblLiq, data: liquidita, borderColor: '#10b981', tension: 0.2 },
                { label: lblInv, data: investimenti, borderColor: '#f59e0b', tension: 0.2 },
                { label: lblDeb, data: debiti, borderColor: '#ef4444', tension: 0.2 }
            ]
        },
        options: { responsive: true, maintainAspectRatio: false, ...zoomPanOptions }
    });
}
let chartPatrimonioInstance = null;
let chartLiquiditaInstance = null;
let chartInvestimentiStoricoInstance = null;
let chartDebitiStoricoInstance = null;
let chartSovrappostoInstance = null;
let isSovrapposto = false;

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
        const totI = Object.values(ultimo.investimentiDettaglio || {}).reduce((a,b)=>a+b, 0);
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
        let temp = [];
        for (let i = 1; i < dati.length; i++) {
            let mPrev = dati[i-1];
            let mCurr = dati[i];
            let netPrev = Object.values(mPrev.bancaDettaglio||{}).reduce((a,b)=>a+b,0) + Object.values(mPrev.investimentiDettaglio||{}).reduce((a,b)=>a+b,0) - Object.values(mPrev.debiti||{}).reduce((a,b)=>a+b,0);
            let netCurr = Object.values(mCurr.bancaDettaglio||{}).reduce((a,b)=>a+b,0) + Object.values(mCurr.investimentiDettaglio||{}).reduce((a,b)=>a+b,0) - Object.values(mCurr.debiti||{}).reduce((a,b)=>a+b,0);
            temp.push({ data: mCurr.data, bancaDettaglio: { MoM: netCurr - netPrev }, investimentiDettaglio: {}, debiti: {} });
        }
        datiGrafico = temp;
    } else if (mode === 'delta' && dati.length >= 2) {
        let base = dati[0];
        let netBase = Object.values(base.bancaDettaglio||{}).reduce((a,b)=>a+b,0) + Object.values(base.investimentiDettaglio||{}).reduce((a,b)=>a+b,0) - Object.values(base.debiti||{}).reduce((a,b)=>a+b,0);
        let temp = dati.map(m => {
            let netCurr = Object.values(m.bancaDettaglio||{}).reduce((a,b)=>a+b,0) + Object.values(m.investimentiDettaglio||{}).reduce((a,b)=>a+b,0) - Object.values(m.debiti||{}).reduce((a,b)=>a+b,0);
            return { data: m.data, bancaDettaglio: { Delta: netCurr - netBase }, investimentiDettaglio: {}, debiti: {} };
        });
        datiGrafico = temp;
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

function renderizzaGraficoPatrimonio(dati) {
    const canvas = document.getElementById('chartPatrimonio');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (chartPatrimonioInstance) chartPatrimonioInstance.destroy();

    const labels = dati.map(d => d.data);
    const netti = dati.map(d => {
        if (d.bancaDettaglio && d.bancaDettaglio.MoM !== undefined) return d.bancaDettaglio.MoM;
        if (d.bancaDettaglio && d.bancaDettaglio.Delta !== undefined) return d.bancaDettaglio.Delta;
        const b = Object.values(d.bancaDettaglio || {}).reduce((a,x)=>a+x, 0);
        const i = Object.values(d.investimentiDettaglio || {}).reduce((a,x)=>a+x, 0);
        const deb = Object.values(d.debiti || {}).reduce((a,x)=>a+x, 0);
        return b + i - deb;
    });

    chartPatrimonioInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{ label: 'Patrimonio Netto (€)', data: netti, borderColor: '#3b82f6', backgroundColor: 'rgba(59, 130, 246, 0.1)', fill: true, tension: 0.2 }]
        },
        options: { responsive: true, maintainAspectRatio: false, scales: { x: { ticks: { color: '#94a3b8' }, grid: { color: '#334155' } }, y: { ticks: { color: '#94a3b8' }, grid: { color: '#334155' } } } }
    });
}

function renderizzaGraficoLiquidita(dati) {
    const canvas = document.getElementById('chartLiquidita');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (chartLiquiditaInstance) chartLiquiditaInstance.destroy();

    const labels = dati.map(d => d.data);
    const liquidita = dati.map(d => Object.values(d.bancaDettaglio || {}).reduce((a,x)=>a+x, 0));

    chartLiquiditaInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{ label: 'Liquidità Totale (€)', data: liquidita, borderColor: '#10b981', backgroundColor: 'rgba(16, 185, 129, 0.1)', fill: true, tension: 0.2 }]
        },
        options: { responsive: true, maintainAspectRatio: false, scales: { x: { ticks: { color: '#94a3b8' }, grid: { color: '#334155' } }, y: { ticks: { color: '#94a3b8' }, grid: { color: '#334155' } } } }
    });
}

function renderizzaGraficoInvestimentiDebitiStorico(dati) {
    const ctxInv = document.getElementById('chartInvestimentiStorico')?.getContext('2d');
    const ctxDeb = document.getElementById('chartDebitiStorico')?.getContext('2d');
    
    if (chartInvestimentiStoricoInstance) chartInvestimentiStoricoInstance.destroy();
    if (chartDebitiStoricoInstance) chartDebitiStoricoInstance.destroy();

    const labels = dati.map(d => d.data);
    const totInv = dati.map(d => Object.values(d.investimentiDettaglio || {}).reduce((a,x)=>a+x, 0));
    const totDeb = dati.map(d => Object.values(d.debiti || {}).reduce((a,x)=>a+x, 0));

    if (ctxInv) {
        chartInvestimentiStoricoInstance = new Chart(ctxInv, {
            type: 'line',
            data: { labels: labels, datasets: [{ label: 'Investimenti Totali (€)', data: totInv, borderColor: '#f59e0b', backgroundColor: 'rgba(245, 158, 11, 0.1)', fill: true, tension: 0.2 }] },
            options: { responsive: true, maintainAspectRatio: false, scales: { x: { ticks: { color: '#94a3b8' }, grid: { color: '#334155' } }, y: { ticks: { color: '#94a3b8' }, grid: { color: '#334155' } } } }
        });
    }

    if (ctxDeb) {
        chartDebitiStoricoInstance = new Chart(ctxDeb, {
            type: 'line',
            data: { labels: labels, datasets: [{ label: 'Debiti Totali (€)', data: totDeb, borderColor: '#ef4444', backgroundColor: 'rgba(239, 68, 68, 0.1)', fill: true, tension: 0.2 }] },
            options: { responsive: true, maintainAspectRatio: false, scales: { x: { ticks: { color: '#94a3b8' }, grid: { color: '#334155' } }, y: { ticks: { color: '#94a3b8' }, grid: { color: '#334155' } } } }
        });
    }
}

function renderizzaGraficoSovrapposto(dati) {
    const canvas = document.getElementById('chartSovrapposto');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (chartSovrappostoInstance) chartSovrappostoInstance.destroy();

    const labels = dati.map(d => d.data);
    const liquidita = dati.map(d => Object.values(d.bancaDettaglio || {}).reduce((a,x)=>a+x, 0));
    const investimenti = dati.map(d => Object.values(d.investimentiDettaglio || {}).reduce((a,x)=>a+x, 0));
    const debiti = dati.map(d => Object.values(d.debiti || {}).reduce((a,x)=>a+x, 0));
    const netto = dati.map((d, idx) => liquidita[idx] + investimenti[idx] - debiti[idx]);

    chartSovrappostoInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                { label: 'Patrimonio Netto', data: netto, borderColor: '#3b82f6', tension: 0.2 },
                { label: 'Liquidità', data: liquidita, borderColor: '#10b981', tension: 0.2 },
                { label: 'Investimenti', data: investimenti, borderColor: '#f59e0b', tension: 0.2 },
                { label: 'Debiti', data: debiti, borderColor: '#ef4444', tension: 0.2 }
            ]
        },
        options: { responsive: true, maintainAspectRatio: false, scales: { x: { ticks: { color: '#94a3b8' }, grid: { color: '#334155' } }, y: { ticks: { color: '#94a3b8' }, grid: { color: '#334155' } } } }
    });
}
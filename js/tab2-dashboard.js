let chartPatrimonioInstance = null;
let chartAssetAllocationInstance = null;

function aggiornaFiltriCondivisi(tipo, valore) {
    const start1 = document.getElementById('filter-date-start');
    const start2 = document.getElementById('filter-date-start-det');
    const end1 = document.getElementById('filter-date-end');
    const end2 = document.getElementById('filter-date-end-det');
    const mode1 = document.getElementById('metric-mode');
    const mode2 = document.getElementById('metric-mode-det');

    if (tipo === 'start') { start1.value = valore; if(start2) start2.value = valore; }
    if (tipo === 'end') { end1.value = valore; if(end2) end2.value = valore; }
    if (tipo === 'mode') { mode1.value = valore; if(mode2) mode2.value = valore; }

    renderizzaVisualizzazioni();
}

function resetFiltriDate() {
    ['filter-date-start', 'filter-date-start-det', 'filter-date-end', 'filter-date-end-det'].forEach(id => {
        if(document.getElementById(id)) document.getElementById(id).value = '';
    });
    if(document.getElementById('metric-mode')) document.getElementById('metric-mode').value = 'valore';
    if(document.getElementById('metric-mode-det')) document.getElementById('metric-mode-det').value = 'valore';
    renderizzaVisualizzazioni();
}

function OTTIENI_DATI_FILTRATI() {
    let dati = [...dbRadice.storicoMesi].sort((a,b) => new Date(a.data) - new Date(b.data));
    const start = document.getElementById('filter-date-start').value;
    const end = document.getElementById('filter-date-end').value;

    if (start) dati = dati.filter(d => d.data >= start);
    if (end) dati = dati.filter(d => d.data <= end);
    return dati;
}

function renderizzaVisualizzazioni() {
    const dati = OTTIENI_DATI_FILTRATI();

    if (dati.length > 0) {
        const ultimo = dati[dati.length - 1];
        const totB = Object.values(ultimo.bancaDettaglio || {}).reduce((a,b)=>a+b, 0);
        const totI = Object.values(ultimo.investimentiDettaglio || {}).reduce((a,b)=>a+b, 0);
        const totD = Object.values(ultimo.debiti || {}).reduce((a,b)=>a+b, 0);

        document.getElementById('kpi-netto').innerText = (totB + totI - totD).toLocaleString() + " €";
        document.getElementById('kpi-liquidita').innerText = totB.toLocaleString() + " €";
        document.getElementById('kpi-investimenti').innerText = totI.toLocaleString() + " €";
        document.getElementById('kpi-debiti').innerText = totD.toLocaleString() + " €";

        // VERIFICA FONDO D'EMERGENZA & SURPLUS
        valutaStatoLiquidita(totB);

        renderizzaGraficoTorta(totB, totI);
    }

    renderizzaGraficoPatrimonio(dati);

    if (typeof renderizzaGraficiDettaglio === 'function') {
        renderizzaGraficiDettaglio(dati);
    }
}

function valutaStatoLiquidita(liquiditaAttuale) {
    const banner = document.getElementById('banner-liquidita-status');
    if (!banner) return;

    const speseTargetTotali = (dbRadice.configurazioneTarget.spese || []).reduce((a,b) => a + (b.importo || 0), 0);
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
        banner.innerHTML = `🚀 <strong>Surplus di Liquidità Rilevato:</strong> Hai un'eccedenza di <strong>${surplus.toLocaleString()} €</strong> oltre il Fondo d'Emergenza (${fondoTarget.toLocaleString()} €) e la soglia di tolleranza. Si consiglia di allocarli negli investimenti (Tab 4).`;
    } else {
        banner.className = "banner-alert banner-success";
        banner.innerHTML = `🟢 <strong>Liquidità in Equilibrio:</strong> Fondo d'Emergenza (${fondoTarget.toLocaleString()} € per ${mesi} mesi di spese) interamente coperto. Nessun accumulo in eccesso.`;
    }
}

function renderizzaGraficoTorta(liquidita, investimenti) {
    const ctx = document.getElementById('chartAssetAllocation').getContext('2d');
    if (chartAssetAllocationInstance) chartAssetAllocationInstance.destroy();

    chartAssetAllocationInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Liquidità', 'Investimenti'],
            datasets: [{ data: [liquidita, investimenti], backgroundColor: ['#10b981', '#f59e0b'], borderWidth: 0 }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: 'bottom', labels: { color: '#f8fafc' } } }
        }
    });
}

function renderizzaGraficoPatrimonio(dati) {
    const ctx = document.getElementById('chartPatrimonio').getContext('2d');
    if (chartPatrimonioInstance) chartPatrimonioInstance.destroy();

    const labels = dati.map(d => d.data);
    const netti = dati.map(d => {
        const b = Object.values(d.bancaDettaglio || {}).reduce((a,x)=>a+x, 0);
        const i = Object.values(d.investimentiDettaglio || {}).reduce((a,x)=>a+x, 0);
        const deb = Object.values(d.debiti || {}).reduce((a,x)=>a+x, 0);
        return b + i - deb;
    });

    chartPatrimonioInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Patrimonio Netto (€)',
                data: netti,
                borderColor: '#3b82f6',
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                fill: true,
                tension: 0.2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: { ticks: { color: '#94a3b8' }, grid: { color: '#334155' } },
                y: { ticks: { color: '#94a3b8' }, grid: { color: '#334155' } }
            },
            plugins: { legend: { labels: { color: '#f8fafc' } } }
        }
    });
}
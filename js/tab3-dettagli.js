let chartDettaglioBancheInstance = null;
let chartDettaglioInvestimentiInstance = null;
let chartDettaglioDebitiInstance = null;
let chartRisparmioInstance = null;

function renderizzaGraficiDettaglio(dati) {
    if (!dati || dati.length === 0) return;
    
    const modeSelect = document.getElementById('metric-mode-det') || document.getElementById('metric-mode');
    const mode = (modeSelect && modeSelect.value) ? modeSelect.value : 'valore';

    renderizzaGraficoDettaglioSingolo('chartDettaglioBanche', dati, 'bancaDettaglio', mode);
    renderizzaGraficoDettaglioSingolo('chartDettaglioInvestimenti', dati, 'investimentiDettaglio', mode);
    renderizzaGraficoDettaglioSingolo('chartDettaglioDebiti', dati, 'debiti', mode);
    
    renderizzaGraficoRisparmioAttesoVsEffettivo(dati);
}

function renderizzaGraficoDettaglioSingolo(canvasId, dati, ramoDati, mode) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    if (canvasId === 'chartDettaglioBanche' && chartDettaglioBancheInstance) chartDettaglioBancheInstance.destroy();
    if (canvasId === 'chartDettaglioInvestimenti' && chartDettaglioInvestimentiInstance) chartDettaglioInvestimentiInstance.destroy();
    if (canvasId === 'chartDettaglioDebiti' && chartDettaglioDebitiInstance) chartDettaglioDebitiInstance.destroy();

    const chiaviSet = new Set();
    dati.forEach(d => { if(d[ramoDati]) Object.keys(d[ramoDati]).forEach(k => chiaviSet.add(k)); });
    const chiavi = Array.from(chiaviSet);
    const colorPalette = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6'];

    if (mode === 'valore') {
        const datasets = chiavi.map((key, i) => ({
            label: key,
            data: dati.map(d => (d[ramoDati] && d[ramoDati][key] !== undefined) ? d[ramoDati][key] : 0),
            borderColor: colorPalette[i % colorPalette.length],
            tension: 0.2,
            fill: false
        }));

        const inst = new Chart(ctx, {
            type: 'line',
            data: { labels: dati.map(d => d.data), datasets: datasets },
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

        if (canvasId === 'chartDettaglioBanche') chartDettaglioBancheInstance = inst;
        if (canvasId === 'chartDettaglioInvestimenti') chartDettaglioInvestimentiInstance = inst;
        if (canvasId === 'chartDettaglioDebiti') chartDettaglioDebitiInstance = inst;

    } else {
        const valoriCalcolati = chiavi.map(key => {
            const serie = dati.map(d => (d[ramoDati] && d[ramoDati][key] !== undefined) ? d[ramoDati][key] : 0);
            if (serie.length === 0) return 0;
            if (mode === 'delta') return serie[serie.length - 1] - serie[0];
            if (mode === 'mom') {
                if (serie.length < 2) return 0;
                let sommaDiff = 0;
                for (let i = 1; i < serie.length; i++) sommaDiff += (serie[i] - serie[i-1]);
                return sommaDiff / (serie.length - 1);
            }
        });

        const inst = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: chiavi,
                datasets: [{
                    label: mode === 'mom' ? 'Media Aumento Mensile (€/mese)' : 'Delta Totale Periodo (€)',
                    data: valoriCalcolati,
                    backgroundColor: valoriCalcolati.map(v => v >= 0 ? '#10b981' : '#ef4444')
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

        if (canvasId === 'chartDettaglioBanche') chartDettaglioBancheInstance = inst;
        if (canvasId === 'chartDettaglioInvestimenti') chartDettaglioInvestimentiInstance = inst;
        if (canvasId === 'chartDettaglioDebiti') chartDettaglioDebitiInstance = inst;
    }
}

function renderizzaGraficoRisparmioAttesoVsEffettivo(dati) {
    const canvas = document.getElementById('chartRisparmioAttesoVsEffettivo');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (chartRisparmioInstance) chartRisparmioInstance.destroy();

    if (dati.length < 2) {
        chartRisparmioInstance = new Chart(ctx, {
            type: 'bar',
            data: { labels: ['Inserisci almeno 2 mesi di storico'], datasets: [{ label: 'Dati insufficienti', data: [0] }] },
            options: { responsive: true, maintainAspectRatio: false }
        });
        return;
    }

    const totRedditiTarget = (dbRadice.configurazioneTarget.redditi || []).reduce((a,b) => a + (b.importo || 0), 0);
    const totSpeseTarget = (dbRadice.configurazioneTarget.spese || []).filter(s => s.attivo).reduce((a,b) => a + (b.importo || 0), 0);
    const risparmioAttesoMensile = totRedditiTarget - totSpeseTarget;

    const etichetteMesi = dati.map(d => d.data).slice(1);
    const differenziali = [];

    for (let i = 1; i < dati.length; i++) {
        const netPrecedente = calcolaNetto(dati[i-1]);
        const netAttuale = calcolaNetto(dati[i]);
        const risparmioEffettivo = netAttuale - netPrecedente;
        const differenziale = risparmioEffettivo - risparmioAttesoMensile;
        differenziali.push(differenziale);
    }

    chartRisparmioInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: etichetteMesi,
            datasets: [{
                label: 'Differenziale Risparmio (Effettivo - Atteso €)',
                data: differenziali,
                backgroundColor: differenziali.map(v => v >= 0 ? '#10b981' : '#ef4444')
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

function calcolaNetto(d) {
    const b = Object.values(d.bancaDettaglio || {}).reduce((a,x)=>a+x, 0);
    const i = Object.values(d.investimentiDettaglio || {}).reduce((a,x)=>a+x, 0);
    const deb = Object.values(d.debiti || {}).reduce((a,x)=>a+x, 0);
    return b + i - deb;
}
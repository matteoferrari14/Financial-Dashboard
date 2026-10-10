let chartDettaglioBancheInstance = null;
let chartDettaglioInvestimentiInstance = null;
let chartDettaglioDebitiInstance = null;

function renderizzaGraficiDettaglio(dati) {
    const mode = document.getElementById('metric-mode').value;
    renderizzaGraficoDettaglioSingolo('chartDettaglioBanche', dati, 'bancaDettaglio', mode);
    renderizzaGraficoDettaglioSingolo('chartDettaglioInvestimenti', dati, 'investimentiDettaglio', mode);
    renderizzaGraficoDettaglioSingolo('chartDettaglioDebiti', dati, 'debiti', mode);
}

function renderizzaGraficoDettaglioSingolo(canvasId, dati, ramoDati, mode) {
    const ctx = document.getElementById(canvasId).getContext('2d');
    
    if (canvasId === 'chartDettaglioBanche' && chartDettaglioBancheInstance) chartDettaglioBancheInstance.destroy();
    if (canvasId === 'chartDettaglioInvestimenti' && chartDettaglioInvestimentiInstance) chartDettaglioInvestimentiInstance.destroy();
    if (canvasId === 'chartDettaglioDebiti' && chartDettaglioDebitiInstance) chartDettaglioDebitiInstance.destroy();

    const chiaviSet = new Set();
    dati.forEach(d => { Object.keys(d[ramoDati] || {}).forEach(k => chiaviSet.add(k)); });
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
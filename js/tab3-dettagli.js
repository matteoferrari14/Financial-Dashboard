let chartDettaglioBancheInstance = null;
let chartDettaglioInvestimentiInstance = null;
let chartDettaglioDebitiInstance = null;
let chartRisparmioInstance = null;

function renderizzaGraficiDettaglio(dati) {
    if (!dati || dati.length === 0) {
        ['mediaMomBanche', 'mediaMomInvestimenti', 'mediaMomDebiti', 'mediaPerformanceRisparmio'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.innerHTML = '';
        });
        return;
    }
    
    const modeSelect = document.getElementById('metric-mode-det') || document.getElementById('metric-mode');
    const mode = (modeSelect && modeSelect.value) ? modeSelect.value : 'valore';

    renderizzaGraficoDettaglioSingolo('chartDettaglioBanche', dati, 'bancaDettaglio', mode);
    renderizzaGraficoDettaglioSingolo('chartDettaglioInvestimenti', dati, 'investimentiDettaglio', mode);
    renderizzaGraficoDettaglioSingolo('chartDettaglioDebiti', dati, 'debiti', mode);
    
    // Righe riepilogo (poco appariscenti) sotto i grafici: media mese su mese di ogni voce
    renderizzaMediaVoci('mediaMomBanche', mediaMomVoci(dati, 'bancaDettaglio'), 'Media mese su mese');
    renderizzaMediaVoci('mediaMomInvestimenti', mediaMomVoci(dati, 'investimentiDettaglio'), 'Media mese su mese');
    renderizzaMediaVoci('mediaMomDebiti', mediaMomVoci(dati, 'debiti'), 'Media mese su mese');

    renderizzaGraficoRisparmioAttesoVsEffettivo(dati);
    renderizzaMediaPerformanceRisparmio(dati);
}

// Configurazione zoom/pan/tooltip condivisa (definita in app.js)
const zoomPanOptionsDet = ZOOM_PAN_OPTIONS;

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
            options: { responsive: true, maintainAspectRatio: false, ...zoomPanOptionsDet }
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
            options: { responsive: true, maintainAspectRatio: false, ...zoomPanOptionsDet }
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
            options: { responsive: true, maintainAspectRatio: false, ...zoomPanOptionsDet }
        });
        return;
    }

    const etichetteMesi = dati.map(d => d.data).slice(1);
    const differenziali = calcolaDifferenzialiRisparmio(dati);

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
        options: { responsive: true, maintainAspectRatio: false, ...zoomPanOptionsDet }
    });
}


function calcolaNetto(d) {
    const b = Object.values(d.bancaDettaglio || {}).reduce((a,x)=>a+x, 0);
    const i = investimentiTotali(d);
    const deb = Object.values(d.debiti || {}).reduce((a,x)=>a+x, 0);
    return b + i - deb;
}
// ---------- Righe riepilogo "media andamento mese su mese" (Tab 3) ----------
// Mostrano, subito sotto i grafici, la media dell'andamento mese su mese di ogni
// voce e la media delle performance nel periodo filtrato (riga poco appariscente).

// Formatta un importo con segno esplicito e due decimali (es. +1.234,56)
function formattaImporto(v) {
    const segno = v >= 0 ? '+' : '';
    return segno + v.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Media dell'andamento mese su mese di ogni voce di un ramo nel periodo filtrato.
// Es. per ogni banca/investimento/debito: media delle differenze fra misurazioni consecutive.
function mediaMomVoci(dati, ramoDati) {
    if (!dati || dati.length < 2) return [];
    const chiavi = new Set();
    dati.forEach(d => { if (d[ramoDati]) Object.keys(d[ramoDati]).forEach(k => chiavi.add(k)); });
    const risultato = [];
    chiavi.forEach(k => {
        const serie = dati.map(d => (d[ramoDati] && d[ramoDati][k] !== undefined) ? d[ramoDati][k] : 0);
        let somma = 0;
        for (let i = 1; i < serie.length; i++) somma += (serie[i] - serie[i - 1]);
        risultato.push({ nome: k, media: somma / (serie.length - 1) });
    });
    return risultato;
}

// Mostra una riga poco appariscente di medie mese su mese sotto il grafico corrispondente.
function renderizzaMediaVoci(containerId, voci, titolo) {
    const el = document.getElementById(containerId);
    if (!el) return;
    if (!voci || voci.length === 0) { el.innerHTML = ''; return; }
    const etichetta = titolo ? `<span class="media-row-label">${escapeHtml(titolo)}:</span>` : '';
    el.innerHTML = etichetta + voci.map(v => `
        <span class="media-chip">
            <span class="media-chip-nome">${escapeHtml(v.nome)}</span>
            <span class="media-chip-val ${v.media >= 0 ? 'media-pos' : 'media-neg'}">${formattaImporto(v.media)} €/mese</span>
        </span>`).join('');
}

// Differenziali mensili (Effettivo - Atteso) nel periodo filtrato, usati dal grafico
// "Differenziale Risparmio" e dalla sua riga di riepilogo.
function calcolaDifferenzialiRisparmio(dati) {
    const totRedditiTarget = (dbRadice.configurazioneTarget.redditi || []).reduce((a,b) => a + (b.importo || 0), 0);
    const totSpeseTarget = (dbRadice.configurazioneTarget.spese || []).filter(s => s.attivo).reduce((a,b) => a + (b.importo || 0), 0);
    const risparmioAttesoMensile = totRedditiTarget - totSpeseTarget;

    const differenziali = [];
    for (let i = 1; i < dati.length; i++) {
        const netPrecedente = calcolaNetto(dati[i-1]);
        const netAttuale = calcolaNetto(dati[i]);
        const risparmioEffettivo = netAttuale - netPrecedente;
        differenziali.push(risparmioEffettivo - risparmioAttesoMensile);
    }
    return differenziali;
}

// Media delle performance nel periodo filtrato (media dei differenziali mensili).
function renderizzaMediaPerformanceRisparmio(dati) {
    const el = document.getElementById('mediaPerformanceRisparmio');
    if (!el) return;
    if (!dati || dati.length < 2) { el.innerHTML = ''; return; }
    const differenziali = calcolaDifferenzialiRisparmio(dati);
    const media = differenziali.reduce((a, b) => a + b, 0) / differenziali.length;
    el.innerHTML = `
        <span class="media-row-label">Media performance periodo:</span>
        <span class="media-chip">
            <span class="media-chip-nome">Effettivo vs Atteso</span>
            <span class="media-chip-val ${media >= 0 ? 'media-pos' : 'media-neg'}">${formattaImporto(media)} €/mese</span>
        </span>`;
}
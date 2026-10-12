// Versione applicazione (da mantenere sincronizzata con la CACHE_NAME in sw.js)
const VERSIONE_APP = '1.3.4';

let dbRadice = {
    configurazioneTarget: {
        redditi: [],
        spese: [],
        investimenti: [],
        bancaNomi: [],
        investimentiNomi: [],
        debitiNomi: [],
        mesiEmergenza: 6,
        sogliaExtraLiquidita: 5000
    },
    storicoMesi: [],
    dettaglioAssets: []
};

window.onload = function() {
    caricaDaLocalStorage();
    normalizzaConfigurazione();
    renderizzaTutto();
    // Imposta la data odierna come default all'avvio (solo se non già valorizzata)
    const inputData = document.getElementById('input-data');
    if (inputData && !inputData.value) {
        inputData.value = new Date().toISOString().split('T')[0];
    }
};

function salvaNelLocalStorage() {
    localStorage.setItem('dbFinanziarioLocale', JSON.stringify(dbRadice));
}

function caricaDaLocalStorage() {
    const saved = localStorage.getItem('dbFinanziarioLocale');
    if (saved) {
        try { dbRadice = JSON.parse(saved); } catch(e) { console.error("Errore parse localStorage", e); }
    }
}

function normalizzaConfigurazione() {
    const keys = ['bancaNomi', 'investimentiNomi', 'debitiNomi', 'spese', 'redditi'];
    keys.forEach(k => {
        if (dbRadice.configurazioneTarget[k]) {
            dbRadice.configurazioneTarget[k] = dbRadice.configurazioneTarget[k].map(item => {
                if (typeof item === 'string') return { nome: item, importo: 0, attivo: true };
                if (item.attivo === undefined) item.attivo = true;
                return item;
            });
        } else {
            dbRadice.configurazioneTarget[k] = [];
        }
    });
    if (!dbRadice.dettaglioAssets) dbRadice.dettaglioAssets = [];
    if (!dbRadice.configurazioneTarget.mesiEmergenza) dbRadice.configurazioneTarget.mesiEmergenza = 6;
}

// Configurazione condivisa zoom/pan/tooltip/colori per i grafici Chart.js
const ZOOM_PAN_OPTIONS = {
    interaction: { mode: 'index', intersect: false },
    plugins: {
        tooltip: { enabled: true, mode: 'index', intersect: false },
        zoom: {
            pan: { enabled: true, mode: 'x' },
            zoom: {
                wheel: { enabled: true },
                pinch: { enabled: true },
                mode: 'x',
                scaleMode: 'y'
            }
        },
        legend: { labels: { color: '#f8fafc' } }
    },
    scales: {
        x: { ticks: { color: '#94a3b8' }, grid: { color: '#334155' } },
        y: { ticks: { color: '#94a3b8' }, grid: { color: '#334155' } }
    }
};

// Escape dei caratteri HTML per prevenire XSS/injection quando i dati
// (es. nomi importati da file) vengono iniettati nel DOM con innerHTML.
function escapeHtml(str) {
    return String(str == null ? '' : str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function switchTab(tabId) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    
    document.querySelector(`[onclick="switchTab('${tabId}')"]`).classList.add('active');
    document.getElementById(tabId).classList.add('active');

    if (tabId === 'tab-dashboard' || tabId === 'tab-dettagli') {
        renderizzaVisualizzazioni();
    } else if (tabId === 'tab-rebalancing') {
        renderizzaRebalancingTab();
    }
}

function renderizzaTutto() {
    if (typeof renderizzaConfigurazioni === 'function') renderizzaConfigurazioni();
    if (typeof renderizzaFormCampi === 'function') renderizzaFormCampi();
    if (typeof renderizzaStoricoTabella === 'function') renderizzaStoricoTabella();
    if (typeof renderizzaVisualizzazioni === 'function') renderizzaVisualizzazioni();
    if (typeof renderizzaRebalancingTab === 'function') renderizzaRebalancingTab();
}
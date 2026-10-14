// Versione applicazione (da mantenere sincronizzata con la CACHE_NAME in sw.js)
const VERSIONE_APP = '1.6.9';

let dbRadice = {
    configurazioneTarget: {
        redditi: [],
        spese: [],
        investimenti: [],
        bancaNomi: [],
        investimentiNomi: [],
        debitiNomi: [],
        etfs: [],
        fmpApiKey: '',
        mesiEmergenza: 6,
        sogliaExtraLiquidita: 5000,
        sogliaScostamentoEtf: 10
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
    const inputDataEtf = document.getElementById('input-data-etf');
    if (inputDataEtf && !inputDataEtf.value) {
        inputDataEtf.value = new Date().toISOString().split('T')[0];
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
    if (!dbRadice.configurazioneTarget.mesiEmergenza) dbRadice.configurazioneTarget.mesiEmergenza = 6;

    // Migrazione: gli investimenti salvati prima dell'introduzione della quota mensile
    // non hanno il campo importo: lo inizializziamo a 0 per renderlo sempre editabile.
    (dbRadice.configurazioneTarget.investimentiNomi || []).forEach(item => {
        if (item && item.importo === undefined) item.importo = 0;
    });

    // Chiave API FMP per l'allocazione geografica (opzionale, salvata solo in locale)
    if (typeof dbRadice.configurazioneTarget.fmpApiKey !== 'string') dbRadice.configurazioneTarget.fmpApiKey = '';

    // Soglia di scostamento % (unica per tutti gli ETF) per i warning del Tab 4
    if (typeof dbRadice.configurazioneTarget.sogliaScostamentoEtf !== 'number' || isNaN(dbRadice.configurazioneTarget.sogliaScostamentoEtf)) dbRadice.configurazioneTarget.sogliaScostamentoEtf = 10;

    // Migrazione (v1.4.0): dettaglioAssets → configurazioneTarget.etfs (ISIN + quota di allocazione %).
    // I valori correnti ora appartengono alle misurazioni mensili (storicoMesi.etfValori).
    if (!Array.isArray(dbRadice.configurazioneTarget.etfs)) {
        const vecchiAsset = Array.isArray(dbRadice.dettaglioAssets) ? dbRadice.dettaglioAssets : [];
        dbRadice.configurazioneTarget.etfs = vecchiAsset.map(a => ({
            id: (typeof a.id === 'number' && a.id) ? a.id : Date.now() + Math.floor(Math.random() * 1000),
            nome: a.nome || 'ETF',
            isin: a.isin || '',
            quotaPct: a.quotaPct || a.targetPct || 0,
            quotaMensile: 0,
            attivo: true,
            geo: null,
            ticker: a.ticker || undefined
        }));
        // Se esistono misurazioni, il vecchio "valore attuale" diventa il valore dell'ultimo mese
        if (vecchiAsset.length > 0 && Array.isArray(dbRadice.storicoMesi) && dbRadice.storicoMesi.length > 0) {
            const ultimo = [...dbRadice.storicoMesi].sort((x, y) => new Date(x.data) - new Date(y.data)).slice(-1)[0];
            if (!ultimo.etfValori) ultimo.etfValori = {};
            dbRadice.configurazioneTarget.etfs.forEach((etf, i) => {
                const vecchio = vecchiAsset[i];
                if (vecchio && (vecchio.valorePortafoglio || 0) > 0 && ultimo.etfValori[etf.id] === undefined) {
                    ultimo.etfValori[etf.id] = vecchio.valorePortafoglio;
                }
            });
        }
        dbRadice.dettaglioAssets = [];
    }
    // Normalizzazione voci ETF
    (dbRadice.configurazioneTarget.etfs || []).forEach(e => {
        if (e.quotaPct === undefined) e.quotaPct = 0;
        if (e.quotaMensile === undefined) e.quotaMensile = 0;
        if (e.attivo === undefined) e.attivo = true;
        if (e.geo === undefined) e.geo = null;
        if (e.isin === undefined) e.isin = '';
    });
}

// Configurazione condivisa tooltip/colori per i grafici Chart.js
// (zoom/pan rimossi: si filtra la serie con i filtri data delle pagine 2 e 3)
const ZOOM_PAN_OPTIONS = {
    interaction: { mode: 'index', intersect: false },
    plugins: {
        tooltip: { enabled: true, mode: 'index', intersect: false },
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

// Valori mensili degli ETF (misurazioni) — usato dal monitoraggio ETF (pagine 4-5)
function totaleETF(mese) {
    return Object.values(mese.etfValori || {}).reduce((a, v) => a + v, 0);
}
// Investimenti delle pagine 1-3 = SOLO i saldi inseriti in pagina 1 (investimentiDettaglio).
// Gli ETF (pagine 4-5) sono monitoraggio separato: NON confluiscono nei totali di pagina 1-3.
function investimentiTotali(mese) {
    return Object.values(mese.investimentiDettaglio || {}).reduce((a, v) => a + v, 0);
}
function ultimoMeseMisurato() {
    if (!Array.isArray(dbRadice.storicoMesi) || dbRadice.storicoMesi.length === 0) return null;
    return [...dbRadice.storicoMesi].sort((a, b) => new Date(a.data) - new Date(b.data)).slice(-1)[0];
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
    } else if (tabId === 'tab-etf-inserimenti') {
        if (typeof renderizzaFormEtf === 'function') renderizzaFormEtf();
        if (typeof renderizzaStoricoETF === 'function') renderizzaStoricoETF();
    }
}

function renderizzaTutto() {
    if (typeof renderizzaConfigurazioni === 'function') renderizzaConfigurazioni();
    if (typeof renderizzaFormCampi === 'function') renderizzaFormCampi();
    if (typeof renderizzaStoricoTabella === 'function') renderizzaStoricoTabella();
    if (typeof renderizzaFormEtf === 'function') renderizzaFormEtf();
    if (typeof renderizzaStoricoETF === 'function') renderizzaStoricoETF();
    if (typeof renderizzaVisualizzazioni === 'function') renderizzaVisualizzazioni();
    if (typeof renderizzaRebalancingTab === 'function') renderizzaRebalancingTab();
}
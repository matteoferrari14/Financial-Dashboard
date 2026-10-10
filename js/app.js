// DATABASE STRUTTURA LOCALE GLOBALE
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
    dettaglioAssets: [] // Per Tab 4
};

window.onload = function() {
    caricaDaLocalStorage();
    normalizzaConfigurazione();
    renderizzaTutto();
    if(document.getElementById('input-data')) {
        document.getElementById('input-data').valueAsDate = new Date();
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
    const keys = ['bancaNomi', 'investimentiNomi', 'debitiNomi'];
    keys.forEach(k => {
        if (dbRadice.configurazioneTarget[k]) {
            dbRadice.configurazioneTarget[k] = dbRadice.configurazioneTarget[k].map(item => {
                if (typeof item === 'string') return { nome: item, attivo: true };
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
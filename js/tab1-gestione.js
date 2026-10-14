// Stato della modifica inline delle voci di configurazione (spese, redditi, investimenti, ecc.)
let configEditKey = null;
let configEditIndex = -1;

// Voci di configurazione che hanno anche un importo (quota mensile) editabile
const chiaviConImporto = new Set(['redditi', 'spese', 'investimentiNomi']);

function renderizzaConfigurazioni() {
    const inputMesi = document.getElementById('config-mesi-emergenza');
    const inputSoglia = document.getElementById('config-soglia-extra');

    if (inputMesi) inputMesi.value = dbRadice.configurazioneTarget.mesiEmergenza || 6;
    if (inputSoglia) inputSoglia.value = dbRadice.configurazioneTarget.sogliaExtraLiquidita || 5000;

    const renderList = (containerId, key) => {
        const container = document.getElementById(containerId);
        if (!container) return;
        container.innerHTML = '';
        (dbRadice.configurazioneTarget[key] || []).forEach((item, index) => {
            const div = document.createElement('div');
            div.className = `config-item ${item.attivo ? '' : 'inactive'}`;

            if (configEditKey === key && configEditIndex === index) {
                // Modifica inline della voce (nome + importo per le voci con quota)
                const campoImporto = chiaviConImporto.has(key)
                    ? `<input type="number" step="0.01" id="edit-config-importo" value="${item.importo !== undefined ? item.importo : 0}" title="Importo (€)" onkeydown="if(event.key==='Enter'){salvaModificaConfigItem();}">`
                    : '';
                div.innerHTML = `
                    <div class="config-edit-form">
                        <input type="text" id="edit-config-nome" value="${escapeHtml(item.nome)}" title="Nome" onkeydown="if(event.key==='Enter'){salvaModificaConfigItem();}">
                        ${campoImporto}
                        <button class="btn-primary w-auto btn-editor" title="Salva" onclick="salvaModificaConfigItem()">✓</button>
                        <button class="btn-secondary w-auto btn-editor" title="Annulla" onclick="annullaModificaConfigItem()">✕</button>
                    </div>
                `;
            } else {
                const testoImporto = chiaviConImporto.has(key)
                    ? `: <strong>${item.importo !== undefined ? item.importo : 0} €</strong>`
                    : '';
                div.innerHTML = `
                    <span>${escapeHtml(item.nome)}${testoImporto}</span>
                    <div>
                        <span class="toggle-switch ${item.attivo ? 'toggle-active' : 'toggle-inactive'}" 
                              onclick="toggleItemActive('${key}', ${index})">
                              ${item.attivo ? 'Attivo' : 'Inattivo'}
                        </span>
                        <button style="width:auto; padding:2px 6px; margin:0 0 0 5px;" class="btn-secondary" title="Modifica" onclick="modificaConfigItem('${key}', ${index})">✏️</button>
                        <button style="width:auto; padding:2px 6px; margin:0 0 0 5px;" class="btn-danger" title="Elimina" onclick="deleteConfigItem('${key}', ${index})">✕</button>
                    </div>
                `;
            }
            container.appendChild(div);
        });
    };

    renderList('list-bancaNomi', 'bancaNomi');
    renderList('list-investimentiNomi', 'investimentiNomi');
    renderList('list-debitiNomi', 'debitiNomi');
    renderList('list-target-redditi', 'redditi');
    renderList('list-target-spese', 'spese');

    aggiornaRiepilogoBudgetPagina1();
    aggiornaFooterVersione();
}

function modificaConfigItem(key, index) {
    configEditKey = key;
    configEditIndex = index;
    renderizzaConfigurazioni();
}

function salvaModificaConfigItem() {
    if (configEditKey === null || configEditIndex < 0) return;
    const lista = dbRadice.configurazioneTarget[configEditKey];
    const item = lista && lista[configEditIndex];
    if (!item) { annullaModificaConfigItem(); return; }

    const nomeIn = document.getElementById('edit-config-nome');
    const impIn = document.getElementById('edit-config-importo');
    if (!nomeIn || !nomeIn.value.trim()) { alert("Il nome non può essere vuoto."); return; }

    item.nome = nomeIn.value.trim();
    if (chiaviConImporto.has(configEditKey) && impIn) {
        item.importo = parseFloat(impIn.value) || 0;
    }

    configEditKey = null;
    configEditIndex = -1;
    salvaNelLocalStorage();
    renderizzaConfigurazioni();
}

function annullaModificaConfigItem() {
    configEditKey = null;
    configEditIndex = -1;
    renderizzaConfigurazioni();
}

function salvaParametriEmergenza() {
    const inputMesi = document.getElementById('config-mesi-emergenza');
    const inputSoglia = document.getElementById('config-soglia-extra');
    
    if (inputMesi) dbRadice.configurazioneTarget.mesiEmergenza = parseInt(inputMesi.value) || 6;
    if (inputSoglia) dbRadice.configurazioneTarget.sogliaExtraLiquidita = parseFloat(inputSoglia.value) || 0;
    
    salvaNelLocalStorage();
    aggiornaRiepilogoBudgetPagina1();
    if (typeof renderizzaVisualizzazioni === 'function') renderizzaVisualizzazioni();
}

function aggiornaFooterVersione() {
    document.querySelectorAll('.app-footer').forEach(f => f.remove());
    document.querySelectorAll('.tab-content').forEach(tab => {
        const footer = document.createElement('div');
        footer.className = 'app-footer';
        footer.innerText = 'Personal Finance Dashboard v' + VERSIONE_APP;
        tab.appendChild(footer);
    });
}

function aggiornaRiepilogoBudgetPagina1() {
    const redditi = (dbRadice.configurazioneTarget.redditi || []).reduce((a,b) => a + (b.importo || 0), 0);
    const spese = (dbRadice.configurazioneTarget.spese || []).filter(s => s.attivo).reduce((a,b) => a + (b.importo || 0), 0);
    const risparmioAtteso = redditi - spese;
    const investimenti = (dbRadice.configurazioneTarget.investimentiNomi || []).filter(i => i.attivo).reduce((a,b) => a + (b.importo || 0), 0);
    const aumentoCashAtteso = redditi - spese - investimenti;
    const mesiEmergenza = dbRadice.configurazioneTarget.mesiEmergenza || 6;
    const fondoTarget = spese * mesiEmergenza;

    const elRedditi = document.getElementById('summary-redditi-target');
    const elSpese = document.getElementById('summary-spese-target');
    const elInvestimenti = document.getElementById('summary-investimenti-target');
    const elRisparmio = document.getElementById('summary-risparmio-atteso');
    const elAumentoCash = document.getElementById('summary-aumento-cash');
    const elFondo = document.getElementById('summary-fondo-target');

    if (elRedditi) elRedditi.innerText = redditi.toLocaleString() + " €";
    if (elSpese) elSpese.innerText = spese.toLocaleString() + " €";
    if (elInvestimenti) elInvestimenti.innerText = investimenti.toLocaleString() + " €";
    if (elRisparmio) elRisparmio.innerText = risparmioAtteso.toLocaleString() + " €";
    if (elAumentoCash) elAumentoCash.innerText = aumentoCashAtteso.toLocaleString() + " €";
    if (elFondo) elFondo.innerText = fondoTarget.toLocaleString() + " €";
}

function toggleItemActive(key, index) {
    dbRadice.configurazioneTarget[key][index].attivo = !dbRadice.configurazioneTarget[key][index].attivo;
    salvaNelLocalStorage();
    renderizzaTutto();
}

function addConfigItem(key) {
    const input = document.getElementById(`new-${key.replace('Nomi', 'Nome')}`);
    if (!input) return;
    const val = input.value.trim();
    if (val) {
        dbRadice.configurazioneTarget[key].push({ nome: val, attivo: true });
        input.value = '';
        salvaNelLocalStorage();
        renderizzaTutto();
    }
}

function deleteConfigItem(key, index) {
    if (confirm("Eliminare questa voce?")) {
        dbRadice.configurazioneTarget[key].splice(index, 1);
        // Azzera lo stato di modifica inline: eliminare una voce sposta gli indici
        // e la voce in modifica potrebbe non coincidere più con configEditIndex.
        configEditKey = null;
        configEditIndex = -1;
        salvaNelLocalStorage();
        renderizzaTutto();
    }
}

function addTargetItem(key) {
    // Il singolare non è sempre key senza l'ultima lettera (es. spese→spesa, redditi→reddito, investimentiNomi→investimento)
    const singolare = { spese: 'spesa', redditi: 'reddito', investimentiNomi: 'investimento' }[key] || key.slice(0, -1);
    const nomeIn = document.getElementById(`new-${singolare}-nome`);
    const impIn = document.getElementById(`new-${singolare}-importo`);
    if (nomeIn && impIn && nomeIn.value.trim() && impIn.value) {
        dbRadice.configurazioneTarget[key].push({ nome: nomeIn.value.trim(), importo: parseFloat(impIn.value), attivo: true });
        nomeIn.value = ''; impIn.value = '';
        salvaNelLocalStorage();
        renderizzaTutto();
    }
}

function renderizzaFormCampi() {
    const generaCampi = (containerId, key, prefix) => {
        const container = document.getElementById(containerId);
        if (!container) return;
        container.innerHTML = '';
        (dbRadice.configurazioneTarget[key] || [])
            .filter(item => item.attivo)
            .forEach(item => {
                const div = document.createElement('div');
                div.innerHTML = `
                    <label>${escapeHtml(item.nome)}</label>
                    <input type="number" step="0.01" class="input-dynamic-${prefix}" data-nome="${escapeHtml(item.nome)}" placeholder="0.00">
                `;
                container.appendChild(div);
            });
    };

    generaCampi('form-fields-banche', 'bancaNomi', 'banca');
    generaCampi('form-fields-investimenti', 'investimentiNomi', 'inv');
    generaCampi('form-fields-debiti', 'debitiNomi', 'deb');
    // I campi ETF (valore + versato) si registrano nella pagina 5 (tab5-etf-inserimenti.js)
}

function copiaUltimoMese() {
    if (!dbRadice.storicoMesi || dbRadice.storicoMesi.length === 0) { 
        alert("Nessun mese precedente disponibile."); 
        return; 
    }
    const storicoOrdinato = [...dbRadice.storicoMesi].sort((a,b) => new Date(a.data) - new Date(b.data));
    const ultimo = storicoOrdinato[storicoOrdinato.length - 1];

    const impostaValori = (prefix, sorgente) => {
        document.querySelectorAll(`.input-dynamic-${prefix}`).forEach(input => {
            const nome = input.dataset.nome;
            if (sorgente && sorgente[nome] !== undefined) input.value = sorgente[nome];
        });
    };

    impostaValori('banca', ultimo.bancaDettaglio);
    impostaValori('inv', ultimo.investimentiDettaglio);
    impostaValori('deb', ultimo.debiti);
    // I dati ETF si copiano dalla pagina 5 (copiaUltimaMisurazioneETF)
}

function salvaMese() {
    const dataInput = document.getElementById('input-data');
    if (!dataInput || !dataInput.value) { alert("Data non valida."); return; }
    const dataVal = dataInput.value;

    const raccogliValori = (prefix) => {
        const obj = {};
        document.querySelectorAll(`.input-dynamic-${prefix}`).forEach(input => {
            obj[input.dataset.nome] = parseFloat(input.value) || 0;
        });
        return obj;
    };

    const editIdx = parseInt(document.getElementById('edit-index').value);

    // Conserva i dati ETF eventualmente già registrati per questo mese (pagina 5):
    // la pagina 1 gestisce solo saldi banca/investimenti/debiti.
    let meseEsistente = null;
    let idxEsistente = -1;
    if (editIdx >= 0) {
        idxEsistente = editIdx;
        meseEsistente = dbRadice.storicoMesi[editIdx];
    } else {
        idxEsistente = dbRadice.storicoMesi.findIndex(m => m.data === dataVal);
        if (idxEsistente >= 0) meseEsistente = dbRadice.storicoMesi[idxEsistente];
    }

    const nuovoMese = {
        data: dataVal,
        bancaDettaglio: raccogliValori('banca'),
        investimentiDettaglio: raccogliValori('inv'),
        debiti: raccogliValori('deb'),
        etfValori: (meseEsistente && meseEsistente.etfValori) || {},
        etfVersamenti: (meseEsistente && meseEsistente.etfVersamenti) || {}
    };

    if (idxEsistente >= 0) {
        dbRadice.storicoMesi[idxEsistente] = nuovoMese;
    } else {
        dbRadice.storicoMesi.push(nuovoMese);
    }

    salvaNelLocalStorage();
    annullaModifica();
    renderizzaTutto();
}

function modificaMese(index) {
    const m = dbRadice.storicoMesi[index];
    document.getElementById('edit-index').value = index;
    document.getElementById('input-data').value = m.data;
    document.getElementById('form-title').innerText = "Modifica Mese: " + m.data;
    document.getElementById('btn-save-month').innerText = "Aggiorna Misurazione";
    document.getElementById('btn-cancel-edit').style.display = "inline-block";

    const impostaValori = (prefix, sorgente) => {
        document.querySelectorAll(`.input-dynamic-${prefix}`).forEach(input => {
            const nome = input.dataset.nome;
            input.value = (sorgente && sorgente[nome] !== undefined) ? sorgente[nome] : '';
        });
    };

    impostaValori('banca', m.bancaDettaglio);
    impostaValori('inv', m.investimentiDettaglio);
    impostaValori('deb', m.debiti);
    // I dati ETF si modificano dalla pagina 5 (modificaMisurazioneETF)

    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// L'inizializzazione (window.onload) è unificata in app.js
function annullaModifica() {
    document.getElementById('edit-index').value = "-1";
    document.getElementById('form-title').innerText = "Inserimento Nuovo Mese";
    document.getElementById('btn-save-month').innerText = "Salva Misurazione";
    document.getElementById('btn-cancel-edit').style.display = "none";
    
    // Reimposta la data odierna
    const inputData = document.getElementById('input-data');
    if (inputData) {
        inputData.value = new Date().toISOString().split('T')[0];
    }
    
    // Azzera solo i campi della pagina 1 (i campi ETF di pagina 5 restano intatti)
    document.querySelectorAll('#tab-gestione input[class*="input-dynamic-"]').forEach(i => i.value = '');
}

function eliminaMese(index) {
    if (confirm("Eliminare questa misurazione?")) {
        dbRadice.storicoMesi.splice(index, 1);
        salvaNelLocalStorage();
        renderizzaTutto();
    }
}

function renderizzaStoricoTabella() {
    const tbody = document.getElementById('table-storico-body');
    if (!tbody) return;
    tbody.innerHTML = '';
    
    const ordinati = [...dbRadice.storicoMesi].sort((a,b) => new Date(b.data) - new Date(a.data));
    const ordinatiCrescenti = [...dbRadice.storicoMesi].sort((a,b) => new Date(a.data) - new Date(b.data));

    const totRedditiTarget = (dbRadice.configurazioneTarget.redditi || []).reduce((a,b) => a + (b.importo || 0), 0);
    const totSpeseTarget = (dbRadice.configurazioneTarget.spese || []).filter(s => s.attivo).reduce((a,b) => a + (b.importo || 0), 0);
    const risparmioAttesoMensile = totRedditiTarget - totSpeseTarget;

    ordinati.forEach((m) => {
        const originalIndex = dbRadice.storicoMesi.indexOf(m);
        const idxCrescente = ordinatiCrescenti.indexOf(m);

        const totBanche = Object.values(m.bancaDettaglio || {}).reduce((a,b) => a+b, 0);
        const totInv = investimentiTotali(m);
        const totDeb = Object.values(m.debiti || {}).reduce((a,b) => a+b, 0);
        const netto = totBanche + totInv - totDeb;

        let deltaMoM = 0;
        let performanceVal = 0;
        if (idxCrescente > 0) {
            const mPrec = ordinatiCrescenti[idxCrescente - 1];
            const bPrec = Object.values(mPrec.bancaDettaglio || {}).reduce((a,b) => a+b, 0);
            const iPrec = Object.values(mPrec.investimentiDettaglio || {}).reduce((a,b) => a+b, 0);
            const dPrec = Object.values(mPrec.debiti || {}).reduce((a,b) => a+b, 0);
            const nettoPrec = bPrec + iPrec - dPrec;
            
            deltaMoM = netto - nettoPrec;
            performanceVal = deltaMoM - risparmioAttesoMensile;
        }

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${m.data}</strong></td>
            <td>${totBanche.toLocaleString()} €</td>
            <td>${totInv.toLocaleString()} €</td>
            <td>${totDeb.toLocaleString()} €</td>
            <td style="font-weight:bold; color: ${netto >= 0 ? 'var(--accent-success)' : 'var(--accent-danger)'}">${netto.toLocaleString()} €</td>
            <td style="color: ${deltaMoM >= 0 ? 'var(--accent-success)' : 'var(--accent-danger)'}">${idxCrescente > 0 ? (deltaMoM >= 0 ? '+' : '') + deltaMoM.toLocaleString() + ' €' : '-'}</td>
            <td style="color: ${performanceVal >= 0 ? 'var(--accent-success)' : 'var(--accent-danger)'}">${idxCrescente > 0 ? (performanceVal >= 0 ? '+' : '') + performanceVal.toLocaleString() + ' €' : '-'}</td>
            <td>
                <button class="btn-secondary w-auto" style="padding:4px 8px; margin:0;" onclick="modificaMese(${originalIndex})">✏️</button>
                <button class="btn-danger w-auto" style="padding:4px 8px; margin:0;" onclick="eliminaMese(${originalIndex})">🗑️</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function esportaFileDati() {
    const contenuto = JSON.stringify(dbRadice, null, 4);
    const blob = new Blob([contenuto], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'dati.json'; a.click();
    URL.revokeObjectURL(url);
}

function importaFileCompleto(input) {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            let fileContent = e.target.result.trim();
            const primaGraffa = fileContent.indexOf('{');
            const ultimaGraffa = fileContent.lastIndexOf('}');
            if (primaGraffa !== -1 && ultimaGraffa !== -1) {
                fileContent = fileContent.substring(primaGraffa, ultimaGraffa + 1);
            }
            const parsed = JSON.parse(fileContent);
            if (parsed.configurazioneTarget && parsed.storicoMesi) {
                dbRadice = parsed;
                normalizzaConfigurazione();
                salvaNelLocalStorage();
                renderizzaTutto();
                alert("Archivio importato con successo!");
            } else { alert("Formato file non valido."); }
        } catch(err) { alert("Errore nella lettura del file."); }
    };
    reader.readAsText(file);
}
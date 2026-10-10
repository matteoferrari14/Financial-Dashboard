function renderizzaConfigurazioni() {
    // Carica selettori parametri emergenza
    document.getElementById('config-mesi-emergenza').value = dbRadice.configurazioneTarget.mesiEmergenza || 6;
    document.getElementById('config-soglia-extra').value = dbRadice.configurazioneTarget.sogliaExtraLiquidita || 5000;

    const renderList = (containerId, key) => {
        const container = document.getElementById(containerId);
        container.innerHTML = '';
        (dbRadice.configurazioneTarget[key] || []).forEach((item, index) => {
            const div = document.createElement('div');
            div.className = `config-item ${item.attivo ? '' : 'inactive'}`;
            div.innerHTML = `
                <span>${item.nome}</span>
                <div>
                    <span class="toggle-switch ${item.attivo ? 'toggle-active' : 'toggle-inactive'}" 
                          onclick="toggleItemActive('${key}', ${index})">
                          ${item.attivo ? 'Attivo' : 'Inattivo'}
                    </span>
                    <button style="width:auto; padding:2px 6px; margin:0 0 0 5px;" class="btn-danger" onclick="deleteConfigItem('${key}', ${index})">✕</button>
                </div>
            `;
            container.appendChild(div);
        });
    };

    renderList('list-bancaNomi', 'bancaNomi');
    renderList('list-investimentiNomi', 'investimentiNomi');
    renderList('list-debitiNomi', 'debitiNomi');

    const renderTargetList = (containerId, key) => {
        const container = document.getElementById(containerId);
        container.innerHTML = '';
        (dbRadice.configurazioneTarget[key] || []).forEach((item, index) => {
            const div = document.createElement('div');
            div.className = 'config-item';
            div.innerHTML = `
                <span>${item.nome}: <strong>${item.importo} €</strong></span>
                <button style="width:auto; padding:2px 6px; margin:0;" class="btn-danger" onclick="deleteTargetItem('${key}', ${index})">✕</button>
            `;
            container.appendChild(div);
        });
    };

    renderTargetList('list-target-redditi', 'redditi');
    renderTargetList('list-target-spese', 'spese');
}

function salvaParametriEmergenza() {
    dbRadice.configurazioneTarget.mesiEmergenza = parseInt(document.getElementById('config-mesi-emergenza').value);
    dbRadice.configurazioneTarget.sogliaExtraLiquidita = parseFloat(document.getElementById('config-soglia-extra').value) || 0;
    salvaNelLocalStorage();
    renderizzaTutto();
}

function toggleItemActive(key, index) {
    dbRadice.configurazioneTarget[key][index].attivo = !dbRadice.configurazioneTarget[key][index].attivo;
    salvaNelLocalStorage();
    renderizzaTutto();
}

function addConfigItem(key) {
    const input = document.getElementById(`new-${key.replace('Nomi', 'Nome')}`);
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
        salvaNelLocalStorage();
        renderizzaTutto();
    }
}

function addTargetItem(key) {
    const nomeIn = document.getElementById(`new-${key.slice(0, -1)}-nome`);
    const impIn = document.getElementById(`new-${key.slice(0, -1)}-importo`);
    if (nomeIn.value.trim() && impIn.value) {
        dbRadice.configurazioneTarget[key].push({ nome: nomeIn.value.trim(), importo: parseFloat(impIn.value) });
        nomeIn.value = ''; impIn.value = '';
        salvaNelLocalStorage();
        renderizzaTutto();
    }
}

function deleteTargetItem(key, index) {
    dbRadice.configurazioneTarget[key].splice(index, 1);
    salvaNelLocalStorage();
    renderizzaTutto();
}

function renderizzaFormCampi() {
    const generaCampi = (containerId, key, prefix) => {
        const container = document.getElementById(containerId);
        container.innerHTML = '';
        (dbRadice.configurazioneTarget[key] || [])
            .filter(item => item.attivo)
            .forEach(item => {
                const div = document.createElement('div');
                div.innerHTML = `
                    <label>${item.nome}</label>
                    <input type="number" step="0.01" class="input-dynamic-${prefix}" data-nome="${item.nome}" placeholder="0.00">
                `;
                container.appendChild(div);
            });
    };

    generaCampi('form-fields-banche', 'bancaNomi', 'banca');
    generaCampi('form-fields-investimenti', 'investimentiNomi', 'inv');
    generaCampi('form-fields-debiti', 'debitiNomi', 'deb');
}

function copiaUltimoMese() {
    if (dbRadice.storicoMesi.length === 0) { alert("Nessun mese precedente."); return; }
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
}

function salvaMese() {
    const dataVal = document.getElementById('input-data').value;
    if (!dataVal) { alert("Data non valida."); return; }

    const raccogliValori = (prefix) => {
        const obj = {};
        document.querySelectorAll(`.input-dynamic-${prefix}`).forEach(input => {
            obj[input.dataset.nome] = parseFloat(input.value) || 0;
        });
        return obj;
    };

    const nuovoMese = {
        data: dataVal,
        bancaDettaglio: raccogliValori('banca'),
        investimentiDettaglio: raccogliValori('inv'),
        debiti: raccogliValori('deb')
    };

    const editIdx = parseInt(document.getElementById('edit-index').value);

    if (editIdx >= 0) {
        dbRadice.storicoMesi[editIdx] = nuovoMese;
    } else {
        const esistente = dbRadice.storicoMesi.findIndex(m => m.data === dataVal);
        if (esistente >= 0) dbRadice.storicoMesi[esistente] = nuovoMese;
        else dbRadice.storicoMesi.push(nuovoMese);
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

    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function annullaModifica() {
    document.getElementById('edit-index').value = "-1";
    document.getElementById('form-title').innerText = "Inserimento Nuovo Mese";
    document.getElementById('btn-save-month').innerText = "Salva Misurazione";
    document.getElementById('btn-cancel-edit').style.display = "none";
    document.getElementById('input-data').valueAsDate = new Date();
    document.querySelectorAll('input[class*="input-dynamic-"]').forEach(i => i.value = '');
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
    tbody.innerHTML = '';
    const ordinati = [...dbRadice.storicoMesi].sort((a,b) => new Date(b.data) - new Date(a.data));

    ordinati.forEach((m) => {
        const originalIndex = dbRadice.storicoMesi.indexOf(m);
        const totBanche = Object.values(m.bancaDettaglio || {}).reduce((a,b) => a+b, 0);
        const totInv = Object.values(m.investimentiDettaglio || {}).reduce((a,b) => a+b, 0);
        const totDeb = Object.values(m.debiti || {}).reduce((a,b) => a+b, 0);
        const netto = totBanche + totInv - totDeb;

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${m.data}</strong></td>
            <td>${totBanche.toLocaleString()} €</td>
            <td>${totInv.toLocaleString()} €</td>
            <td>${totDeb.toLocaleString()} €</td>
            <td style="font-weight:bold; color: ${netto >= 0 ? 'var(--accent-success)' : 'var(--accent-danger)'}">${netto.toLocaleString()} €</td>
            <td>
                <button class="btn-secondary w-auto" style="padding:4px 8px; margin:0;" onclick="modificaMese(${originalIndex})">✏️</button>
                <button class="btn-danger w-auto" style="padding:4px 8px; margin:0;" onclick="eliminaMese(${originalIndex})">🗑️</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function esportaFileDati() {
    const contenuto = "// Archivio dati privato esportato PFD\nwindow.dbFinanziarioLocale = " + JSON.stringify(dbRadice, null, 4) + ";";
    const blob = new Blob([contenuto], { type: 'application/javascript' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'dati.js'; a.click();
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
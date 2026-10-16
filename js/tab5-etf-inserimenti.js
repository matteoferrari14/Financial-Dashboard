// ===== PAGINA 5: INSERIMENTI ETF (misurazioni mensili valore + versato PAC) =====
// I valori correnti e i versamenti (PAC) di ogni ETF si registrano qui, NON nella
// pagina 1 (che gestisce solo saldi banche/investimenti/debiti). I dati vivono in un
// archivio dedicato (dbRadice.misurazioniEtf) completamente SEPARATO dallo storico
// delle pagine 1-3 (dbRadice.storicoMesi): misurare gli ETF anche in date diverse
// da quelle di pagina 1 NON crea mesi nelle pagine 1-2-3.

function renderizzaFormEtf() {
    const containerEtf = document.getElementById('form-fields-etf');
    if (!containerEtf) return;
    containerEtf.innerHTML = '';
    (dbRadice.configurazioneTarget.etfs || [])
        .filter(e => e.attivo)
        .forEach(etf => {
            const div = document.createElement('div');
            div.innerHTML = `
                <label>${escapeHtml(etf.nome)} ${etf.isin ? `<small class="text-muted">(${escapeHtml(etf.isin)})</small>` : ''}</label>
                <div class="etf-form-row">
                    <input type="number" step="0.01" min="0" class="input-dynamic-etf" data-id="${etf.id}" placeholder="Valore (€)" title="Valore di mercato corrente dell'ETF (€)">
                    <input type="number" step="0.01" min="0" class="input-dynamic-etfvers" data-id="${etf.id}" placeholder="Versato (€)" title="Quanto hai versato nell'ETF questo mese (€)">
                </div>
            `;
            containerEtf.appendChild(div);
        });
}

function copiaUltimaMisurazioneETF() {
    const ultimo = ultimaMisurazioneEtf();
    if (!ultimo) {
        alert("Nessuna misurazione precedente disponibile.");
        return;
    }
    const inputData = document.getElementById('input-data-etf');
    if (inputData) inputData.value = ultimo.data;
    document.querySelectorAll('#tab-etf-inserimenti .input-dynamic-etf').forEach(input => {
        const id = input.dataset.id;
        if (ultimo.etfValori && ultimo.etfValori[id] !== undefined) input.value = ultimo.etfValori[id];
    });
    document.querySelectorAll('#tab-etf-inserimenti .input-dynamic-etfvers').forEach(input => {
        const id = input.dataset.id;
        if (ultimo.etfVersamenti && ultimo.etfVersamenti[id] !== undefined) input.value = ultimo.etfVersamenti[id];
    });
}

function salvaMisurazioneETF() {
    const inputData = document.getElementById('input-data-etf');
    if (!inputData || !inputData.value) { alert("Data non valida."); return; }
    const dataVal = inputData.value;

    const etfValori = {};
    document.querySelectorAll('#tab-etf-inserimenti .input-dynamic-etf').forEach(input => {
        etfValori[input.dataset.id] = parseFloat(input.value) || 0;
    });
    const etfVersamenti = {};
    document.querySelectorAll('#tab-etf-inserimenti .input-dynamic-etfvers').forEach(input => {
        etfVersamenti[input.dataset.id] = parseFloat(input.value) || 0;
    });

    // Upsert nell'archivio dedicato misurazioniEtf (separato dallo storico pagine 1-3)
    if (!Array.isArray(dbRadice.misurazioniEtf)) dbRadice.misurazioniEtf = [];
    let misura = dbRadice.misurazioniEtf.find(m => m.data === dataVal);
    if (misura) {
        misura.etfValori = etfValori;
        misura.etfVersamenti = etfVersamenti;
    } else {
        dbRadice.misurazioniEtf.push({
            data: dataVal,
            etfValori: etfValori,
            etfVersamenti: etfVersamenti
        });
    }

    salvaNelLocalStorage();
    renderizzaTutto();
    alert("Misurazione ETF salvata per il " + dataVal);
}

function renderizzaStoricoETF() {
    const tbody = document.getElementById('table-storico-etf-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    const conEtf = (Array.isArray(dbRadice.misurazioniEtf) ? dbRadice.misurazioniEtf : []).filter(m => {
        const v = Object.keys(m.etfValori || {}).length;
        const p = Object.keys(m.etfVersamenti || {}).length;
        return v > 0 || p > 0;
    });
    const ordinati = [...conEtf].sort((a, b) => new Date(a.data) - new Date(b.data));

    ordinati.forEach(m => {
        const totValore = Object.values(m.etfValori || {}).reduce((a, b) => a + b, 0);
        const totVersato = Object.values(m.etfVersamenti || {}).reduce((a, b) => a + b, 0);
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${m.data}</strong></td>
            <td>${totValore.toLocaleString()} €</td>
            <td>${totVersato.toLocaleString()} €</td>
            <td>
                <button class="btn-secondary w-auto" style="padding:4px 8px; margin:0;" onclick="modificaMisurazioneETF('${m.data}')">✏️</button>
                <button class="btn-danger w-auto" style="padding:4px 8px; margin:0;" onclick="eliminaMisurazioneETF('${m.data}')">🗑️</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function modificaMisurazioneETF(data) {
    const m = (dbRadice.misurazioniEtf || []).find(x => x.data === data);
    if (!m) return;
    const inputData = document.getElementById('input-data-etf');
    if (inputData) inputData.value = data;
    document.querySelectorAll('#tab-etf-inserimenti .input-dynamic-etf').forEach(input => {
        const id = input.dataset.id;
        input.value = (m.etfValori && m.etfValori[id] !== undefined) ? m.etfValori[id] : '';
    });
    document.querySelectorAll('#tab-etf-inserimenti .input-dynamic-etfvers').forEach(input => {
        const id = input.dataset.id;
        input.value = (m.etfVersamenti && m.etfVersamenti[id] !== undefined) ? m.etfVersamenti[id] : '';
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function eliminaMisurazioneETF(data) {
    if (!confirm("Eliminare la misurazione ETF del " + data + "?")) return;
    dbRadice.misurazioniEtf = (dbRadice.misurazioniEtf || []).filter(x => x.data !== data);
    salvaNelLocalStorage();
    renderizzaTutto();
}
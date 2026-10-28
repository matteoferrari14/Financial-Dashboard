// ===== PAGINA 5: INSERIMENTI ETF (misurazioni mensili valore + versato PAC) =====
// I valori correnti e i versamenti (PAC) di ogni ETF si registrano qui, NON nella
// pagina 1 (che gestisce solo saldi banche/investimenti/debiti). I dati vivono in un
// archivio dedicato (dbRadice.misurazioniEtf) completamente SEPARATO dallo storico
// delle pagine 1-3 (dbRadice.storicoMesi): misurare gli ETF anche in date diverse
// da quelle di pagina 1 NON crea mesi nelle pagine 1-2-3.

// ---------- Versato: TOTALE cumulativo versato nell'ETF ----------
// Il campo "Versato" della pagina 5 contiene il capitale TOTALE versato nell'ETF fino a
// quella data e ogni nuova misurazione lo SOSTITUISCE (non si somma a quello precedente).
// Alla creazione di una nuova misurazione il campo viene precompilato con l'ultimo totale
// registrato + la quota mensile (PAC) configurata per quell'ETF: è l'unico calcolo
// automatico, ed è sempre modificabile se ci sono stati versamenti diversi.
// La pagina 4 legge direttamente questo totale (nessuna somma tra mesi).

// Mese (YYYY-MM) di una data di misurazione salvata come stringa YYYY-MM-DD
function chiaveMese(data) {
    return String(data || '').slice(0, 7);
}

// Totale versato registrato per l'ETF nell'ultima misurazione fino alla data indicata
// (inclusa). Restituisce 0 se non c'è ancora alcun versamento salvato.
function ultimoVersatoRegistratoETF(etfId, data) {
    const misure = (dbRadice.misurazioniEtf || [])
        .filter(m => !data || m.data <= data)
        .filter(m => m.etfVersamenti && m.etfVersamenti[etfId] !== undefined && m.etfVersamenti[etfId] !== null && m.etfVersamenti[etfId] !== '')
        .sort((a, b) => new Date(a.data) - new Date(b.data));
    if (misure.length === 0) return 0;
    return parseFloat(misure[misure.length - 1].etfVersamenti[etfId]) || 0;
}

// Valore suggerito per il campo "Versato": ultimo TOTALE registrato + quota mensile (PAC).
// Con modifica = true (misurazione esistente aperta in modifica) si mostra il totale
// salvato senza riaggiungere la quota, perché si sta correggendo quel dato.
function defaultVersatoETF(etf, data, modifica) {
    const quota = parseFloat(etf && etf.quotaMensile) || 0;
    if (modifica) {
        const esistente = (dbRadice.misurazioniEtf || []).find(m => m.data === data);
        if (esistente && esistente.etfVersamenti && esistente.etfVersamenti[etf.id] !== undefined) {
            return parseFloat(esistente.etfVersamenti[etf.id]) || 0;
        }
    }
    const totale = ultimoVersatoRegistratoETF(etf.id, data) + quota;
    return Math.round(totale * 100) / 100;
}

function mappaDefaultVersati(data, modifica) {
    const mappa = {};
    (dbRadice.configurazioneTarget.etfs || [])
        .filter(e => e.attivo)
        .forEach(etf => { mappa[etf.id] = defaultVersatoETF(etf, data, modifica); });
    return mappa;
}

// Stato del form della pagina 5: data della bozza, default applicati ai campi "Versato"
// e flag di modifica (true quando si sta correggendo una misurazione già salvata).
const statoFormEtf = { data: '', default: {}, bozza: {}, modifica: false };

function renderizzaFormEtf() {
    const containerEtf = document.getElementById('form-fields-etf');
    if (!containerEtf) return;

    // Valori in corso d'opera: se il form è già stato compilato (es. un render parziale)
    // si conservano, a meno che la data di misurazione non sia cambiata. Dopo un
    // salvataggio resetBozzaFormEtf() svuota la bozza e si riparte dai valori aggiornati.
    const inputData = document.getElementById('input-data-etf');
    const dataCorrente = inputData ? inputData.value : '';
    const stessaData = dataCorrente !== '' && dataCorrente === statoFormEtf.data;
    const bozza = stessaData ? { ...(statoFormEtf.bozza || {}) } : {};

    const ultimo = ultimaMisurazioneEtf();
    const ultimoValori = (ultimo && ultimo.etfValori) ? ultimo.etfValori : {};
    const mappaVersati = mappaDefaultVersati(dataCorrente, statoFormEtf.modifica);

    containerEtf.innerHTML = '';
    (dbRadice.configurazioneTarget.etfs || [])
        .filter(e => e.attivo)
        .forEach(etf => {
            const div = document.createElement('div');
            // Valore: si propone l'ultimo misurato (la data nuova è già impostata con
            // oggi), ma se c'è una bozza in corso prevale quella.
            const valore = bozza['v_' + etf.id] !== undefined ? bozza['v_' + etf.id]
                : (ultimoValori[etf.id] !== undefined && ultimoValori[etf.id] !== null ? ultimoValori[etf.id] : '');
            const versato = bozza['p_' + etf.id] !== undefined ? bozza['p_' + etf.id]
                : (mappaVersati[etf.id] !== undefined ? mappaVersati[etf.id] : '');
            div.innerHTML = `
                <label>${escapeHtml(etf.nome)} ${etf.isin ? `<small class="text-muted">(${escapeHtml(etf.isin)})</small>` : ''}</label>
                <div class="etf-form-row">
                    <input type="number" step="0.01" min="0" class="input-dynamic-etf" data-id="${etf.id}" value="${valore}" placeholder="Valore (€)" title="Valore di mercato corrente dell'ETF (€)">
                    <input type="number" step="0.01" min="0" class="input-dynamic-etfvers" data-id="${etf.id}" value="${versato}" data-manuale="${bozza['p_' + etf.id] !== undefined && String(bozza['p_' + etf.id]) !== String(mappaVersati[etf.id]) ? '1' : ''}" placeholder="Versato totale (€)" title="Totale versato nell'ETF: precompilato con l'ultimo totale + quota mensile, si sostituisce a ogni misurazione">
                </div>
            `;
            containerEtf.appendChild(div);
            // Un input modificato a mano non viene sovrascritto al cambio della data:
            // il campo "Versato" può contenere versamenti extra non riconducibili alla
            // quota mensile. Svuotandolo si torna al default calcolato.
            const inputVersato = div.querySelector('.input-dynamic-etfvers');
            if (inputVersato) {
                inputVersato.addEventListener('input', () => {
                    inputVersato.dataset.manuale = '1';
                    statoFormEtf.bozza = {
                        ...(statoFormEtf.bozza || {}),
                        ['p_' + etf.id]: inputVersato.value
                    };
                });
            }
            const inputValore = div.querySelector('.input-dynamic-etf');
            if (inputValore) {
                inputValore.addEventListener('input', () => {
                    statoFormEtf.bozza = {
                        ...(statoFormEtf.bozza || {}),
                        ['v_' + etf.id]: inputValore.value
                    };
                });
            }
        });

    // Ricorda su quale data si sta lavorando, per rilevare i cambi data successivi
    statoFormEtf.data = dataCorrente;
    statoFormEtf.default = mappaVersati;
    statoFormEtf.bozza = bozza;
}

// Dopo un salvataggio il form viene ricostruito coi valori aggiornati: si azzera quindi
// la memoria della bozza, altrimenti verrebbero riproposti i valori appena salvati
// (es. il "Versato" del mese già conteggiato) invece del nuovo default.
function resetBozzaFormEtf() {
    statoFormEtf.bozza = {};
    statoFormEtf.data = '';
    statoFormEtf.default = {};
    statoFormEtf.modifica = false;
}

// Cambio della data di misurazione: si ricalcola il suggerimento dei campi "Versato"
// (ultimo totale versato registrato + quota mensile). Un importo digitato a mano viene
// conservato solo se la data non cambia; cambiando data si torna al suggerimento.
// Accetta sia una data esplicita sia l'evento onchange del campo data.
function aggiornaDefaultVersati(dataForzata) {
    const inputData = document.getElementById('input-data-etf');
    const data = (typeof dataForzata === 'string' && dataForzata)
        ? dataForzata
        : (inputData ? inputData.value : '');
    const nuoviDefaultMap = mappaDefaultVersati(data);

    document.querySelectorAll('#tab-etf-inserimenti .input-dynamic-etfvers').forEach(input => {
        const id = input.dataset.id;
        const nuovoDefault = parseFloat(nuoviDefaultMap[id]);
        // Il campo torna al suggerimento automatico (ultimo totale + quota) a ogni cambio
        // di data; un valore digitato a mano viene conservato solo se la data non cambia.
        const stessaData = data === statoFormEtf.data;
        if (!isNaN(nuovoDefault) && !(input.dataset.manuale && stessaData)) input.value = nuovoDefault;
    });

    statoFormEtf.data = data;
    statoFormEtf.default = nuoviDefaultMap;
    statoFormEtf.modifica = false;
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
    // Il "Versato" si ripropone come suggerimento standard per la data selezionata:
    // ultimo totale registrato + quota mensile (PAC). Resta modificabile a mano, così
    // eventuali versamenti extra non vengono persi.
    document.querySelectorAll('#tab-etf-inserimenti .input-dynamic-etfvers').forEach(input => {
        const id = input.dataset.id;
        const etf = (dbRadice.configurazioneTarget.etfs || []).find(e => String(e.id) === String(id));
        if (!etf) return;
        input.value = defaultVersatoETF(etf, ultimo.data);
        input.dataset.manuale = '';
    });
    statoFormEtf.data = ultimo.data;
    statoFormEtf.default = mappaDefaultVersati(ultimo.data);
    statoFormEtf.modifica = false;
    statoFormEtf.bozza = {};
}

function salvaMisurazioneETF() {
    const inputData = document.getElementById('input-data-etf');
    if (!inputData || !inputData.value) { alert("Data non valida."); return; }
    const dataVal = inputData.value;

    const etfValori = {};
    document.querySelectorAll('#tab-etf-inserimenti .input-dynamic-etf').forEach(input => {
        etfValori[input.dataset.id] = parseFloat(input.value) || 0;
    });
    // Il campo contiene già il TOTALE versato nell'ETF: si salva così com'è, sostituendo
    // il valore memorizzato nella misurazione precedente (nessuna somma tra mesi).
    const etfVersamenti = {};
    document.querySelectorAll('#tab-etf-inserimenti .input-dynamic-etfvers').forEach(input => {
        etfVersamenti[input.dataset.id] = Math.round((parseFloat(input.value) || 0) * 100) / 100;
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
    // Il form va ricostruito con i valori aggiornati: si azzera la bozza, altrimenti
    // resterebbe il totale appena salvato invece del nuovo suggerimento (+ quota PAC).
    resetBozzaFormEtf();
    // Se la misurazione salvata non è di oggi si passa alla data odierna, così il form
    // propone il prossimo versamento (totale salvato + quota mensile).
    const oggi = new Date().toISOString().split('T')[0];
    if (inputData && oggi > dataVal) inputData.value = oggi;

    renderizzaTutto();
    alert("Misurazione ETF salvata per il " + dataVal + ".\nIl campo Versato contiene il TOTALE versato nell'ETF e sostituisce il valore precedente.");
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
    // Si riparte dal form pulito: il campo "Versato" mostra il totale versato salvato in
    // quella misurazione (non il suggerimento del mese successivo).
    document.querySelectorAll('#tab-etf-inserimenti .input-dynamic-etf').forEach(input => {
        const id = input.dataset.id;
        input.value = (m.etfValori && m.etfValori[id] !== undefined) ? m.etfValori[id] : '';
    });
    document.querySelectorAll('#tab-etf-inserimenti .input-dynamic-etfvers').forEach(input => {
        const id = input.dataset.id;
        input.value = (m.etfVersamenti && m.etfVersamenti[id] !== undefined) ? m.etfVersamenti[id] : '';
        // Valore caricato dalla misurazione: resta finché la data non cambia (poi torna al
        // suggerimento automatico).
        input.dataset.manuale = '1';
    });
    // I valori caricati sono una modifica in corso: il render successivo deve conservarli
    statoFormEtf.data = data;
    statoFormEtf.modifica = true;
    statoFormEtf.default = mappaDefaultVersati(data, true);
    statoFormEtf.bozza = {};
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function eliminaMisurazioneETF(data) {
    if (!confirm("Eliminare la misurazione ETF del " + data + "?")) return;
    dbRadice.misurazioniEtf = (dbRadice.misurazioniEtf || []).filter(x => x.data !== data);
    salvaNelLocalStorage();
    renderizzaTutto();
}
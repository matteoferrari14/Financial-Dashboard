// ===== PAGINA 5: INSERIMENTI ETF (misurazioni valore + performance in €) =====
// I valori correnti e la performance (utile/perdita) di ogni ETF si registrano qui,
// NON nella pagina 1 (che gestisce solo saldi banche/investimenti/debiti). I dati
// vivono in un archivio dedicato (dbRadice.misurazioniEtf) completamente SEPARATO
// dallo storico delle pagine 1-3 (dbRadice.storicoMesi): misurare gli ETF anche in
// date diverse da quelle di pagina 1 NON crea mesi nelle pagine 1-2-3.

// ---------- Performance vs Versato ----------
// Il campo "Performance" della pagina 5 contiene, in €, quanto si sta guadagnando
// (valore positivo) o perdendo (valore negativo, segno "-" davanti all'importo) per
// ogni ETF. Il capitale versato NON si inserisce più: viene RICAVATO automaticamente
// come "Valore di mercato - Performance".
//   es. Valore 100, Performance   20 → Versato 80
//   es. Valore 100, Performance  -20 → Versato 120
// La pagina 4 legge questo versato derivato (nessuna somma tra mesi).

// Mese (YYYY-MM) di una data di misurazione salvata come stringa YYYY-MM-DD
function chiaveMese(data) {
    return String(data || '').slice(0, 7);
}

// Performance (€) registrata per l'ETF in una misurazione. Il versato derivato
// (valore - performance) resta memorizzato in etfVersamenti per compatibilità con il
// resto dell'app; la performance vera e propria vive in etfPerformance. Per i dati
// salvati prima di questa modifica (solo versato) la performance viene ricavata come
// valore - versato.
function performanceRegistratoETF(misura, etfId) {
    if (!misura) return null;
    if (misura.etfPerformance && misura.etfPerformance[etfId] !== undefined) {
        return parseFloat(misura.etfPerformance[etfId]) || 0;
    }
    const val = (misura.etfValori && misura.etfValori[etfId] !== undefined) ? misura.etfValori[etfId] : null;
    const ver = (misura.etfVersamenti && misura.etfVersamenti[etfId] !== undefined) ? misura.etfVersamenti[etfId] : null;
    if (val !== null && ver !== null) return val - ver;
    return null;
}

// Performance registrata per l'ETF nell'ultima misurazione fino alla data indicata
// (inclusa). Restituisce 0 se non c'è ancora alcuna misurazione con performance.
function ultimaPerformanceRegistrataETF(etfId, data) {
    const misure = (dbRadice.misurazioniEtf || [])
        .filter(m => !data || m.data <= data)
        .sort((a, b) => new Date(a.data) - new Date(b.data));
    for (let i = misure.length - 1; i >= 0; i--) {
        const p = performanceRegistratoETF(misure[i], etfId);
        if (p !== null) return p;
    }
    return 0;
}

// Valore suggerito per il campo "Performance": ultima performance misurata (utile per
// aggiornare i valori correnti a ogni misurazione). Con modifica = true (misurazione
// esistente aperta in modifica) si mostra la performance salvata in quella misurazione,
// perché si sta correggendo quel dato.
function defaultPerformanceETF(etf, data, modifica) {
    if (modifica) {
        const esistente = (dbRadice.misurazioniEtf || []).find(m => m.data === data);
        const perf = performanceRegistratoETF(esistente, etf.id);
        if (perf !== null) return perf;
    }
    return ultimaPerformanceRegistrataETF(etf.id, data);
}

function mappaDefaultPerformance(data, modifica) {
    const mappa = {};
    (dbRadice.configurazioneTarget.etfs || [])
        .filter(e => e.attivo)
        .forEach(etf => { mappa[etf.id] = defaultPerformanceETF(etf, data, modifica); });
    return mappa;
}

// Versato derivato = Valore di mercato - Performance
function ricavaVersato(valore, performance) {
    return Math.round(((parseFloat(valore) || 0) - (parseFloat(performance) || 0)) * 100) / 100;
}

// Stato del form della pagina 5: data della bozza, default applicati ai campi
// "Performance" e flag di modifica (true quando si sta correggendo una misurazione
// già salvata).
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
    // Il campo "Performance" NON viene più precompilato per le nuove misurazioni: parte
    // vuoto e l'utente inserisce a mano guadagno/perdita. Solo in modifica (misurazione
    // esistente aperta per correzione) si mostra la performance già salvata.
    const mappaPerformance = statoFormEtf.modifica ? mappaDefaultPerformance(dataCorrente, true) : {};

    containerEtf.innerHTML = '';
    // Titoli di colonna delle due colonne di input: Valore di mercato e Rendimento.
    const header = document.createElement('div');
    header.className = 'etf-form-header';
    header.innerHTML = '<span>Valore di mercato</span><span>Rendimento</span>';
    containerEtf.appendChild(header);
    (dbRadice.configurazioneTarget.etfs || [])
        .filter(e => e.attivo)
        .forEach(etf => {
            const div = document.createElement('div');
            // Valore: si propone l'ultimo misurato (la data nuova è già impostata con
            // oggi), ma se c'è una bozza in corso prevale quella.
            const valore = bozza['v_' + etf.id] !== undefined ? bozza['v_' + etf.id]
                : (ultimoValori[etf.id] !== undefined && ultimoValori[etf.id] !== null ? ultimoValori[etf.id] : '');
            const performance = bozza['p_' + etf.id] !== undefined ? bozza['p_' + etf.id]
                : (mappaPerformance[etf.id] !== undefined ? mappaPerformance[etf.id] : '');
            div.innerHTML = `
                <label>${escapeHtml(etf.nome)} ${etf.isin ? `<small class="text-muted">(${escapeHtml(etf.isin)})</small>` : ''}</label>
                <div class="etf-form-row">
                    <input type="number" step="0.01" min="0" class="input-dynamic-etf" data-id="${etf.id}" value="${valore}" placeholder="Valore (€)" title="Valore di mercato corrente dell'ETF (€)">
                    <input type="number" step="0.01" class="input-dynamic-etfperf" data-id="${etf.id}" value="${performance}" data-manuale="${bozza['p_' + etf.id] !== undefined ? '1' : ''}" placeholder="Performance (€)" title="In €: segno + se guadagno, segno - se perdita.">
                </div>
            `;
            containerEtf.appendChild(div);
            // Un input modificato a mano non viene sovrascritto al cambio della data.
            const inputPerformance = div.querySelector('.input-dynamic-etfperf');
            if (inputPerformance) {
                inputPerformance.addEventListener('input', () => {
                    inputPerformance.dataset.manuale = '1';
                    statoFormEtf.bozza = {
                        ...(statoFormEtf.bozza || {}),
                        ['p_' + etf.id]: inputPerformance.value
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
    statoFormEtf.default = mappaPerformance;
    statoFormEtf.bozza = bozza;
}

// Dopo un salvataggio il form viene ricostruito coi valori aggiornati: si azzera quindi
// la memoria della bozza, altrimenti verrebbero riproposti i valori appena salvati
// (es. la performance digitata) mentre il nuovo campo deve ripartire vuoto.
function resetBozzaFormEtf() {
    statoFormEtf.bozza = {};
    statoFormEtf.data = '';
    statoFormEtf.default = {};
    statoFormEtf.modifica = false;
}

// Cambio della data di misurazione: i campi "Performance" non vengono più precompilati,
// quindi si azzerano (l'utente inserisce a mano guadagno/perdita per la nuova data).
// Il campo "Valore" resta precompilato dall'ultima misurazione. Accetta una data
// esplicita o l'evento onchange del campo data.
function aggiornaDefaultPerformance(dataForzata) {
    const inputData = document.getElementById('input-data-etf');
    const data = (typeof dataForzata === 'string' && dataForzata)
        ? dataForzata
        : (inputData ? inputData.value : '');
    const nuoviDefaultMap = mappaDefaultPerformance(data);

    document.querySelectorAll('#tab-etf-inserimenti .input-dynamic-etfperf').forEach(input => {
        // Nessun suggerimento automatico: il campo parte vuoto a ogni cambio data.
        input.value = '';
        input.dataset.manuale = '';
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
    // Anche la "Performance" si ripropone dall'ultima misurazione: resta modificabile a
    // mano.
    document.querySelectorAll('#tab-etf-inserimenti .input-dynamic-etfperf').forEach(input => {
        const id = input.dataset.id;
        const etf = (dbRadice.configurazioneTarget.etfs || []).find(e => String(e.id) === String(id));
        if (!etf) return;
        input.value = defaultPerformanceETF(etf, ultimo.data);
        input.dataset.manuale = '';
    });
    statoFormEtf.data = ultimo.data;
    statoFormEtf.default = mappaDefaultPerformance(ultimo.data);
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
    // L'utente inserisce la Performance in € (segno + guadagno, segno - perdita). Il
    // versato NON si inserisce più: deriva da Valore - Performance.
    const etfPerformance = {};
    const etfVersamenti = {};
    document.querySelectorAll('#tab-etf-inserimenti .input-dynamic-etfperf').forEach(input => {
        const id = input.dataset.id;
        const performance = parseFloat(input.value) || 0;
        etfPerformance[id] = Math.round(performance * 100) / 100;
        etfVersamenti[id] = ricavaVersato(etfValori[id], performance);
    });

    // Upsert nell'archivio dedicato misurazioniEtf (separato dallo storico pagine 1-3)
    if (!Array.isArray(dbRadice.misurazioniEtf)) dbRadice.misurazioniEtf = [];
    let misura = dbRadice.misurazioniEtf.find(m => m.data === dataVal);
    if (misura) {
        misura.etfValori = etfValori;
        misura.etfPerformance = etfPerformance;
        misura.etfVersamenti = etfVersamenti;
    } else {
        dbRadice.misurazioniEtf.push({
            data: dataVal,
            etfValori: etfValori,
            etfPerformance: etfPerformance,
            etfVersamenti: etfVersamenti
        });
    }

    salvaNelLocalStorage();
    // Il form va ricostruito con i valori aggiornati: si azzera la bozza, altrimenti
    // resterebbe il valore appena salvato invece del nuovo default (ultima performance).
    resetBozzaFormEtf();
    // Se la misurazione salvata non è di oggi si passa alla data odierna, così il form
    // propone la prossima misurazione (valore e performance aggiornati).
    const oggi = new Date().toISOString().split('T')[0];
    if (inputData && oggi > dataVal) inputData.value = oggi;

    renderizzaTutto();
    alert("Misurazione ETF salvata per il " + dataVal + ".\nIl versato deriva automaticamente da Valore - Performance.");
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
        const totPerformance = Object.values(m.etfPerformance || {}).reduce((a, b) => a + (Number(b) || 0), 0);
        const totVersato = Object.values(m.etfVersamenti || {}).reduce((a, b) => a + b, 0);
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${m.data}</strong></td>
            <td>${totValore.toLocaleString()} €</td>
            <td style="color: ${totPerformance >= 0 ? 'var(--accent-success)' : 'var(--accent-danger)'};">${totPerformance >= 0 ? '+' : ''}${totPerformance.toLocaleString()} €</td>
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
    // Si riparte dal form pulito: il campo "Performance" mostra la performance salvata in
    // quella misurazione (non il suggerimento della misurazione successiva).
    document.querySelectorAll('#tab-etf-inserimenti .input-dynamic-etf').forEach(input => {
        const id = input.dataset.id;
        input.value = (m.etfValori && m.etfValori[id] !== undefined) ? m.etfValori[id] : '';
    });
    document.querySelectorAll('#tab-etf-inserimenti .input-dynamic-etfperf').forEach(input => {
        const id = input.dataset.id;
        const perf = performanceRegistratoETF(m, id);
        input.value = (perf !== null) ? perf : '';
        // Valore caricato dalla misurazione: resta finché la data non cambia (poi torna al
        // suggerimento automatico).
        input.dataset.manuale = '1';
    });
    // I valori caricati sono una modifica in corso: il render successivo deve conservarli
    statoFormEtf.data = data;
    statoFormEtf.modifica = true;
    statoFormEtf.default = mappaDefaultPerformance(data, true);
    statoFormEtf.bozza = {};
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function eliminaMisurazioneETF(data) {
    if (!confirm("Eliminare la misurazione ETF del " + data + "?")) return;
    dbRadice.misurazioniEtf = (dbRadice.misurazioniEtf || []).filter(x => x.data !== data);
    salvaNelLocalStorage();
    renderizzaTutto();
}
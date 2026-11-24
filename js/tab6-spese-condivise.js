// ==========================================
// TAB 6: SPESE CONDIVISE & BUDGET DI GRUPPO
// ==========================================

// Inizializza i dati se non ancora presenti
function assicuraDatiSpeseCondivise() {
    if (!dbRadice.speseCondivise) {
        dbRadice.speseCondivise = {
            budgetComune: 1500,
            soggetti: [
                {
                    id: 1,
                    nome: 'Soggetto 1',
                    stipendioNetto: 2000,
                    mensilita: 12,
                    speseAutonome: []
                },
                {
                    id: 2,
                    nome: 'Soggetto 2',
                    stipendioNetto: 1000,
                    mensilita: 12,
                    speseAutonome: []
                }
            ]
        };
    }
    // Normalizzazione campi
    if (typeof dbRadice.speseCondivise.budgetComune !== 'number' || isNaN(dbRadice.speseCondivise.budgetComune)) {
        dbRadice.speseCondivise.budgetComune = 0;
    }
    if (!Array.isArray(dbRadice.speseCondivise.soggetti)) {
        dbRadice.speseCondivise.soggetti = [];
    }
    dbRadice.speseCondivise.soggetti.forEach((s, idx) => {
        if (!s.id) s.id = Date.now() + idx;
        if (typeof s.nome !== 'string') s.nome = 'Soggetto ' + (idx + 1);
        if (typeof s.stipendioNetto !== 'number' || isNaN(s.stipendioNetto)) s.stipendioNetto = 0;
        if (typeof s.mensilita !== 'number' || isNaN(s.mensilita) || s.mensilita <= 0) s.mensilita = 12;
        if (!Array.isArray(s.speseAutonome)) s.speseAutonome = [];
        s.speseAutonome.forEach((sp, spIdx) => {
            if (!sp.id) sp.id = Date.now() + spIdx;
            if (typeof sp.nome !== 'string') sp.nome = 'Spesa';
            if (typeof sp.importo !== 'number' || isNaN(sp.importo)) sp.importo = 0;
        });
    });
}

function aggiungiSoggettoCondiviso() {
    assicuraDatiSpeseCondivise();
    const count = dbRadice.speseCondivise.soggetti.length + 1;
    dbRadice.speseCondivise.soggetti.push({
        id: Date.now(),
        nome: 'Soggetto ' + count,
        stipendioNetto: 0,
        mensilita: 12,
        speseAutonome: []
    });
    salvaNelLocalStorage();
    renderizzaSpeseCondivise();
}

function rimuoviSoggettoCondiviso(id) {
    assicuraDatiSpeseCondivise();
    if (dbRadice.speseCondivise.soggetti.length <= 1) {
        alert("Deve essere presente almeno un soggetto.");
        return;
    }
    if (!confirm("Sei sicuro di voler rimuovere questo soggetto?")) return;
    dbRadice.speseCondivise.soggetti = dbRadice.speseCondivise.soggetti.filter(s => s.id !== id);
    salvaNelLocalStorage();
    renderizzaSpeseCondivise();
}

function aggiornaBudgetComune(val) {
    assicuraDatiSpeseCondivise();
    dbRadice.speseCondivise.budgetComune = Math.max(0, parseFloat(val) || 0);
    salvaNelLocalStorage();
    renderizzaSpeseCondivise();
}

function aggiornaCampoSoggetto(id, campo, val) {
    assicuraDatiSpeseCondivise();
    const sogg = dbRadice.speseCondivise.soggetti.find(s => s.id === id);
    if (!sogg) return;

    if (campo === 'nome') {
        sogg.nome = val.trim() || 'Soggetto';
    } else if (campo === 'stipendioNetto') {
        sogg.stipendioNetto = Math.max(0, parseFloat(val) || 0);
    } else if (campo === 'mensilita') {
        sogg.mensilita = Math.max(1, parseFloat(val) || 12);
    }
    salvaNelLocalStorage();
    renderizzaSpeseCondivise();
}

function aggiungiSpesaAutonoma(soggettoId) {
    assicuraDatiSpeseCondivise();
    const sogg = dbRadice.speseCondivise.soggetti.find(s => s.id === soggettoId);
    if (!sogg) return;

    const nomeInput = document.getElementById(`new-spesa-nome-${soggettoId}`);
    const importoInput = document.getElementById(`new-spesa-importo-${soggettoId}`);

    const nome = nomeInput ? nomeInput.value.trim() : '';
    const importo = importoInput ? (parseFloat(importoInput.value) || 0) : 0;

    if (!nome) {
        alert("Inserisci una descrizione per la spesa (es. 'Bolletta telefono').");
        return;
    }
    if (importo <= 0) {
        alert("Inserisci un importo maggiore di zero.");
        return;
    }

    sogg.speseAutonome.push({
        id: Date.now(),
        nome: nome,
        importo: importo
    });

    salvaNelLocalStorage();
    renderizzaSpeseCondivise();
}

function rimuoviSpesaAutonoma(soggettoId, spesaId) {
    assicuraDatiSpeseCondivise();
    const sogg = dbRadice.speseCondivise.soggetti.find(s => s.id === soggettoId);
    if (!sogg) return;

    sogg.speseAutonome = sogg.speseAutonome.filter(sp => sp.id !== spesaId);
    salvaNelLocalStorage();
    renderizzaSpeseCondivise();
}

function calcolaRipartizioneCondivisa() {
    assicuraDatiSpeseCondivise();
    const soggetti = dbRadice.speseCondivise.soggetti;
    const budgetComune = dbRadice.speseCondivise.budgetComune || 0;

    // 1. Calcolo redditi medi mensili e totale redditi
    let totaleRedditiMedi = 0;
    const soggettiCalcolati = soggetti.map(s => {
        const mensileMedio = (s.stipendioNetto * s.mensilita) / 12;
        totaleRedditiMedi += mensileMedio;

        const totaleSpeseAutonome = s.speseAutonome.reduce((sum, sp) => sum + (parseFloat(sp.importo) || 0), 0);

        return {
            id: s.id,
            nome: s.nome,
            stipendioNetto: s.stipendioNetto,
            mensilita: s.mensilita,
            mensileMedio: mensileMedio,
            totaleSpeseAutonome: totaleSpeseAutonome,
            speseAutonome: s.speseAutonome,
            quotaPct: 0,
            quotaTotaleDovuta: 0,
            versamentoContoComune: 0
        };
    });

    // 2. Calcolo totale spese autonome di tutti i soggetti
    const totaleSpeseAutonomeTutti = soggettiCalcolati.reduce((sum, s) => sum + s.totaleSpeseAutonome, 0);

    // 3. Fabbisogno totale complessivo (Budget comune + tutte le spese già sostenute autonomamente)
    const fabbisognoTotale = budgetComune + totaleSpeseAutonomeTutti;

    // 4. Ripartizione percentuale e quote
    let totaleVersamentiEffettivi = 0;
    soggettiCalcolati.forEach(s => {
        if (totaleRedditiMedi > 0) {
            s.quotaPct = (s.mensileMedio / totaleRedditiMedi) * 100;
        } else {
            s.quotaPct = soggettiCalcolati.length > 0 ? (100 / soggettiCalcolati.length) : 0;
        }

        // Quota complessiva a carico del soggetto sulle spese totali
        s.quotaTotaleDovuta = (fabbisognoTotale * (s.quotaPct / 100));

        // Versamento effettivo nel conto comune: quota totale dovuta meno le spese già pagate autonomamente
        s.versamentoContoComune = s.quotaTotaleDovuta - s.totaleSpeseAutonome;
        totaleVersamentiEffettivi += s.versamentoContoComune;
    });

    return {
        budgetComune: budgetComune,
        totaleRedditiMedi: totaleRedditiMedi,
        totaleSpeseAutonomeTutti: totaleSpeseAutonomeTutti,
        fabbisognoTotale: fabbisognoTotale,
        totaleVersamentiEffettivi: totaleVersamentiEffettivi,
        soggetti: soggettiCalcolati
    };
}

function renderizzaSpeseCondivise() {
    assicuraDatiSpeseCondivise();
    const container = document.getElementById('tab-spese-condivise');
    if (!container) return;

    const res = calcolaRipartizioneCondivisa();

    // Aggiorna KPI di riepilogo
    const elBudgetComune = document.getElementById('kpi-condivise-budget');
    if (elBudgetComune) elBudgetComune.innerText = res.budgetComune.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';

    const elSpeseAutonome = document.getElementById('kpi-condivise-autonome');
    if (elSpeseAutonome) elSpeseAutonome.innerText = res.totaleSpeseAutonomeTutti.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';

    const elFabbisogno = document.getElementById('kpi-condivise-fabbisogno');
    if (elFabbisogno) elFabbisogno.innerText = res.fabbisognoTotale.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';

    const elRedditoTot = document.getElementById('kpi-condivise-reddito-tot');
    if (elRedditoTot) elRedditoTot.innerText = res.totaleRedditiMedi.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';

    // Input budget
    const inputBudget = document.getElementById('input-budget-comune');
    if (inputBudget && document.activeElement !== inputBudget) {
        inputBudget.value = res.budgetComune;
    }

    // Render schede soggetti
    const contSoggetti = document.getElementById('soggetti-cards-container');
    if (contSoggetti) {
        contSoggetti.innerHTML = res.soggetti.map((s, idx) => {
            const righeSpese = s.speseAutonome.length > 0 ? s.speseAutonome.map(sp => `
                <div class="flex-between py-5 border-b-subtle" style="font-size:0.85rem;">
                    <span><strong>${escapeHtml(sp.nome)}</strong>: ${sp.importo.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €/mese</span>
                    <button class="btn-danger w-auto" style="padding:2px 8px; font-size:0.75rem;" onclick="rimuoviSpesaAutonoma(${s.id}, ${sp.id})" title="Rimuovi spesa">✕</button>
                </div>
            `).join('') : '<p class="text-muted" style="font-size:0.85rem; font-style:italic;">Nessuna spesa autonoma inserita.</p>';

            return `
                <div class="card" style="margin-bottom:15px; border-left: 4px solid var(--accent-primary);">
                    <div class="flex-between" style="align-items:center; margin-bottom:12px;">
                        <input type="text" value="${escapeHtml(s.nome)}" 
                               style="font-size:1.1rem; font-weight:bold; max-width:250px; background:rgba(0,0,0,0.2); border:1px solid var(--border-color); color:var(--text-main); border-radius:4px; padding:4px 8px;"
                               onchange="aggiornaCampoSoggetto(${s.id}, 'nome', this.value)" title="Clicca per modificare il nome">
                        <button class="btn-danger w-auto" style="padding:4px 10px; font-size:0.8rem;" onclick="rimuoviSoggettoCondiviso(${s.id})">🗑 Elimina Soggetto</button>
                    </div>

                    <div class="grid-2">
                        <div>
                            <label>Stipendio Netto Mensile (€):</label>
                            <input type="number" step="any" value="${s.stipendioNetto}" 
                                   onchange="aggiornaCampoSoggetto(${s.id}, 'stipendioNetto', this.value)">
                        </div>
                        <div>
                            <label>Numero Mensilità (es. 12, 13, 14):</label>
                            <input type="number" step="1" min="1" max="24" value="${s.mensilita}" 
                                   onchange="aggiornaCampoSoggetto(${s.id}, 'mensilita', this.value)">
                        </div>
                    </div>

                    <div style="background:rgba(255,255,255,0.03); padding:10px; border-radius:6px; margin: 12px 0;">
                        <span class="text-muted" style="font-size:0.85rem;">Reddito Medio Mensile calcolato: </span>
                        <strong class="text-success">${s.mensileMedio.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €/mese</strong>
                        <span class="text-muted" style="font-size:0.85rem; margin-left:10px;">(${s.quotaPct.toFixed(1)}% del reddito totale)</span>
                    </div>

                    <!-- Spese autonome per la casa -->
                    <div style="margin-top:15px;">
                        <h4 style="font-size:0.95rem; margin-bottom:8px; color:var(--text-main);">
                            Spese autonome per la casa (es. bollette, assicurazione)
                        </h4>
                        <div id="lista-spese-${s.id}" style="margin-bottom:10px;">
                            ${righeSpese}
                        </div>
                        <div style="font-size:0.85rem; margin-bottom:10px;">
                            <span class="text-muted">Totale spese autonome:</span> 
                            <strong class="text-warning">${s.totaleSpeseAutonome.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €/mese</strong>
                        </div>

                        <!-- Inserimento nuova spesa autonoma -->
                        <div class="grid-3" style="grid-template-columns: 2fr 1fr auto; gap:8px; align-items:end;">
                            <div>
                                <label style="font-size:0.75rem;">Nuova voce:</label>
                                <input type="text" id="new-spesa-nome-${s.id}" placeholder="es. Bolletta luce" style="font-size:0.85rem; padding:6px 8px;">
                            </div>
                            <div>
                                <label style="font-size:0.75rem;">Importo (€/mese):</label>
                                <input type="number" step="any" id="new-spesa-importo-${s.id}" placeholder="es. 40" style="font-size:0.85rem; padding:6px 8px;">
                            </div>
                            <div>
                                <button class="btn-primary w-auto" style="padding:6px 14px; font-size:0.85rem;" onclick="aggiungiSpesaAutonoma(${s.id})">+ Aggiungi</button>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    // Render Tabella Riepilogo Ripartizione & Versamenti
    const tbodyRiepilogo = document.getElementById('table-riepilogo-condivise-body');
    if (tbodyRiepilogo) {
        tbodyRiepilogo.innerHTML = res.soggetti.map(s => {
            const coloreVersamento = s.versamentoContoComune >= 0 ? 'text-primary' : 'text-danger';
            const etichettaVersamento = s.versamentoContoComune >= 0 
                ? `${s.versamentoContoComune.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`
                : `RIMBORSO di ${Math.abs(s.versamentoContoComune).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

            return `
                <tr>
                    <td><strong>${escapeHtml(s.nome)}</strong></td>
                    <td>${s.mensileMedio.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €</td>
                    <td><strong>${s.quotaPct.toFixed(1)}%</strong></td>
                    <td>${s.quotaTotaleDovuta.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €</td>
                    <td class="text-warning">− ${s.totaleSpeseAutonome.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €</td>
                    <td class="${coloreVersamento}" style="font-size:1.05rem; font-weight:bold;">
                        ${etichettaVersamento}
                    </td>
                </tr>
            `;
        }).join('');
    }

    // Totali riga tabella
    const tfootRiepilogo = document.getElementById('table-riepilogo-condivise-foot');
    if (tfootRiepilogo) {
        tfootRiepilogo.innerHTML = `
            <tr style="border-top: 2px solid var(--border-color); font-weight:bold; background:rgba(255,255,255,0.02);">
                <td>TOTALE</td>
                <td>${res.totaleRedditiMedi.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €</td>
                <td>100%</td>
                <td>${res.fabbisognoTotale.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €</td>
                <td class="text-warning">− ${res.totaleSpeseAutonomeTutti.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €</td>
                <td class="text-primary" style="font-size:1.1rem;">${res.budgetComune.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €</td>
            </tr>
        `;
    }
}

// ========================================================
// IMPORT / EXPORT PARZIALE (ESCLUSIVO PER LA PAGINA 6)
// ========================================================

function esportaSpeseCondivise() {
    assicuraDatiSpeseCondivise();
    const exportData = {
        tipo: 'PFD_SPESE_CONDIVISE',
        versione: typeof VERSIONE_APP !== 'undefined' ? VERSIONE_APP : '1.7.1',
        dataEsportazione: new Date().toISOString(),
        speseCondivise: dbRadice.speseCondivise
    };

    const blob = new Blob([JSON.stringify(exportData, null, 4)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pfd-spese-condivise-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

function importaSpeseCondivise(input) {
    const file = input.files && input.files[0];
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

            // Riconoscimento: può essere un export parziale (tipo: 'PFD_SPESE_CONDIVISE' o chiave speseCondivise)
            // oppure un backup globale da cui estrarre solo la sezione speseCondivise
            let nuovaConfigurazione = null;
            if (parsed.speseCondivise && Array.isArray(parsed.speseCondivise.soggetti)) {
                nuovaConfigurazione = parsed.speseCondivise;
            } else if (parsed.tipo === 'PFD_SPESE_CONDIVISE' && parsed.soggetti) {
                nuovaConfigurazione = parsed;
            }

            if (!nuovaConfigurazione) {
                alert("Il file selezionato non contiene una configurazione valida di Spese Condivise.");
                input.value = '';
                return;
            }

            // Sovrascrive ESCLUSIVAMENTE la sezione speseCondivise senza toccare nulla del resto di dbRadice
            dbRadice.speseCondivise = JSON.parse(JSON.stringify(nuovaConfigurazione));
            assicuraDatiSpeseCondivise();
            salvaNelLocalStorage();
            renderizzaSpeseCondivise();

            alert("Configurazione Spese Condivise importata con successo! I dati patrimoniali, conti ed ETF sono rimasti inalterati.");
        } catch(err) {
            console.error(err);
            alert("Errore nella lettura del file JSON: formato non valido.");
        } finally {
            input.value = '';
        }
    };
    reader.readAsText(file);
}


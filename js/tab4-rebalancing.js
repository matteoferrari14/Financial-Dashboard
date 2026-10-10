let chartGeoBreakdownInstance = null;
let chartPerformanceAssetsInstance = null;

function salvaAssetSingolo() {
    const nome = document.getElementById('asset-nome').value.trim();
    const isin = document.getElementById('asset-isin').value.trim();
    const targetPct = parseFloat(document.getElementById('asset-target-pct').value) || 0;
    const benchmark = document.getElementById('asset-benchmark').value;
    const quotaPac = parseFloat(document.getElementById('asset-quota-pac').value) || 0;
    const valorePortafoglio = parseFloat(document.getElementById('asset-valore-portafoglio').value) || 0;

    if (!nome) { alert("Inserisci il nome dell'asset."); return; }

    const nuovoAsset = {
        id: Date.now(),
        nome, isin, targetPct, benchmark, quotaPac, valorePortafoglio
    };

    dbRadice.dettaglioAssets.push(nuovoAsset);
    salvaNelLocalStorage();

    document.getElementById('asset-nome').value = '';
    document.getElementById('asset-isin').value = '';
    document.getElementById('asset-target-pct').value = '';
    document.getElementById('asset-quota-pac').value = '';
    document.getElementById('asset-valore-portafoglio').value = '';

    renderizzaRebalancingTab();
}

function eliminaAssetSingolo(index) {
    if (confirm("Rimuovere questo asset dal portafoglio?")) {
        dbRadice.dettaglioAssets.splice(index, 1);
        salvaNelLocalStorage();
        renderizzaRebalancingTab();
    }
}

function renderizzaRebalancingTab() {
    const assets = dbRadice.dettaglioAssets || [];
    const tbody = document.getElementById('table-assets-body');
    if(!tbody) return;
    tbody.innerHTML = '';

    const valoreTotalePortafoglio = assets.reduce((a,b) => a + (b.valorePortafoglio || 0), 0);

    assets.forEach((item, idx) => {
        const pesoAttualePct = valoreTotalePortafoglio > 0 ? ((item.valorePortafoglio / valoreTotalePortafoglio) * 100) : 0;
        const valoreTargetEuro = (valoreTotalePortafoglio * (item.targetPct / 100));
        const riallocazioneEuro = valoreTargetEuro - item.valorePortafoglio;

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>
                <strong>${item.nome}</strong>
                ${item.isin ? `<br><small class="text-muted">${item.isin}</small>` : ''}
            </td>
            <td>${item.quotaPac.toLocaleString()} € / mese</td>
            <td>${item.valorePortafoglio.toLocaleString()} €</td>
            <td>${pesoAttualePct.toFixed(1)} %</td>
            <td>${item.targetPct.toFixed(1)} %</td>
            <td style="font-weight:bold; color: ${riallocazioneEuro >= 0 ? 'var(--accent-success)' : 'var(--accent-danger)'}">
                ${riallocazioneEuro >= 0 ? 'Aggiungi ' : 'Riduci '}${Math.abs(Math.round(riallocazioneEuro)).toLocaleString()} €
            </td>
            <td>
                <button class="btn-danger w-auto" style="padding:4px 8px; margin:0;" onclick="eliminaAssetSingolo(${idx})">🗑️</button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    renderizzaGraficoGeografico(assets);
    renderizzaGraficoQuotaPac(assets);
}

function renderizzaGraficoGeografico(assets) {
    const ctx = document.getElementById('chartGeoBreakdown').getContext('2d');
    if (chartGeoBreakdownInstance) chartGeoBreakdownInstance.destroy();

    let geoTotali = { "USA / Nord America": 0, "Europa": 0, "Mercati Emergenti": 0, "Asia / Pacifico": 0, "Italia": 0 };

    assets.forEach(a => {
        const val = a.valorePortafoglio || 0;
        if (a.benchmark === 'WORLD') {
            geoTotali["USA / Nord America"] += val * 0.60;
            geoTotali["Europa"] += val * 0.15;
            geoTotali["Asia / Pacifico"] += val * 0.15;
            geoTotali["Mercati Emergenti"] += val * 0.10;
        } else if (a.benchmark === 'USA') {
            geoTotali["USA / Nord America"] += val;
        } else if (a.benchmark === 'EUROPE') {
            geoTotali["Europa"] += val;
        } else if (a.benchmark === 'EM') {
            geoTotali["Mercati Emergenti"] += val;
        } else if (a.benchmark === 'ITALY') {
            geoTotali["Italia"] += val;
        }
    });

    chartGeoBreakdownInstance = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: Object.keys(geoTotali),
            datasets: [{
                data: Object.values(geoTotali),
                backgroundColor: ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899']
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: 'bottom', labels: { color: '#f8fafc' } } }
        }
    });
}

function renderizzaGraficoQuotaPac(assets) {
    const ctx = document.getElementById('chartPerformanceAssets').getContext('2d');
    if (chartPerformanceAssetsInstance) chartPerformanceAssetsInstance.destroy();

    const labels = assets.map(a => a.nome);
    const quotePac = assets.map(a => a.quotaPac);

    chartPerformanceAssetsInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{ label: 'Quota PAC Mensile (€/mese)', data: quotePac, backgroundColor: '#3b82f6' }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: { ticks: { color: '#94a3b8' }, grid: { color: '#334155' } },
                y: { ticks: { color: '#94a3b8' }, grid: { color: '#334155' } }
            },
            plugins: { legend: { labels: { color: '#f8fafc' } } }
        }
    });
}
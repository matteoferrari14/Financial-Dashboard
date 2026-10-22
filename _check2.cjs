(async () => {
  console.log('=== Stato sito online ===');
  for (const [label, u] of [
    ['sw.js', 'https://matteoferrari14.github.io/Financial-Dashboard/sw.js'],
    ['app.js', 'https://matteoferrari14.github.io/Financial-Dashboard/js/app.js'],
    ['tab4(30k)', 'https://matteoferrari14.github.io/Financial-Dashboard/js/tab4-rebalancing.js']
  ]) {
    try {
      const r = await fetch(u, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      const t = await r.text();
      const ver = (t.match(/VERSIONE_APP = '([^']+)'/) || t.match(/pfd-cache-(v[^']+)'/) || [])[1];
      console.log(label, '→ status', r.status, '| versione:', ver, '| allorigins:', t.includes('allorigins'));
    } catch (e) { console.log(label, '→ ERR', e.message.slice(0, 80)); }
  }
  console.log('\n=== Proxy AllOrigins (5 tentativi, URL esatto del codice) ===');
  const yahooUrl = 'https://query1.finance.yahoo.com/v1/finance/search?q=IE00BK5BQT80&quotesCount=5&newsCount=0';
  const pUrl = 'https://api.allorigins.win/raw?url=' + encodeURIComponent(yahooUrl);
  const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
  for (let i = 1; i <= 5; i++) {
    try {
      const r = await fetch(pUrl, { headers: { 'User-Agent': UA } });
      const t = await r.text();
      console.log('tentativo', i, '→ status', r.status, '| inizio risposta:', JSON.stringify(t.trim().slice(0, 60)));
    } catch (e) { console.log('tentativo', i, '→ ERR', e.message.slice(0, 80)); }
    await new Promise(res => setTimeout(res, 900));
  }
})();

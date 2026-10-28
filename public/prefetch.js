// New-tab critical path, part one. A classic script runs while the HTML is still parsing, before
// the module bundle has even been compiled; it starts every cache read the front page needs and
// leaves the promise on globalThis.__dailyTabPrefetch for the app (lib/frontpage-data.ts).
// No dependencies, no network. It must never create the database: Dexie owns the schema.
(() => {
  const readDB = () =>
    new Promise((resolve) => {
      let req;
      try {
        req = indexedDB.open('daily-tab');
      } catch {
        return resolve(null);
      }
      // No database yet (first run): abort so nothing is created here.
      req.onupgradeneeded = () => req.transaction.abort();
      req.onerror = req.onblocked = () => resolve(null);
      req.onsuccess = () => {
        const db = req.result;
        const stores = ['editions', 'items', 'feedState'];
        if (!stores.every((s) => db.objectStoreNames.contains(s))) {
          db.close();
          return resolve(null);
        }
        const tx = db.transaction(stores, 'readonly');
        const out = { edition: null, items: [], states: [] };
        const latest = tx.objectStore('editions').index('composedAt').openCursor(null, 'prev');
        latest.onsuccess = () => {
          const edition = latest.result ? latest.result.value : null;
          out.edition = edition;
          if (!edition) return;
          const ids = [
            edition.leadItemId,
            ...edition.leadRelatedItemIds,
            ...edition.secondaryItemIds,
            ...(edition.leadColumnItemIds || []),
            ...edition.sections.flatMap((s) => s.itemIds),
            ...edition.briefItemIds,
          ];
          const items = tx.objectStore('items');
          for (const id of ids) {
            const get = items.get(id);
            get.onsuccess = () => get.result && out.items.push(get.result);
          }
        };
        const states = tx.objectStore('feedState').getAll();
        states.onsuccess = () => (out.states = states.result);
        tx.oncomplete = () => {
          db.close();
          resolve(out);
        };
        tx.onabort = tx.onerror = () => {
          db.close();
          resolve(null);
        };
      };
    });

  globalThis.__dailyTabPrefetch = Promise.all([
    readDB(),
    chrome.storage.sync.get(null),
    chrome.storage.local.get(['lastVisitAt', 'weather', 'market']),
  ]).then(
    ([db, sync, local]) => ({ db, sync, local }),
    () => null,
  );
})();

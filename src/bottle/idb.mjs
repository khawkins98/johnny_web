let dbPromise = null;

export const getDB = () => {
    if (window.location.search.includes('reset')) {
        indexedDB.deleteDatabase('BottleDGDS');
        window.history.replaceState(null, '', window.location.pathname);
        dbPromise = null;
    }

    if (!dbPromise) {
        dbPromise = new Promise((resolve, reject) => {
            const req = indexedDB.open('BottleDGDS', 1);
            req.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains('files')) {
                    db.createObjectStore('files');
                }
            };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }
    return dbPromise;
};

export const saveFile = async (name, buffer) => {
    const db = await getDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('files', 'readwrite');
        const store = tx.objectStore('files');
        const req = store.put(buffer, name);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    });
};

export const loadFile = async (name) => {
    const db = await getDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('files', 'readonly');
        const store = tx.objectStore('files');
        const req = store.get(name);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
};

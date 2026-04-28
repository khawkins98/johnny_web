import { drawScreen } from '../dgds/graphics.mjs';
import { loadResources, loadResourceEntry } from '../dgds/resource.mjs';
import { startProcess, stopProcess } from '../dgds/scripting/process.mjs';
import Story from './story.mjs';

export const run = async () => {
    const mainContext = document.getElementById('mainCanvas').getContext('2d');
    mainContext.clearRect(0, 0, 640, 480);

    const base = import.meta.env.BASE_URL;

    let resMapResp, resFileResp;
    try {
        [resMapResp, resFileResp] = await Promise.all([
            fetch(`${base}data/RESOURCE.MAP`),
            fetch(`${base}data/RESOURCE.001`),
        ]);
    } catch {
        showDataError(['RESOURCE.MAP', 'RESOURCE.001']);
        return;
    }

    // Vite's dev server returns 200 + text/html (SPA history fallback) for
    // files that don't exist, so content-type is a more reliable signal than ok.
    const isMissing = r => !r.ok || r.headers.get('content-type')?.startsWith('text/html');
    const missing = [
        isMissing(resMapResp) && 'RESOURCE.MAP',
        isMissing(resFileResp) && 'RESOURCE.001',
    ].filter(Boolean);

    if (missing.length) {
        showDataError(missing);
        return;
    }

    let res;
    try {
        res = loadResources(
            await resMapResp.arrayBuffer(),
            await resFileResp.arrayBuffer(),
        );
    } catch (err) {
        showDataError(['RESOURCE.MAP', 'RESOURCE.001'], `Could not parse game data: ${err.message}`);
        return;
    }

    const resource = res.getResource('RESOURCE.001');
    const introRes = resource.loadEntry('INTRO.SCR');
    drawScreen(introRes, mainContext);

    await new Promise(r => setTimeout(r, window.location.hostname === 'localhost' ? 1000 : 3000));

    const story = new Story(resource);
    await story.play();
};

function showDataError(missing, detail) {
    const overlay = document.getElementById('data-error');
    const list = document.getElementById('data-error-files');
    if (!overlay || !list) return;

    const allFiles = ['RESOURCE.MAP', 'RESOURCE.001', 'SCRANTIC.SCR'];
    list.innerHTML = allFiles
        .map(f => `<li class="${missing.includes(f) ? '' : 'ok'}">${f}</li>`)
        .join('');

    if (detail) {
        const detailEl = overlay.querySelector('.detail');
        if (detailEl) detailEl.textContent = detail;
    }

    overlay.style.display = 'block';
    console.error('[johnny_web]', missing.join(', '), detail ?? '');
}

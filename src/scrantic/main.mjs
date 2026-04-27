import { drawScreen } from '../dgds/graphics.mjs';
import { loadResources, loadResourceEntry } from '../dgds/resource.mjs';
import { startProcess, stopProcess } from '../dgds/scripting/process.mjs';
import Story from './story.mjs';

export const run = async () => {
    const mainContext = document.getElementById('mainCanvas').getContext('2d');
    mainContext.clearRect(0, 0, 640, 480);

    const base = import.meta.env.BASE_URL;

    let resIndex, resFile;
    try {
        [resIndex, resFile] = await Promise.all([
            fetch(`${base}data/RESOURCE.MAP`),
            fetch(`${base}data/RESOURCE.001`),
        ]);
    } catch (err) {
        showDataError(mainContext, 'Network error loading game data. See console.');
        throw err;
    }

    if (!resIndex.ok || !resFile.ok) {
        const missing = [
            !resIndex.ok && 'RESOURCE.MAP',
            !resFile.ok  && 'RESOURCE.001',
        ].filter(Boolean).join(', ');
        const msg = `Missing game data: ${missing}. Place original files in public/data/.`;
        showDataError(mainContext, msg);
        throw new Error(msg);
    }

    const res = loadResources(await resIndex.arrayBuffer(), await resFile.arrayBuffer());
    const resource = res.getResource('RESOURCE.001');

    const introRes = resource.loadEntry('INTRO.SCR');
    drawScreen(introRes, mainContext);

    await new Promise(r => setTimeout(r, window.location.hostname === 'localhost' ? 1000: 3000));

    const story = new Story(resource);
    await story.play();
};

function showDataError(ctx, message) {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, 640, 480);
    ctx.fillStyle = '#f66';
    ctx.font = 'bold 14px monospace';
    const words = message.split(' ');
    let line = '';
    let y = 40;
    for (const word of words) {
        const test = line ? `${line} ${word}` : word;
        if (ctx.measureText(test).width > 580) {
            ctx.fillText(line, 30, y);
            y += 20;
            line = word;
        } else {
            line = test;
        }
    }
    if (line) ctx.fillText(line, 30, y);
    console.error('[johnny_web]', message);
}

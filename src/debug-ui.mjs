import { StoryScenes } from './scrantic/metadata/scenes.mjs';
import { __DEBUG__ } from './dgds/scripting/process.mjs';

export function setupDebugUI() {
    const container = document.createElement('div');
    container.style.position = 'fixed';
    container.style.top = '10px';
    container.style.right = '10px';
    container.style.zIndex = '1000';
    container.style.background = 'rgba(0, 0, 0, 0.8)';
    container.style.color = '#fff';
    container.style.padding = '10px';
    container.style.borderRadius = '4px';
    container.style.fontFamily = 'monospace';
    container.style.fontSize = '12px';
    container.style.border = '1px solid #444';
    container.style.display = 'flex';
    container.style.flexDirection = 'column';
    container.style.gap = '8px';

    const title = document.createElement('div');
    title.innerText = '🛠 Debug Menu';
    title.style.fontWeight = 'bold';
    title.style.marginBottom = '4px';
    title.style.color = '#8ab4d4';
    container.appendChild(title);

    // Scene Selection
    const sceneRow = document.createElement('div');
    sceneRow.style.display = 'flex';
    sceneRow.style.gap = '8px';
    sceneRow.style.alignItems = 'center';

    const select = document.createElement('select');
    select.style.background = '#222';
    select.style.color = '#fff';
    select.style.border = '1px solid #555';
    select.style.padding = '2px 4px';

    StoryScenes.forEach(scene => {
        if (scene.tag) {
            const option = document.createElement('option');
            option.value = scene.tag;
            option.innerText = `${scene.tag}: ${scene.description}`;
            select.appendChild(option);
        }
    });

    const jumpBtn = document.createElement('button');
    jumpBtn.innerText = 'Jump to Gag';
    jumpBtn.style.background = '#333';
    jumpBtn.style.color = '#fff';
    jumpBtn.style.border = '1px solid #555';
    jumpBtn.style.cursor = 'pointer';
    
    jumpBtn.addEventListener('click', () => {
        const tagId = Number(select.value);
        __DEBUG__.jumpToScene(tagId);
    });

    sceneRow.appendChild(select);
    sceneRow.appendChild(jumpBtn);
    container.appendChild(sceneRow);

    // Day/Night Toggle
    const timeRow = document.createElement('div');
    timeRow.style.display = 'flex';
    timeRow.style.gap = '8px';
    timeRow.style.alignItems = 'center';

    const timeLabel = document.createElement('label');
    timeLabel.innerText = 'Night Mode: ';
    timeLabel.style.cursor = 'pointer';

    const timeCheckbox = document.createElement('input');
    timeCheckbox.type = 'checkbox';
    timeCheckbox.style.cursor = 'pointer';
    timeCheckbox.addEventListener('change', (e) => {
        __DEBUG__.setNightMode(e.target.checked);
    });

    timeLabel.prepend(timeCheckbox);
    timeRow.appendChild(timeLabel);
    container.appendChild(timeRow);

    document.body.appendChild(container);
}

/** Synthetic beam/transfer fixture, independently drawn; no proprietary content. */
export function drawCalibration(ctx, tick) {
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 640, 480);
    ctx.font = '14px monospace'; ctx.fillStyle = '#ccc'; ctx.fillText('BEAM / TRANSFER / SAMPLING · 640 × 480', 24, 24);
    const levels = [32, 64, 128, 192, 224, 255];
    levels.forEach((v, i) => {
        ctx.fillStyle = `rgb(${v},${v},${v})`; ctx.fillRect(24 + i * 98, 44, 90, 44);
        // Isolated one-row lines and a resolved repeated-line field at each drive level.
        ctx.fillRect(24 + i * 98, 120, 90, 1);
        for (let y = 148; y < 188; y += 4) ctx.fillRect(24 + i * 98, y, 90, 1);
    });
    for (let i = 0; i < 256; i++) { ctx.fillStyle = `rgb(${i},${i},${i})`; ctx.fillRect(24 + i * 2, 210, 2, 40); }
    ['#f00', '#0f0', '#00f', '#fff'].forEach((color, i) => {
        ctx.fillStyle = color; ctx.fillRect(24 + i * 148, 276, 1, 60); ctx.fillRect(24 + i * 148, 308, 120, 1);
    });
    for (let x = 24; x < 616; x++) for (let y = 360; y < 424; y++) {
        ctx.fillStyle = (x + y) % 2 ? '#fff' : '#000'; ctx.fillRect(x, y, 1, 1);
    }
    ctx.fillStyle = '#888'; ctx.fillRect(24, 440, 592, 24);
    ctx.fillStyle = '#fff'; ctx.fillRect(24 + tick % 560, 440, 16, 24);
}

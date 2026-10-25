import { resolveScale } from './scaling.mjs';
import { createCrt } from './crt.mjs';

/** One output target. Source acquisition stays in the lab, shared by every target. */
export function createStage(viewport) {
    const makeCanvas = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 640; canvas.height = 480;
        canvas.className = 'output'; viewport.append(canvas);
        return canvas;
    };
    const baseline = makeCanvas(), raster = makeCanvas(), output = makeCanvas();
    let crt = null, failure = '', geometry, effect = 'none', dpr = 1, available, sizing, lastCrtSettings;
    function fail(message) {
        failure = message; output.hidden = true; raster.hidden = true; baseline.hidden = false;
    }
    function configure(width, height, ratio, mode, presentation) {
        dpr = ratio; effect = presentation; sizing = mode; available = [width, height];
        viewport.style.width = `${width}px`; viewport.style.height = `${height}px`;
        viewport.style.marginLeft = '0px'; viewport.style.top = '0px'; viewport.style.transform = 'none';
        const rect = viewport.getBoundingClientRect();
        // Translation avoids layout's 1/64 CSS-pixel quantization at fractional DPR.
        viewport.style.transform = `translate(${Math.round(rect.left * dpr) / dpr - rect.left}px, ${Math.round(rect.top * dpr) / dpr - rect.top}px)`;
        geometry = resolveScale(width, height, dpr, mode);
        for (const canvas of [baseline, raster, output]) Object.assign(canvas.style, {
            width: `${geometry.width}px`, height: `${geometry.height}px`,
            left: `${geometry.x}px`, top: `${geometry.y}px`,
            imageRendering: geometry.sharp ? 'pixelated' : 'auto',
        });
        output.style.imageRendering = 'auto'; raster.style.imageRendering = 'auto';
        failure = ''; output.hidden = true; raster.hidden = true; baseline.hidden = false;
        if (effect === 'unavailable') fail('Forced WebGL unavailable · unfiltered fallback');
        if (effect === 'crt' && !crt) {
            try { crt = createCrt(output, fail); } catch (error) { fail(error.message); }
        }
    }
    function draw(source, settings) {
        lastCrtSettings = settings;
        baseline.getContext('2d').drawImage(source, 0, 0);
        const width = Math.round(geometry.width * dpr), height = Math.round(geometry.height * dpr);
        if (effect === 'raster') {
            if (raster.width !== width || raster.height !== height) { raster.width = width; raster.height = height; }
            const context = raster.getContext('2d'); context.imageSmoothingEnabled = !geometry.sharp;
            context.drawImage(source, 0, 0, width, height);
            raster.hidden = false; baseline.hidden = true;
        }
        if (effect === 'crt' && settings.bypass) { output.hidden = true; raster.hidden = true; baseline.hidden = false; }
        if (effect === 'crt' && !settings.bypass && crt && !failure) {
            try { crt.draw(source, width, height, settings, geometry.sharp); output.hidden = false; baseline.hidden = true; }
            catch (error) { fail(error.message); }
        }
    }
    function metrics() {
        const rect = viewport.getBoundingClientRect();
        return { available, mode: sizing, geometry, effect, failure, crt: effect === 'crt' ? lastCrtSettings : null,
            layoutDeviceOrigin: [(rect.left + geometry.x) * dpr, (rect.top + geometry.y) * dpr],
            glSize: [output.width, output.height], rasterSize: [raster.width, raster.height] };
    }
    return { configure, draw, metrics, fail, lose: () => crt?.lose(), dispose: () => crt?.dispose() };
}

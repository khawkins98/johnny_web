import cabinet from './island-art/cabinet.png';
import objects from './island-art/objects.png';
import labels from './island-art/labels.png';
import title from './island-art/title.png';
export const islandArt = { cabinet, objects, labels, title };
// Label windows in the original sheet. Object crop windows are shared in island-objects.css.
const words = {
    sound: [320, 290],
    speed: [640, 290],
    picture: [950, 300],
    options: [1275, 310],
    full: [1605, 325],
    rail: [1950, 222],
    book: [1950, 222],
};
export function paintedControl(name, label) {
    const [lx, lw] = words[name];
    const picture = `<span class="jc-object-art island-object island-object--${name}" aria-hidden="true"></span>`;
    const word =
        name === 'book'
            ? `<span class="jc-painted-word island-control-label jc-live-word" aria-hidden="true">Timeline</span>`
            : `<span class="jc-painted-word island-control-label" aria-hidden="true" style="width:${lw * 0.25}px"><img src="${labels}" alt="" style="left:${-lx * 0.25}px"></span>`;
    return `${picture}${word}<span class="jc-control-state">${name === 'book' ? 'Days & gags' : label}</span>`;
}

export const cabinetArtwork = '<span class="island-cabinet-face"></span><span class="island-cabinet-controls"></span>';

/** Keep modal focus in the dialog, preserving hidden-UI and other inert state. */
export function isolateDialog(overlay) {
    const previous = new Map();
    for (const element of document.body.children) {
        if (element === overlay || /^(SCRIPT|STYLE|LINK)$/.test(element.tagName)) continue;
        previous.set(element, Boolean(element.inert));
        element.inert = true;
    }
    const trapFocus = (event) => {
        if (event.key !== 'Tab') return;
        const controls = [...overlay.querySelectorAll('button,select,input,textarea,summary,a[href],[tabindex]:not([tabindex="-1"])')]
            .filter(element => !element.disabled && element.getClientRects().length);
        if (!controls.length) return;
        const first = controls[0], last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    overlay.addEventListener('keydown', trapFocus);
    return () => {
        overlay.removeEventListener('keydown', trapFocus);
        for (const [element, inert] of previous) if (element.isConnected) element.inert = inert;
        previous.clear();
    };
}

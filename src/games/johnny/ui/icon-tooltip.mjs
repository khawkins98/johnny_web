export const iconTooltipCss = `
    #settings-cog::after, #scene-flow-cog::after {
        content: attr(data-tooltip) '  [' attr(data-shortcut) ']';
        position: absolute;
        top: calc(100% + 9px);
        left: 0;
        z-index: 1;
        padding: 7px 9px;
        border: 2px solid #8b5a2b;
        background: #f4e4c8;
        color: #3b2c1c;
        box-shadow: 3px 3px 0 #11116b;
        font: 18px/1 'VT323', monospace;
        white-space: nowrap;
        opacity: 0;
        visibility: hidden;
        transform: translateY(-3px);
        pointer-events: none;
        transition-property: opacity, transform, visibility;
        transition-duration: 120ms;
    }
    #settings-cog.is-visible:hover::after,
    #settings-cog.is-visible:focus-visible::after,
    #scene-flow-cog.is-visible:hover::after,
    #scene-flow-cog.is-visible:focus-visible::after {
        opacity: 1;
        visibility: visible;
        transform: translateY(0);
    }
    @media (prefers-reduced-motion: reduce) {
        #settings-cog::after, #scene-flow-cog::after { transition-duration: 0ms; }
    }
`;

export const labelIconShortcut = (button, label, shortcut) => {
    button.dataset.tooltip = label;
    button.dataset.shortcut = shortcut;
    button.setAttribute('aria-label', `Open ${label} (shortcut ${shortcut})`);
    button.setAttribute('aria-keyshortcuts', shortcut);
};

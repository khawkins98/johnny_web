const AMBIENT_SCRIPTS = Object.freeze(['ACTIVITY.ADS', 'BUILDING.ADS', 'FISHING.ADS', 'MISCGAG.ADS']);

/**
 * Make every decoded ambient gag naturally reachable.
 *
 * This is the first host-selection compatibility layer, not the complete
 * historical story scheduler. Final/ordinary grouping, walking transitions,
 * story days, and island-state flags remain title-host work; see
 * docs/johnny-host-behavior.md.
 */
export const createJohnnySceneSelector = ({ random = Math.random } = {}) => {
    let catalog = null;

    return ({ resourceProvider }) => {
        catalog ||= AMBIENT_SCRIPTS.flatMap((script) => {
            const data = resourceProvider.resolve(script);
            return (data?.scenes || [])
                .filter((scene) => Number.isInteger(scene.tagId?.id))
                .map((scene) => Object.freeze({ script, tagId: scene.tagId.id }));
        });
        if (catalog.length === 0) return null;
        return catalog[Math.floor(random() * catalog.length)];
    };
};

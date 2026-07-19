import { buildSpriteCanvas } from '../../../dgds/graphics.mjs';

const HOLIDAYS = Object.freeze([
    Object.freeze({ name: 'st-patricks-day', start: 315, end: 317, sprite: 1, x: 333, y: 286 }),
    Object.freeze({ name: 'halloween', start: 1029, end: 1031, sprite: 0, x: 410, y: 298 }),
    Object.freeze({ name: 'christmas', start: 1223, end: 1225, sprite: 2, x: 404, y: 267 }),
    Object.freeze({ name: 'new-year', dates: Object.freeze([1229, 1230, 1231, 101]), sprite: 3, x: 361, y: 155 }),
]);

export const holidayForDate = (date = new Date()) => {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
    const monthDay = (date.getMonth() + 1) * 100 + date.getDate();
    return (
        HOLIDAYS.find((holiday) =>
            holiday.dates
                ? holiday.dates.includes(monthDay)
                : monthDay >= holiday.start && monthDay <= holiday.end,
        ) || null
    );
};

export const createHolidayOverlay = ({ resourceProvider, now = () => new Date() }) => {
    if (typeof resourceProvider?.resolve !== 'function') {
        throw new TypeError('Holiday overlay requires a resource provider');
    }

    let holidayResource;
    return (state, mainContext) => {
        const holiday = holidayForDate(now());
        const layout = state.game?.background?.layouts?.[state.backgroundId];
        if (!holiday || !layout) return false;

        holidayResource ||= resourceProvider.resolve('HOLIDAY.BMP');
        const image = holidayResource?.images?.[holiday.sprite];
        const sprite = image && buildSpriteCanvas(image);
        if (!sprite) return false;

        const islandOffsetX = layout.x - 288;
        mainContext.drawImage(sprite, holiday.x + islandOffsetX, holiday.y);
        return true;
    };
};

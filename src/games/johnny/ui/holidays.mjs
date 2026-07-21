import { buildSpriteCanvas } from '../../../dgds/graphics.mjs';

export const HOLIDAY_SETTING_KEY = 'jc-holiday-theme';

const HOLIDAYS = Object.freeze([
    Object.freeze({
        name: 'st-patricks-day',
        label: "St Patrick's Day",
        start: 315,
        end: 317,
        sprite: 1,
        x: 333,
        y: 286,
    }),
    Object.freeze({ name: 'halloween', label: 'Halloween', start: 1029, end: 1031, sprite: 0, x: 410, y: 298 }),
    Object.freeze({ name: 'christmas', label: 'Christmas', start: 1223, end: 1225, sprite: 2, x: 404, y: 267 }),
    Object.freeze({
        name: 'new-year',
        label: 'New Year',
        dates: Object.freeze([1229, 1230, 1231, 101]),
        sprite: 3,
        x: 361,
        y: 155,
    }),
]);

export const HOLIDAY_THEME_OPTIONS = Object.freeze([
    Object.freeze({ value: 'calendar', label: 'Calendar' }),
    Object.freeze({ value: 'none', label: 'None' }),
    ...HOLIDAYS.map((holiday) => Object.freeze({ value: holiday.name, label: holiday.label })),
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

export const createHolidayOverlay = ({
    resourceProvider,
    now = () => new Date(),
    storage = globalThis.localStorage,
}) => {
    if (typeof resourceProvider?.resolve !== 'function') {
        throw new TypeError('Holiday overlay requires a resource provider');
    }

    let holidayResource;
    return (state, mainContext) => {
        let theme = 'calendar';
        try {
            theme = storage?.getItem(HOLIDAY_SETTING_KEY) || theme;
        } catch {
            // Calendar mode remains available when storage is blocked.
        }
        const holiday =
            theme === 'calendar'
                ? holidayForDate(now())
                : theme === 'none'
                  ? null
                  : HOLIDAYS.find((candidate) => candidate.name === theme) || null;
        const layout = state.game?.background?.layouts?.[state.backgroundId];
        if (!holiday || !layout || state.titleState?.island === false || state.titleState?.holidayAllowed === false) {
            return false;
        }

        holidayResource ||= resourceProvider.resolve('HOLIDAY.BMP');
        const image = holidayResource?.images?.[holiday.sprite];
        const sprite = image && buildSpriteCanvas(image);
        if (!sprite) return false;

        const islandOffsetX = layout.x - 288 + (state.titleState?.x || 0);
        const islandOffsetY = state.titleState?.y || 0;
        mainContext.drawImage(sprite, holiday.x + islandOffsetX, holiday.y + islandOffsetY);
        return true;
    };
};

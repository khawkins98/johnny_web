// Preserve the scheduling remainder on displays whose refresh is not a 60Hz multiple.
export function guestDeadline(now, deadline, fps = 60) {
    const period = 1000 / fps;
    if (deadline && now + 0.25 < deadline) return { render:false, deadline };
    const next = deadline ? deadline + period : now + period;
    return { render:true, deadline:next < now - period ? now + period : next };
}

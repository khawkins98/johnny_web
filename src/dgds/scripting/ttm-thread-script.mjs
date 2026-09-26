/**
 * A SET_SCENE marks a thread's start frame, not the end of the preceding
 * thread. The binary's frame pointer keeps advancing across later SET_SCENEs
 * until PURGE, GOTO, or the end of the resource stops that execution.
 * Keep the terminator's full frame: ops after PURGE still run before UPDATE.
 */
export const getTtmThreadScript = (ttm, tagId) => {
    const start = ttm.scenes.findIndex((scene) => scene.tagId === tagId);
    if (start < 0) return undefined;

    const script = [];
    let terminatingFrame = false;
    for (const scene of ttm.scenes.slice(start)) {
        for (const command of scene.script) {
            script.push(command);
            if (command.opcode === 0x0110 || command.opcode === 0x1200) terminatingFrame = true;
            if (terminatingFrame && command.opcode === 0x0ff0) return script;
        }
    }
    return script;
};

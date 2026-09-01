// Standalone Phase-1 oracle report (run: `node src/dgds/scripting/oracle/report.mjs`).
// Drives every ADS gag on the real single-gag path and prints, per gag, the
// completion tick and any live-thread-drain divergence candidate vs the binary's
// completion oracle (completion-model.mjs = FUN_1048_0766). Local-only: needs the
// proprietary SCRANTIC data under public/data (prints a notice and exits otherwise).
import { johnnyCastaway } from '../../../games/johnny/manifest.mjs';
import { driveGag, hasData, loadAds } from '../__tests__/support/drive-gag.mjs';
import { completionView } from './completion-model.mjs';
import { isTtmFinished, TtmRunMode } from '../ttm-run-state.mjs';

if (!hasData) {
    console.log('oracle report: proprietary SCRANTIC data absent (public/data) -- skipping.');
    process.exit(0);
}

const isUnbounded = (s) =>
    s.runMode === TtmRunMode.KEEP_GOING ||
    (s.execution?.status === 'looped' && s.retries === 0 && !Number.isFinite(s.timeLimitTicks));

const runGag = ({ adsName, tag, seed }) => {
    const snaps = [];
    driveGag({
        adsName,
        tag,
        seed,
        onTick: (rt, result, tick) => {
            const unbounded = (rt.state.scenes || [])
                .filter((s) => !isTtmFinished(s) && isUnbounded(s))
                .map((s) => `${s.sceneIdx}:${s.tagId}`);
            snaps.push({ tick, view: completionView(rt.state), unbounded, completed: result.completed });
        },
    });
    const completedAt = snaps.findIndex((s) => s.completed);
    const pre = completedAt > 0 ? snaps[completedAt - 1] : null;
    let drained = 0;
    let worst = 0;
    for (const s of snaps) {
        if (s.completed) break;
        drained = s.view.oracleComplete ? drained + 1 : 0;
        worst = Math.max(worst, drained);
    }
    return {
        adsName,
        tag,
        completedTick: completedAt >= 0 ? snaps[completedAt].tick : null,
        earlyCompletion: pre ? pre.unbounded : [],
        latencyWindow: worst,
    };
};

const activity = loadAds(johnnyCastaway.resources.activity);
const gagIds = [...new Set(activity.scenes.map((s) => s.tagId?.id).filter((id) => id != null))];
const targets = [
    ...gagIds.map((tag) => ({ adsName: johnnyCastaway.resources.activity, tag })),
    { adsName: 'FISHING.ADS', tag: 2 },
];

console.log('gag                      completeTick  earlyCompletion(unbounded live)  finish->handoff latency');
for (const t of targets) {
    const r = runGag({ ...t, seed: 0x4a430000 + t.tag });
    const label = `${r.adsName} #${r.tag}`.padEnd(24);
    const early = r.earlyCompletion.length ? r.earlyCompletion.join(',') : '-';
    console.log(`${label} ${String(r.completedTick).padStart(11)}  ${early.padEnd(31)}  ${r.latencyWindow}`);
}

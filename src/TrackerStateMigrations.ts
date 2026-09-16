import { produce } from 'immer';
import type { TrackerState } from './tracker/Slice';

export function migrateTrackerState(old: TrackerState): TrackerState {
    return produce(old, (draft) => {
        for (const key of Object.keys(old.hints)) {
            if (old.hints[key] && !Array.isArray(old.hints[key])) {
                draft.hints[key] = [old.hints[key]];
            }
        }
        const oldPrefix =
            '\\Fire Sanctuary\\Main\\Magmanos Fight Room\\Underground Rupee beneath Double Magmanos Room';
        const newPrefix =
            '\\Fire Sanctuary\\Main\\Magmanos Fight Room\\Lower Part\\Underground Rupee beneath Double Magmanos Room';

        if (draft.checkedChecks) {
            draft.checkedChecks = draft.checkedChecks.map((check) =>
                check.startsWith(oldPrefix)
                    ? check.replace(oldPrefix, newPrefix)
                    : check,
            );
        }
        if (draft.checkHints) {
            for (const [k, v] of Object.entries(draft.checkHints)) {
                if (k.startsWith(oldPrefix)) {
                    delete draft.checkHints[k];
                    draft.checkHints[k.replace(oldPrefix, newPrefix)] = v;
                }
            }
        }
        if (draft.lastCheckedLocation?.startsWith(oldPrefix)) {
            draft.lastCheckedLocation = draft.lastCheckedLocation.replace(
                oldPrefix,
                newPrefix,
            );
        }
    });
}

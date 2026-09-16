import type { InventoryItem } from './Inventory';
import type { Logic } from './Logic';
import {
    cubeCheckToCubeCollected,
    dungeonCompletionItems,
} from './TrackerModifications';

export function getNumLooseGratitudeCrystals(
    _logic?: Logic,
    _checkedChecks?: Set<string>,
    _isShuffleOn?: boolean,
) {
    return 0;
}

export function getAdditionalItems(
    logic: Logic,
    inventory: Record<InventoryItem, number>,
    checkedChecks: Set<string>,
) {
    const result: Record<string, number> = {};
    // Completed dungeons
    for (const [dungeon, completionCheck] of Object.entries(
        logic.dungeonCompletionRequirements,
    )) {
        if (checkedChecks.has(completionCheck)) {
            result[dungeonCompletionItems[dungeon]] = 1;
        }
    }

    if (inventory['Triforce'] === 3) {
        result[dungeonCompletionItems['Sky Keep']] = 1;
    }

    // If this is a goddess cube check, mark the requirement as checked
    // since this is the requirement used by the goddess chests.
    for (const check of checkedChecks) {
        const cubeCollectedItem = cubeCheckToCubeCollected[check];
        if (cubeCollectedItem) {
            result[cubeCollectedItem] = 1;
        }
    }

    result['Gratitude Crystal'] = inventory['Gratitude Crystal'] ?? 0;
    return result;
}

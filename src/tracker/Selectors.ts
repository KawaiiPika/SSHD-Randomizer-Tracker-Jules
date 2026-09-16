import { createSelector, lruMemoize } from '@reduxjs/toolkit';
import { compact, groupBy, isEqual, keyBy, partition, sumBy } from 'es-toolkit';
import {
    counterBasisSelector,
    trickSemiLogicSelector,
    trickSemiLogicTrickListSelector,
} from '../customization/Selectors';
import {
    dumpCheckToSSHDName,
    oldDumpShortNameToSSHDName,
    sshdNameToDumpCheck,
    sshdNameToOldShortName,
} from '../data/SSHDLocationMapping';
import { parseHintsText } from '../hints/HintsParser';
import {
    getAllowedStartingEntrances,
    getEntrancePools,
    getExitRules,
    getExits,
    getUsedEntrances,
} from '../logic/Entrances';
import { type InventoryItem, itemMaxes } from '../logic/Inventory';
import { keyData } from '../logic/KeyLogic';
import {
    type Check,
    type CheckGroup,
    type DungeonName,
    dungeonNames,
    type HintRegion,
    isDungeon,
    type LogicalState,
} from '../logic/Locations';
import type { LogicalCheck } from '../logic/Logic';
import { mapInventory, mapSettings } from '../logic/Mappers';
import { getAdditionalItems } from '../logic/Misc';
import { exploreAreaGraph } from '../logic/Pathfinding';
import {
    areaGraphSelector,
    logicSelector,
    optionsSelector,
} from '../logic/Selectors';
import {
    computeSemiLogic,
    getVisibleTricksEnabledRequirements,
} from '../logic/SemiLogic';
import { doesHintDistroUseGossipStone } from '../logic/ThingsThatWouldBeNiceToHaveInTheDump';
import {
    cubeCheckToGoddessChestCheck,
    dungeonCompletionItems,
    goddessChestCheckToCubeCheck,
} from '../logic/TrackerModifications';
import {
    computeLeastFixedPoint,
    mergeRequirements,
} from '../logic/bitlogic/BitLogic';
import { BitVector } from '../logic/bitlogic/BitVector';
import { validateSettings } from '../permalink/Settings';
import type { TypedOptions } from '../permalink/SettingsTypes';
import type { RootState } from '../store/Store';
import { emptyArray, mapValues } from '../utils/Collections';
import { stubTrue } from '../utils/Function';
import { currySelector } from '../utils/Redux';

const bitVectorMemoizeOptions = {
    memoizeOptions: {
        resultEqualityCheck: (a: BitVector, b: BitVector) =>
            a instanceof BitVector && b instanceof BitVector && a.equals(b),
    },
};

const parsedHintsSelector = createSelector(
    [(state: RootState) => state.tracker.userHintsText, logicSelector],
    (hintsText, logic) => parseHintsText(hintsText, logic.hintRegions),
    {
        // Make sure we don't accumulate garbage for every single
        // value of the hints text input
        memoize: lruMemoize,
        memoizeOptions: {
            // Skip rerenders if the parsed hints are deeply equal
            resultEqualityCheck: isEqual,
        },
    },
);

/**
 * A map from hint region to all tracked and parsed region hints.
 */
const allAreaHintsSelector = createSelector(
    [
        logicSelector,
        parsedHintsSelector,
        (state: RootState) => state.tracker.hints,
    ],
    (logic, parsed, tracked) =>
        Object.fromEntries(
            logic.hintRegions.map((region) => [
                region,
                [...(tracked[region] ?? []), ...(parsed[region] ?? [])],
            ]),
        ),
);

/**
 * Selects the hint for a given area.
 */
export const areaHintSelector = currySelector(
    createSelector(
        [(_state: RootState, area: string) => area, allAreaHintsSelector],
        (area, hints) => hints[area] ?? emptyArray(),
    ),
);

/**
 * All hinted items.
 */
export const checkHintsSelector = (state: RootState) =>
    state.tracker.checkHints;

/**
 * Selects the hinted item for a given check
 */
export const checkHintSelector = currySelector(
    (state: RootState, checkId: string) => state.tracker.checkHints[checkId],
);

/**
 * Selects ALL settings, even the ones not logically relevant.
 */
export const allSettingsSelector = createSelector(
    [optionsSelector, (state: RootState) => state.tracker.settings],
    validateSettings,
);

/**
 * Selects the current logical settings. This is basically the same
 * thing but differently typed to only provide the subset of logically relevant settings.
 */
export const settingsSelector: (state: RootState) => TypedOptions =
    allSettingsSelector;

/**
 * Selects a particular logical settings value.
 */
export const settingSelector: <K extends keyof TypedOptions>(
    setting: K,
) => (state: RootState) => TypedOptions[K] = currySelector(
    <K extends keyof TypedOptions>(
        state: RootState,
        setting: K,
    ): TypedOptions[K] => settingsSelector(state)[setting],
);

const rawItemCountsSelector = (state: RootState) => state.tracker.inventory;

/** A map of all actual items to their counts. Since redux only stores partial counts, this ensures all items are present. */
const inventorySelector = createSelector(
    [rawItemCountsSelector],
    (rawInventory) =>
        mapValues(itemMaxes, (_val, item) => rawInventory[item] ?? 0),
    { memoizeOptions: { resultEqualityCheck: isEqual } },
);

export const rawItemCountSelector = currySelector(
    (state: RootState, item: InventoryItem) =>
        inventorySelector(state)[item] ?? 0,
);

const checkedChecksSelector = createSelector(
    [(state: RootState) => state.tracker.checkedChecks],
    (checkedChecks) => new Set(checkedChecks),
);

const checkItemsSelector = createSelector(
    [logicSelector, inventorySelector, checkedChecksSelector],
    getAdditionalItems,
    { memoizeOptions: { resultEqualityCheck: isEqual } },
);

export const totalGratitudeCrystalsSelector = createSelector(
    [
        rawItemCountSelector('Gratitude Crystal Pack'),
        rawItemCountSelector('Gratitude Crystal'),
    ],
    (packCount, singleCount) => packCount * 5 + singleCount,
);

const allowedStartingEntrancesSelector = createSelector(
    [logicSelector, settingSelector('random-start-entrance')],
    getAllowedStartingEntrances,
);

const skyKeepRequiredSelector = (state: RootState) => {
    const settings = settingsSelector(state);
    if (!settings['triforce-required']) {
        return false;
    }
    return settings['triforce-shuffle'] !== 'Anywhere';
};

export const requiredDungeonsSelector = createSelector(
    [
        (state: RootState) => state.tracker.requiredDungeons,
        settingSelector('required-dungeon-count'),
        skyKeepRequiredSelector,
    ],
    (selectedRequiredDungeons, numRequiredDungeons, skyKeepRequired) => {
        // Enforce consistent order
        return dungeonNames.filter((d) =>
            d === 'Sky Keep'
                ? skyKeepRequired
                : numRequiredDungeons === 6 ||
                  selectedRequiredDungeons.includes(d),
        );
    },
);

/**
 * Describes which entrances are available for a given pool (dungeons, silent realms, starting, ...)
 * This is a bit overkill because it keeps all pools available at all times, but it
 * used to be necessary when we allowed context menus to select entrances, since
 * context menus had to be always rendered and there wasn't a way to include
 */
export const entrancePoolsSelector = createSelector(
    [
        areaGraphSelector,
        allowedStartingEntrancesSelector,
        settingSelector('randomize-entrances'),
        settingSelector('randomize-dungeon-entrances'),
        requiredDungeonsSelector,
    ],
    getEntrancePools,
);

const mappedExitsSelector = (state: RootState) => state.tracker.mappedExits;

/** Defines how exits should be resolved. */
const exitRulesSelector = createSelector(
    [
        logicSelector,
        settingSelector('random-start-entrance'),
        settingSelector('randomize-entrances'),
        settingSelector('randomize-dungeon-entrances'),
        settingSelector('randomize-trials'),
        settingSelector('random-start-statues'),
        settingSelector('empty-unrequired-dungeons'),
        requiredDungeonsSelector,
    ],
    getExitRules,
);

export const exitsSelector = createSelector(
    [logicSelector, exitRulesSelector, mappedExitsSelector],
    getExits,
);

export const exitsByIdSelector = createSelector([exitsSelector], (exits) =>
    keyBy(exits, (e) => e.exit.id),
);

/**
 * Selects the requirements that depend on state/settings, but should still be revealed during
 * tooltip computations. Any recalculations here will cause the tooltips cache to throw away its
 * cached tooltips and recalculate requirements (after logic has loaded, this is only settings, mapped exits, and required dungeons).
 */
export const settingsRequirementsSelector = createSelector(
    [
        logicSelector,
        optionsSelector,
        settingsSelector,
        exitsSelector,
        requiredDungeonsSelector,
    ],
    mapSettings,
);

const inventoryRequirementsSelector = createSelector(
    [logicSelector, inventorySelector],
    mapInventory,
);

const checkRequirementsSelector = createSelector(
    [logicSelector, checkItemsSelector],
    mapInventory,
);

export const inLogicBitsSelector = createSelector(
    [
        logicSelector,
        settingsRequirementsSelector,
        inventoryRequirementsSelector,
        checkRequirementsSelector,
    ],
    (logic, settingsRequirements, inventoryRequirements, checkRequirements) =>
        computeLeastFixedPoint(
            'Logical state',
            mergeRequirements(
                logic.numRequirements,
                logic.staticRequirements,
                settingsRequirements,
                inventoryRequirements,
                checkRequirements,
            ),
        ),
    bitVectorMemoizeOptions,
);

const optimisticInventoryItemRequirementsSelector = createSelector(
    [logicSelector],
    (logic) => mapInventory(logic, itemMaxes),
);

/**
 * A selector that computes logical state as if you had gotten every item.
 * Useful for checking if something is out of logic because of missing
 * items or generally unreachable because of missing entrances.
 */
const optimisticLogicBitsSelector = createSelector(
    [
        logicSelector,
        settingsRequirementsSelector,
        optimisticInventoryItemRequirementsSelector,
        // TODO this should probably also treat all check requirements as available? E.g. dungeons completed, cubes gotten?
        checkRequirementsSelector,
        inLogicBitsSelector,
    ],
    (
        logic,
        settingsRequirements,
        optimisticInventoryRequirements,
        checkRequirements,
        inLogicBits,
    ) =>
        computeLeastFixedPoint(
            'Optimistic state',
            mergeRequirements(
                logic.numRequirements,
                logic.staticRequirements,
                settingsRequirements,
                optimisticInventoryRequirements,
                checkRequirements,
            ),
            inLogicBits,
        ),
    bitVectorMemoizeOptions,
);

export const availableLocationsSelector = (state: RootState) =>
    state.tracker.availableLocations;

export const availableLocationsSetSelector = createSelector(
    [availableLocationsSelector],
    (locs) => {
        if (!locs || locs.length === 0) return null;
        const set = new Set<string>();

        const addVariants = (str: string) => {
            if (!str) return;
            const trimmed = str.trim();
            set.add(str);
            set.add(trimmed);

            const mapped =
                dumpCheckToSSHDName[trimmed] ?? dumpCheckToSSHDName[str];
            if (mapped) {
                set.add(mapped);
                set.add(mapped.trim());
            }
            const mappedShort =
                oldDumpShortNameToSSHDName[trimmed] ??
                oldDumpShortNameToSSHDName[str];
            if (mappedShort) {
                set.add(mappedShort);
                set.add(mappedShort.trim());
            }

            const revDump =
                sshdNameToDumpCheck[trimmed] ?? sshdNameToDumpCheck[str];
            if (revDump) {
                set.add(revDump);
                set.add(revDump.trim());
            }
            const revShort =
                sshdNameToOldShortName[trimmed] ?? sshdNameToOldShortName[str];
            if (revShort) {
                set.add(revShort);
                set.add(revShort.trim());
            }

            const dashIdx = trimmed.indexOf(' - ');
            if (dashIdx !== -1) {
                const afterDash = trimmed.substring(dashIdx + 3).trim();
                set.add(afterDash);
                const mappedDash =
                    dumpCheckToSSHDName[afterDash] ??
                    oldDumpShortNameToSSHDName[afterDash];
                if (mappedDash) {
                    set.add(mappedDash);
                    set.add(mappedDash.trim());
                }
            } else {
                set.add(`Batreaux's House - ${trimmed}`);
            }
        };

        for (const loc of locs) {
            addVariants(loc);
        }
        return set;
    },
);

export const areaHasApLocationsSelector = createSelector(
    [logicSelector, availableLocationsSetSelector],
    (logic, apLocationsSet) => {
        if (!apLocationsSet) return null;
        const areasWithLocations = new Set<string>();
        for (const [checkId, check] of Object.entries(logic.checks)) {
            const checkSshdName = dumpCheckToSSHDName[checkId];
            const oldShortName =
                oldDumpShortNameToSSHDName[check.name] ??
                oldDumpShortNameToSSHDName[check.name.trim()];
            if (
                apLocationsSet.has(check.name) ||
                apLocationsSet.has(check.name.trim()) ||
                apLocationsSet.has(`Batreaux's House - ${check.name.trim()}`) ||
                apLocationsSet.has(checkId) ||
                apLocationsSet.has(checkId.trim()) ||
                (checkSshdName &&
                    (apLocationsSet.has(checkSshdName) ||
                        apLocationsSet.has(checkSshdName.trim()) ||
                        apLocationsSet.has(
                            `Batreaux's House - ${checkSshdName.trim()}`,
                        ))) ||
                (oldShortName &&
                    (apLocationsSet.has(oldShortName) ||
                        apLocationsSet.has(oldShortName.trim())))
            ) {
                if (check.area) {
                    areasWithLocations.add(check.area);
                }
            }
        }
        return areasWithLocations;
    },
);

const isTruthyOption = (val: unknown): boolean =>
    val === true || val === 'on' || val === 'true';

const skyKeepNonprogressSelector = createSelector(
    [settingsSelector],
    (settings) =>
        isTruthyOption(settings['empty-unrequired-dungeons']) &&
        (settings['triforce-required'] === false ||
            settings['triforce-shuffle'] === 'Anywhere'),
);

export const areaNonprogressSelector = createSelector(
    [
        skyKeepNonprogressSelector,
        settingSelector('empty-unrequired-dungeons'),
        requiredDungeonsSelector,
        areaHasApLocationsSelector,
    ],
    (
        skyKeepNonprogress,
        emptyUnrequiredDungeons,
        requiredDungeons,
        areasWithApLocations,
    ) => {
        const isEudOn = isTruthyOption(emptyUnrequiredDungeons);
        return (area: string) => {
            if (areasWithApLocations) {
                if (areasWithApLocations.has(area)) {
                    return false;
                }
                if (isDungeon(area)) {
                    return true;
                }
            }
            return area === 'Sky Keep'
                ? skyKeepNonprogress
                : isEudOn && isDungeon(area)
                  ? !requiredDungeons.includes(area)
                  : false;
        };
    },
);

const areaHiddenSelector = createSelector(
    [
        areaNonprogressSelector,
        settingSelector('randomize-entrances'),
        settingSelector('randomize-dungeon-entrances'),
    ],
    (areaNonprogress, randomEntranceSetting, randomDungeonEntranceSetting) => {
        const dungeonEntranceSetting =
            randomDungeonEntranceSetting ?? randomEntranceSetting;
        return (area: string) =>
            areaNonprogress(area) &&
            (!isDungeon(area) ||
                (area === 'Sky Keep' &&
                    dungeonEntranceSetting !==
                        'All Surface Dungeons + Sky Keep'));
    },
);

export const isCheckBannedSelector = createSelector(
    [
        logicSelector,
        areaNonprogressSelector,
        availableLocationsSetSelector,
        settingSelector('excluded-locations'),
        settingSelector('rupeesanity'),
        settingSelector('shopsanity'),
        settingSelector('beedle-shopsanity'),
        settingSelector('beedle-shop-shuffle'),
        settingSelector('rupin-shopsanity'),
        settingSelector('luv-shopsanity'),
        settingSelector('tadtonesanity'),
        settingSelector('tadtone-shuffle'),
        settingSelector('treasuresanity-in-silent-realms'),
        settingSelector('trial-treasure-amount'),
        settingSelector('hint-distribution'),
        settingSelector('npc-closet-shuffle'),
        settingSelector('stamina-fruit-shuffle'),
        settingSelector('underground-rupee-shuffle'),
        settingSelector('gossip-stone-treasure-shuffle'),
    ],
    (
        logic,
        areaNonprogress,
        availableLocationsSet,
        bannedLocations,
        rupeeSanity,
        shopSanity,
        beedleShopsanity,
        beedleShopShuffle,
        rupinShopSanity,
        luvShopSanity,
        tadtoneSanity,
        tadtoneShuffle,
        silentRealmTreasuresanity,
        silentRealmTreasureAmount,
        hintDistro,
        npcClosetShuffle,
        staminaFruitShuffle,
        undergroundRupeeShuffle,
        gossipStoneShuffle,
    ) => {
        const bannedChecks = new Set<string>();
        for (const loc of bannedLocations) {
            const trimmed = loc.trim();
            bannedChecks.add(loc);
            bannedChecks.add(trimmed);
            const mappedShort =
                oldDumpShortNameToSSHDName[trimmed] ??
                oldDumpShortNameToSSHDName[loc];
            if (mappedShort) {
                bannedChecks.add(mappedShort);
                bannedChecks.add(mappedShort.trim());
            }
            const mappedId =
                dumpCheckToSSHDName[trimmed] ?? dumpCheckToSSHDName[loc];
            if (mappedId) {
                bannedChecks.add(mappedId);
                bannedChecks.add(mappedId.trim());
            }
        }
        const rupeesExcluded =
            rupeeSanity === 'Vanilla' || rupeeSanity === false;
        const maxRelics = silentRealmTreasuresanity
            ? silentRealmTreasureAmount
            : 0;
        const isOffOrVanilla = (val: unknown): boolean =>
            val === 'vanilla' || val === 'off' || val === false;
        const isOff = (val: unknown): boolean => val === 'off' || val === false;

        const banBeedle =
            beedleShopShuffle !== undefined
                ? isOffOrVanilla(beedleShopShuffle)
                : shopSanity !== undefined
                  ? shopSanity !== true
                  : beedleShopsanity !== true;
        const banGearShop = rupinShopSanity !== true;
        const banPotionShop = luvShopSanity !== true;
        const banClosets =
            npcClosetShuffle === undefined || isOffOrVanilla(npcClosetShuffle);
        const banStaminaFruit =
            staminaFruitShuffle === undefined || isOff(staminaFruitShuffle);
        const banUndergroundRupee =
            undergroundRupeeShuffle === undefined ||
            isOff(undergroundRupeeShuffle);
        const isTadtoneBanned =
            tadtoneSanity !== undefined
                ? !tadtoneSanity
                : tadtoneShuffle === undefined || isOff(tadtoneShuffle);

        const banGossipStoneTreasure =
            gossipStoneShuffle !== undefined && isOff(gossipStoneShuffle);

        const trialTreasurePattern = /Relic (\d+)/;
        const isExcessRelic = (check: LogicalCheck) => {
            if (check.type === 'trial_treasure') {
                const match = check.name.match(trialTreasurePattern);
                return match && parseInt(match[1], 10) > maxRelics;
            }
        };

        const isBannedCubeCheckViaChest = (
            checkId: string,
            check: LogicalCheck,
        ) => {
            return (
                check.type === 'tr_cube' &&
                bannedChecks.has(
                    logic.checks[cubeCheckToGoddessChestCheck[checkId]].name,
                )
            );
        };

        const isBannedChestViaCube = (checkId: string) => {
            const cube = goddessChestCheckToCubeCheck[checkId];
            return cube && areaNonprogress(logic.checks[cube].area!);
        };

        const gossipStoneUsed =
            doesHintDistroUseGossipStone[hintDistro] ?? stubTrue;

        return (checkId: string) => {
            let check = logic.checks[checkId];
            if (!check) {
                const found = Object.values(logic.checks).find(
                    (c) => c.name === checkId,
                );
                if (found) {
                    check = found;
                }
            }
            if (!check) return true;

            const checkType = check.type as string;
            const isClosetCheck =
                checkType === 'closet' || checkType === 'Closets';

            if (availableLocationsSet) {
                const checkSshdName = dumpCheckToSSHDName[checkId];
                const oldShortName =
                    oldDumpShortNameToSSHDName[check.name] ??
                    oldDumpShortNameToSSHDName[check.name.trim()];
                const isCheckInAp =
                    availableLocationsSet.has(check.name) ||
                    availableLocationsSet.has(check.name.trim()) ||
                    availableLocationsSet.has(
                        `Batreaux's House - ${check.name.trim()}`,
                    ) ||
                    availableLocationsSet.has(checkId) ||
                    availableLocationsSet.has(checkId.trim()) ||
                    (checkSshdName &&
                        (availableLocationsSet.has(checkSshdName) ||
                            availableLocationsSet.has(checkSshdName.trim()) ||
                            availableLocationsSet.has(
                                `Batreaux's House - ${checkSshdName.trim()}`,
                            ))) ||
                    (oldShortName &&
                        (availableLocationsSet.has(oldShortName) ||
                            availableLocationsSet.has(oldShortName.trim())));

                if (isCheckInAp) {
                    return false;
                }

                // Check goddess cube via chest
                if (check.type === 'tr_cube') {
                    const chestCheckId = cubeCheckToGoddessChestCheck[checkId];
                    if (chestCheckId) {
                        const chestCheck = logic.checks[chestCheckId];
                        const chestSshdName = dumpCheckToSSHDName[chestCheckId];
                        if (
                            chestCheck &&
                            (availableLocationsSet.has(chestCheck.name) ||
                                availableLocationsSet.has(
                                    chestCheck.name.trim(),
                                ) ||
                                availableLocationsSet.has(chestCheckId) ||
                                availableLocationsSet.has(
                                    chestCheckId.trim(),
                                ) ||
                                (chestSshdName &&
                                    (availableLocationsSet.has(chestSshdName) ||
                                        availableLocationsSet.has(
                                            chestSshdName.trim(),
                                        ))))
                        ) {
                            return false;
                        }
                    }
                }

                return true;
            }

            return (
                bannedChecks.has(check.name) ||
                bannedChecks.has(checkId) ||
                areaNonprogress(logic.checks[checkId]?.area ?? check.area!) ||
                isExcessRelic(check) ||
                isBannedChestViaCube(checkId) ||
                isBannedCubeCheckViaChest(checkId, check) ||
                (rupeesExcluded && check.type === 'rupee') ||
                (banBeedle && check.type === 'beedle_shop') ||
                (banGearShop && check.type === 'gear_shop') ||
                (banPotionShop && check.type === 'potion_shop') ||
                (isTadtoneBanned && check.type === 'tadtone') ||
                (banClosets && isClosetCheck) ||
                (banStaminaFruit && checkType === 'stamina_fruit') ||
                (banUndergroundRupee && checkType === 'underground_rupee') ||
                (check.type === 'gossip_stone' &&
                    (banGossipStoneTreasure || !gossipStoneUsed(checkId)))
            );
        };
    },
);

const dungeonKeyLogicSelector = createSelector(
    [
        logicSelector,
        settingSelector('logic-mode'),
        settingSelector('boss-key-mode'),
        settingSelector('small-key-mode'),
        settingsRequirementsSelector,
        checkRequirementsSelector,
        isCheckBannedSelector,
        optimisticLogicBitsSelector,
    ],
    keyData,
);

/** A selector for the requirements that assume every trick enabled in customization is enabled. */
const visibleTricksRequirementsSelector = createSelector(
    [
        logicSelector,
        optionsSelector,
        settingsSelector,
        trickSemiLogicTrickListSelector,
    ],
    getVisibleTricksEnabledRequirements,
);

export const locationsForItemSelector = currySelector(
    createSelector(
        [
            checkHintsSelector,
            logicSelector,
            (_state: RootState, item: InventoryItem) => item,
        ],
        (checkHints, logic, item) =>
            Object.entries(checkHints)
                .filter(([, itemHint]) => itemHint === item)
                .map(([location, _]) => logic.checks[location].name),
    ),
);

const semiLogicBitsSelector = createSelector(
    [
        logicSelector,
        isCheckBannedSelector,
        checkedChecksSelector,
        inventorySelector,
        inLogicBitsSelector,
        dungeonKeyLogicSelector,
        settingsRequirementsSelector,
        checkHintsSelector,
        trickSemiLogicSelector,
        visibleTricksRequirementsSelector,
    ],
    computeSemiLogic,
);

export const getRequirementLogicalStateSelector = createSelector(
    [logicSelector, inLogicBitsSelector, semiLogicBitsSelector],
    (logic, inLogicBits, semiLogicBits) =>
        (requirement: string): LogicalState => {
            const bit = logic.itemBits[requirement];
            return inLogicBits.test(bit)
                ? 'inLogic'
                : semiLogicBits.inSemiLogicBits.test(bit)
                  ? 'semiLogic'
                  : semiLogicBits.inTrickLogicBits.test(bit)
                    ? 'trickLogic'
                    : 'outLogic';
        },
);

export const dungeonCompletedSelector = currySelector(
    createSelector(
        [
            (_state: RootState, name: DungeonName) => name,
            // This dependency is the wrong way around, I think
            checkItemsSelector,
        ],
        (name, checkItems) => Boolean(checkItems[dungeonCompletionItems[name]]),
    ),
);

export const checkSelector = currySelector(
    createSelector(
        [
            (_state: RootState, checkId: string) => checkId,
            logicSelector,
            getRequirementLogicalStateSelector,
            checkedChecksSelector,
            mappedExitsSelector,
        ],
        (
            checkId,
            logic,
            getRequirementLogicalState,
            checkedChecks,
            mappedExits,
        ): Check => {
            const logicalState = getRequirementLogicalState(checkId);

            if (logic.checks[checkId]) {
                const checkName = logic.checks[checkId].name;
                const shortCheckName = checkName.includes('-')
                    ? checkName.substring(checkName.indexOf('-') + 1).trim()
                    : checkName;
                return {
                    checked: checkedChecks.has(checkId),
                    checkId,
                    checkName: shortCheckName,
                    type: logic.checks[checkId].type,
                    logicalState,
                };
            } else if (logic.areaGraph.exits[checkId]) {
                const shortCheckName =
                    logic.areaGraph.exits[checkId].short_name;
                return {
                    checked: Boolean(mappedExits[checkId]),
                    checkId,
                    checkName: shortCheckName,
                    type: 'exit',
                    logicalState,
                };
            } else if (checkId !== '') {
                throw new Error('unknown check ' + checkId);
            }
            return undefined as unknown as Check;
        },
    ),
);

export const areasSelector = createSelector(
    [
        logicSelector,
        checkedChecksSelector,
        exitsSelector,
        isCheckBannedSelector,
        getRequirementLogicalStateSelector,
        areaNonprogressSelector,
        areaHiddenSelector,
        counterBasisSelector,
        settingSelector('randomize-entrances'),
        settingSelector('randomize-dungeon-entrances'),
    ],
    (
        logic,
        checkedChecks,
        allExits,
        isCheckBanned,
        getLogicalState,
        isAreaNonprogress,
        isAreaHidden,
        counterBasis,
        randomEntranceSetting,
        randomDungeonEntranceSetting,
    ): HintRegion[] => {
        const dungeonEntranceSetting =
            randomDungeonEntranceSetting ?? randomEntranceSetting;
        const exitsById = keyBy(allExits, (e) => e.exit.id);
        return compact(
            logic.hintRegions.map((area): HintRegion | undefined => {
                const checks = logic.checksByHintRegion[area];
                // Loose crystal checks can be banned to not require picking them up
                // in logic, but we want to allow marking them as collected.
                const progressChecks = checks.filter(
                    (check) =>
                        !isCheckBanned(check) ||
                        logic.checks[check].type === 'loose_crystal',
                );

                const [extraChecks, regularChecks_] = partition(
                    progressChecks,
                    (check) =>
                        logic.checks[check].type === 'gossip_stone' ||
                        logic.checks[check].type === 'tr_cube' ||
                        logic.checks[check].type === 'loose_crystal',
                );

                const nonProgress = isAreaNonprogress(area);
                const regularChecks = nonProgress ? [] : regularChecks_;
                const shouldCount = (state: LogicalState) =>
                    counterBasis === 'logic'
                        ? state === 'inLogic'
                        : state !== 'outLogic';

                const checkGroup = (checks: string[]): CheckGroup => {
                    const nonBannedChecks = checks.filter(
                        (c) => !isCheckBanned(c),
                    );
                    const remaining = nonBannedChecks.filter(
                        (c) => !checkedChecks.has(c),
                    );
                    const accessible = remaining.filter((c) =>
                        shouldCount(getLogicalState(c)),
                    );
                    return {
                        // Intentionally include banned but shown checks in the list
                        // of checks, but do not count them anywhere!
                        list: checks,
                        numTotal: nonBannedChecks.length,
                        numAccessible: accessible.length,
                        numRemaining: remaining.length,
                    };
                };

                const extraLocations: HintRegion<string>['extraLocations'] =
                    mapValues(
                        groupBy(
                            extraChecks,
                            (check) => logic.checks[check].type,
                        ),
                        checkGroup,
                    );

                const relevantExits = (
                    logic.exitsByHintRegion[area] ?? []
                ).filter((e) => {
                    const exitMapping = exitsById[e];
                    if (!exitMapping) {
                        return false;
                    }
                    return (
                        exitMapping.canAssign &&
                        exitMapping.rule.type === 'random'
                    );
                });

                const remainingExits = relevantExits.filter((e) => {
                    const exitMapping = exitsById[e];
                    return !exitMapping.entrance;
                });

                const accessibleExits = remainingExits.filter((e) => {
                    const exitMapping = exitsById[e];
                    return (
                        exitMapping.rule.type === 'random' &&
                        !exitMapping.rule.isKnownIrrelevant &&
                        shouldCount(getLogicalState(e))
                    );
                });

                extraLocations.exits = {
                    list: relevantExits,
                    numAccessible: accessibleExits.length,
                    numRemaining: remainingExits.length,
                    numTotal: relevantExits.length,
                } satisfies CheckGroup;

                const isSkyKeepEntranceRando =
                    area === 'Sky Keep' &&
                    dungeonEntranceSetting ===
                        'All Surface Dungeons + Sky Keep';

                const hidden =
                    isAreaHidden(area) ||
                    (!isSkyKeepEntranceRando &&
                        progressChecks.length === 0 &&
                        relevantExits.length === 0);

                return {
                    checks: checkGroup(regularChecks),
                    extraLocations,
                    nonProgress,
                    hidden,
                    name: area,
                };
            }),
        );
    },
);

export const totalCountersSelector = createSelector(
    [areasSelector, exitsByIdSelector],
    (areas, exits) => {
        const numChecked = sumBy(
            areas,
            (a) => a.checks.numTotal - a.checks.numRemaining,
        );
        const numAccessible = sumBy(areas, (a) => a.checks.numAccessible);
        const numRemaining = sumBy(areas, (a) => a.checks.numRemaining);
        let numExitsAccessible = sumBy(
            areas,
            (a) => a.extraLocations.exits?.numAccessible ?? 0,
        );

        const startMapping = exits['\\Start'];
        const needsStartingEntrance = !startMapping.entrance;
        if (needsStartingEntrance) {
            numExitsAccessible++;
        }
        return {
            numChecked,
            numAccessible,
            numRemaining,
            numExitsAccessible,
        };
    },
);

export const usedEntrancesSelector = createSelector(
    [entrancePoolsSelector, exitsSelector],
    getUsedEntrances,
);

export const inLogicPathfindingSelector = createSelector(
    [areaGraphSelector, exitsSelector, inLogicBitsSelector],
    exploreAreaGraph,
);

export const optimisticPathfindingSelector = createSelector(
    [areaGraphSelector, exitsSelector, optimisticLogicBitsSelector],
    exploreAreaGraph,
);

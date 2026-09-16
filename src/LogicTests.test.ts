import {
    setAutoItemAssignment,
    setCounterBasis,
    setEnabledSemilogicTricks,
    setTrickSemiLogic,
} from './customization/Slice';
import { type InventoryItem, itemMaxes } from './logic/Inventory';
import type { LogicalState } from './logic/Locations';
import { logicSelector } from './logic/Selectors';
import type { TypedOptions } from './permalink/SettingsTypes';
import type { AppAction, RootState, SyncThunkResult } from './store/Store';
import { createTestLogic } from './testing/TestingUtils';
import { checkOrUncheckAll, clickCheck } from './tracker/Actions';
import {
    allSettingsSelector,
    areasSelector,
    checkHintSelector,
    checkSelector,
    isCheckBannedSelector,
    rawItemCountSelector,
    requiredDungeonsSelector,
    totalCountersSelector,
    totalGratitudeCrystalsSelector,
} from './tracker/Selectors';

import {
    acceptSettings,
    cancelItemAssignment,
    clickDungeonName,
    clickItem,
    mapEntrance,
    reset,
    setAvailableLocations,
    setCheckHint,
    setItemCounts,
    setRequiredDungeons,
} from './tracker/Slice';

describe('full logic tests', () => {
    const tester = createTestLogic();

    beforeAll(tester.initialize);
    beforeEach(tester.reset);

    /**
     * Read the value of a selector. The result is not reactive,
     * so for updated state you must read again after dispatching any actions.
     */
    function readSelector<T>(selector: (state: RootState) => T): T {
        return tester.readSelector(selector);
    }

    function dispatch(action: SyncThunkResult | AppAction) {
        return tester.dispatch(action);
    }

    /**
     * Check that a check of the given name *does not* exist in the area (most likely is banned).
     * To protect against typos, you should also verify that the check exists with different settings.
     */
    function expectCheckAbsent(areaName: string, checkName: string) {
        const check = tester.tryFindCheckId(areaName, checkName);
        expect(check).toBeUndefined();
    }

    /** Set a particular settings value. */
    function updateSettings<K extends keyof TypedOptions>(
        option: K,
        value: TypedOptions[K],
    ) {
        const settings = {
            ...readSelector(allSettingsSelector),
            [option]: value,
        };
        dispatch(acceptSettings({ settings }));
    }

    /** Set a particular settings value. */
    function updateSettingsWithReset<K extends keyof TypedOptions>(
        option: K,
        value: TypedOptions[K],
    ) {
        const settings = {
            ...readSelector(allSettingsSelector),
            [option]: value,
        };
        dispatch(reset({ settings }));
    }

    function updateSettingsWithFullInventory() {
        const fullInventory = [];
        for (const [item, count] of Object.entries(itemMaxes)) {
            for (let i = 0; i < count; i++) {
                fullInventory.push({ item: item as InventoryItem, count });
            }
        }
        dispatch(setItemCounts(fullInventory));
    }

    function checkState(checkId: string): LogicalState {
        return readSelector(checkSelector(checkId)).logicalState;
    }

    it('has some checks in logic with default settings', () => {
        const fledgesGiftId = tester.findCheckId(
            'Upper Skyloft',
            "Fledge's Gift",
        );
        expect(checkState(fledgesGiftId)).toBe('inLogic');
    });

    it('supports hint item semilogic', () => {
        const fledgesGiftId = tester.findCheckId(
            'Upper Skyloft',
            "Fledge's Gift",
        );
        const zeldaClosetGift = tester.findCheckId(
            'Upper Skyloft',
            "Zelda's Closet",
        );

        // Zelda's Closet is out of logic because it needs clawshots
        expect(checkState(zeldaClosetGift)).toBe('outLogic');

        // But if Fledge's Gift is hinted to be Clawshots...
        dispatch(setCheckHint({ checkId: fledgesGiftId, hint: 'Clawshots' }));

        // Then Zelda's Closet is semilogic
        expect(checkState(zeldaClosetGift)).toBe('semiLogic');
    });

    it('supports goddess chests and semilogic', () => {
        const chestName =
            'Northeast Island Goddess Chest behind Bombable Rocks';
        const cubeName = 'Goddess Cube at Lanayru Mine Entrance';
        // Goddess chests are excluded by default
        expectCheckAbsent('Sky', chestName);
        expectCheckAbsent('Lanayru Mine', cubeName);

        updateSettings('excluded-locations', []);
        const goddessChest = tester.findCheckId('Sky', chestName);
        const cubeCheck = tester.findCheckId('Lanayru Mine', cubeName);

        expect(checkState(goddessChest)).toBe('outLogic');

        dispatch(clickItem({ item: 'Clawshots', take: false }));
        dispatch(clickItem({ item: 'Amber Tablet', take: false }));

        // Still out of logic since we still needs bombs to access the chest itself,
        // even if we can access the cube
        expect(checkState(goddessChest)).toBe('outLogic');

        // With bombs, it's semilogic
        dispatch(clickItem({ item: 'Bomb Bag', take: false }));
        expect(checkState(goddessChest)).toBe('semiLogic');

        dispatch(clickCheck({ checkId: cubeCheck }));

        // And once we collect the cube, the chest is in logic
        expect(checkState(goddessChest)).toBe('inLogic');
    });

    it('bans goddess chest if cube is in EUD Skyview', () => {
        const chestName = 'Lumpy Pumpkin\\Goddess Chest on the Roof';
        const cubeName = 'Goddess Cube in Skyview Spring';

        updateSettings('excluded-locations', []);
        updateSettings('empty-unrequired-dungeons', true);
        expectCheckAbsent('Sky', chestName);
        expectCheckAbsent('Skyview', cubeName);

        // Either EUD is off
        updateSettings('empty-unrequired-dungeons', false);
        tester.findCheckId('Sky', chestName);
        tester.findCheckId('Skyview', cubeName);

        // Or SV is required
        updateSettings('empty-unrequired-dungeons', true);
        dispatch(clickDungeonName({ dungeonName: 'Skyview' }));
        tester.findCheckId('Sky', chestName);
        tester.findCheckId('Skyview', cubeName);
    });

    it('shows or hides Sky Keep depending on settings', () => {
        updateSettings('empty-unrequired-dungeons', true);
        const skyKeepHidden = () =>
            readSelector(areasSelector).find((a) => a.name === 'Sky Keep')!
                .hidden;
        expect(skyKeepHidden()).toBe(true);

        updateSettings(
            'randomize-entrances',
            'All Surface Dungeons + Sky Keep',
        );
        expect(skyKeepHidden()).toBe(false);

        updateSettings('randomize-entrances', 'All Surface Dungeons');
        expect(skyKeepHidden()).toBe(true);
        updateSettings('randomize-entrances', 'Required Dungeons Separately');
        expect(skyKeepHidden()).toBe(true);

        updateSettings('triforce-shuffle', 'Sky Keep');
        expect(skyKeepHidden()).toBe(false);
        updateSettings('triforce-shuffle', 'Vanilla');
        expect(skyKeepHidden()).toBe(false);
    });

    it('handles countable items', () => {
        const check = tester.findCheckId(
            'Eldin Volcano',
            'Chest behind Bombable Wall near Volcano Ascent',
        );
        expect(checkState(check)).toBe('outLogic');

        dispatch(clickItem({ item: 'Ruby Tablet', take: false }));
        expect(checkState(check)).toBe('outLogic');
        dispatch(clickItem({ item: 'Progressive Beetle', take: false }));
        expect(checkState(check)).toBe('outLogic');
        dispatch(clickItem({ item: 'Progressive Beetle', take: false }));
        expect(checkState(check)).toBe('inLogic');
    });

    it('does not assign items by default', () => {
        const fledgesGiftId = tester.findCheckId(
            'Upper Skyloft',
            "Fledge's Gift",
        );
        dispatch(clickCheck({ checkId: fledgesGiftId }));
        dispatch(clickItem({ item: 'Ruby Tablet', take: false }));
        const hintedItem = readSelector(checkHintSelector(fledgesGiftId));
        expect(hintedItem).toBeUndefined();
    });

    it('assigns items with the relevant setting', () => {
        dispatch(setAutoItemAssignment(true));
        const fledgesGiftId = tester.findCheckId(
            'Upper Skyloft',
            "Fledge's Gift",
        );
        dispatch(clickCheck({ checkId: fledgesGiftId }));
        dispatch(clickItem({ item: 'Ruby Tablet', take: false }));
        const hintedItem = readSelector(checkHintSelector(fledgesGiftId));
        expect(hintedItem).toBe('Ruby Tablet');
    });

    it('undoes when taking the item', () => {
        dispatch(setAutoItemAssignment(true));
        const fledgesGiftId = tester.findCheckId(
            'Upper Skyloft',
            "Fledge's Gift",
        );
        dispatch(clickCheck({ checkId: fledgesGiftId }));
        dispatch(clickItem({ item: 'Ruby Tablet', take: false }));
        const hintedItem = readSelector(checkHintSelector(fledgesGiftId));
        expect(hintedItem).toBe('Ruby Tablet');
        dispatch(clickItem({ item: 'Ruby Tablet', take: true }));
        const hintedItemAfterTaking = readSelector(
            checkHintSelector(fledgesGiftId),
        );
        expect(hintedItemAfterTaking).toBeUndefined();
    });

    it('allows correcting the item in an overlapping order', () => {
        dispatch(setAutoItemAssignment(true));
        const fledgesGiftId = tester.findCheckId(
            'Upper Skyloft',
            "Fledge's Gift",
        );
        dispatch(clickCheck({ checkId: fledgesGiftId }));
        dispatch(clickItem({ item: 'Ruby Tablet', take: false }));
        const hintedItem = readSelector(checkHintSelector(fledgesGiftId));
        expect(hintedItem).toBe('Ruby Tablet');
        dispatch(clickItem({ item: 'Emerald Tablet', take: false }));
        const hintedItemAfterGetting = readSelector(
            checkHintSelector(fledgesGiftId),
        );
        expect(hintedItemAfterGetting).toBe('Emerald Tablet');
        dispatch(clickItem({ item: 'Ruby Tablet', take: true }));
        const hintedItemAfterTaking = readSelector(
            checkHintSelector(fledgesGiftId),
        );
        expect(hintedItemAfterTaking).toBe('Emerald Tablet');
    });

    it('does not track gratitude crystals', () => {
        dispatch(setAutoItemAssignment(true));
        const crystalCheckId = tester.findCheckId(
            'Upper Skyloft',
            'Crystal in Knight Academy Plant',
        );
        dispatch(clickCheck({ checkId: crystalCheckId }));
        dispatch(clickItem({ item: 'Ruby Tablet', take: false }));
        const hintedItem = readSelector(checkHintSelector(crystalCheckId));
        expect(hintedItem).toBeUndefined();
    });

    it('cancels tracking when unmarking', () => {
        dispatch(setAutoItemAssignment(true));
        const fledgesGiftId = tester.findCheckId(
            'Upper Skyloft',
            "Fledge's Gift",
        );
        dispatch(clickCheck({ checkId: fledgesGiftId }));
        dispatch(clickCheck({ checkId: fledgesGiftId }));
        dispatch(clickItem({ item: 'Ruby Tablet', take: false }));
        const hintedItem = readSelector(checkHintSelector(fledgesGiftId));
        expect(hintedItem).toBeUndefined();
    });

    it('cancels tracking when cancelling', () => {
        dispatch(setAutoItemAssignment(true));
        const fledgesGiftId = tester.findCheckId(
            'Upper Skyloft',
            "Fledge's Gift",
        );
        dispatch(clickCheck({ checkId: fledgesGiftId }));
        dispatch(cancelItemAssignment());
        dispatch(clickItem({ item: 'Ruby Tablet', take: false }));
        const hintedItem = readSelector(checkHintSelector(fledgesGiftId));
        expect(hintedItem).toBeUndefined();
    });

    it('can bulk mark / unmark', () => {
        dispatch(checkOrUncheckAll('Upper Skyloft', true, true));
        let area = tester.findArea('Upper Skyloft');
        expect(area.checks.numRemaining).toBeLessThan(area.checks.numTotal);
        expect(area.checks.numRemaining).toBeGreaterThan(0);
        dispatch(checkOrUncheckAll('Upper Skyloft', false));
        area = tester.findArea('Upper Skyloft');
        expect(area.checks.numRemaining).toEqual(area.checks.numTotal);
    });

    it('handles semilogic counters', () => {
        const fledgesGift = tester.findCheckId(
            'Upper Skyloft',
            "Fledge's Gift",
        );
        dispatch(setCheckHint({ checkId: fledgesGift, hint: 'Clawshots' }));

        const area = tester.findArea('Upper Skyloft');
        expect(area.checks.numRemaining).toBeGreaterThan(0);
        const accessibleDirect = area.checks.numAccessible;

        dispatch(setCounterBasis('semilogic'));

        const areaWithSemilogic = tester.findArea('Upper Skyloft');
        expect(areaWithSemilogic.checks.numAccessible).toBeGreaterThan(
            accessibleDirect,
        );

        const totalCounterWithSemilogic = readSelector(
            totalCountersSelector,
        ).numAccessible;
        expect(totalCounterWithSemilogic).toBeGreaterThan(accessibleDirect);
    });

    it('handles starting items', () => {
        expect(
            readSelector(rawItemCountSelector('Progressive Slingshot')),
        ).toBe(0);
        updateSettingsWithReset('starting-items', ['Progressive Slingshot']);

        expect(
            readSelector(rawItemCountSelector('Progressive Slingshot')),
        ).toBe(1);
        expect(readSelector(rawItemCountSelector('Progressive Bow'))).toBe(0);
        updateSettingsWithReset('starting-items', ['Progressive Bow']);
        expect(
            readSelector(rawItemCountSelector('Progressive Slingshot')),
        ).toBe(0);
        expect(readSelector(rawItemCountSelector('Progressive Bow'))).toBe(1);
    });

    it('handles clicking items', () => {
        const click = (take: boolean) =>
            dispatch(clickItem({ item: 'Progressive Bow', take }));
        const count = () =>
            readSelector(rawItemCountSelector('Progressive Bow'));
        expect(count()).toBe(0);
        for (let i = 1; i <= 3; i++) {
            click(false);
            expect(count()).toBe(i);
        }

        // Decrement
        click(true);
        expect(count()).toBe(2);
        click(false);
        // Wrap around
        click(false);
        expect(count()).toBe(0);
        // Wrap around
        click(true);
        expect(count()).toBe(3);
    });

    it('handles trick logic', () => {
        updateSettingsWithReset('starting-items', ['Amber Tablet']);
        const cagedRobotCheck = tester.findCheckId(
            'Lanayru Desert',
            'Rescue Caged Robot',
        );
        expect(checkState(cagedRobotCheck)).toBe('outLogic');

        // You can get this check with Brakeslide and Ampilus Bomb Toss tricks
        dispatch(setTrickSemiLogic(true));
        expect(checkState(cagedRobotCheck)).toBe('trickLogic');

        // Adding a single trick means we no longer consider all tricks by default,
        // so Ampilus Bomb Toss will be missing
        dispatch(setEnabledSemilogicTricks(['Brakeslide']));
        expect(checkState(cagedRobotCheck)).toBe('outLogic');

        // If one trick is in logic and one is customized for tricklogic, still tricklogic
        updateSettings('enabled-tricks-bitless', [
            'Lanayru Desert - Ampilus Bomb Toss',
        ]);
        expect(checkState(cagedRobotCheck)).toBe('trickLogic');

        // Make sure considered tricks are not considered if the toggle is off
        dispatch(setTrickSemiLogic(false));
        expect(checkState(cagedRobotCheck)).toBe('outLogic');

        // If both tricks are in logic, the check is in logic
        updateSettings('enabled-tricks-bitless', [
            'Lanayru Desert - Ampilus Bomb Toss',
            'Brakeslide',
        ]);
        expect(checkState(cagedRobotCheck)).toBe('inLogic');
    });

    it('hides gossip stones with known hint distros', () => {
        updateSettingsWithReset('hint-distribution', 'Balanced');
        tester.findCheckId('Faron Woods', 'Gossip Stone in Deep Woods');

        updateSettingsWithReset('hint-distribution', 'Remlits Tournament');
        expectCheckAbsent('Faron Woods', 'Gossip Stone in Deep Woods');
    });

    it('handles DER = None', () => {
        updateSettingsWithFullInventory();
        updateSettings('randomize-entrances', 'None');
        tester.expectExitAbsent('Faron Woods', 'Exit to Skyview Temple');
        tester.expectExitAbsent('Central Skyloft', 'Exit to Sky Keep');

        // Dungeon requiredness changes nothing
        dispatch(clickDungeonName({ dungeonName: 'Skyview' }));
        tester.expectExitAbsent('Faron Woods', 'Exit to Skyview Temple');
        expect(readSelector(totalCountersSelector).numExitsAccessible).toBe(0);
    });

    it('handles DER = Required Dungeons Separately', () => {
        updateSettingsWithFullInventory();
        updateSettings('randomize-entrances', 'Required Dungeons Separately');
        updateSettings('empty-unrequired-dungeons', false);
        updateSettings('triforce-required', false);
        updateSettings('triforce-shuffle', 'Anywhere');

        // Unrequired dungeon together with all other unrequired dungeons (including Sky Keep)
        expect(
            tester.getExitPool('Faron Woods', 'Exit to Skyview Temple')
                .entrances.length,
        ).toBe(7);
        expect(
            tester.getExitPool('Central Skyloft', 'Exit to Sky Keep').entrances
                .length,
        ).toBe(7);

        // SV required
        dispatch(clickDungeonName({ dungeonName: 'Skyview' }));
        expect(
            tester.getExitPool('Faron Woods', 'Exit to Skyview Temple')
                .entrances.length,
        ).toBe(1);

        // Eldin together with the unrequired dungeons
        expect(
            tester.getExitPool('Eldin Volcano', 'Exit to Earth Temple')
                .entrances.length,
        ).toBe(6);

        // Make Sky Keep required
        updateSettings('triforce-required', true);
        updateSettings('triforce-shuffle', 'Sky Keep');

        expect(
            tester.getExitPool('Eldin Volcano', 'Exit to Earth Temple')
                .entrances.length,
        ).toBe(5);

        // Skyview required together with Sky Keep
        expect(
            tester.getExitPool('Faron Woods', 'Exit to Skyview Temple')
                .entrances.length,
        ).toBe(2);
        expect(
            tester.getExitPool('Central Skyloft', 'Exit to Sky Keep').entrances
                .length,
        ).toBe(2);

        // ET marked as uninteresting

        expect(readSelector(totalCountersSelector).numExitsAccessible).toBe(7);
        updateSettings('empty-unrequired-dungeons', true);
        expect(readSelector(totalCountersSelector).numExitsAccessible).toBe(2);

        tester.expectRandomExitIrrelevant(
            'Eldin Volcano',
            'Exit to Earth Temple',
        );
    });

    it('handles DER = All Surface Dungeons', () => {
        updateSettingsWithFullInventory();
        updateSettings('randomize-entrances', 'All Surface Dungeons');
        updateSettings('empty-unrequired-dungeons', true);
        updateSettings('triforce-required', false);
        updateSettings('triforce-shuffle', 'Anywhere');

        // Unrequired dungeon together with all other unrequired dungeons (excluding Sky Keep)
        expect(
            tester.getExitPool('Faron Woods', 'Exit to Skyview Temple')
                .entrances.length,
        ).toBe(6);
        tester.expectExitAbsent('Central Skyloft', 'Exit to Sky Keep');

        // SV required
        dispatch(clickDungeonName({ dungeonName: 'Skyview' }));
        expect(
            tester.getExitPool('Faron Woods', 'Exit to Skyview Temple')
                .entrances.length,
        ).toBe(6);

        // Eldin together with the unrequired dungeons
        expect(
            tester.getExitPool('Eldin Volcano', 'Exit to Earth Temple')
                .entrances.length,
        ).toBe(6);

        // Make Sky Keep required
        updateSettings('triforce-required', true);
        updateSettings('triforce-shuffle', 'Sky Keep');

        // Sky Keep still uninteresting
        expect(
            tester.getExitPool('Faron Woods', 'Exit to Skyview Temple')
                .entrances.length,
        ).toBe(6);
        tester.expectExitAbsent('Central Skyloft', 'Exit to Sky Keep');

        expect(readSelector(totalCountersSelector).numExitsAccessible).toBe(6);
    });

    it('handles DER = All Surface Dungeons + Sky Keep', () => {
        updateSettingsWithFullInventory();
        updateSettings(
            'randomize-entrances',
            'All Surface Dungeons + Sky Keep',
        );
        updateSettings('empty-unrequired-dungeons', true);
        updateSettings('triforce-required', false);
        updateSettings('triforce-shuffle', 'Anywhere');

        // Unrequired dungeon together with all other unrequired dungeons (including Sky Keep)
        expect(
            tester.getExitPool('Faron Woods', 'Exit to Skyview Temple')
                .entrances.length,
        ).toBe(7);
        expect(
            tester.getExitPool('Central Skyloft', 'Exit to Sky Keep').entrances
                .length,
        ).toBe(7);

        // SV required
        dispatch(clickDungeonName({ dungeonName: 'Skyview' }));
        expect(
            tester.getExitPool('Faron Woods', 'Exit to Skyview Temple')
                .entrances.length,
        ).toBe(7);

        // Eldin together with the other dungeons
        expect(
            tester.getExitPool('Eldin Volcano', 'Exit to Earth Temple')
                .entrances.length,
        ).toBe(7);

        // Make Sky Keep required
        updateSettings('triforce-required', true);
        updateSettings('triforce-shuffle', 'Sky Keep');

        // Sky Keep still unchanged
        expect(
            tester.getExitPool('Faron Woods', 'Exit to Skyview Temple')
                .entrances.length,
        ).toBe(7);
        expect(
            tester.getExitPool('Central Skyloft', 'Exit to Sky Keep').entrances
                .length,
        ).toBe(7);
        expect(readSelector(totalCountersSelector).numExitsAccessible).toBe(7);
    });

    it('handles num accessible exits correctly', () => {
        updateSettings(
            'randomize-entrances',
            'All Surface Dungeons + Sky Keep',
        );
        updateSettings('random-start-statues', false);

        dispatch(clickItem({ item: 'Stone of Trials', take: false }));
        dispatch(clickItem({ item: 'Clawshots', take: false }));

        expect(readSelector(totalCountersSelector).numExitsAccessible).toBe(1);

        dispatch(clickItem({ item: 'Clawshots', take: true }));

        dispatch(clickItem({ item: 'Amber Tablet', take: false }));
        expect(readSelector(totalCountersSelector).numExitsAccessible).toBe(0);

        dispatch(clickItem({ item: 'Emerald Tablet', take: false }));
        expect(readSelector(totalCountersSelector).numExitsAccessible).toBe(0);

        updateSettings('random-start-statues', true);
        expect(readSelector(totalCountersSelector).numExitsAccessible).toBe(2);

        dispatch(
            mapEntrance({
                from: tester.findExit('Sky', 'Faron Pillar\\First Time Dive')
                    .exit.id,
                to: tester.findEntranceId(
                    'Sealed Grounds',
                    'Sealed Grounds Spiral',
                ),
            }),
        );

        expect(
            tester.findExit('Sky', 'Faron Pillar\\First Time Dive').entrance,
        ).toBeTruthy();
        expect(readSelector(totalCountersSelector).numExitsAccessible).toBe(1);

        dispatch(clickItem({ item: 'Clawshots', take: false }));

        // Lanayru Pillar, Sky Keep, Skyview Temple
        expect(readSelector(totalCountersSelector).numExitsAccessible).toBe(3);

        dispatch(
            mapEntrance({
                from: tester.findExit('Central Skyloft', 'Exit to Sky Keep')
                    .exit.id,
                to: tester.findEntranceId('Sky Keep', 'Bottom Entrance'),
            }),
        );

        dispatch(
            mapEntrance({
                from: tester.findExit('Faron Woods', 'Exit to Skyview Temple')
                    .exit.id,
                to: tester.findEntranceId('Skyview', 'Main Entrance'),
            }),
        );

        expect(readSelector(totalCountersSelector).numExitsAccessible).toBe(1);
    });

    it('handles random starting entrance in accessible exits count', () => {
        expect(readSelector(totalCountersSelector).numExitsAccessible).toBe(0);

        updateSettings('random-start-entrance', 'Any');
        expect(readSelector(totalCountersSelector).numExitsAccessible).toBe(1);
    });

    it('does not consider banned crystals in semilogic', () => {
        const fledgesGift = tester.findCheckId(
            'Upper Skyloft',
            "Fledge's Gift",
        );
        dispatch(setCheckHint({ checkId: fledgesGift, hint: 'Clawshots' }));

        const zeldaCloset = tester.findCheckId(
            'Upper Skyloft',
            "In Zelda's Closet",
        );
        expect(checkState(zeldaCloset)).toBe('semiLogic');

        updateSettings('excluded-locations', ["Upper Skyloft - Fledge's Gift"]);
        expect(checkState(zeldaCloset)).toBe('outLogic');
    });

    it('requires Goddesss Harp and Ballad of the Goddess to access closed Thunderhead', () => {
        updateSettingsWithReset('open-thunderhead', 'Ballad');
        dispatch(clickItem({ item: 'Progressive Mitts', take: false }));

        const eastIslandCheck =
            '\\Sky\\Thunderhead\\East Island\\East Island Chest';
        expect(checkState(eastIslandCheck)).toBe('outLogic');

        // Only Ballad of the Goddess - still out of logic without Goddess's Harp in SSHD logic
        dispatch(clickItem({ item: 'Ballad of the Goddess', take: false }));
        expect(checkState(eastIslandCheck)).toBe('outLogic');

        // With Goddess's Harp - now both are acquired, Thunderhead opens
        dispatch(clickItem({ item: "Goddess's Harp", take: false }));
        expect(checkState(eastIslandCheck)).toBe('inLogic');
    });

    it('tracks individual gratitude crystals from inventory and never from loose crystal checks', () => {
        // Starting with 1 pack = 5 crystals
        dispatch(clickItem({ item: 'Gratitude Crystal Pack', take: false }));
        expect(readSelector(totalGratitudeCrystalsSelector)).toBe(5);

        // Receive 3 individual crystals (e.g. from Archipelago)
        dispatch(setItemCounts([{ item: 'Gratitude Crystal', count: 3 }]));
        expect(readSelector(totalGratitudeCrystalsSelector)).toBe(8);

        // Clicking a loose crystal check in the world never adds crystals
        const looseCrystalCheck = tester.findCheckId('Central Skyloft', 'Shed');
        dispatch(clickCheck({ checkId: looseCrystalCheck }));
        expect(readSelector(totalGratitudeCrystalsSelector)).toBe(8);
    });

    it('does not count loose crystal checks as crystals regardless of settings', () => {
        updateSettings('gratitude-crystal-shuffle', 'off');
        const looseCrystalCheck = tester.findCheckId('Central Skyloft', 'Shed');
        dispatch(clickCheck({ checkId: looseCrystalCheck }));
        expect(readSelector(totalGratitudeCrystalsSelector)).toBe(0);
    });

    it('shows dungeon checks by default when empty-unrequired-dungeons is false', () => {
        const areas = readSelector(areasSelector);
        const skyview = areas.find((a) => a.name === 'Skyview');
        expect(skyview).toBeDefined();
        expect(skyview!.checks.numTotal).toBeGreaterThan(0);
    });

    it('normalizes Skyview Temple in setRequiredDungeons', () => {
        dispatch(setRequiredDungeons(['Skyview Temple']));
        const req = readSelector(requiredDungeonsSelector);
        expect(req).toContain('Skyview');
    });

    it('includes SSHD closet checks and filters them when npc-closet-shuffle is vanilla', () => {
        const linksCloset = tester.findCheckId(
            'Upper Skyloft',
            "Link's Closet",
        );
        expect(linksCloset).toBeDefined();
        expect(
            tester.findCheckId('Sky', "Pumm and Kina's Closet"),
        ).toBeDefined();
        expect(
            tester.findCheckId('Lanayru Sand Sea', "Skipper's Closet"),
        ).toBeDefined();

        // When randomized (default), closet checks are not banned
        expect(readSelector(isCheckBannedSelector)(linksCloset)).toBe(false);

        // When vanilla, closet checks are banned
        updateSettingsWithReset('npc-closet-shuffle', 'vanilla');
        expect(readSelector(isCheckBannedSelector)(linksCloset)).toBe(true);

        updateSettingsWithReset('npc-closet-shuffle', 'randomized');
        expect(readSelector(isCheckBannedSelector)(linksCloset)).toBe(false);
    });

    it("makes Batreaux's House accessible with default open-batreaux-shed setting", () => {
        const batreauxExit =
            "\\Skyloft\\Skyloft Village\\Batreaux's House Exit";
        // With open-batreaux-shed on (default), the exit should be inLogic
        expect(checkState(batreauxExit)).toBe('inLogic');

        // Batreaux's House checks are in the "Batreaux's House" hint region
        // Check IDs still use dump paths, so search by dump path substring
        const reward5 = tester.findCheckId("Batreaux's House", '5 Crystals');
        // Out of logic without crystals
        expect(checkState(reward5)).toBe('outLogic');

        // With 5 gratitude crystals (1 pack = 5) in inventory, it becomes inLogic
        dispatch(setItemCounts([{ item: 'Gratitude Crystal Pack', count: 1 }]));
        expect(checkState(reward5)).toBe('inLogic');
    });

    it('hides Sky Keep when its checks are in excluded-locations', () => {
        const skyKeepArea = () =>
            readSelector(areasSelector).find((a) => a.name === 'Sky Keep')!;
        expect(skyKeepArea().hidden).toBe(false);

        const skyKeepChecks = skyKeepArea().checks.list;
        expect(skyKeepChecks.length).toBeGreaterThan(0);

        // Exclude all checks in Sky Keep
        updateSettings('excluded-locations', skyKeepChecks);
        expect(skyKeepArea().hidden).toBe(true);
    });

    it('uses official SSHD names for checks via check names in logic', () => {
        // After SSHD renaming, check.name should be the official SSHD / Archipelago name
        const fledgesGiftId = tester.findCheckId(
            'Upper Skyloft',
            "Fledge's Gift", // search by dump path substring
        );
        const logic = readSelector(logicSelector);
        const fledgesGiftCheck = logic.checks[fledgesGiftId];
        // The check name should now be the official SSHD name
        expect(fledgesGiftCheck?.name).toBe("Knight Academy - Fledge's Gift");

        const bossSVId = tester.findCheckId('Skyview', 'Heart Container');
        const bossSVCheck = logic.checks[bossSVId];
        expect(bossSVCheck?.name).toBe('Skyview Temple - Defeat Boss');
    });

    it('trusts Archipelago available locations over settings (reveals Sky Keep checks)', () => {
        // Under settings, Sky Keep is empty/nonprogress and hidden
        updateSettings('empty-unrequired-dungeons', true);
        updateSettings('triforce-shuffle', 'Anywhere');
        updateSettings('randomize-entrances', 'None');
        updateSettings('randomize-dungeon-entrances', 'None');

        const skyKeepArea = () =>
            readSelector(areasSelector).find((a) => a.name === 'Sky Keep')!;
        expect(skyKeepArea().hidden).toBe(true);
        expect(skyKeepArea().nonProgress).toBe(true);

        // Now Archipelago reports that Sky Keep checks are available in this seed
        dispatch(
            setAvailableLocations([
                'Sky Keep - Chest in First Room',
                'Sky Keep - Chest after Dreadfuse Fight',
            ]),
        );

        // Sky Keep should now be visible and not nonprogress
        expect(skyKeepArea().hidden).toBe(false);
        expect(skyKeepArea().nonProgress).toBe(false);
        expect(skyKeepArea().checks.numTotal).toBe(2);

        // The checks in availableLocations are NOT banned
        expect(
            readSelector(isCheckBannedSelector)(
                'Sky Keep - Chest in First Room',
            ),
        ).toBe(false);
        expect(
            readSelector(isCheckBannedSelector)(
                'Sky Keep - Chest after Dreadfuse Fight',
            ),
        ).toBe(false);

        // A check not in availableLocations is banned
        expect(
            readSelector(isCheckBannedSelector)(
                'Sky Keep - Sacred Power of Farore',
            ),
        ).toBe(true);

        // Clearing availableLocations reverts to settings-based behavior
        dispatch(setAvailableLocations(undefined));
        expect(skyKeepArea().hidden).toBe(true);
        expect(skyKeepArea().nonProgress).toBe(true);
    });

    it('trusts Archipelago available locations over excluded-locations', () => {
        // Exclude Fledge's Gift in settings
        updateSettings('excluded-locations', [
            "Knight Academy - Fledge's Gift",
        ]);
        expect(
            readSelector(isCheckBannedSelector)(
                "Knight Academy - Fledge's Gift",
            ),
        ).toBe(true);

        // Archipelago reports Fledge's Gift is available
        dispatch(setAvailableLocations(["Knight Academy - Fledge's Gift"]));
        expect(
            readSelector(isCheckBannedSelector)(
                "Knight Academy - Fledge's Gift",
            ),
        ).toBe(false);
    });
});

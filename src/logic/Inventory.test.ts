import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
    APClientManager,
    optionIndicesToOptions,
} from '../archipelago/Archipelago';
import { createTestLogic } from '../testing/TestingUtils';
import { resolveItem } from './Inventory';
import { optionsSelector } from './Selectors';
import { getInitialItems } from './TrackerModifications';

describe('Inventory resolveItem', () => {
    it('resolves Skyview Temple Small Key and Boss Key', () => {
        expect(resolveItem('Skyview Temple Small Key')).toEqual([
            { item: 'Skyview Small Key', count: 1 },
        ]);
        expect(resolveItem('Skyview Small Key')).toEqual([
            { item: 'Skyview Small Key', count: 1 },
        ]);
        expect(resolveItem('Skyview Temple Boss Key')).toEqual([
            { item: 'Skyview Boss Key', count: 1 },
        ]);
        expect(resolveItem('Skyview Boss Key')).toEqual([
            { item: 'Skyview Boss Key', count: 1 },
        ]);
    });

    it('resolves Rattle / Baby Rattle and Beedle Insect Cage', () => {
        expect(resolveItem('Rattle')).toEqual([
            { item: 'Baby Rattle', count: 1 },
        ]);
        expect(resolveItem('Baby Rattle')).toEqual([
            { item: 'Baby Rattle', count: 1 },
        ]);
        expect(resolveItem("Beedle's Insect Cage")).toEqual([
            { item: 'Horned Colossus Beetle', count: 1 },
        ]);
        expect(resolveItem('Horned Colossus Beetle')).toEqual([
            { item: 'Horned Colossus Beetle', count: 1 },
        ]);
    });

    it('resolves key rings and skeleton key', () => {
        expect(resolveItem('Skyview Temple Key Ring')).toEqual([
            { item: 'Skyview Small Key', count: 2 },
        ]);
        expect(resolveItem('Lanayru Mining Facility Key Ring')).toEqual([
            { item: 'Lanayru Mining Facility Small Key', count: 1 },
        ]);
        const skeleton = resolveItem('Skeleton Key');
        expect(skeleton).toContainEqual({
            item: 'Skyview Small Key',
            count: 2,
        });
        expect(skeleton).toContainEqual({
            item: 'Lanayru Mining Facility Small Key',
            count: 1,
        });
        expect(skeleton).toContainEqual({
            item: 'Ancient Cistern Small Key',
            count: 2,
        });
        expect(skeleton).toContainEqual({
            item: 'Fire Sanctuary Small Key',
            count: 3,
        });
        expect(skeleton).toContainEqual({
            item: 'Sandship Small Key',
            count: 2,
        });
        expect(skeleton).toContainEqual({
            item: 'Sky Keep Small Key',
            count: 1,
        });
        expect(skeleton).toContainEqual({
            item: 'Lanayru Caves Small Key',
            count: 1,
        });
    });

    it('resolves Song of the Hero and Triforce parts', () => {
        expect(resolveItem('Faron Song of the Hero Part')).toEqual([
            { item: 'Song of the Hero', count: 1 },
        ]);
        expect(resolveItem('Song of the Hero Part')).toEqual([
            { item: 'Song of the Hero', count: 1 },
        ]);
        expect(resolveItem('Triforce of Courage')).toEqual([
            { item: 'Triforce', count: 1 },
        ]);
        expect(resolveItem('Triforce of Wisdom')).toEqual([
            { item: 'Triforce', count: 1 },
        ]);
    });

    it('resolves regular items and ignores junk', () => {
        expect(resolveItem('Progressive Bow')).toEqual([
            { item: 'Progressive Bow', count: 1 },
        ]);
        expect(resolveItem('Blue Rupee')).toEqual([]);
    });
});

describe('APClientManager processNetItem', () => {
    it('correctly tracks Skyview Temple Small Keys and Baby Rattle from net items', () => {
        const manager = new APClientManager();
        manager.idToItem = {
            100: 'Skyview Temple Small Key',
            101: 'Rattle',
            102: 'Skyview Temple Boss Key',
        };

        manager.processNetItem(100);
        expect(manager.inventory['Skyview Small Key']).toBe(1);

        manager.processNetItem(100);
        expect(manager.inventory['Skyview Small Key']).toBe(2);

        // Clamped at max (itemMaxes['Skyview Small Key'] is 2)
        manager.processNetItem(100);
        expect(manager.inventory['Skyview Small Key']).toBe(2);

        // Baby Rattle
        manager.processNetItem(101);
        expect(manager.inventory['Baby Rattle']).toBe(1);

        // Clamped at max (itemMaxes['Baby Rattle'] is 1)
        manager.processNetItem(101);
        expect(manager.inventory['Baby Rattle']).toBe(1);

        // Skyview Boss Key
        manager.processNetItem(102);
        expect(manager.inventory['Skyview Boss Key']).toBe(1);
    });
});

describe('optionIndicesToOptions Archipelago slot_data mapping', () => {
    const tester = createTestLogic();

    beforeAll(tester.initialize);
    beforeEach(tester.reset);

    function getOptions() {
        return tester.readSelector(optionsSelector);
    }

    it('maps small_key_shuffle and boss_key_shuffle from AP slot data', () => {
        const options = getOptions();

        // Test "anywhere"
        const settingsAnywhere = optionIndicesToOptions(options, {
            small_key_shuffle: 'anywhere',
            boss_key_shuffle: 'anywhere',
        });
        expect(settingsAnywhere['small-key-mode']).toBe('Anywhere');
        expect(settingsAnywhere['boss-key-mode']).toBe('Anywhere');

        // Test "own_region" / "own_dungeon"
        const settingsOwnDungeon = optionIndicesToOptions(options, {
            small_keys: 'own_region',
            boss_keys: 'own_dungeon',
        });
        expect(settingsOwnDungeon['small-key-mode']).toBe(
            'Own Dungeon - Restricted',
        );
        expect(settingsOwnDungeon['boss-key-mode']).toBe('Own Dungeon');

        // Test "lanayru_caves_only" and "vanilla"
        const settingsCaves = optionIndicesToOptions(options, {
            small_key_shuffle: 'lanayru_caves_only',
            boss_key_shuffle: 'vanilla',
        });
        expect(settingsCaves['small-key-mode']).toBe('Lanayru Caves Key Only');
        expect(settingsCaves['boss-key-mode']).toBe('Vanilla');

        // Test numeric choice indices
        const settingsNumeric = optionIndicesToOptions(options, {
            small_key_shuffle: 2, // Anywhere
            boss_key_shuffle: 1, // Own Dungeon
        });
        expect(settingsNumeric['small-key-mode']).toBe('Anywhere');
        expect(settingsNumeric['boss-key-mode']).toBe('Own Dungeon');
    });

    it('maps custom_starting_items and starting_items with aliases', () => {
        const options = getOptions();

        // Dict format with aliases
        const settingsDict = optionIndicesToOptions(options, {
            custom_starting_items: {
                'Progressive Pouch': 1,
                Sailcloth: 1,
                Scrapper: 1,
                'Skyview Temple Map': 1,
                Rattle: 1,
                "Beedle's Insect Cage": 1,
            },
        });
        const startingItems = settingsDict['starting-items'];
        expect(startingItems).toContain('Progressive Pouch');
        expect(startingItems).toContain('Scrapper');
        expect(startingItems).toContain('Skyview Map');
        expect(startingItems).toContain('Baby Rattle');
        expect(startingItems).toContain('Horned Colossus Beetle');

        // Array format
        const settingsArray = optionIndicesToOptions(options, {
            starting_items: ['Progressive Pouch', 'Skyview Temple Small Key'],
        });
        const startingItemsArr = settingsArray['starting-items'];
        expect(startingItemsArr).toContain('Progressive Pouch');
        expect(startingItemsArr).toContain('Skyview Small Key');
    });

    it('maps sword, tablets, shuffles, and convenience options correctly', () => {
        const options = getOptions();

        const settings = optionIndicesToOptions(options, {
            starting_sword: 'no_sword',
            starting_tablets: 0,
            map_shuffle: 'own_dungeon_unrestricted',
            gratitude_crystal_shuffle: true,
            stamina_fruit_shuffle: false,
            npc_closet_shuffle: true,
            rupee_shuffle: 'vanilla',
            empty_unrequired_dungeons: true,
            gate_of_time_sword_requirement: 'true_master_sword',
            open_lake_floria: 'open',
            open_earth_temple: 'open',
        });

        expect(settings['starting-sword']).toBe('Swordless');
        expect(settings['starting-tablet-count']).toBe(0);
        expect(settings['map-mode']).toBe('Own Dungeon - Unrestricted');
        expect(settings['gratitude-crystal-shuffle']).toBe('on');
        expect(settings['stamina-fruit-shuffle']).toBe('off');
        expect(settings['npc-closet-shuffle']).toBe('randomized');
        expect(settings['rupeesanity']).toBe(false);
        expect(settings['empty-unrequired-dungeons']).toBe(true);
        expect(settings['got-sword-requirement']).toBe('True Master Sword');
        expect(settings['open-lake-floria']).toBe('Open');
        expect(settings['open-et']).toBe(true);
    });

    it('correctly maps option_ prefix and numeric starting_sword from Archipelago slot_data', () => {
        const options = getOptions();

        // option_starting_sword as integer 0 (Swordless)
        const s0 = optionIndicesToOptions(options, {
            option_starting_sword: 0,
        });
        expect(s0['starting-sword']).toBe('Swordless');
        const initial0 = getInitialItems(s0);
        expect(initial0['Progressive Sword']).toBe(0);

        // option_starting_sword as integer 1 (Practice Sword)
        const s1 = optionIndicesToOptions(options, {
            option_starting_sword: 1,
        });
        expect(s1['starting-sword']).toBe('Practice Sword');
        const initial1 = getInitialItems(s1);
        expect(initial1['Progressive Sword']).toBe(1);

        // option_starting_sword as integer 2 (Goddess Sword)
        const s2 = optionIndicesToOptions(options, {
            option_starting_sword: 2,
        });
        expect(s2['starting-sword']).toBe('Goddess Sword');
        const initial2 = getInitialItems(s2);
        expect(initial2['Progressive Sword']).toBe(2);

        // option_starting_sword as string '0'
        const sStr0 = optionIndicesToOptions(options, {
            option_starting_sword: '0',
        });
        expect(sStr0['starting-sword']).toBe('Swordless');

        // option_starting_sword as string 'no_sword'
        const sNoSword = optionIndicesToOptions(options, {
            option_starting_sword: 'no_sword',
        });
        expect(sNoSword['starting-sword']).toBe('Swordless');

        // Case-insensitive / PascalCase / alias
        const sPascal = optionIndicesToOptions(options, {
            StartingSword: 0,
        });
        expect(sPascal['starting-sword']).toBe('Swordless');

        // Missing starting_sword in Archipelago slot_data defaults to Swordless
        const sApMissing = optionIndicesToOptions(options, {
            world_version: [0, 7, 2],
            option_randomize_entrances: 0,
        });
        expect(sApMissing['starting-sword']).toBe('Swordless');
        expect(getInitialItems(sApMissing)['Progressive Sword']).toBe(0);
    });
});

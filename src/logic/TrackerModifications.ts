import { invert } from 'es-toolkit';
import goddessCubesList_ from '../data/goddessCubes2.json';
import type { OptionDefs, TypedOptions } from '../permalink/SettingsTypes';
import type { TrackerState } from '../tracker/Slice';
import { appError } from '../utils/Debug';
import { BitVector } from './bitlogic/BitVector';
import { type InventoryItem, isItem, itemMaxes, itemName } from './Inventory';
import type { DungeonName } from './Locations';
import type { Logic } from './Logic';
import { swordsToAdd } from './ThingsThatWouldBeNiceToHaveInTheDump';
import type { RawArea, RawLogic } from './UpstreamTypes';

const collectedCubeSuffix = '_TR_Cube_Collected';

export const goddessChestCheckToCubeCheck = Object.fromEntries(
    goddessCubesList_.map(([chest, cube]) => [chest, cube]),
);
export const cubeCheckToGoddessChestCheck = invert<string, string>(
    goddessChestCheckToCubeCheck,
);
export const cubeCollectedToCubeCheck = Object.fromEntries(
    Object.keys(cubeCheckToGoddessChestCheck).map((check) => [
        mapToCubeCollectedRequirement(check),
        check,
    ]),
);
export const cubeCheckToCubeCollected = invert<string, string>(
    cubeCollectedToCubeCheck,
);

function mapToCubeCollectedRequirement(check: string) {
    return `${check}${collectedCubeSuffix}`;
}

// The rando models some items as individual items, but the tracker just has these as stacks.
// Maybe we could ad-hoc rewrite the logic to model these as stacks, but it doesn't seem worth it.
export const sothItems = [
    'Faron Song of the Hero Part',
    'Eldin Song of the Hero Part',
    'Lanayru Song of the Hero Part',
    'Levias Song of the Hero Part',
];

export const sothItemReplacement = 'Song of the Hero';

export const triforceItems = [
    'Triforce of Power',
    'Triforce of Wisdom',
    'Triforce of Courage',
];

export const triforceItemReplacement = 'Triforce';

// Checking a dungeon completion check gives the respective "item"
// so that the "All Required Dungeons Complete" requirement is
// logically fulfilled when the player completes the dungeon, not
// when they gain the ability to do so (semilogic...)
export const dungeonCompletionItems: Record<string, string> = {
    Skyview: '\\Tracker\\Skyview Completed',
    'Earth Temple': '\\Tracker\\Earth Temple Completed',
    'Lanayru Mining Facility': '\\Tracker\\Lanayru Mining Facility Completed',
    'Ancient Cistern': '\\Tracker\\Ancient Cistern Completed',
    Sandship: '\\Tracker\\Sandship Completed',
    'Fire Sanctuary': '\\Tracker\\Fire Sanctuary Completed',
    'Sky Keep': '\\Tracker\\Sky Keep Completed',
} satisfies Record<DungeonName, string>;

export function getInitialItems(
    settings: TypedOptions,
): TrackerState['inventory'] {
    const items: TrackerState['inventory'] = {};
    const add = (item: InventoryItem, count: number = 1) => {
        items[item] ??= 0;
        items[item] += count;
    };
    add('Sailcloth');
    if (settings['starting-tablet-count'] === 3) {
        add('Emerald Tablet');
        add('Ruby Tablet');
        add('Amber Tablet');
    }
    add('Gratitude Crystal Pack', settings['starting-crystal-packs'] ?? 0);
    add('Group of Tadtones', settings['starting-tadtones'] ?? 0);
    add('Empty Bottle', settings['starting-bottles'] ?? 0);

    add(
        'Progressive Sword',
        swordsToAdd[settings['starting-sword'] ?? 'Swordless'],
    );
    const startingItems = settings['starting-items'] ?? [];
    for (const item of startingItems) {
        if (item.includes(sothItemReplacement)) {
            add(sothItemReplacement);
        } else if (item.includes(triforceItemReplacement)) {
            add(triforceItemReplacement);
        } else if (
            isItem(item) &&
            (!item.includes('Pouch') || !items['Progressive Pouch'])
        ) {
            add(item);
        }
    }

    return items;
}

/**
 * Returns a BitVector containing all the expressions that should be visible in the tooltips
 * and not recursively expanded (items and various item-like requirements).
 */
export function getTooltipOpaqueBits(
    logic: Logic,
    options: OptionDefs,
    settings: TypedOptions,
    expertMode: boolean,
    consideredTricks: Set<string>,
) {
    const items = new BitVector();
    const set = (id: string) => {
        const bit = logic.itemBits[id];
        if (bit !== undefined) {
            items.setBit(bit);
        } else {
            appError('unknown item', id);
        }
    };

    for (const option of options) {
        if (
            option.type === 'multichoice' &&
            (option.command === 'enabled-tricks-glitched' ||
                option.command === 'enabled-tricks-bitless')
        ) {
            const vals = option.choices;
            for (const opt of vals) {
                const considered =
                    settings[option.command].includes(opt) ||
                    (expertMode &&
                        (!consideredTricks.size || consideredTricks.has(opt)));
                if (considered) {
                    set(`${opt} Trick`);
                }
            }
        }
    }

    // All actual inventory items are shown in the tooltips
    for (const [item, count] of Object.entries(itemMaxes)) {
        if (
            count === undefined ||
            item === 'Sailcloth' ||
            item === 'Tumbleweed'
        ) {
            continue;
        }
        if (item === sothItemReplacement) {
            for (let i = 1; i <= count; i++) {
                const sothItem = sothItems[i - 1];
                if (sothItem && logic.itemBits[sothItem] !== undefined) {
                    set(sothItem);
                }
            }
        } else if (item === triforceItemReplacement) {
            for (let i = 1; i <= count; i++) {
                set(triforceItems[i - 1]);
            }
        } else {
            for (let i = 1; i <= count; i++) {
                const name = itemName(item, i);
                if (logic.itemBits[name] !== undefined) {
                    set(name);
                }
            }
        }
    }

    // Zelda's Blessing should show the various $Dungeon Completed requirements
    for (const fakeItem of Object.values(dungeonCompletionItems)) {
        set(fakeItem);
    }

    // Goddess chest tooltips should show the corresponding goddess cube.
    for (const cubeItem of Object.values(cubeCheckToCubeCollected)) {
        set(cubeItem);
    }

    // No point in revealing that the math behind 80 crystals is 13*5+15
    for (const amt of [5, 10, 30, 40, 50, 70, 80]) {
        set(`\\${amt} Gratitude Crystals`);
    }

    if (settings['gondo-upgrades'] === false) {
        set(
            "\\Skyloft\\Central Skyloft\\Bazaar\\Gondo's Upgrades\\Upgrade to Quick Beetle",
        );
        set(
            "\\Skyloft\\Central Skyloft\\Bazaar\\Gondo's Upgrades\\Upgrade to Tough Beetle",
        );
    }

    return items;
}

export interface ExtraClosetCheck {
    areaId: string;
    locationKey: string;
    fullId: string;
    shortName: string;
    originalItem: string;
    requirement: string;
}

export const extraClosetChecks: ExtraClosetCheck[] = [
    {
        areaId: "\\Skyloft\\Upper Skyloft\\Knight Academy\\Link's Room",
        locationKey: "Link's Closet",
        fullId: "\\Skyloft\\Upper Skyloft\\Knight Academy\\Link's Room\\Link's Closet",
        shortName: "Upper Skyloft - Link's Closet",
        originalItem: 'Blue Rupee',
        requirement: 'True',
    },
    {
        areaId: '\\Skyloft\\Upper Skyloft\\Knight Academy',
        locationKey: "Fledge's Closet",
        fullId: "\\Skyloft\\Upper Skyloft\\Knight Academy\\Fledge's Closet",
        shortName: "Upper Skyloft - Fledge's Closet",
        originalItem: 'Green Rupee',
        requirement: 'True',
    },
    {
        areaId: '\\Skyloft\\Upper Skyloft\\Knight Academy',
        locationKey: "Groose's Closet",
        fullId: "\\Skyloft\\Upper Skyloft\\Knight Academy\\Groose's Closet",
        shortName: "Upper Skyloft - Groose's Closet",
        originalItem: 'Green Rupee',
        requirement: 'True',
    },
    {
        areaId: '\\Skyloft\\Upper Skyloft\\Knight Academy',
        locationKey: "Owlan's Closet",
        fullId: "\\Skyloft\\Upper Skyloft\\Knight Academy\\Owlan's Closet",
        shortName: "Upper Skyloft - Owlan's Closet",
        originalItem: 'Green Rupee',
        requirement: 'True',
    },
    {
        areaId: '\\Skyloft\\Upper Skyloft\\Knight Academy',
        locationKey: "Horwell's Closet",
        fullId: "\\Skyloft\\Upper Skyloft\\Knight Academy\\Horwell's Closet",
        shortName: "Upper Skyloft - Horwell's Closet",
        originalItem: 'Green Rupee',
        requirement: 'True',
    },
    {
        areaId: '\\Skyloft\\Upper Skyloft\\Knight Academy',
        locationKey: "Karane's Closet",
        fullId: "\\Skyloft\\Upper Skyloft\\Knight Academy\\Karane's Closet",
        shortName: "Upper Skyloft - Karane's Closet",
        originalItem: 'Green Rupee',
        requirement: 'True',
    },
    {
        areaId: "\\Skyloft\\Central Skyloft\\Orielle and Parrow's House",
        locationKey: "Orielle and Parrow's Closet",
        fullId: "\\Skyloft\\Central Skyloft\\Orielle and Parrow's House\\Orielle and Parrow's Closet",
        shortName: "Central Skyloft - Orielle and Parrow's Closet",
        originalItem: 'Green Rupee',
        requirement: 'True',
    },
    {
        areaId: "\\Skyloft\\Central Skyloft\\Peatrice's House",
        locationKey: "Peater's Closet",
        fullId: "\\Skyloft\\Central Skyloft\\Peatrice's House\\Peater's Closet",
        shortName: "Central Skyloft - Peater's Closet",
        originalItem: 'Green Rupee',
        requirement: 'True',
    },
    {
        areaId: "\\Skyloft\\Central Skyloft\\Peatrice's House",
        locationKey: "Peatrice's Closet",
        fullId: "\\Skyloft\\Central Skyloft\\Peatrice's House\\Peatrice's Closet",
        shortName: "Central Skyloft - Peatrice's Closet",
        originalItem: 'Green Rupee',
        requirement: 'True',
    },
    {
        areaId: "\\Skyloft\\Central Skyloft\\Wryna's House",
        locationKey: "Kukiel's Family Closet",
        fullId: "\\Skyloft\\Central Skyloft\\Wryna's House\\Kukiel's Family Closet",
        shortName: "Central Skyloft - Kukiel's Family Closet",
        originalItem: 'Green Rupee',
        requirement: 'True',
    },
    {
        areaId: "\\Skyloft\\Skyloft Village\\Bertie's House",
        locationKey: "Bertie and Luv's Closet",
        fullId: "\\Skyloft\\Skyloft Village\\Bertie's House\\Bertie and Luv's Closet",
        shortName: "Skyloft Village - Bertie and Luv's Closet",
        originalItem: 'Green Rupee',
        requirement: 'True',
    },
    {
        areaId: "\\Skyloft\\Skyloft Village\\Sparrot's House",
        locationKey: "Sparrot's Closet",
        fullId: "\\Skyloft\\Skyloft Village\\Sparrot's House\\Sparrot's Closet",
        shortName: "Skyloft Village - Sparrot's Closet",
        originalItem: 'Green Rupee',
        requirement: 'True',
    },
    {
        areaId: "\\Skyloft\\Skyloft Village\\Mallara's House",
        locationKey: "Pipit and Mallara's Closet",
        fullId: "\\Skyloft\\Skyloft Village\\Mallara's House\\Pipit and Mallara's Closet",
        shortName: "Skyloft Village - Pipit and Mallara's Closet",
        originalItem: 'Green Rupee',
        requirement: 'True',
    },
    {
        areaId: "\\Skyloft\\Skyloft Village\\Gondo's House",
        locationKey: "Gondo and Greba's Closet",
        fullId: "\\Skyloft\\Skyloft Village\\Gondo's House\\Gondo and Greba's Closet",
        shortName: "Skyloft Village - Gondo and Greba's Closet",
        originalItem: 'Green Rupee',
        requirement: 'True',
    },
    {
        areaId: "\\Skyloft\\Skyloft Village\\Rupin's House",
        locationKey: "Rupin and Goselle's Closet",
        fullId: "\\Skyloft\\Skyloft Village\\Rupin's House\\Rupin and Goselle's Closet",
        shortName: "Skyloft Village - Rupin and Goselle's Closet",
        originalItem: 'Green Rupee',
        requirement: 'True',
    },
    {
        areaId: '\\Sky\\South East\\Lumpy Pumpkin\\Lumpy Pumpkin Building',
        locationKey: "Pumm and Kina's Closet",
        fullId: "\\Sky\\South East\\Lumpy Pumpkin\\Lumpy Pumpkin Building\\Pumm and Kina's Closet",
        shortName: "Sky - Pumm and Kina's Closet",
        originalItem: 'Green Rupee',
        requirement: 'True',
    },
    {
        areaId: "\\Lanayru\\Lanayru Sand Sea\\Skipper's Retreat\\Shack",
        locationKey: "Skipper's Closet",
        fullId: "\\Lanayru\\Lanayru Sand Sea\\Skipper's Retreat\\Shack\\Skipper's Closet",
        shortName: "Lanayru Sand Sea - Skipper's Closet",
        originalItem: 'Gust Bellows',
        requirement: 'Gust Bellows',
    },
];

function findRawArea(root: RawArea, targetName: string): RawArea | undefined {
    if (root.name === targetName) return root;
    if (root.sub_areas) {
        for (const sub of Object.values(root.sub_areas)) {
            const found = findRawArea(sub, targetName);
            if (found) return found;
        }
    }
    return undefined;
}

export function patchRawLogicForSSHD(raw: RawLogic): RawLogic {
    for (const closet of extraClosetChecks) {
        if (!raw.checks[closet.fullId]) {
            raw.checks[closet.fullId] = {
                type: 'Closets',
                short_name: closet.shortName,
                'original item': closet.originalItem,
            };
        }
        if (!raw.items.includes(closet.fullId)) {
            raw.items.push(closet.fullId);
        }
        const area = findRawArea(raw.areas, closet.areaId);
        if (area) {
            if (
                !area.locations ||
                !Object.prototype.hasOwnProperty.call(
                    area.locations,
                    closet.locationKey,
                )
            ) {
                area.locations = {
                    ...area.locations,
                    [closet.locationKey]: closet.requirement,
                };
            }
        }
    }
    return raw;
}

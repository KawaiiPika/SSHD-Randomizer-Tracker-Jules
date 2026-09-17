import { invert } from 'es-toolkit';
import goddessCubesList_ from '../data/goddessCubes2.json';
import { dumpCheckToSSHDName } from '../data/SSHDLocationMapping';
import type { OptionDefs, TypedOptions } from '../permalink/SettingsTypes';
import type { TrackerState } from '../tracker/Slice';
import { appError } from '../utils/Debug';
import { BitVector } from './bitlogic/BitVector';
import {
    type InventoryItem,
    itemMaxes,
    itemName,
    resolveItem,
} from './Inventory';
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
        const max = itemMaxes[item] ?? 1;
        items[item] = Math.min(max, items[item] + count);
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
        const resolved = resolveItem(item);
        for (const { item: invItem, count } of resolved) {
            add(invItem, count);
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
    type?: string;
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
        shortName: "Knight Academy - Owlan's Closet",
        originalItem: 'Green Rupee',
        requirement: 'True',
    },
    {
        areaId: '\\Skyloft\\Upper Skyloft\\Knight Academy',
        locationKey: "Horwell's Closet",
        fullId: "\\Skyloft\\Upper Skyloft\\Knight Academy\\Horwell's Closet",
        shortName: "Knight Academy - Horwell's Closet",
        originalItem: 'Green Rupee',
        requirement: 'True',
    },
    {
        areaId: '\\Skyloft\\Upper Skyloft\\Knight Academy',
        locationKey: "Karane's Closet",
        fullId: "\\Skyloft\\Upper Skyloft\\Knight Academy\\Karane's Closet",
        shortName: "Knight Academy - Karane's Closet",
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
        shortName: "Lumpy Pumpkin - Pumm and Kina's Closet",
        originalItem: 'Green Rupee',
        requirement: 'True',
    },
    {
        areaId: "\\Lanayru\\Lanayru Sand Sea\\Skipper's Retreat\\Shack",
        locationKey: "Skipper's Closet",
        fullId: "\\Lanayru\\Lanayru Sand Sea\\Skipper's Retreat\\Shack\\Skipper's Closet",
        shortName: "Skipper's Retreat Shack - Skipper's Closet",
        originalItem: 'Gust Bellows',
        requirement: 'Gust Bellows',
    },
];

export const extraSSHDChecks: {
    areaId: string;
    locationKey: string;
    fullId: string;
    shortName: string;
    type?: string;
    originalItem: string;
    requirement: string;
}[] = [
    {
        areaId: '\\Sky\\North East',
        locationKey: 'Form a Swirrell Ring above Bamboo Island',
        fullId: '\\Sky\\North East\\Form a Swirrell Ring above Bamboo Island',
        shortName: 'The Sky - Form a Swirrell Ring above Bamboo Island',
        type: 'regular',
        originalItem: 'Green Rupee',
        requirement: 'True',
    },
    {
        areaId: '\\Sky\\South East',
        locationKey: 'Form a Swirrell Ring above Lumpy Pumpkin',
        fullId: '\\Sky\\South East\\Form a Swirrell Ring above Lumpy Pumpkin',
        shortName: 'The Sky - Form a Swirrell Ring above Lumpy Pumpkin',
        type: 'regular',
        originalItem: 'Green Rupee',
        requirement: 'True',
    },
    {
        areaId: '\\Sky\\South West',
        locationKey: 'Form a Swirrell Ring above Volcanic Island',
        fullId: '\\Sky\\South West\\Form a Swirrell Ring above Volcanic Island',
        shortName: 'The Sky - Form a Swirrell Ring above Volcanic Island',
        type: 'regular',
        originalItem: 'Green Rupee',
        requirement: 'True',
    },
    {
        areaId: '\\Skyloft\\Upper Skyloft\\Knight Academy',
        locationKey: 'Deliver Barrel to Henya the Lunch Lady',
        fullId: '\\Skyloft\\Upper Skyloft\\Knight Academy\\Deliver Barrel to Henya the Lunch Lady',
        shortName: 'Knight Academy - Deliver Barrel to Henya the Lunch Lady',
        type: 'item',
        originalItem: 'Red Rupee',
        requirement: 'True',
    },
    {
        areaId: '\\Skyloft\\Upper Skyloft',
        locationKey: 'Rescue Remlit above Knight Academy',
        fullId: '\\Skyloft\\Upper Skyloft\\Rescue Remlit above Knight Academy',
        shortName: 'Upper Skyloft - Rescue Remlit above Knight Academy',
        type: 'item',
        originalItem: 'Green Rupee',
        requirement: 'True',
    },
    {
        areaId: '\\Faron\\Sealed Grounds\\Sealed Temple',
        locationKey: 'Collect Fruit from the Tree of Life',
        fullId: '\\Faron\\Sealed Grounds\\Sealed Temple\\Collect Fruit from the Tree of Life',
        shortName: 'Sealed Temple - Collect Fruit from the Tree of Life',
        type: 'item',
        originalItem: 'Life Tree Fruit',
        requirement:
            '\\Faron\\Sealed Grounds\\Sealed Temple\\Open Gate of Time & Life Tree Seedling',
    },
    {
        areaId: "\\Faron\\Sealed Grounds\\Hylia's Temple",
        locationKey: 'Defeat Demise',
        fullId: "\\Faron\\Sealed Grounds\\Hylia's Temple\\Defeat Demise",
        shortName: "Hylia's Realm - Defeat Demise",
        type: 'item',
        originalItem: 'Defeat Demise',
        requirement: 'True',
    },
    {
        areaId: '\\Lanayru\\Lanayru Sand Sea\\Gorge',
        locationKey: 'Boss Rush -- 4 Bosses',
        fullId: '\\Lanayru\\Lanayru Sand Sea\\Gorge\\Boss Rush -- 4 Bosses',
        shortName: 'Lanayru Gorge - Boss Rush 4 Bosses',
        type: 'item',
        originalItem: 'Heart Piece',
        requirement: 'Gust Bellows & Whip & \\Bow',
    },
    {
        areaId: '\\Lanayru\\Lanayru Sand Sea\\Gorge',
        locationKey: 'Boss Rush -- 8 Bosses',
        fullId: '\\Lanayru\\Lanayru Sand Sea\\Gorge\\Boss Rush -- 8 Bosses',
        shortName: 'Lanayru Gorge - Boss Rush 8 Bosses',
        type: 'item',
        originalItem: 'Hylian Shield',
        requirement: 'Gust Bellows & Whip & \\Bow',
    },
];

for (let i = 1; i <= 9; i++) {
    extraSSHDChecks.push({
        areaId: '\\Eldin\\Volcano\\First Room',
        locationKey: `Underground Rupee in First Room ${i}`,
        fullId: `\\Eldin\\Volcano\\First Room\\Underground Rupee in First Room ${i}`,
        shortName: `Eldin Volcano - Underground Rupee in First Room ${i}`,
        type: 'underground_rupee',
        originalItem: 'Silver Rupee',
        requirement: '\\Mogma Mitts',
    });
}

for (let i = 1; i <= 2; i++) {
    extraSSHDChecks.push({
        areaId: '\\Eldin\\Volcano\\East',
        locationKey: `Underground Rupee before Bone Bridge ${i}`,
        fullId: `\\Eldin\\Volcano\\East\\Underground Rupee before Bone Bridge ${i}`,
        shortName: `Eldin Volcano - Underground Rupee before Bone Bridge ${i}`,
        type: 'underground_rupee',
        originalItem: 'Silver Rupee',
        requirement: '\\Mogma Mitts',
    });
}

for (let i = 1; i <= 15; i++) {
    extraSSHDChecks.push({
        areaId: '\\Eldin\\Volcano\\East',
        locationKey: `Underground Rupee in Cliff ${i}`,
        fullId: `\\Eldin\\Volcano\\East\\Underground Rupee in Cliff ${i}`,
        shortName: `Eldin Volcano - Underground Rupee in Cliff ${i}`,
        type: 'underground_rupee',
        originalItem: 'Silver Rupee',
        requirement: '\\Mogma Mitts',
    });
}

for (let i = 1; i <= 10; i++) {
    extraSSHDChecks.push({
        areaId: '\\Eldin\\Volcano\\Near Temple Entrance',
        locationKey: `Underground Rupee West of Temple ${i}`,
        fullId: `\\Eldin\\Volcano\\Near Temple Entrance\\Underground Rupee West of Temple ${i}`,
        shortName: `Eldin Volcano - Underground Rupee West of Temple ${i}`,
        type: 'underground_rupee',
        originalItem: 'Silver Rupee',
        requirement: '\\Mogma Mitts',
    });
}

for (let i = 1; i <= 2; i++) {
    extraSSHDChecks.push({
        areaId: '\\Eldin\\Volcano Summit',
        locationKey: `Underground Rupee ${i}`,
        fullId: `\\Eldin\\Volcano Summit\\Underground Rupee ${i}`,
        shortName: `Volcano Summit - Underground Rupee ${i}`,
        type: 'underground_rupee',
        originalItem: 'Silver Rupee',
        requirement: '\\Mogma Mitts',
    });
}

extraSSHDChecks.push({
    areaId: '\\Fire Sanctuary\\Main\\Second Trapped Mogma Room',
    locationKey: 'Underground Rupee behind Bombable Wall',
    fullId: '\\Fire Sanctuary\\Main\\Second Trapped Mogma Room\\Underground Rupee behind Bombable Wall',
    shortName: 'Fire Sanctuary - Underground Rupee behind Bombable Wall',
    type: 'underground_rupee',
    originalItem: 'Silver Rupee',
    requirement: '\\Mogma Mitts & Bomb Bag & \\Goddess Sword',
});

for (let i = 1; i <= 5; i++) {
    extraSSHDChecks.push({
        areaId: '\\Fire Sanctuary\\Main\\Magmanos Fight Room\\Lower Part',
        locationKey: `Underground Rupee beneath Double Magmanos Room ${i}`,
        fullId: `\\Fire Sanctuary\\Main\\Magmanos Fight Room\\Lower Part\\Underground Rupee beneath Double Magmanos Room ${i}`,
        shortName: `Fire Sanctuary - Underground Rupee beneath Double Magmanos Room ${i}`,
        type: 'underground_rupee',
        originalItem: 'Silver Rupee',
        requirement: '\\Mogma Mitts',
    });
}

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
    for (const check of [...extraClosetChecks, ...extraSSHDChecks]) {
        if (!raw.checks[check.fullId]) {
            raw.checks[check.fullId] = {
                type: check.type ?? 'regular',
                short_name: check.shortName,
                'original item': check.originalItem,
            };
        }
        if (!raw.items.includes(check.fullId)) {
            raw.items.push(check.fullId);
        }
        const area = findRawArea(raw.areas, check.areaId);
        if (area) {
            if (
                !area.locations ||
                !Object.prototype.hasOwnProperty.call(
                    area.locations,
                    check.locationKey,
                )
            ) {
                area.locations = {
                    ...area.locations,
                    [check.locationKey]: check.requirement,
                };
            }
        }
    }
    if (!raw.items.includes("Open Batreaux's Shed option")) {
        raw.items.push("Open Batreaux's Shed option");
    }
    if (!raw.items.includes('Life Tree Seedling')) {
        raw.items.push('Life Tree Seedling');
    }

    // Ensure Batreaux reward macros in sslib / Battlecats59 dump.yaml are satisfied by gratitude crystals
    if (raw.areas) {
        if (!raw.areas.locations) {
            raw.areas.locations = {};
        }
        const batreauxLevels: [string, string][] = [
            ['Can Receive Batreaux Level 1 Rewards', '\\5 Gratitude Crystals'],
            ['Can Receive Batreaux Level 2 Rewards', '\\10 Gratitude Crystals'],
            ['Can Receive Batreaux Level 3 Rewards', '\\30 Gratitude Crystals'],
            ['Can Receive Batreaux Level 4 Rewards', '\\40 Gratitude Crystals'],
            ['Can Receive Batreaux Level 5 Rewards', '\\50 Gratitude Crystals'],
            ['Can Receive Batreaux Level 6 Rewards', '\\70 Gratitude Crystals'],
            ['Can Receive Batreaux Level 7 Rewards', '\\80 Gratitude Crystals'],
        ];
        for (const [key, target] of batreauxLevels) {
            if (raw.areas.locations[key] !== undefined) {
                raw.areas.locations[key] = target;
            }
        }

        // Patch Opened Shed in Skyloft Village so open-batreaux-shed option works
        const patchOpenedShed = (area: RawArea) => {
            if (area.name === '\\Skyloft\\Skyloft Village' && area.locations) {
                if (area.locations['Opened Shed']) {
                    area.locations['Opened Shed'] =
                        "Open Batreaux's Shed option | Night";
                }
            }
            for (const sub of Object.values(area.sub_areas || {})) {
                patchOpenedShed(sub);
            }
        };
        patchOpenedShed(raw.areas);
    }

    // Rename dump checks to official SSHD / Archipelago names
    for (const [id, check] of Object.entries(raw.checks)) {
        const sshdName = dumpCheckToSSHDName[id];
        if (sshdName) {
            check.short_name = sshdName;
        }

        // Catch all variations of Batreaux reward names from any upstream fork
        if (
            id.includes("Batreaux's House\\First Reward") ||
            id.includes("Batreaux's House\\5 Crystals") ||
            check.short_name === "Batreaux's House - First Reward" ||
            check.short_name === 'First Reward' ||
            check.short_name === "Batreaux's House - 5 Crystals" ||
            check.short_name === '5 Crystals'
        ) {
            check.short_name = '5 Gratitude Crystals Reward';
        } else if (
            id.includes("Batreaux's House\\Second Reward") ||
            id.includes("Batreaux's House\\10 Crystals") ||
            check.short_name === "Batreaux's House - Second Reward" ||
            check.short_name === 'Second Reward' ||
            check.short_name === "Batreaux's House - 10 Crystals" ||
            check.short_name === '10 Crystals'
        ) {
            check.short_name = '10 Gratitude Crystals Reward';
        } else if (
            id.includes("Batreaux's House\\Third Reward") ||
            (id.includes("Batreaux's House\\30 Crystals") &&
                !id.includes('Chest')) ||
            check.short_name === "Batreaux's House - Third Reward" ||
            check.short_name === 'Third Reward' ||
            check.short_name === "Batreaux's House - 30 Crystals" ||
            check.short_name === '30 Crystals'
        ) {
            check.short_name = '30 Gratitude Crystals Reward';
        } else if (
            id.includes("Batreaux's House\\Chest") ||
            id.includes('30 Crystals Chest') ||
            ((check.short_name === "Batreaux's House - Chest" ||
                check.short_name === "Batreaux's House - 30 Crystals Chest" ||
                check.short_name === '30 Crystals Chest') &&
                check.type === "Batreaux's Rewards")
        ) {
            check.short_name = '30 Gratitude Crystals Reward Chest';
        } else if (
            id.includes("Batreaux's House\\Fourth Reward") ||
            id.includes("Batreaux's House\\40 Crystals") ||
            check.short_name === "Batreaux's House - Fourth Reward" ||
            check.short_name === 'Fourth Reward' ||
            check.short_name === "Batreaux's House - 40 Crystals" ||
            check.short_name === '40 Crystals'
        ) {
            check.short_name = '40 Gratitude Crystals Reward';
        } else if (
            id.includes("Batreaux's House\\Fifth Reward") ||
            id.includes("Batreaux's House\\50 Crystals") ||
            check.short_name === "Batreaux's House - Fifth Reward" ||
            check.short_name === 'Fifth Reward' ||
            check.short_name === "Batreaux's House - 50 Crystals" ||
            check.short_name === '50 Crystals'
        ) {
            check.short_name = '50 Gratitude Crystals Reward';
        } else if (
            id.includes("Batreaux's House\\Sixth Reward") ||
            (id.includes("Batreaux's House\\70 Crystals") &&
                !id.includes('Second')) ||
            check.short_name === "Batreaux's House - Sixth Reward" ||
            check.short_name === 'Sixth Reward' ||
            check.short_name === "Batreaux's House - 70 Crystals" ||
            check.short_name === '70 Crystals'
        ) {
            check.short_name = '70 Gratitude Crystals First Reward';
        } else if (
            id.includes("Batreaux's House\\Seventh Reward") ||
            id.includes('70 Crystals Second Reward') ||
            check.short_name === "Batreaux's House - Seventh Reward" ||
            check.short_name === 'Seventh Reward' ||
            check.short_name ===
                "Batreaux's House - 70 Crystals Second Reward" ||
            check.short_name === '70 Crystals Second Reward'
        ) {
            check.short_name = '70 Gratitude Crystals Second Reward';
        } else if (
            id.includes("Batreaux's House\\Final Reward") ||
            id.includes("Batreaux's House\\80 Crystals") ||
            check.short_name === "Batreaux's House - Final Reward" ||
            check.short_name === 'Final Reward' ||
            check.short_name === "Batreaux's House - 80 Crystals" ||
            check.short_name === '80 Crystals'
        ) {
            check.short_name = '80 Gratitude Crystals Reward';
        }
    }

    return raw;
}

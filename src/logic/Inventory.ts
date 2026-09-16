// The order here defines the order of items in requirement tooltips too
export const itemMaxes = {
    Sailcloth: 1,

    'Emerald Tablet': 1,
    'Ruby Tablet': 1,
    'Amber Tablet': 1,

    'Lanayru Caves Small Key': 1,
    'Sea Chart': 1,
    'Stone of Trials': 1,

    'Empty Bottle': 5,
    'Progressive Pouch': 1,
    'Progressive Wallet': 4,
    'Extra Wallet': 3,

    'Progressive Sword': 6,

    'Progressive Slingshot': 2,
    'Progressive Beetle': 4,
    'Bomb Bag': 1,
    'Gust Bellows': 1,
    Whip: 1,
    Clawshots: 1,
    'Progressive Bow': 3,
    'Progressive Bug Net': 2,

    'Progressive Mitts': 2,
    "Water Dragon's Scale": 1,
    'Fireshield Earrings': 1,

    "Goddess's Harp": 1,
    'Ballad of the Goddess': 1,

    "Farore's Courage": 1,
    "Nayru's Wisdom": 1,
    "Din's Power": 1,
    'Song of the Hero': 4,
    Triforce: 3,

    "Cawlin's Letter": 1,
    'Horned Colossus Beetle': 1,
    'Baby Rattle': 1,
    'Gratitude Crystal': 15,
    'Gratitude Crystal Pack': 13,
    'Spiral Charge': 1,
    'Life Tree Fruit': 1,
    'Life Tree Seedling': 1,
    'Group of Tadtones': 17,
    Scrapper: 1,

    'Skyview Boss Key': 1,
    'Earth Temple Boss Key': 1,
    'Lanayru Mining Facility Boss Key': 1,
    'Ancient Cistern Boss Key': 1,
    'Sandship Boss Key': 1,
    'Fire Sanctuary Boss Key': 1,
    'Skyview Small Key': 2,
    'Key Piece': 5,
    'Lanayru Mining Facility Small Key': 1,
    'Ancient Cistern Small Key': 2,
    'Sandship Small Key': 2,
    'Fire Sanctuary Small Key': 3,
    'Sky Keep Small Key': 1,

    Tumbleweed: 1,
};

export type InventoryItem = keyof typeof itemMaxes;

export function isItem(id: string): id is InventoryItem {
    return id in itemMaxes;
}

export function itemName(item: string, amount: number) {
    return amount > 1 ? `${item} x ${amount}` : item;
}

export const itemAliases: Record<
    string,
    InventoryItem | { item: InventoryItem; count: number }[]
> = {
    // Skyview Temple
    'Skyview Temple Small Key': 'Skyview Small Key',
    'Skyview Temple Boss Key': 'Skyview Boss Key',

    // Sidequests / Misc items
    Rattle: 'Baby Rattle',
    "Beedle's Insect Cage": 'Horned Colossus Beetle',

    // Key Rings
    'Skyview Temple Key Ring': [{ item: 'Skyview Small Key', count: 2 }],
    'Skyview Key Ring': [{ item: 'Skyview Small Key', count: 2 }],
    'Lanayru Mining Facility Key Ring': [
        { item: 'Lanayru Mining Facility Small Key', count: 1 },
    ],
    'LMF Key Ring': [{ item: 'Lanayru Mining Facility Small Key', count: 1 }],
    'Ancient Cistern Key Ring': [
        { item: 'Ancient Cistern Small Key', count: 2 },
    ],
    'AC Key Ring': [{ item: 'Ancient Cistern Small Key', count: 2 }],
    'Fire Sanctuary Key Ring': [{ item: 'Fire Sanctuary Small Key', count: 3 }],
    'FS Key Ring': [{ item: 'Fire Sanctuary Small Key', count: 3 }],
    'Sandship Key Ring': [{ item: 'Sandship Small Key', count: 2 }],
    'SSH Key Ring': [{ item: 'Sandship Small Key', count: 2 }],
    'Sky Keep Key Ring': [{ item: 'Sky Keep Small Key', count: 1 }],
    'SK Key Ring': [{ item: 'Sky Keep Small Key', count: 1 }],
    'Lanayru Caves Key Ring': [{ item: 'Lanayru Caves Small Key', count: 1 }],
    'LC Key Ring': [{ item: 'Lanayru Caves Small Key', count: 1 }],

    // Skeleton Key
    'Skeleton Key': [
        { item: 'Skyview Small Key', count: 2 },
        { item: 'Lanayru Mining Facility Small Key', count: 1 },
        { item: 'Ancient Cistern Small Key', count: 2 },
        { item: 'Fire Sanctuary Small Key', count: 3 },
        { item: 'Sandship Small Key', count: 2 },
        { item: 'Sky Keep Small Key', count: 1 },
        { item: 'Lanayru Caves Small Key', count: 1 },
    ],

    // Triforce complete
    'Completed Triforce': [{ item: 'Triforce', count: 3 }],
};

export function resolveItem(
    rawItemName: string,
): { item: InventoryItem; count: number }[] {
    if (rawItemName.includes('Song of the Hero')) {
        return [{ item: 'Song of the Hero', count: 1 }];
    }
    if (rawItemName in itemAliases) {
        const mapped = itemAliases[rawItemName];
        if (typeof mapped === 'string') {
            return [{ item: mapped, count: 1 }];
        }
        return mapped;
    }
    if (rawItemName.includes('Triforce')) {
        return [{ item: 'Triforce', count: 1 }];
    }
    if (isItem(rawItemName)) {
        return [{ item: rawItemName, count: 1 }];
    }
    return [];
}

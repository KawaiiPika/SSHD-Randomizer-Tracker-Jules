import {
    Client,
    type ConnectedPacket,
    type DataPackage,
    type DataPackagePacket,
    type MessageNode,
} from 'archipelago.js';
import { invert } from 'es-toolkit';
import type { ReactNode } from 'react';
import React from 'react';
import type { ColorScheme } from '../customization/ColorScheme';
import { setStoredArchipelagoServer } from '../LocalStorage';
import { itemMaxes, resolveItem, type InventoryItem } from '../logic/Inventory';
import { getInitialItems } from '../logic/TrackerModifications';
import { defaultSettings } from '../permalink/Settings';
import type {
    AllTypedOptions,
    OptionDefs,
    OptionsCommand,
    OptionValue,
} from '../permalink/SettingsTypes';
import type { TrackerState } from '../tracker/Slice';
import { convertError } from '../utils/Errors';

function kebabToSnake(input: string): string {
    return input.replace(/-/g, '_');
}

const STARTING_ITEM_ALIASES: Record<string, string> = {
    'Skyview Temple Map': 'Skyview Map',
    'Skyview Temple Small Key': 'Skyview Small Key',
    'Skyview Temple Boss Key': 'Skyview Boss Key',
    Rattle: 'Baby Rattle',
    "Beedle's Insect Cage": 'Horned Colossus Beetle',
};

const COMMAND_ALIASES: Record<string, string[]> = {
    'small-key-mode': [
        'small_key_shuffle',
        'small_keys',
        'small_key_mode',
        'small-key-mode',
    ],
    'boss-key-mode': [
        'boss_key_shuffle',
        'boss_keys',
        'boss_key_mode',
        'boss-key-mode',
    ],
    'map-mode': ['map_shuffle', 'map_mode', 'map-mode'],
    'starting-items': [
        'custom_starting_items',
        'starting_items',
        'starting-items',
        'starting_inventory',
    ],
    'starting-sword': ['starting_sword', 'starting-sword'],
    'starting-tablet-count': [
        'starting_tablets',
        'starting_tablet_count',
        'random_starting_tablet_count',
        'starting-tablet-count',
    ],
    'required-dungeon-count': [
        'required_dungeon_count',
        'required_dungeons',
        'required-dungeon-count',
    ],
    'got-sword-requirement': [
        'gate_of_time_sword_requirement',
        'got_sword_requirement',
        'got-sword-requirement',
    ],
    'got-dungeon-requirement': [
        'gate_of_time_dungeon_requirements',
        'gate_of_time_dungeon_requirement',
        'got_dungeon_requirement',
        'got-dungeon-requirement',
    ],
    'got-start': ['gate_of_time_starting_state', 'got_start', 'got-start'],
    'open-lake-floria': ['open_lake_floria', 'open-lake-floria'],
    'open-et': ['open_earth_temple', 'open_et', 'open-et'],
    'open-lmf': ['open_lmf', 'open-lmf'],
    'open-thunderhead': ['open_thunderhead', 'open-thunderhead'],
    'open-batreaux-shed': ['open_batreaux_shed', 'open-batreaux-shed'],
    'fs-lava-flow': ['shortcut_fs_lava_flow', 'fs_lava_flow', 'fs-lava-flow'],
    'skip-g3': ['skip_ghirahim3', 'skip_g3', 'skip-g3'],
    'skip-horde': ['skip_horde', 'skip-horde'],
    'skip-demise': ['skip_demise', 'skip-demise'],
    'randomize-dungeon-entrances': [
        'randomize_dungeons',
        'randomize_dungeon_entrances',
        'randomize-dungeon-entrances',
    ],
    'randomize-trials': [
        'randomize_trials',
        'randomize_trial_gate_entrances',
        'randomize-trials',
    ],
    'random-start-entrance': [
        'random_starting_spawn',
        'random_start_entrance',
        'random-start-entrance',
    ],
    'random-start-statues': [
        'random_starting_statues',
        'random_start_statues',
        'random-start-statues',
    ],
    'random-puzzles': ['boss_key_puzzles', 'random_puzzles', 'random-puzzles'],
    rupeesanity: ['rupee_shuffle', 'rupeesanity'],
    'empty-unrequired-dungeons': [
        'empty_unrequired_dungeons',
        'empty-unrequired-dungeons',
    ],
    'excluded-locations': ['excluded_locations', 'excluded-locations'],
    'upgraded-skyward-strike': [
        'upgraded_skyward_strike',
        'upgraded-skyward-strike',
    ],
    'triforce-required': ['triforce_required', 'triforce-required'],
    'triforce-shuffle': ['triforce_shuffle', 'triforce-shuffle'],
    'no-spoiler-log': ['no_spoiler_log', 'no-spoiler-log'],
    shopsanity: ['shopsanity', 'beedle_shop_shuffle'],
    'beedle-shop-shuffle': ['beedle_shop_shuffle', 'beedle-shop-shuffle'],
    'gondo-upgrades': [
        'gondo_upgrades',
        'place_scrap_shop_upgrades',
        'gondo-upgrades',
    ],
    'tadtone-shuffle': ['tadtone_shuffle', 'tadtone-shuffle'],
    tadtonesanity: ['tadtone_shuffle', 'tadtonesanity'],
    'trial-treasure-amount': [
        'trial_treasure_shuffle',
        'trial-treasure-amount',
    ],
    'gratitude-crystal-shuffle': [
        'gratitude_crystal_shuffle',
        'gratitude-crystal-shuffle',
    ],
    'npc-closet-shuffle': ['npc_closet_shuffle', 'npc-closet-shuffle'],
    'stamina-fruit-shuffle': ['stamina_fruit_shuffle', 'stamina-fruit-shuffle'],
    'underground-rupee-shuffle': [
        'underground_rupee_shuffle',
        'underground-rupee-shuffle',
    ],
    'goddess-chest-shuffle': ['goddess_chest_shuffle', 'goddess-chest-shuffle'],
    'gossip-stone-treasure-shuffle': [
        'gossip_stone_treasure_shuffle',
        'gossip-stone-treasure-shuffle',
    ],
    'peatrice-conversations': [
        'peatrice_conversations',
        'peatrice-conversations',
    ],
    'damage-multiplier': ['damage_multiplier', 'damage-multiplier'],
};

function findLoadedValue(
    command: string,
    loadedOptions: Record<string, unknown>,
): unknown {
    const candidates = COMMAND_ALIASES[command] ?? [];
    for (const key of candidates) {
        if (loadedOptions[key] !== undefined && loadedOptions[key] !== null) {
            return loadedOptions[key];
        }
    }
    const snake = kebabToSnake(command);
    if (loadedOptions[snake] !== undefined && loadedOptions[snake] !== null) {
        return loadedOptions[snake];
    }
    if (
        loadedOptions[command] !== undefined &&
        loadedOptions[command] !== null
    ) {
        return loadedOptions[command];
    }
    const noPrefix = snake.replace(/^setting_/, '');
    if (
        loadedOptions[noPrefix] !== undefined &&
        loadedOptions[noPrefix] !== null
    ) {
        return loadedOptions[noPrefix];
    }
    return undefined;
}

function parseSmallKeyMode(val: unknown): string | undefined {
    if (typeof val === 'number') {
        switch (val) {
            case 0:
                return 'Vanilla';
            case 1:
                return 'Own Dungeon - Restricted';
            case 2:
                return 'Anywhere';
            case 3:
                return 'Lanayru Caves Key Only';
            default:
                return undefined;
        }
    }
    if (typeof val === 'string') {
        const s = val.toLowerCase().replace(/[-_\s]+/g, '');
        if (s === 'vanilla') return 'Vanilla';
        if (
            [
                'owndungeon',
                'ownregion',
                'owndungeonrestricted',
                'restricted',
                'removed',
            ].includes(s)
        ) {
            return 'Own Dungeon - Restricted';
        }
        if (
            [
                'lanayrucavesonly',
                'lanayrucaves',
                'lanayrucaveskeyonly',
            ].includes(s)
        ) {
            return 'Lanayru Caves Key Only';
        }
        if (['anywhere', 'overworld', 'anydungeon'].includes(s)) {
            return 'Anywhere';
        }
    }
    return undefined;
}

function parseBossKeyMode(val: unknown): string | undefined {
    if (typeof val === 'number') {
        switch (val) {
            case 0:
                return 'Vanilla';
            case 1:
                return 'Own Dungeon';
            case 2:
                return 'Anywhere';
            default:
                return undefined;
        }
    }
    if (typeof val === 'string') {
        const s = val.toLowerCase().replace(/[-_\s]+/g, '');
        if (['vanilla', 'removed'].includes(s)) return 'Vanilla';
        if (['owndungeon', 'ownregion'].includes(s)) return 'Own Dungeon';
        if (['anywhere', 'anydungeon', 'overworld'].includes(s))
            return 'Anywhere';
    }
    return undefined;
}

function parseMapMode(val: unknown): string | undefined {
    if (typeof val === 'number') {
        switch (val) {
            case 0:
                return 'Removed';
            case 1:
                return 'Vanilla';
            case 2:
                return 'Own Dungeon - Restricted';
            case 3:
                return 'Own Dungeon - Unrestricted';
            case 4:
                return 'Anywhere';
            default:
                return undefined;
        }
    }
    if (typeof val === 'string') {
        const s = val.toLowerCase().replace(/[-_\s]+/g, '');
        if (s === 'removed') return 'Removed';
        if (s === 'vanilla') return 'Vanilla';
        if (
            [
                'owndungeonrestricted',
                'owndungeon',
                'ownregion',
                'restricted',
            ].includes(s)
        ) {
            return 'Own Dungeon - Restricted';
        }
        if (['owndungeonunrestricted', 'unrestricted'].includes(s)) {
            return 'Own Dungeon - Unrestricted';
        }
        if (['anywhere', 'anydungeon', 'overworld'].includes(s)) {
            return 'Anywhere';
        }
    }
    return undefined;
}

function parseStartingSword(val: unknown): string | undefined {
    if (typeof val === 'number') {
        const choices = [
            'Swordless',
            'Practice Sword',
            'Goddess Sword',
            'Goddess Longsword',
            'Goddess White Sword',
            'Master Sword',
            'True Master Sword',
        ];
        return choices[val];
    }
    if (typeof val === 'string') {
        const s = val.toLowerCase().replace(/[-_\s]+/g, '');
        if (['nosword', 'swordless', 'none'].includes(s)) return 'Swordless';
        if (['practicesword', 'practice'].includes(s)) return 'Practice Sword';
        if (s === 'goddesssword') return 'Goddess Sword';
        if (s === 'goddesslongsword') return 'Goddess Longsword';
        if (s === 'goddesswhitesword') return 'Goddess White Sword';
        if (s === 'mastersword') return 'Master Sword';
        if (s === 'truemastersword') return 'True Master Sword';
    }
    return undefined;
}

function parseStartingItems(val: unknown, choices: string[]): string[] {
    const rawItems: string[] = [];
    if (Array.isArray(val)) {
        for (const item of val) {
            if (typeof item === 'string') {
                rawItems.push(item);
            }
        }
    } else if (val && typeof val === 'object') {
        for (const [key, count] of Object.entries(
            val as Record<string, unknown>,
        )) {
            const num = typeof count === 'number' ? count : 1;
            for (let i = 0; i < num; i++) {
                rawItems.push(key);
            }
        }
    }
    const result: string[] = [];
    for (const raw of rawItems) {
        const aliasResolved = STARTING_ITEM_ALIASES[raw] ?? raw;
        const matched = choices.find(
            (c) =>
                c.toLowerCase() === aliasResolved.toLowerCase() ||
                c.toLowerCase().replace(/[-_\s]+/g, '') ===
                    aliasResolved.toLowerCase().replace(/[-_\s]+/g, ''),
        );
        if (matched) {
            result.push(matched);
        }
    }
    return result;
}

export function optionIndicesToOptions(
    optionDefs: OptionDefs,
    loadedOptions: Record<string, unknown>,
): AllTypedOptions {
    const settings: Partial<Record<OptionsCommand, OptionValue>> =
        defaultSettings(optionDefs);

    for (const option of optionDefs) {
        const loadedVal: unknown = findLoadedValue(
            option.command,
            loadedOptions,
        );

        if (loadedVal !== undefined && loadedVal !== null) {
            if (option.command === 'excluded-locations') {
                if (Array.isArray(loadedVal)) {
                    settings[option.command] = loadedVal as string[];
                }
            } else if (option.command === 'starting-items') {
                if (option.type === 'multichoice') {
                    settings[option.command] = parseStartingItems(
                        loadedVal,
                        option.choices,
                    );
                }
            } else if (option.command === 'small-key-mode') {
                const parsed = parseSmallKeyMode(loadedVal);
                if (parsed) {
                    settings[option.command] = parsed;
                }
            } else if (option.command === 'boss-key-mode') {
                const parsed = parseBossKeyMode(loadedVal);
                if (parsed) {
                    settings[option.command] = parsed;
                }
            } else if (option.command === 'map-mode') {
                const parsed = parseMapMode(loadedVal);
                if (parsed) {
                    settings[option.command] = parsed;
                }
            } else if (option.command === 'starting-sword') {
                const parsed = parseStartingSword(loadedVal);
                if (parsed) {
                    settings[option.command] = parsed;
                }
            } else if (option.command === 'open-et') {
                if (typeof loadedVal === 'string') {
                    settings[option.command] =
                        loadedVal.toLowerCase() === 'open';
                } else if (typeof loadedVal === 'boolean') {
                    settings[option.command] = loadedVal;
                }
            } else if (option.command === 'rupeesanity') {
                if (typeof loadedVal === 'string') {
                    const lower = loadedVal.toLowerCase();
                    settings[option.command] =
                        lower !== 'vanilla' && lower !== 'off';
                } else if (typeof loadedVal === 'boolean') {
                    settings[option.command] = loadedVal;
                }
            } else if (option.type === 'boolean') {
                if (typeof loadedVal === 'boolean') {
                    settings[option.command] = loadedVal;
                } else if (typeof loadedVal === 'number') {
                    settings[option.command] = loadedVal === 1;
                } else if (typeof loadedVal === 'string') {
                    const lower = loadedVal.toLowerCase();
                    settings[option.command] =
                        lower === 'true' ||
                        lower === 'on' ||
                        lower === '1' ||
                        lower === 'randomized';
                }
            } else if (option.type === 'int') {
                if (Array.isArray(loadedVal)) {
                    settings[option.command] = loadedVal.length;
                } else if (typeof loadedVal === 'number') {
                    settings[option.command] = loadedVal;
                } else if (typeof loadedVal === 'string') {
                    settings[option.command] = parseInt(loadedVal, 10);
                }
            } else if (option.type === 'singlechoice') {
                if (typeof loadedVal === 'boolean') {
                    if (
                        option.choices.includes('on') &&
                        option.choices.includes('off')
                    ) {
                        settings[option.command] = loadedVal ? 'on' : 'off';
                    } else if (
                        option.choices.includes('randomized') &&
                        option.choices.includes('vanilla')
                    ) {
                        settings[option.command] = loadedVal
                            ? 'randomized'
                            : 'vanilla';
                    }
                } else if (typeof loadedVal === 'number') {
                    settings[option.command] =
                        option.choices[loadedVal] ?? option.choices[0];
                } else if (typeof loadedVal === 'string') {
                    const cleanLoaded = loadedVal
                        .toLowerCase()
                        .replace(/[-_\s]+/g, '');
                    const matchedChoice = option.choices.find((choice) => {
                        const cleanChoice = choice
                            .toLowerCase()
                            .replace(/[-_\s]+/g, '');
                        return (
                            cleanChoice === cleanLoaded ||
                            choice.toLowerCase() === loadedVal.toLowerCase() ||
                            kebabToSnake(choice.toLowerCase()) ===
                                kebabToSnake(loadedVal.toLowerCase())
                        );
                    });
                    if (matchedChoice) {
                        settings[option.command] = matchedChoice;
                    }
                }
            }
        }
    }

    const finalSettings = settings as Record<string, OptionValue>;
    for (const [key, val] of Object.entries(loadedOptions)) {
        const kebabKey = key.replace(/_/g, '-');
        if (
            typeof val === 'boolean' ||
            typeof val === 'number' ||
            typeof val === 'string'
        ) {
            if (finalSettings[kebabKey] === undefined) {
                finalSettings[kebabKey] = val;
            }
            if (finalSettings[key] === undefined) {
                finalSettings[key] = val;
            }
        }
    }

    return settings as AllTypedOptions;
}

export type ClientConnectionState =
    | {
          state: 'loggedOut';
          error?: string;
      }
    | {
          state: 'loggingIn';
      }
    | {
          state: 'loggedIn';
          serverName: string;
          slotName: string;
      };

export class ColoredText {
    constructor(
        public text: string,
        public color?: keyof ColorScheme,
        public customColor?: string, // for color nodes
        public tooltip?: ReactNode,
    ) {}
}

export type ClientMessage = ColoredText[];

const MAX_MESSAGES = 1000;

export class APClientManager {
    client?: Client;
    loadedSettings?: AllTypedOptions;
    idToLocation?: Record<number, string>;
    idToItem?: Record<number, string>;
    connectedData?: ConnectedPacket;
    inventory: TrackerState['inventory'] = {};
    checkedLocations: string[] = [];
    availableLocations: string[] = [];
    checkedCubes: number = 0;
    messages: ClientMessage[] = [];
    requiredDungeons: string[] = [];
    cubeDataKey?: string;
    resolveLocations?: (locs: string[]) => void;
    resolveAvailableLocations?: (locs: string[]) => void;
    resolveItems?: (items: TrackerState['inventory']) => void;
    resolveSettings?: (settings: AllTypedOptions) => void;
    changeStage?: (stage: string) => void;
    resolveCubes?: (cubeflags: number) => void;
    onMessage?: (messages: ClientMessage[]) => void;

    status: ClientConnectionState = { state: 'loggedOut' };
    statusSubscriptions: Set<() => void> = new Set();

    pendingLocationIds: number[] = [];
    pendingItemIds: number[] = [];
    allLocationIds: number[] = [];

    processNetItem(netItemId: number) {
        if (!this.idToItem) return;
        const item = this.idToItem[netItemId];
        if (!item) return;
        const resolved = resolveItem(item);
        for (const { item: invItem, count } of resolved) {
            this.add(invItem, count);
        }
    }

    add(item: InventoryItem, count: number = 1) {
        this.inventory[item] ??= 0;
        const max = itemMaxes[item] ?? 1;
        this.inventory[item] = Math.min(max, this.inventory[item] + count);
    }

    isHooked(): boolean {
        return this.client !== undefined && this.client.socket.connected;
    }

    getLoadedSettings(): AllTypedOptions | undefined {
        return this.loadedSettings;
    }

    setLocationCallback(func: (locs: string[]) => void) {
        this.resolveLocations = func;
        this.resolveLocations(this.checkedLocations);
    }

    setAvailableLocationsCallback(func: (locs: string[]) => void) {
        this.resolveAvailableLocations = func;
        this.resolveAvailableLocations(this.availableLocations);
    }

    setItemCallback(func: (items: TrackerState['inventory']) => void) {
        this.resolveItems = func;
        this.resolveItems(this.inventory);
    }

    setSettingsCallback(func: (settings: AllTypedOptions) => void) {
        this.resolveSettings = func;
        if (this.loadedSettings) {
            this.resolveSettings(this.loadedSettings);
        }
    }

    setNewStageCallback(func: (stage: string) => void) {
        this.changeStage = func;
    }

    setCubeCallback(func: (cubeflags: number) => void) {
        this.resolveCubes = func;
        this.resolveCubes(this.checkedCubes);
    }

    setOnMessage(func: (messages: ClientMessage[]) => void) {
        this.onMessage = func;
        this.onMessage(this.messages);
    }

    sendMessage(message: string) {
        if (this.isHooked()) {
            this.client!.messages.say(message);
        }
    }

    resetClient() {
        if (this.isHooked()) {
            this.client!.socket.disconnect();
            this.client = undefined;
            this.loadedSettings = undefined;
            this.connectedData = undefined;
            this.inventory = {};
            this.checkedLocations = [];
            this.availableLocations = [];
            this.checkedCubes = 0;
            this.messages = [];
            this.cubeDataKey = undefined;
            this.resolveLocations = undefined;
            this.resolveAvailableLocations = undefined;
            this.resolveItems = undefined;
            this.resolveSettings = undefined;
            this.changeStage = undefined;
            this.resolveCubes = undefined;
            this.pendingItemIds = [];
            this.pendingLocationIds = [];
            this.allLocationIds = [];

            this.status = { state: 'loggedOut' };
            this.notifyStatusSubscribers();
        }
    }

    getStatusString(): string {
        switch (this.status.state) {
            case 'loggedOut':
                if (this.status.error) {
                    return `Error: ${this.status.error}`;
                } else {
                    return 'Disconnected, please connect.';
                }
            case 'loggingIn':
                return 'Connecting...';
            case 'loggedIn':
                return `Connected to ${this.status.serverName} as ${this.status.slotName}`;
        }
    }

    getStatus(): ClientConnectionState {
        return this.status;
    }

    subscribeToStatus(callback: () => void): () => void {
        this.statusSubscriptions.add(callback);
        return () => {
            this.statusSubscriptions.delete(callback);
        };
    }

    private notifyStatusSubscribers() {
        for (const subscriber of this.statusSubscriptions) {
            subscriber();
        }
    }

    async login(
        server: string,
        slot: string,
        password: string,
        optionDefs: OptionDefs,
    ): Promise<boolean> {
        if (this.status.state === 'loggingIn') {
            return false;
        } else if (this.status.state === 'loggedIn') {
            this.resetClient();
        }

        const client = new Client();

        client.socket.on('connected', (content) => {
            this.connectedData = content;
            setStoredArchipelagoServer(server);
            const slotData = content.slot_data as Record<string, unknown>;
            this.loadedSettings = optionIndicesToOptions(
                optionDefs ?? [],
                slotData,
            );
            this.resolveSettings?.(this.loadedSettings);
            const rawReqDungeons = Array.isArray(slotData['required_dungeons'])
                ? (slotData['required_dungeons'] as string[])
                : [];
            this.requiredDungeons = rawReqDungeons.map((name) =>
                name === 'Skyview Temple' ? 'Skyview' : name,
            );

            const allLocIds = [
                ...(content.missing_locations ?? []),
                ...(content.checked_locations ?? []),
            ];

            const slotGame = content.slot_info[content.slot]?.game;
            const pkg =
                (slotGame ? client.package.findPackage(slotGame) : null) ??
                client.package.findPackage('Skyward Sword HD') ??
                client.package.findPackage('Skyward Sword');
            if (pkg) {
                this.idToLocation = pkg.reverseLocationTable as Record<
                    number,
                    string
                >;
                this.idToItem = pkg.reverseItemTable as Record<number, string>;
            }

            if (this.idToLocation && this.connectedData.checked_locations) {
                this.checkedLocations = this.connectedData.checked_locations
                    .map((location_id) =>
                        this.idToLocation![location_id]?.trim(),
                    )
                    .filter((loc): loc is string => Boolean(loc));
                this.resolveLocations?.(this.checkedLocations);
            } else if (this.connectedData.checked_locations) {
                this.pendingLocationIds.push(
                    ...this.connectedData.checked_locations,
                );
            }

            if (this.idToLocation && allLocIds.length > 0) {
                this.availableLocations = Array.from(
                    new Set(
                        allLocIds
                            .map((location_id) =>
                                this.idToLocation![location_id]?.trim(),
                            )
                            .filter((loc): loc is string => Boolean(loc)),
                    ),
                );
                this.resolveAvailableLocations?.(this.availableLocations);
            } else if (allLocIds.length > 0) {
                this.allLocationIds = allLocIds;
            }

            if (!this.idToLocation) {
                client.package
                    .fetchPackage([
                        slotGame ?? 'Skyward Sword HD',
                        'Skyward Sword HD',
                        'Skyward Sword',
                    ])
                    .then(() => {
                        const fetchedPkg =
                            (slotGame
                                ? client.package.findPackage(slotGame)
                                : null) ??
                            client.package.findPackage('Skyward Sword HD') ??
                            client.package.findPackage('Skyward Sword');
                        if (fetchedPkg) {
                            this.idToLocation =
                                fetchedPkg.reverseLocationTable as Record<
                                    number,
                                    string
                                >;
                            this.idToItem =
                                fetchedPkg.reverseItemTable as Record<
                                    number,
                                    string
                                >;
                            if (this.allLocationIds.length > 0) {
                                this.availableLocations = Array.from(
                                    new Set(
                                        this.allLocationIds
                                            .map((id) =>
                                                this.idToLocation![id]?.trim(),
                                            )
                                            .filter((loc): loc is string =>
                                                Boolean(loc),
                                            ),
                                    ),
                                );
                                this.allLocationIds = [];
                                this.resolveAvailableLocations?.(
                                    this.availableLocations,
                                );
                            }
                            if (this.pendingLocationIds.length > 0) {
                                const resolved = this.pendingLocationIds
                                    .map((id) => this.idToLocation![id]?.trim())
                                    .filter((loc): loc is string =>
                                        Boolean(loc),
                                    );
                                this.checkedLocations = Array.from(
                                    new Set([
                                        ...this.checkedLocations,
                                        ...resolved,
                                    ]),
                                );
                                this.pendingLocationIds = [];
                                this.resolveLocations?.(this.checkedLocations);
                            }
                            if (this.pendingItemIds.length > 0) {
                                for (const netItemId of this.pendingItemIds) {
                                    this.processNetItem(netItemId);
                                }
                                this.pendingItemIds = [];
                                this.resolveItems?.(this.inventory);
                            }
                        }
                    })
                    .catch((err) => {
                        console.error('Failed to fetch data package:', err);
                    });
            }

            client.socket.send({
                cmd: 'GetDataPackage',
                games: ['Skyward Sword', 'Skyward Sword HD'],
            });
            const cubePrefix =
                slotGame === 'Skyward Sword HD'
                    ? 'skyward_sword_hd_cubes'
                    : 'skyward_sword_cubes';
            this.cubeDataKey = `${cubePrefix}_${content.team}_${content.slot}`;
            client.socket.send({
                cmd: 'SetNotify',
                keys: [this.cubeDataKey],
            });
            client.socket.send({
                cmd: 'Get',
                keys: [this.cubeDataKey],
            });
        });

        client.socket.on('dataPackage', (content) => {
            const rawPacket: unknown = Array.isArray(content)
                ? content[0]
                : content;
            const dataPackage: DataPackage | undefined =
                rawPacket &&
                typeof rawPacket === 'object' &&
                'data' in rawPacket
                    ? (rawPacket as DataPackagePacket).data
                    : (rawPacket as DataPackage | undefined);
            const ssData =
                dataPackage?.games?.['Skyward Sword HD'] ??
                dataPackage?.games?.['Skyward Sword'];
            if (ssData !== undefined) {
                this.idToLocation = invert<string, number>(
                    ssData.location_name_to_id,
                );
                this.idToItem = invert<string, number>(ssData.item_name_to_id);

                if (this.pendingLocationIds.length > 0) {
                    const resolved = this.pendingLocationIds
                        .map((location_id) =>
                            this.idToLocation![location_id]?.trim(),
                        )
                        .filter((loc): loc is string => Boolean(loc));
                    this.checkedLocations = Array.from(
                        new Set([...this.checkedLocations, ...resolved]),
                    );
                    this.pendingLocationIds = [];
                    this.resolveLocations?.(this.checkedLocations);
                }
                if (this.allLocationIds.length > 0) {
                    const resolvedAvail = this.allLocationIds
                        .map((location_id) =>
                            this.idToLocation![location_id]?.trim(),
                        )
                        .filter((loc): loc is string => Boolean(loc));
                    this.availableLocations = Array.from(
                        new Set([...this.availableLocations, ...resolvedAvail]),
                    );
                    this.allLocationIds = [];
                    this.resolveAvailableLocations?.(this.availableLocations);
                }
                if (this.pendingItemIds.length > 0) {
                    for (const netItemId of this.pendingItemIds) {
                        this.processNetItem(netItemId);
                    }
                    this.pendingItemIds = [];
                    this.resolveItems?.(this.inventory);
                }
            }
        });

        client.messages.on('message', (_, messageData) => {
            const convertNode = (node: MessageNode): ColoredText => {
                switch (node.type) {
                    case 'item': {
                        let item_color: keyof ColorScheme = 'apFiller';
                        let item_class = 'normal';
                        if (node.item.progression) {
                            item_color = 'apProgression';
                            item_class = 'progression';
                        } else if (node.item.trap) {
                            item_color = 'apTrap';
                            item_class = 'trap';
                        } else if (node.item.useful) {
                            item_color = 'apUseful';
                            item_class = 'useful';
                        } else if (node.item.filler) {
                            item_class = 'filler';
                        }
                        return {
                            text: node.text,
                            color: item_color,
                            tooltip: `Item Class: ${item_class}`,
                        };
                    }
                    case 'location':
                        return {
                            text: node.text,
                            color: 'apLocation',
                        };
                    case 'color':
                        return {
                            text: node.text,
                            customColor: node.color,
                        };
                    case 'text':
                        return {
                            text: node.text,
                        };
                    case 'entrance':
                        return {
                            text: node.text,
                            color: 'apEntrance',
                        };
                    case 'player': {
                        const player_color =
                            this.connectedData?.slot === node.player.slot
                                ? 'apThisPlayer'
                                : 'apOtherPlayer';
                        let player_type = 'player';
                        switch (node.player.type) {
                            case 0:
                                player_type = 'spectator';
                                break;
                            case 2:
                                player_type = 'group';
                                break;
                            default:
                                break;
                        }
                        const player_tooltip: React.ReactNode = [
                            `Game: ${node.player.game}`,
                            React.createElement('br', { key: 'break' }),
                            `Type: ${player_type}`,
                        ];
                        return {
                            text: node.text,
                            color: player_color,
                            tooltip: player_tooltip,
                        };
                    }
                }
            };
            const msg = messageData.map((node) => convertNode(node));
            this.messages.push(msg);
            // Don't keep track of too many messages at a time
            if (this.messages.length > MAX_MESSAGES) {
                this.messages.shift();
            }
            this.onMessage?.(this.messages);
        });

        client.socket.on('receivedItems', (content) => {
            if (content.index === 0) {
                this.inventory = this.loadedSettings
                    ? { ...getInitialItems(this.loadedSettings) }
                    : {};
                this.pendingItemIds = [];
            }
            if (!this.idToItem) {
                this.pendingItemIds.push(...content.items.map((i) => i.item));
                return;
            }
            for (const netItem of content.items) {
                this.processNetItem(netItem.item);
            }
            this.resolveItems?.(this.inventory);
        });

        client.socket.on('roomUpdate', (content) => {
            if (content.checked_locations) {
                if (this.idToLocation) {
                    const newLocs = content.checked_locations
                        .map((location_id) =>
                            this.idToLocation![location_id]?.trim(),
                        )
                        .filter((loc): loc is string => Boolean(loc));
                    this.checkedLocations = Array.from(
                        new Set([...this.checkedLocations, ...newLocs]),
                    );
                    this.resolveLocations?.(this.checkedLocations);
                } else {
                    this.pendingLocationIds.push(...content.checked_locations);
                }
            }
        });

        client.socket.on('bounced', (content) => {
            const stage = content.data?.ss_stage_name;
            if (stage !== undefined) {
                this.changeStage?.(stage as string);
            }
        });

        client.socket.on('retrieved', (content) => {
            if (this.cubeDataKey !== undefined) {
                const new_cubes = content.keys[this.cubeDataKey];
                if (new_cubes !== undefined) {
                    this.checkedCubes = new_cubes as number;
                    this.resolveCubes?.(new_cubes as number);
                }
            }
        });

        client.socket.on('setReply', (content) => {
            if (this.cubeDataKey === content.key) {
                const new_cubes = content.value;
                if (new_cubes !== undefined) {
                    this.checkedCubes = new_cubes as number;
                    this.resolveCubes?.(new_cubes as number);
                }
            }
        });

        try {
            this.status = { state: 'loggingIn' };
            this.notifyStatusSubscribers();
            await client.login(server, slot, '', {
                tags: ['Tracker'],
                password: password,
                version: {
                    major: 0,
                    minor: 6,
                    build: 7,
                },
            });
            this.client = client;
            this.status = {
                state: 'loggedIn',
                serverName: server,
                slotName: slot,
            };
            this.notifyStatusSubscribers();
            return true;
        } catch (error: unknown) {
            this.status = { state: 'loggedOut', error: convertError(error) };
            this.notifyStatusSubscribers();
            return false;
        }
    }
}

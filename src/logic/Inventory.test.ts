import { describe, expect, it } from 'vitest';
import { APClientManager } from '../archipelago/Archipelago';
import { resolveItem } from './Inventory';

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

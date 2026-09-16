import { useContext, useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Link, Navigate } from 'react-router-dom';
import {
    ClientManagerContext,
    useApConnectionStatusString,
} from './archipelago/ClientHooks';
import CustomizationModal from './customization/CustomizationModal';
import {
    autoRegionLoadingSelector,
    hasCustomLayoutSelector,
} from './customization/Selectors';
import goddessCubesList_ from './data/goddessCubes2.json';
import stageToRegion from './data/stageToRegion.json';
import { DragAndDropContext } from './dragAndDrop/DragAndDrop';
import EntranceTracker from './entranceTracker/EntranceTracker';
import { ExportButton } from './ImportExport';
import { TrackerLayoutCustom } from './layouts/TrackerLayoutCustom';
import { TrackerLayout } from './layouts/TrackerLayouts';
import { useSyncTrackerStateToLocalStorage } from './LocalStorage';
import LocationContextMenu from './locationTracker/LocationContextMenu';
import LocationGroupContextMenu from './locationTracker/LocationGroupContextMenu';
import type { InventoryItem } from './logic/Inventory';
import { isLogicLoadedSelector, logicSelector } from './logic/Selectors';
import { MakeTooltipsAvailable } from './tooltips/TooltipHooks';
import {
    bulkEditChecks,
    // clickDungeonName,
    setAvailableLocations,
    setItemCounts,
    type TrackerState,
} from './tracker/Slice';
import { useTrackerInterfaceReducer } from './tracker/TrackerInterfaceReducer';
// import { requiredDungeonsSelector } from './tracker/Selectors';
// import type { RegularDungeon } from './logic/Locations';

export default function TrackerContainer() {
    const logicLoaded = useSelector(isLogicLoadedSelector);

    // If we haven't loaded logic yet, redirect to the main menu,
    // which will take care of loading logic for us.
    if (!logicLoaded) {
        return <Navigate to="/" />;
    }

    return (
        <MakeTooltipsAvailable>
            <DragAndDropContext>
                <Tracker />
            </DragAndDropContext>
            <TrackerStateSaver />
        </MakeTooltipsAvailable>
    );
}

// Split out into separate component to optimize rerenders
function TrackerStateSaver() {
    useSyncTrackerStateToLocalStorage();
    return null;
}

function Tracker() {
    return (
        <>
            <div
                style={{
                    width: '100vw',
                    height: '100vh',
                    overflow: 'hidden',
                    background: 'var(--scheme-background)',
                }}
            >
                <div
                    style={{
                        height: '95%',
                        position: 'relative',
                        display: 'flex',
                        flexFlow: 'row nowrap',
                    }}
                >
                    <TrackerContents />
                </div>
                <div
                    style={{
                        position: 'fixed',
                        bottom: 0,
                        left: 0,
                        width: '100%',
                        height: '5%',
                    }}
                >
                    <TrackerFooter />
                </div>
            </div>
        </>
    );
}

function TrackerContents() {
    const logic = useSelector(logicSelector);
    const [trackerInterfaceState, trackerInterfaceDispatch] =
        useTrackerInterfaceReducer();

    const hasCustomLayout = useSelector(hasCustomLayoutSelector);
    const dispatch = useDispatch();
    const clientManager = useContext(ClientManagerContext);
    const autoRegionLoading = useSelector(autoRegionLoadingSelector);
    // const reqDungeons = useSelector(requiredDungeonsSelector);

    // Configure the AP client for auto-tracking
    useEffect(() => {
        const shortToFull: Record<string, string> = {};
        for (const [fullName, checkInfo] of Object.entries(logic.checks)) {
            shortToFull[checkInfo.name] = fullName;
            const suffix = checkInfo.name.split(' - ').slice(1).join(' - ');
            if (suffix) {
                shortToFull[suffix] = fullName;
            }
        }
        const clientLocationCallback = (locs: string[]) => {
            dispatch(
                bulkEditChecks({
                    checks: locs
                        .map(
                            (loc) =>
                                shortToFull[loc] ??
                                shortToFull[
                                    loc.split(' - ').slice(1).join(' - ')
                                ] ??
                                shortToFull[loc.replace(/^.* - /, '')],
                        )
                        .filter((c): c is string => Boolean(c)),
                    markChecked: true,
                }),
            );
        };

        const clientCubeCallback = (cubeflags: number) => {
            const cubes = Array.from(goddessCubesList_);
            const struck = cubes
                .filter((_, index) => (cubeflags & (1 << index)) !== 0)
                .map((cubedata) => cubedata[1]);
            dispatch(
                bulkEditChecks({
                    checks: struck,
                    markChecked: true,
                }),
            );
        };

        const clientItemCallback = (inv: TrackerState['inventory']) => {
            const items: { item: InventoryItem; count: number }[] = [];
            for (const [item, count] of Object.entries(inv)) {
                items.push({ item: item as InventoryItem, count });
            }
            dispatch(setItemCounts(items));
        };

        const stageCallback = (stage: string) => {
            if (autoRegionLoading) {
                const region =
                    stageToRegion[stage as keyof typeof stageToRegion];
                if (region !== undefined) {
                    trackerInterfaceDispatch({
                        type: 'selectHintRegion',
                        hintRegion: region,
                    });
                }
            }
        };

        const clientAvailableLocationsCallback = (locs: string[]) => {
            dispatch(setAvailableLocations(locs.length > 0 ? locs : undefined));
        };

        clientManager?.setLocationCallback(clientLocationCallback);
        clientManager?.setAvailableLocationsCallback(
            clientAvailableLocationsCallback,
        );
        clientManager?.setItemCallback(clientItemCallback);
        clientManager?.setNewStageCallback(stageCallback);
        clientManager?.setCubeCallback(clientCubeCallback);
        /* This will have to happen somewhere else to work properly
        if (clientManager !== undefined) {
            for (const dungeonName of clientManager!.requiredDungeons) {
                const dungeon = dungeonName as RegularDungeon;
                if (dungeon !== undefined && !reqDungeons.includes(dungeon)) {
                    dispatch(clickDungeonName({dungeonName: dungeon}));
                }
            }
        } */
    }, [
        dispatch,
        logic,
        clientManager,
        autoRegionLoading,
        trackerInterfaceDispatch,
    ]);

    return (
        <>
            <LocationContextMenu />
            <LocationGroupContextMenu
                interfaceDispatch={trackerInterfaceDispatch}
            />
            {hasCustomLayout ? (
                <TrackerLayoutCustom
                    interfaceDispatch={trackerInterfaceDispatch}
                    interfaceState={trackerInterfaceState}
                />
            ) : (
                <TrackerLayout
                    interfaceDispatch={trackerInterfaceDispatch}
                    interfaceState={trackerInterfaceState}
                />
            )}
        </>
    );
}

function TrackerFooter() {
    const [showCustomizationDialog, setShowCustomizationDialog] =
        useState(false);
    const [showEntranceDialog, setShowEntranceDialog] = useState(false);
    const statusString = useApConnectionStatusString();

    return (
        <>
            <div
                style={{
                    background: 'lightgrey',
                    width: '100%',
                    height: '100%',
                    alignContent: 'center',
                    display: 'flex',
                    flexFlow: 'row nowrap',
                    justifyContent: 'space-around',
                    alignItems: 'center',
                }}
            >
                <div style={{ color: '#000000' }}>{statusString}</div>
                <div>
                    <Link to="/">
                        <div className="tracker-button">← Options</div>
                    </Link>
                </div>
                <div>
                    <ExportButton />
                </div>
                <div>
                    <button
                        type="button"
                        className="tracker-button"
                        onClick={() => setShowEntranceDialog(true)}
                    >
                        Entrances
                    </button>
                </div>
                <div>
                    <button
                        type="button"
                        className="tracker-button"
                        onClick={() => setShowCustomizationDialog(true)}
                    >
                        Customization
                    </button>
                </div>
            </div>
            <CustomizationModal
                open={showCustomizationDialog}
                onOpenChange={setShowCustomizationDialog}
            />
            <EntranceTracker
                open={showEntranceDialog}
                onOpenChange={setShowEntranceDialog}
            />
        </>
    );
}

import { itemLocationAssignmentEnabledSelector } from '../customization/Selectors';
import { isRegularItemCheck } from '../logic/Logic';
import { goddessChestCheckToCubeCheck } from '../logic/TrackerModifications';
import type { SyncThunkResult } from '../store/Store';
import { areasSelector, checkSelector } from './Selectors';
import { bulkEditChecks, clickCheckInternal } from './Slice';

export function clickCheck({
    checkId,
    markChecked,
}: {
    checkId: string;
    markChecked?: boolean;
}): SyncThunkResult {
    return (dispatch, getState) => {
        const check = checkSelector(checkId)(getState());
        const autoAssignmentEnabled =
            itemLocationAssignmentEnabledSelector(getState());
        const isCurrentlyChecked =
            getState().tracker.checkedChecks.includes(checkId);
        const willCheck = markChecked ?? !isCurrentlyChecked;

        dispatch(
            clickCheckInternal({
                checkId,
                markChecked,
                canMarkForItemAssignment:
                    autoAssignmentEnabled &&
                    check.type !== 'exit' &&
                    isRegularItemCheck(check.type),
            }),
        );

        const connectedCube = goddessChestCheckToCubeCheck[checkId];
        if (connectedCube) {
            dispatch(
                clickCheckInternal({
                    checkId: connectedCube,
                    markChecked: willCheck,
                    canMarkForItemAssignment: false,
                }),
            );
        }
    };
}

export function checkOrUncheckAll(
    area: string,
    markChecked: boolean,
    onlyInLogic = false,
): SyncThunkResult {
    return (dispatch, getState) => {
        let checks = areasSelector(getState()).find((a) => a.name === area)
            ?.checks.list;

        if (onlyInLogic) {
            checks = checks?.filter(
                (c) => checkSelector(c)(getState()).logicalState === 'inLogic',
            );
        }

        if (checks?.length) {
            dispatch(bulkEditChecks({ checks, markChecked }));
        }
    };
}

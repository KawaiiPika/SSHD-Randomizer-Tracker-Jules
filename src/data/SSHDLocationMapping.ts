import dumpToSSHDMap from './dumpToSSHDLocationMap.json';
import oldShortNameToSSHDMap from './oldDumpShortNameToSSHDName.json';

export const dumpCheckToSSHDName: Record<string, string> = dumpToSSHDMap;
export const oldDumpShortNameToSSHDName: Record<string, string> =
    oldShortNameToSSHDMap;

export const sshdNameToDumpCheck: Record<string, string> = {};
for (const [dumpId, sshdName] of Object.entries(dumpToSSHDMap)) {
    sshdNameToDumpCheck[sshdName] = dumpId;
}

export const sshdNameToOldShortName: Record<string, string> = {};
for (const [oldShort, sshdName] of Object.entries(oldShortNameToSSHDMap)) {
    sshdNameToOldShortName[sshdName] = oldShort;
}

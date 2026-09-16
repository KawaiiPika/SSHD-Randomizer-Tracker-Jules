import dumpToSSHDMap from './dumpToSSHDLocationMap.json';
import oldShortNameToSSHDMap from './oldDumpShortNameToSSHDName.json';

export const dumpCheckToSSHDName: Record<string, string> = dumpToSSHDMap;
export const oldDumpShortNameToSSHDName: Record<string, string> =
    oldShortNameToSSHDMap;

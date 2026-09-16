import { isEqual } from 'es-toolkit';
import { load } from 'js-yaml';
import { patchRawLogicForSSHD } from '../logic/TrackerModifications';
import type { RawLogic, RawPresets } from '../logic/UpstreamTypes';
import type { MultiChoiceOption, OptionDefs } from '../permalink/SettingsTypes';
import { compareBy } from '../utils/Compare';
import { appError } from '../utils/Debug';
import { convertError } from '../utils/Errors';
import { getLatestRelease } from './ReleasesLoader';

export const LATEST_STRING = 'Latest';
// Fallback in case the GitHub API is unreachable or rate limited
const LATEST_KNOWN_RELEASE = 'v2.2.0';

export type RemoteReference =
    | {
          type: 'latestRelease';
      }
    | {
          type: 'releaseVersion';
          versionTag: string;
      }
    | {
          type: 'forkBranch';
          // not a great name, this is the GitHub account or organization name
          author: string;
          // the GitHub project name, fallback to ssrando so that author/branchname works
          // for forks that aren't named sslib...
          repoName: string | undefined;
          branch: string;
      };

export function areRemotesEqual(left: RemoteReference, right: RemoteReference) {
    // Ensure that the undefined value is present before comparing
    const canonicalizeValue = (v: RemoteReference): RemoteReference => {
        if (v.type === 'forkBranch' && v.repoName === undefined) {
            return { ...v, repoName: undefined };
        }
        return v;
    };
    return isEqual(canonicalizeValue(left), canonicalizeValue(right));
}

async function resolveRemote(
    ref: RemoteReference,
): Promise<[url: string, name: string]> {
    switch (ref.type) {
        case 'latestRelease':
            try {
                const latest = await getLatestRelease();
                return [
                    `https://raw.githubusercontent.com/ssrando/ssrando/${latest}`,
                    latest,
                ];
            } catch (e) {
                appError(
                    'Could not retrieve latest release from GitHub: ' +
                        (e ? convertError(e) : 'Unknown error'),
                );
                return [
                    `https://raw.githubusercontent.com/ssrando/ssrando/${LATEST_KNOWN_RELEASE}`,
                    LATEST_KNOWN_RELEASE,
                ];
            }
        case 'releaseVersion':
            // Hack: This is a custom logic dump backported to 2.1.1
            if (ref.versionTag === 'v2.1.1') {
                return [
                    `https://raw.githubusercontent.com/robojumper/ssrando/logic-v2.1.1`,
                    formatRemote(ref),
                ];
            }
            return [
                `https://raw.githubusercontent.com/ssrando/ssrando/${ref.versionTag}`,
                formatRemote(ref),
            ];
        case 'forkBranch':
            return [
                `https://raw.githubusercontent.com/${ref.author}/${
                    ref.repoName ?? 'ssrando'
                }/${ref.branch}`,
                formatRemote(ref),
            ];
    }
}

export function formatRemote(ref: RemoteReference) {
    switch (ref.type) {
        case 'latestRelease':
            return LATEST_STRING;
        case 'releaseVersion':
            return ref.versionTag;
        case 'forkBranch':
            if (ref.repoName) {
                return `https://github.com/${ref.author}/${ref.repoName}/tree/${ref.branch}`;
            } else {
                return `${ref.author}/${ref.branch}`;
            }
    }
}

const prBranchPattern =
    /^https:\/\/github.com\/([^/]+)\/ssrando\/tree\/([^/]+)$/;
const extendedPrBranchPattern =
    /^https:\/\/github.com\/([^/]+)\/([^/]+)\/(?:tree|releases\/tag)\/([^/]+)$/;
const branchPattern = /^([^/]+)(?:[/|:])([^/]+)$/;
const versionPattern = /^v\d+\.\d+\.\d+$/;

export function parseRemote(remote: string): RemoteReference | undefined {
    // eslint-disable-next-line no-param-reassign
    remote = remote.trim();
    if (remote === LATEST_STRING) {
        return { type: 'latestRelease' };
    }
    if (remote.match(versionPattern)) {
        return { type: 'releaseVersion', versionTag: remote };
    }

    const prBranchMatch =
        remote.match(prBranchPattern) ?? remote.match(branchPattern);
    if (prBranchMatch) {
        return {
            type: 'forkBranch',
            author: prBranchMatch[1],
            branch: prBranchMatch[2],
            repoName: undefined,
        };
    }

    const extendedPrBranchMatch = remote.match(extendedPrBranchPattern);
    if (extendedPrBranchMatch) {
        return {
            type: 'forkBranch',
            author: extendedPrBranchMatch[1],
            branch: extendedPrBranchMatch[3],
            repoName: extendedPrBranchMatch[2],
        };
    }
}

const baseFileUrl = (remoteUrl: string, file: string) => `${remoteUrl}/${file}`;

const loadFileFromUrl = async (url: string) => {
    const response = await fetch(url);
    if (response.status === 200) {
        return response.text();
    } else {
        throw new Error(`failed to fetch ${url}`);
    }
};

const loadFile = async (baseUrl: string, file: string) => {
    const fileUrl = baseFileUrl(baseUrl, file);
    return await loadFileFromUrl(fileUrl);
};

export async function loadRemoteLogic(
    remote: RemoteReference,
): Promise<[RawLogic, OptionDefs, RawPresets, string]> {
    const [baseUrl, remoteName] = await resolveRemote(remote);
    const loader = (file: string) => loadFile(baseUrl, file);

    return [...(await getAndPatchLogic(loader)), remoteName];
}

export const sshdOptionDefs: OptionDefs = [
    {
        name: 'Gratitude Crystal Shuffle',
        command: 'gratitude-crystal-shuffle',
        type: 'singlechoice',
        permalink: false,
        choices: ['off', 'on'],
        bits: 1,
        default: 'on',
        help: 'Determines if single gratitude crystal locations are randomized.',
    },
    {
        name: 'NPC Closet Shuffle',
        command: 'npc-closet-shuffle',
        type: 'singlechoice',
        permalink: false,
        choices: ['vanilla', 'randomized'],
        bits: 1,
        default: 'randomized',
        help: 'Determines if NPC closets contain randomized items.',
    },
    {
        name: 'Stamina Fruit Shuffle',
        command: 'stamina-fruit-shuffle',
        type: 'singlechoice',
        permalink: false,
        choices: ['off', 'on'],
        bits: 1,
        default: 'off',
        help: 'Determines if stamina fruits are randomized.',
    },
    {
        name: 'Underground Rupee Shuffle',
        command: 'underground-rupee-shuffle',
        type: 'singlechoice',
        permalink: false,
        choices: ['off', 'on'],
        bits: 1,
        default: 'off',
        help: 'Determines if underground rupees are randomized.',
    },
    {
        name: 'Beedle Shop Shuffle',
        command: 'beedle-shop-shuffle',
        type: 'singlechoice',
        permalink: false,
        choices: ['vanilla', 'junk_only', 'randomized'],
        bits: 2,
        default: 'randomized',
        help: "Determines how Beedle's Airshop is randomized.",
    },
    {
        name: 'Goddess Chest Shuffle',
        command: 'goddess-chest-shuffle',
        type: 'singlechoice',
        permalink: false,
        choices: ['off', 'on'],
        bits: 1,
        default: 'off',
        help: 'Determines if Goddess Chests are randomized.',
    },
    {
        name: 'Tadtone Shuffle',
        command: 'tadtone-shuffle',
        type: 'singlechoice',
        permalink: false,
        choices: ['off', 'on'],
        bits: 1,
        default: 'off',
        help: 'Determines if Tadtones are randomized.',
    },
];

export async function getAndPatchLogic(
    loader: (fileName: string) => Promise<string>,
) {
    const parseYaml = async <T>(file: string) => {
        const text = await loader(file);
        return load(text) as T;
    };

    const parseJson = async <T>(file: string) => {
        const text = await loader(file);
        return JSON.parse(text) as T;
    };

    const [logic, options, presets] = await Promise.all([
        parseYaml<RawLogic>('dump.yaml'),
        parseYaml<OptionDefs>('options.yaml'),
        parseJson<RawPresets>('gui/presets/default_presets.json'),
    ]);

    patchRawLogicForSSHD(logic);

    const patchedOptions = options.slice();

    for (const sshdOpt of sshdOptionDefs) {
        const idx = patchedOptions.findIndex(
            (x) => x.command === sshdOpt.command,
        );
        if (idx >= 0) {
            patchedOptions[idx] = sshdOpt;
        } else {
            patchedOptions.push(sshdOpt);
        }
    }

    const eudIndex = patchedOptions.findIndex(
        (x) => x.command === 'empty-unrequired-dungeons',
    );
    if (eudIndex >= 0) {
        const eudOpt = patchedOptions[eudIndex];
        if (eudOpt.type === 'boolean') {
            patchedOptions[eudIndex] = {
                ...eudOpt,
                default: false,
            };
        }
    }

    // We need to patch the "excluded locations" option with the actual checks from logic.
    const excludedLocsIndex = patchedOptions.findIndex(
        (x) => x.command === 'excluded-locations' && x.type === 'multichoice',
    );
    if (excludedLocsIndex >= 0) {
        const excludedLocsOption = patchedOptions[
            excludedLocsIndex
        ] as MultiChoiceOption;

        const choices = Object.values(logic.checks).map((c) => c.short_name);

        patchedOptions[excludedLocsIndex] = {
            ...excludedLocsOption,
            choices,
            default: [...excludedLocsOption.default].sort(
                compareBy((entry) => choices.indexOf(entry)),
            ),
        };
    }

    return [logic, patchedOptions, presets] as const;
}

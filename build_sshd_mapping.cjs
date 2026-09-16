const fs = require('fs');
const yaml = require('js-yaml');

const dump = yaml.load(fs.readFileSync('testData/dump.yaml', 'utf8'));
const sshdLocs = yaml.load(fs.readFileSync('sshd-rando-main/data/locations.yaml', 'utf8'));
const items = yaml.load(fs.readFileSync('sshd-rando-main/data/items.yaml', 'utf8'));
const cubes = JSON.parse(fs.readFileSync('src/data/goddessCubes2.json', 'utf8'));

const sshdSet = new Set(sshdLocs.map(l => l.name));

// Map goddess chest checks to SSHD location names via items.yaml
const cubeCheckToSSHDChest = {};
for (const item of items) {
    if (item.goddess_chest) {
        // Find matching dump cube check
        // e.g. item.name: "Faron Woods Goddess Cube on West Great Tree near Exit"
        cubeCheckToSSHDChest[item.name] = item.goddess_chest;
    }
}

// Build mapping for the 27 goddess chests from goddessCubes2.json
const chestCheckToSSHD = {};
for (const [chestCheck, cubeCheck] of cubes) {
    // extract last part of cubeCheck: e.g. "Goddess Cube West of Earth Temple Entrance"
    const cubeName = cubeCheck.split('\\').pop();
    const sshdCube = items.find(i => i.types && i.types.includes('Goddess Cube') && i.name.toLowerCase().includes(cubeName.toLowerCase().replace('goddess cube ', '')));
    if (sshdCube && sshdCube.goddess_chest) {
        chestCheckToSSHD[chestCheck] = sshdCube.goddess_chest;
    }
}

console.log('Goddess chests resolved automatically:', Object.keys(chestCheckToSSHD).length);

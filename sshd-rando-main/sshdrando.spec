# -*- mode: python ; coding: utf-8 -*-

import os
import glob

from constants.randoconstants import VERSION

block_cipher = None

def build_datas_recursive(paths):
    datas = []
    
    for path in paths:
        for filename in glob.iglob(path, recursive=True):
            dest_dirname = os.path.dirname(filename)

            if dest_dirname == "":
                dest_dirname = "."
            
            data_entry = (filename, dest_dirname)
            datas.append(data_entry)
            # print(data_entry)
    
    return datas


def build_ap_bridge_datas():
    """Bundle AP bridge files used by patcher_tab's SSHDRWrapper import path."""
    bridge_files = [
        "SSHDRWrapper.py",
        "Locations.py",
        "Items.py",
        "SSHD_Options.py",
        "platform_utils.py",
        "setting_string_decoder.py",
        "archipelago.json",
    ]
    bridge_roots = [
        "../SSHD_APWorld",
    ]

    for root in bridge_roots:
        if not os.path.isdir(root):
            continue

        datas = []
        for filename in bridge_files:
            src = os.path.join(root, filename)
            if os.path.isfile(src):
                datas.append((src, "apworld_bridge"))

        if datas:
            return datas

    return []


a = Analysis(
    ["sshdrando.py"],
    pathex=[],
    binaries=[],
    datas=build_datas_recursive(
        [
            "asm/*.*",  # includes assemble.py but it shouldn't matter
            "asm/additions/diffs/*.yaml",
            "asm/patches/diffs/*.yaml",
            "assets/**/*",
            "data/**/*",
            "gui/custom_themes/**/*",
            "plandomizers/**/*",
            "presets/**/*",
            "sshd_extract/README.md",
            "*.md",
            "LICENSE",
        ]
    ) + build_ap_bridge_datas(),
    hiddenimports=[],
    hookspath=[],
    runtime_hooks=[],
    excludes=[],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
)

pyz = PYZ(
    a.pure,
    a.zipped_data,
    cipher=block_cipher,
)

exe = EXE(
    pyz,
    a.scripts,
    [
        ("--nogui", None, "OPTION"),
    ],
    a.binaries,
    a.datas,
    name=f"Skyward Sword HD Randomizer Archipelago {VERSION}",
    debug=False,
    strip=False,
    upx=True,
    runtime_tmpdir=None,
    console=False,
    icon="assets/icon.png", # causes the exe to get flagged as a trojan :/
)

app = BUNDLE(
    exe,
    name=f"Skyward Sword HD Randomizer Archipelago {VERSION}.app",
    icon="assets/icon.png",
    bundle_identifier=None,
    info_plist={
        "LSBackgroundOnly": False,
        "CFBundleDisplayName": "Skyward Sword HD Randomizer Archipelago",
        "CFBundleName": "SSHD Rando AP", # 15 character maximum
        "CFBundleShortVersionString": VERSION,
    },
)

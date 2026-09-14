"""
Patcher tab for the SSHD Randomizer GUI.

Provides the ability to load an .apsshd file, generate ROM patches using
the user's extracted ROM, and install the result to the emulator.
"""

import json
import os
import shutil
import sys
import tempfile
import urllib.error
import urllib.request
import zipfile
from pathlib import Path
from typing import Optional

from PySide6.QtCore import Qt, QThread, Signal
from PySide6.QtWidgets import (
    QComboBox,
    QFileDialog,
    QGroupBox,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QProgressBar,
    QPushButton,
    QScrollArea,
    QSizePolicy,
    QTextEdit,
    QVBoxLayout,
    QWidget,
)

from filepathconstants import CONFIG_PATH, SSHD_EXTRACT_PATH

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from gui.main import Main
    from gui.ui.ui_main import Ui_main_window


# ── Helpers ───────────────────────────────────────────────────────────────

_GAME_ID = "01002da013484000"
_ALL_EMULATORS = ["Ryujinx", "yuzu", "suyu", "sudachi", "eden"]
_APWORLD_BRIDGE_FILES = [
    "SSHDRWrapper.py",
    "Locations.py",
    "Items.py",
    "SSHD_Options.py",
    "platform_utils.py",
    "archipelago.json",
]
_APWORLD_BRIDGE_BASE_URL = os.environ.get(
    "SSHD_APWORLD_BRIDGE_BASE_URL",
    "https://raw.githubusercontent.com/LonLon-Labs/SSHD_APWorld/refs/heads/main",
)


def _emulator_mod_path(emulator: str) -> Optional[Path]:
    """Return the expected mod directory path for a specific emulator, or None if not installed."""
    if sys.platform == "win32":
        base = Path(os.environ.get("APPDATA", "")) / emulator
    elif sys.platform == "linux":
        linux_dirs = {
            "Ryujinx": ".config/Ryujinx",
            "yuzu": ".local/share/yuzu",
            "suyu": ".local/share/suyu",
            "sudachi": ".local/share/sudachi",
            "eden": ".local/share/eden",
        }
        dir_name = linux_dirs.get(emulator)
        if dir_name is None:
            return None
        base = Path.home() / dir_name
    else:  # macOS
        base = Path.home() / "Library" / "Application Support" / emulator

    if not base.exists():
        return None

    if emulator == "Ryujinx":
        return base / "sdcard" / "atmosphere" / "contents" / _GAME_ID
    return base / "load" / _GAME_ID


def _detect_installed_emulators() -> list:
    """Return list of emulator names whose base directory exists."""
    return [emu for emu in _ALL_EMULATORS if _emulator_mod_path(emu) is not None]


def _find_emulator_mod_dir(emulator: Optional[str] = None) -> Optional[Path]:
    """Return the emulator LayeredFS mod path for SSHD, or None.

    If *emulator* is given, only check that specific emulator.
    """
    targets = [emulator] if emulator else _ALL_EMULATORS
    for emu in targets:
        p = _emulator_mod_path(emu)
        if p is not None:
            p.mkdir(parents=True, exist_ok=True)
            return p
    return None


def _find_all_emulator_mod_dirs() -> list:
    """Return list of Paths for all installed emulators."""
    dirs = []
    for emu in _ALL_EMULATORS:
        p = _emulator_mod_path(emu)
        if p is not None:
            dirs.append(p)
    return dirs


def _download_apworld_bridge_files(log_message=None) -> Path:
    """Download required APWorld bridge files for this patch run."""
    cache_dir = Path(CONFIG_PATH).resolve().parent / "apworld_bridge_download"
    cache_dir.mkdir(parents=True, exist_ok=True)

    failures = []
    for filename in _APWORLD_BRIDGE_FILES:
        url = f"{_APWORLD_BRIDGE_BASE_URL}/{filename}"
        target = cache_dir / filename
        try:
            with urllib.request.urlopen(url, timeout=30) as resp:
                data = resp.read()
            target.write_bytes(data)
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            failures.append(f"{filename}: {exc}")

    if failures:
        details = "\n".join(failures)
        raise RuntimeError(
            "Failed to download required APWorld bridge files from "
            f"{_APWORLD_BRIDGE_BASE_URL}.\n{details}"
        )

    if log_message is not None:
        log_message(f"Downloaded AP bridge files to: {cache_dir}")

    return cache_dir


# Keep old name as alias
_find_ryujinx_mod_dir = _find_emulator_mod_dir


def _find_ap_bridge_dirs() -> list[Path]:
    """Find directories that may contain SSHDRWrapper.py for AP patching."""
    candidates = []

    meipass = getattr(sys, "_MEIPASS", None)
    if meipass:
        meipass_path = Path(meipass)
        candidates.extend(
            [
                meipass_path / "apworld_bridge",
                meipass_path / "SSHD_APWorld",
            ]
        )

    this_file = Path(__file__).resolve()
    search_roots = [
        Path.cwd(),
        this_file.parent,
        this_file.parent.parent,
        this_file.parent.parent.parent,
    ]

    seen = set()
    unique_roots = []
    for root in search_roots:
        root_resolved = root.resolve()
        key = str(root_resolved)
        if key not in seen:
            seen.add(key)
            unique_roots.append(root_resolved)

    for root in unique_roots:
        candidates.extend(
            [
                root / "SSHD_APWorld",
            ]
        )

    valid = []
    seen_valid = set()
    for d in candidates:
        if d.is_dir() and (d / "SSHDRWrapper.py").is_file():
            s = str(d)
            if s not in seen_valid:
                seen_valid.add(s)
                valid.append(d)

    # Hard policy: only APWorld bridge roots are allowed for sshd-rando patching.
    valid.sort(key=lambda p: ("apworld_bridge" not in str(p), "SSHD_APWorld" not in str(p)))
    return valid


# ── Worker thread ─────────────────────────────────────────────────────────


class PatchWorker(QThread):
    """Background thread that runs patching so the GUI stays responsive."""

    log_message = Signal(str)
    progress_update = Signal(int)
    status_update = Signal(str, str)  # (message, color)
    finished_signal = Signal(bool)  # success

    def __init__(self, patch_path: Path, extract_path: Path, emulator: str = "all"):
        super().__init__()
        self._patch_path = patch_path
        self._extract_path = extract_path
        self._emulator = emulator

    def run(self):
        try:
            self._do_patch()
        except Exception as e:
            import traceback

            self.log_message.emit(f"\nERROR: {e}")
            self.log_message.emit(traceback.format_exc())
            self.status_update.emit(f"Error: {e}", "#ee0000")
            self.finished_signal.emit(False)

    def _do_patch(self):
        self.log_message.emit("Reading .apsshd file...")
        self.progress_update.emit(5)

        with zipfile.ZipFile(self._patch_path, "r") as zf:
            manifest = json.loads(zf.read("manifest.json"))
            patch_data = json.loads(zf.read("patch_data.json"))

            if "patcher_data.json" not in zf.namelist():
                self.status_update.emit("Invalid .apsshd file", "#ee0000")
                self.log_message.emit(
                    "This .apsshd does not contain patcher_data.json.\n"
                    "It was likely generated by an older version."
                )
                self.finished_signal.emit(False)
                return

            patcher_data = json.loads(zf.read("patcher_data.json"))

        self.log_message.emit(f"  Player: {manifest.get('player')}")
        self.log_message.emit(f"  Seed:   {manifest.get('seed')}")

        # Check if already contains ROM patches
        has_existing = manifest.get("has_rom_patches", False)
        with zipfile.ZipFile(self._patch_path, "r") as zf:
            has_romfs = any(n.startswith("romfs/") for n in zf.namelist())
            has_exefs = any(n.startswith("exefs/") for n in zf.namelist())

        if has_existing and has_romfs and has_exefs:
            self.log_message.emit("\nThis .apsshd already contains ROM patches.")
            self.log_message.emit("Installing existing patches...")
            self.progress_update.emit(50)
            self._install_from_zip()
            return

        # Generate patches from scratch
        self.log_message.emit("\nGenerating ROM patches from your ROM extract...")
        self.progress_update.emit(10)

        # Validate extract
        romfs_check = self._extract_path / "romfs"
        if not romfs_check.exists():
            self.status_update.emit("ROM extract not found", "#ee0000")
            self.log_message.emit(
                f"Expected {romfs_check} to exist.\n"
                f"Extract your SSHD ROM and point to the folder."
            )
            self.finished_signal.emit(False)
            return

        temp_dir = Path(tempfile.mkdtemp(prefix="sshd_patch_"))
        try:
            self._generate_and_install(patcher_data, temp_dir)
        finally:
            if temp_dir.exists():
                shutil.rmtree(temp_dir, ignore_errors=True)

    def _install_from_zip(self):
        """Install pre-patched romfs/exefs from the .apsshd file."""
        if self._emulator == "all":
            mod_dirs = _find_all_emulator_mod_dirs()
        else:
            d = _find_emulator_mod_dir(self._emulator)
            mod_dirs = [d] if d else []

        if not mod_dirs:
            self.status_update.emit("Emulator directory not found", "#ff7700")
            self.log_message.emit(
                "Could not locate emulator mod directory.\n"
                "Extract romfs/ and exefs/ from the .apsshd manually."
            )
            self.finished_signal.emit(False)
            return

        for mod_dir in mod_dirs:
            mod_dir.mkdir(parents=True, exist_ok=True)
            install_dir = mod_dir / "Archipelago"
            self.log_message.emit(f"Installing to: {install_dir}")

            if install_dir.exists():
                shutil.rmtree(install_dir)
            install_dir.mkdir(parents=True, exist_ok=True)

            with zipfile.ZipFile(self._patch_path, "r") as zf:
                for name in zf.namelist():
                    if name.startswith("romfs/") or name.startswith("exefs/"):
                        target = install_dir / name
                        target.parent.mkdir(parents=True, exist_ok=True)
                        with zf.open(name) as src, open(target, "wb") as dst:
                            dst.write(src.read())

        self.progress_update.emit(100)
        self.status_update.emit(f"Installed to {len(mod_dirs)} emulator(s)!", "#00ff7f")
        self.log_message.emit("\nDone! Launch Skyward Sword HD in your emulator.")
        self.finished_signal.emit(True)

    def _generate_and_install(self, patcher_data: dict, temp_dir: Path):
        """Run the full patch generation pipeline."""
        import io

        # Set up environment for sshd-rando imports
        os.environ["SSHD_AP_EXTRACT_PATH"] = str(self._extract_path.resolve())
        os.environ["SSHD_AP_USERDATA_PATH"] = str(self._extract_path.resolve().parent)

        import importlib

        if "filepathconstants" in sys.modules:
            importlib.reload(sys.modules["filepathconstants"])
        importlib.invalidate_caches()

        self.log_message.emit("Downloading AP bridge files...")
        downloaded_bridge_dir = _download_apworld_bridge_files(self.log_message.emit)

        # We need SSHDRWrapper.py from APWorld bridge files or SSHD_APWorld checkout only.
        bridge_dirs = [downloaded_bridge_dir]
        for d in _find_ap_bridge_dirs():
            if d != downloaded_bridge_dir:
                bridge_dirs.append(d)
        # Remove any stale Switch/legacy bridge paths from prior runs in the same process.
        blocked_tokens = ("SSHD_APWorld_Switch", "SSHD_Switch_AP", "legacy_switch")
        sys.path = [p for p in sys.path if not any(tok in str(p) for tok in blocked_tokens)]

        # Reinsert allowed bridge dirs at highest priority in deterministic order.
        for bridge_dir in reversed(bridge_dirs):
            bridge_str = str(bridge_dir)
            if bridge_str in sys.path:
                sys.path.remove(bridge_str)
            sys.path.insert(0, bridge_str)

        # Force a fresh import so path-priority changes take effect this run.
        if "SSHDRWrapper" in sys.modules:
            del sys.modules["SSHDRWrapper"]

        try:
            wrapper_mod = importlib.import_module("SSHDRWrapper")
            wrapper_path = Path(getattr(wrapper_mod, "__file__", "")).resolve()

            # Enforce APWorld-only wrapper selection.
            wrapper_path_str = str(wrapper_path)
            if (
                "SSHD_APWorld" not in wrapper_path_str
                and "apworld_bridge" not in wrapper_path_str
            ) or any(tok in wrapper_path_str for tok in blocked_tokens):
                raise ImportError(
                    "Resolved SSHDRWrapper from a disallowed path: "
                    f"{wrapper_path}. Allowed roots: SSHD_APWorld or apworld_bridge."
                )

            create_sshd_rando_config = wrapper_mod.create_sshd_rando_config
            overlay_multiworld_items = wrapper_mod.overlay_multiworld_items
        except ModuleNotFoundError as exc:
            if exc.name == "SSHDRWrapper":
                searched = "\n".join(f"  - {d}" for d in bridge_dirs) or "  - (no bridge directories found)"
                raise ModuleNotFoundError(
                    "No module named 'SSHDRWrapper'.\n"
                    "Could not locate AP bridge files. Checked directories:\n"
                    f"{searched}\n"
                    "Install/build with AP bridge files (apworld_bridge) or place SSHD_APWorld beside the randomizer."
                ) from exc
            raise

        # Do not call the downloaded APWorld wrapper's backend initializer here.
        # In the randomizer app/exe, the sshd-rando backend is the app itself and
        # its modules are already directly importable; the APWorld initializer is
        # designed for a separate on-disk sshd-rando-backend checkout.

        # Force reimport of filepathconstants and all backend modules from the backend now that it's on sys.path.
        # This ensures all path constants (SSHD_EXTRACT_PATH, OBJECTPACK_PATH, DEFAULT_OUTPUT_PATH, etc.)
        # read the env vars we set above (SSHD_AP_EXTRACT_PATH, SSHD_AP_USERDATA_PATH).
        # We must clear logic.* and other backend modules so they re-import filepathconstants fresh.
        modules_to_clear = [m for m in sys.modules.keys() if m.startswith(('filepathconstants', 'logic', 'patches', 'util', 'constants', 'randomizer'))]
        for mod_name in modules_to_clear:
            del sys.modules[mod_name]
        importlib.invalidate_caches()

        from logic.generate import generate
        from logic.config import write_config_to_file
        from patches.allpatchhandler import AllPatchHandler
        from util.text import load_text_data

        ap_settings = patcher_data["ap_settings"]
        seed = patcher_data.get("sshdr_seed")

        self.progress_update.emit(15)
        self.log_message.emit("Building sshd-rando config...")

        config = create_sshd_rando_config(ap_settings, temp_dir, seed)
        config.output_dir = temp_dir

        config_file = temp_dir / "ap_config.yaml"
        write_config_to_file(config_file, config, write_preferences=False)

        # Ensure output_dir is persisted to the YAML so generate() reads the correct path
        import yaml
        with open(config_file, "r", encoding="utf-8") as f:
            cfg = yaml.safe_load(f) or {}
        cfg["output_dir"] = str(temp_dir.resolve())
        with open(config_file, "w", encoding="utf-8") as f:
            yaml.dump(cfg, f, default_flow_style=False)

        # Legacy backend reads output_dir from preferences.yaml (not config fields),
        # so point preferences output_dir at this run's temp directory.
        try:
            import filepathconstants as _fpc

            prefs_path = Path(_fpc.PREFERENCES_PATH)
            prefs_path.parent.mkdir(parents=True, exist_ok=True)
            prefs_data = {}
            if prefs_path.is_file():
                with open(prefs_path, "r", encoding="utf-8") as f:
                    prefs_data = yaml.safe_load(f) or {}
            prefs_data["output_dir"] = temp_dir.as_posix()
            with open(prefs_path, "w", encoding="utf-8") as f:
                yaml.safe_dump(prefs_data, f, sort_keys=False)
        except Exception as e:
            self.log_message.emit(f"Warning: could not write backend preferences.yaml: {e}")

        self.progress_update.emit(25)
        self.log_message.emit("Generating sshd-rando world...")

        worlds = generate(config_file)
        world = worlds[0]
        if world is None:
            self.status_update.emit("Generation failed", "#ee0000")
            self.log_message.emit("sshd-rando generation returned None world.")
            self.finished_signal.emit(False)
            return

        world.config.output_dir = temp_dir

        # Overlay multiworld items
        item_mapping = patcher_data.get("multiworld_item_mapping", {})
        if item_mapping:
            self.progress_update.emit(50)
            self.log_message.emit(f"Overlaying {len(item_mapping)} multiworld items...")
            overlay_multiworld_items(world, item_mapping)

        # Inject custom flags
        raw_flag_mapping = patcher_data.get("custom_flag_mapping", {})
        if raw_flag_mapping:
            self.progress_update.emit(55)
            self.log_message.emit(f"Injecting {len(raw_flag_mapping)} custom flags...")
            flag_mapping = {int(k): v for k, v in raw_flag_mapping.items()}
            location_code_to_flag = {
                loc_code: fid for fid, loc_code in flag_mapping.items()
            }

            # Try to import Locations from AP world
            try:
                from Locations import LOCATION_TABLE

                name_to_code = {
                    name: data.code
                    for name, data in LOCATION_TABLE.items()
                    if data.code is not None
                }
                injected = 0
                for loc_name, loc_obj in world.location_table.items():
                    code = name_to_code.get(loc_name)
                    if code is not None and code in location_code_to_flag:
                        loc_obj.custom_flag = location_code_to_flag[code]
                        injected += 1
                self.log_message.emit(f"  Injected flags into {injected} locations")
            except ImportError:
                self.log_message.emit("  Warning: Could not import AP Locations table")

        # Apply ROM patches
        self.progress_update.emit(65)
        self.log_message.emit("Applying ROM patches...")
        load_text_data()
        handler = AllPatchHandler(world)
        handler.do_all_patches()

        self.progress_update.emit(85)
        self.log_message.emit("Installing to emulator...")

        romfs_out = temp_dir / "romfs"
        exefs_out = temp_dir / "exefs"

        if not romfs_out.exists() or not exefs_out.exists():
            self.status_update.emit("Patch generation failed", "#ee0000")
            self.log_message.emit("romfs or exefs not generated.")
            self.finished_signal.emit(False)
            return

        if self._emulator == "all":
            mod_dirs = _find_all_emulator_mod_dirs()
        else:
            d = _find_emulator_mod_dir(self._emulator)
            mod_dirs = [d] if d else []

        if not mod_dirs:
            self.status_update.emit(
                "Patches generated \u2014 manual install needed", "#ff7700"
            )
            self.log_message.emit(
                f"Patches at: {temp_dir}\n"
                "Copy romfs/ and exefs/ to your emulator's mod directory."
            )
            self.finished_signal.emit(True)
            return

        for mod_dir in mod_dirs:
            mod_dir.mkdir(parents=True, exist_ok=True)
            install_dir = mod_dir / "Archipelago"
            self.log_message.emit(f"Installing to: {install_dir}")
            if install_dir.exists():
                shutil.rmtree(install_dir)
            install_dir.mkdir(parents=True, exist_ok=True)
            shutil.copytree(str(romfs_out), str(install_dir / "romfs"))
            shutil.copytree(str(exefs_out), str(install_dir / "exefs"))

        self.progress_update.emit(100)
        self.status_update.emit(
            f"Patched and installed to {len(mod_dirs)} emulator(s)!", "#00ff7f"
        )
        self.log_message.emit(
            "\nDone! Launch Skyward Sword HD in your emulator and connect to the server."
        )
        self.finished_signal.emit(True)


# ── Tab class ─────────────────────────────────────────────────────────────


class PatcherTab:
    """Manages the integrated Patcher tab in the randomizer GUI."""

    def __init__(self, main: "Main", ui: "Ui_main_window"):
        self.main = main
        self.ui = ui
        self._worker: Optional[PatchWorker] = None

        self._build_tab()

    def _build_tab(self):
        self.tab = QWidget()
        self.tab.setObjectName("patcher_tab")

        layout = QVBoxLayout(self.tab)
        layout.setContentsMargins(12, 12, 12, 12)
        layout.setSpacing(10)

        # ── Title ─────────────────────────────────────────────────────
        title = QLabel("<b>SSHD Archipelago Patcher</b>")
        title.setAlignment(Qt.AlignmentFlag.AlignCenter)
        layout.addWidget(title)

        subtitle = QLabel("<i>Generate and install ROM patches from .apsshd files</i>")
        subtitle.setAlignment(Qt.AlignmentFlag.AlignCenter)
        layout.addWidget(subtitle)

        # ── Patch file row ────────────────────────────────────────────
        group_file = QGroupBox("Patch File")
        vbox_file = QVBoxLayout(group_file)

        row1 = QHBoxLayout()
        lbl1 = QLabel("Patch file:")
        lbl1.setMinimumWidth(100)
        self.patch_input = QLineEdit()
        self.patch_input.setPlaceholderText("Select an .apsshd file...")
        self.patch_input.textChanged.connect(self._on_file_changed)
        row1.addWidget(lbl1)
        row1.addWidget(self.patch_input, stretch=1)
        browse_btn = QPushButton("Browse")
        browse_btn.clicked.connect(self._browse_patch)
        row1.addWidget(browse_btn)
        vbox_file.addLayout(row1)

        # Extract path
        row2 = QHBoxLayout()
        lbl2 = QLabel("ROM extract:")
        lbl2.setMinimumWidth(100)
        self.extract_input = QLineEdit(str(SSHD_EXTRACT_PATH))
        self.extract_input.setPlaceholderText("Path to sshd_extract folder")
        row2.addWidget(lbl2)
        row2.addWidget(self.extract_input, stretch=1)
        browse_ext = QPushButton("Browse")
        browse_ext.clicked.connect(self._browse_extract)
        row2.addWidget(browse_ext)
        vbox_file.addLayout(row2)

        # Emulator selection
        row3 = QHBoxLayout()
        lbl3 = QLabel("Install to:")
        lbl3.setMinimumWidth(100)
        self.emulator_combo = QComboBox()
        self.emulator_combo.addItem("All Installed Emulators", "all")
        for emu in _detect_installed_emulators():
            self.emulator_combo.addItem(emu, emu)
        row3.addWidget(lbl3)
        row3.addWidget(self.emulator_combo, stretch=1)
        vbox_file.addLayout(row3)

        layout.addWidget(group_file)

        # ── Info / status ─────────────────────────────────────────────
        self.info_label = QLabel("Select an .apsshd file and click Patch & Install")
        self.info_label.setWordWrap(True)
        layout.addWidget(self.info_label)

        # ── Progress ──────────────────────────────────────────────────
        self.progress_bar = QProgressBar()
        self.progress_bar.setRange(0, 100)
        self.progress_bar.setValue(0)
        self.progress_bar.setTextVisible(True)
        layout.addWidget(self.progress_bar)

        # ── Log output ────────────────────────────────────────────────
        self.log_output = QTextEdit()
        self.log_output.setReadOnly(True)
        self.log_output.setSizePolicy(
            QSizePolicy.Policy.Expanding,
            QSizePolicy.Policy.Expanding,
        )
        layout.addWidget(self.log_output, stretch=1)

        # ── Patch button ──────────────────────────────────────────────
        self.patch_btn = QPushButton("Patch && Install")
        self.patch_btn.setMinimumHeight(40)
        self.patch_btn.clicked.connect(self._start_patch)
        self.patch_btn.setEnabled(False)
        layout.addWidget(self.patch_btn)

        # Insert before Tracker (last tab)
        tracker_index = self.ui.tab_widget.count() - 1
        self.ui.tab_widget.insertTab(tracker_index, self.tab, "Patcher")

    # ── Callbacks ─────────────────────────────────────────────────────

    def _browse_patch(self):
        start = (
            str(Path(self.patch_input.text()).parent)
            if self.patch_input.text().strip()
            else str(Path.home())
        )
        path, _ = QFileDialog.getOpenFileName(
            self.main,
            "Select .apsshd file",
            start,
            "SSHD Patches (*.apsshd);;All Files (*)",
        )
        if path:
            self.patch_input.setText(path)

    def _browse_extract(self):
        start = self.extract_input.text().strip() or str(Path.home())
        path = QFileDialog.getExistingDirectory(
            self.main,
            "Select SSHD ROM Extract Folder",
            start,
        )
        if path:
            self.extract_input.setText(path)

    def _on_file_changed(self):
        """Enable/disable patch button and show file info."""
        patch_file = self.patch_input.text().strip()
        valid = (
            patch_file and Path(patch_file).is_file() and patch_file.endswith(".apsshd")
        )
        self.patch_btn.setEnabled(valid)

        if valid:
            try:
                with zipfile.ZipFile(patch_file, "r") as zf:
                    manifest = json.loads(zf.read("manifest.json"))
                    player = manifest.get("player", "?")
                    seed = manifest.get("seed", "?")
                    has_rom = manifest.get("has_rom_patches", False)
                    status = (
                        "contains ROM patches" if has_rom else "needs ROM generation"
                    )
                    self.info_label.setText(
                        f"Player: {player}  |  Seed: {seed}  |  Status: {status}"
                    )
            except Exception as e:
                self.info_label.setText(f"Could not read file: {e}")
                self.patch_btn.setEnabled(False)

    def _start_patch(self):
        """Begin the patching process in a background thread."""
        patch_path = Path(self.patch_input.text().strip())
        extract_path = Path(self.extract_input.text().strip())

        if not patch_path.is_file():
            self.info_label.setText("Please select a valid .apsshd file.")
            return

        self.patch_btn.setEnabled(False)
        self.progress_bar.setValue(0)
        self.log_output.clear()

        self._worker = PatchWorker(
            patch_path, extract_path, self.emulator_combo.currentData()
        )
        self._worker.log_message.connect(self._on_log)
        self._worker.progress_update.connect(self.progress_bar.setValue)
        self._worker.status_update.connect(self._on_status)
        self._worker.finished_signal.connect(self._on_finished)
        self._worker.finished.connect(self._on_worker_thread_finished)
        self._worker.start()

    def _on_log(self, text: str):
        self.log_output.append(text)

    def _on_status(self, text: str, color: str):
        self.info_label.setText(f'<span style="color:{color}">{text}</span>')

    def _on_finished(self, success: bool):
        self.patch_btn.setEnabled(True)

    def _on_worker_thread_finished(self):
        """Clear worker reference only after the thread has fully stopped."""
        self._worker = None

    def set_extract_path(self, path: str):
        """Called externally to sync extract path from the AP settings tab."""
        if path:
            self.extract_input.setText(path)

"""
Archipelago Settings tab for the SSHD Randomizer GUI.

Provides all Archipelago-specific settings that are not part of the
vanilla randomizer: player name, death link, breath link, progression
balancing, cosmetic model choices, and cheats.
"""

from functools import partial
from pathlib import Path

from PySide6.QtCore import Qt
from PySide6.QtWidgets import (
    QCheckBox,
    QComboBox,
    QDoubleSpinBox,
    QFileDialog,
    QGroupBox,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QPushButton,
    QScrollArea,
    QSizePolicy,
    QSlider,
    QSpinBox,
    QVBoxLayout,
    QWidget,
)

from filepathconstants import CONFIG_PATH
from logic.config import write_config_to_file

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from gui.main import Main
    from gui.ui.ui_main import Ui_main_window

# ── Default values ────────────────────────────────────────────────────────

AP_DEFAULTS = {
    "player_name": "Player1",
    "goal": 0,
    "triforce_required": True,
    "triforce_count": 3,
    "dungeon_goal_requirement": False,
    "required_dungeon_count": 0,
    "require_greg": False,
    "require_tim": False,
    "require_all_progression_items": False,
    "death_link": False,
    "breath_link": False,
    "progression_balancing": 50,
    "use_alternative_logo": False,
    "archipelago_item_model": 2,
    "extract_path": "",
    # Cheats
    "cheat_infinite_health": False,
    "cheat_infinite_stamina": False,
    "cheat_infinite_ammo": False,
    "cheat_infinite_bugs": False,
    "cheat_infinite_materials": False,
    "cheat_infinite_shield": False,
    "cheat_infinite_skyward_strike": False,
    "cheat_infinite_rupees": False,
    "cheat_moon_jump": False,
    "cheat_hovercraft": False,
    "cheat_infinite_beetle": False,
    "cheat_infinite_loftwing": False,
    "cheat_no_electric_stun": False,
    "cheat_speed_multiplier": 10,
    "demise_count": 1,
}

GOAL_OPTIONS = ["Defeat Demise", "Defeat Ghirahim 3", "Defeat Horde"]
ITEM_MODEL_OPTIONS = ["Letter", "Archipelago Logo", "Unofficial Archipelago Logo"]


class Archipelago:
    """Manages the Archipelago-specific settings tab."""

    def __init__(self, main: "Main", ui: "Ui_main_window"):
        self.main = main
        self.ui = ui
        self.config = main.config

        # Load saved AP settings from config (stored as extra dict)
        if not hasattr(self.config, "ap_settings"):
            self.config.ap_settings = dict(AP_DEFAULTS)

        self.ap: dict = self.config.ap_settings

        # Build the tab widget
        self._build_tab()
        self._load_values()
        self._update_summary()

    # ── Tab construction ──────────────────────────────────────────────────

    def _build_tab(self):
        """Programmatically create the Archipelago tab and add it to the tab widget."""
        self.tab = QWidget()
        self.tab.setObjectName("archipelago_tab")

        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        scroll.setFrameShape(QScrollArea.Shape.NoFrame)

        scroll_widget = QWidget()
        self.layout = QVBoxLayout(scroll_widget)
        self.layout.setContentsMargins(12, 12, 12, 12)
        self.layout.setSpacing(10)

        self._build_connection_group()
        self._build_defeat_requirements_group()
        self._build_multiworld_group()
        self._build_cosmetics_group()
        self._build_cheats_group()
        self._build_extract_group()
        self._build_summary_group()

        self.layout.addStretch()
        scroll.setWidget(scroll_widget)

        tab_layout = QVBoxLayout(self.tab)
        tab_layout.setContentsMargins(0, 0, 0, 0)
        tab_layout.addWidget(scroll)

        # Insert before the Tracker tab (last real tab)
        tracker_index = self.ui.tab_widget.count() - 1
        self.ui.tab_widget.insertTab(tracker_index, self.tab, "Archipelago")

    # ── Group: Connection / Player ────────────────────────────────────────

    def _build_connection_group(self):
        group = QGroupBox("Player Information")
        vbox = QVBoxLayout(group)

        # Player name
        row = QHBoxLayout()
        lbl = QLabel("Player Name:")
        lbl.setMinimumWidth(160)
        self.player_name_edit = QLineEdit()
        self.player_name_edit.setPlaceholderText("Player1")
        self.player_name_edit.setToolTip(
            "Your player name in the Archipelago multiworld session.\n"
            "This must match the name used when generating the multiworld."
        )
        self.player_name_edit.textChanged.connect(self._on_change)
        row.addWidget(lbl)
        row.addWidget(self.player_name_edit, stretch=1)
        vbox.addLayout(row)

        self.layout.addWidget(group)

    # ── Group: Defeat Requirements ─────────────────────────────────────────

    def _build_defeat_requirements_group(self):
        group = QGroupBox("Defeat Requirements")
        vbox = QVBoxLayout(group)

        # Triforce Required
        self.triforce_required_cb = QCheckBox("Triforce Required")
        self.triforce_required_cb.setToolTip(
            "When enabled, Triforce pieces are required to open the door\n"
            "to Hylia's Realm. When disabled, you can proceed to the\n"
            "endgame without collecting any Triforce pieces."
        )
        self.triforce_required_cb.stateChanged.connect(self._on_change)
        self.triforce_required_cb.stateChanged.connect(
            self._update_triforce_count_enabled
        )
        vbox.addWidget(self.triforce_required_cb)

        # Triforce Count
        row = QHBoxLayout()
        lbl = QLabel("Triforce Count:")
        lbl.setMinimumWidth(160)
        self.triforce_count_spin = QSpinBox()
        self.triforce_count_spin.setRange(1, 3)
        self.triforce_count_spin.setToolTip(
            "How many of the 3 Triforce pieces are needed to open the\n"
            "door to Hylia's Realm. Only applies when Triforce Required\n"
            "is enabled."
        )
        self.triforce_count_spin.valueChanged.connect(self._on_change)
        row.addWidget(lbl)
        row.addWidget(self.triforce_count_spin)
        row.addStretch()
        vbox.addLayout(row)

        # Dungeon Goal Requirement
        self.require_dungeons_cb = QCheckBox("Dungeon Goal Requirement")
        self.require_dungeons_cb.setToolTip(
            "When enabled, you must defeat the configured number of dungeons\n"
            "before the goal boss counts for victory."
        )
        self.require_dungeons_cb.stateChanged.connect(self._on_change)
        self.require_dungeons_cb.stateChanged.connect(self._update_dungeon_count_enabled)
        vbox.addWidget(self.require_dungeons_cb)

        # Dungeon Count
        row = QHBoxLayout()
        lbl = QLabel("Dungeon Count:")
        lbl.setMinimumWidth(160)
        self.dungeon_count_spin = QSpinBox()
        self.dungeon_count_spin.setRange(0, 7)
        self.dungeon_count_spin.setToolTip(
            "How many dungeons must be defeated before the goal boss counts.\n"
            "Only applies when Require Dungeons is enabled."
        )
        self.dungeon_count_spin.valueChanged.connect(self._on_change)
        row.addWidget(lbl)
        row.addWidget(self.dungeon_count_spin)
        row.addStretch()
        vbox.addLayout(row)

        # Require Greg
        self.require_greg_cb = QCheckBox("Require Greg (The Green Rupee)")
        self.require_greg_cb.setToolTip(
            "When enabled, you must obtain Greg The Green Rupee\n"
            "before the goal boss counts for victory."
        )
        self.require_greg_cb.stateChanged.connect(self._on_change)
        vbox.addWidget(self.require_greg_cb)

        # Require Tim
        self.require_tim_cb = QCheckBox("Require Tim (The Tumbleweed)")
        self.require_tim_cb.setToolTip(
            "When enabled, you must obtain Tim The Tumbleweed\n"
            "before the goal boss counts for victory."
        )
        self.require_tim_cb.stateChanged.connect(self._on_change)
        vbox.addWidget(self.require_tim_cb)

        # Require All Progression Items
        self.require_all_progression_cb = QCheckBox("Require All Progression Items")
        self.require_all_progression_cb.setToolTip(
            "When enabled, you must collect every single progression item\n"
            "in the randomizer before the goal boss counts for victory.\n"
            "This may result in a long playthrough!"
        )
        self.require_all_progression_cb.stateChanged.connect(self._on_change)
        vbox.addWidget(self.require_all_progression_cb)

        self.layout.addWidget(group)

    def _update_triforce_count_enabled(self):
        """Enable/disable the triforce count spinbox based on triforce_required."""
        self.triforce_count_spin.setEnabled(self.triforce_required_cb.isChecked())

    def _update_dungeon_count_enabled(self):
        """Enable/disable the dungeon count spinbox based on require_dungeons."""
        self.dungeon_count_spin.setEnabled(self.require_dungeons_cb.isChecked())

    # ── Group: Multiworld Options ─────────────────────────────────────────

    def _build_multiworld_group(self):
        group = QGroupBox("Multiworld Options")
        vbox = QVBoxLayout(group)

        # Goal
        row = QHBoxLayout()
        lbl = QLabel("Goal:")
        lbl.setMinimumWidth(160)
        self.goal_combo = QComboBox()
        self.goal_combo.setMinimumWidth(200)
        self.goal_combo.addItems(GOAL_OPTIONS)
        self.goal_combo.setToolTip(
            "Victory condition for this world in the multiworld.\n"
            "Defeat Demise: Full Horde \u2192 Ghirahim 3 \u2192 Demise sequence.\n"
            "Defeat Ghirahim 3: Demise is skipped.\n"
            "Defeat Horde: Ghirahim 3 and Demise are skipped."
        )
        self.goal_combo.currentIndexChanged.connect(self._on_change)
        row.addWidget(lbl)
        row.addWidget(self.goal_combo)
        row.addStretch()
        vbox.addLayout(row)

        # Demise Count
        row = QHBoxLayout()
        lbl = QLabel("Demise Count:")
        lbl.setMinimumWidth(160)
        self.demise_count_spin = QSpinBox()
        self.demise_count_spin.setRange(1, 10)
        self.demise_count_spin.setToolTip(
            "Number of Demise bosses to fight in the final arena.\n"
            "Setting this higher than 1 spawns additional Demise bosses."
        )
        self.demise_count_spin.valueChanged.connect(self._on_change)
        row.addWidget(lbl)
        row.addWidget(self.demise_count_spin)
        row.addStretch()
        vbox.addLayout(row)

        # Death Link
        self.death_link_cb = QCheckBox("Death Link")
        self.death_link_cb.setToolTip("When you die, everyone dies (and vice versa).")
        self.death_link_cb.stateChanged.connect(self._on_change)
        vbox.addWidget(self.death_link_cb)

        # Breath Link
        self.breath_link_cb = QCheckBox("Breath Link")
        self.breath_link_cb.setToolTip(
            "When your stamina runs out, everyone's stamina runs out (and vice versa)."
        )
        self.breath_link_cb.stateChanged.connect(self._on_change)
        vbox.addWidget(self.breath_link_cb)

        # Progression Balancing
        row = QHBoxLayout()
        lbl = QLabel("Progression Balancing:")
        lbl.setMinimumWidth(160)
        self.progression_spin = QSpinBox()
        self.progression_spin.setRange(0, 99)
        self.progression_spin.setToolTip(
            "Controls how much to front-load progression items to reduce waiting.\n"
            "0 = completely random, 50 = balanced (recommended), 99 = maximum early placement."
        )
        self.progression_spin.valueChanged.connect(self._on_change)
        row.addWidget(lbl)
        row.addWidget(self.progression_spin)
        row.addStretch()
        vbox.addLayout(row)

        self.layout.addWidget(group)

    # ── Group: Cosmetics ──────────────────────────────────────────────────

    def _build_cosmetics_group(self):
        group = QGroupBox("Archipelago Cosmetics")
        vbox = QVBoxLayout(group)

        # Alternative logo
        self.alt_logo_cb = QCheckBox("Use Alternative Archipelago Logo")
        self.alt_logo_cb.setToolTip(
            "Use the alternative Archipelago logo on the title screen and credits\n"
            "(adds the archipelago triangle pattern at the top)."
        )
        self.alt_logo_cb.stateChanged.connect(self._on_change)
        vbox.addWidget(self.alt_logo_cb)

        # Item model
        row = QHBoxLayout()
        lbl = QLabel("AP Item Model:")
        lbl.setMinimumWidth(160)
        self.item_model_combo = QComboBox()
        self.item_model_combo.addItems(ITEM_MODEL_OPTIONS)
        self.item_model_combo.setToolTip(
            "Choose the 3D model used for items that belong to other players.\n"
            "0 = Letter, 1 = Archipelago Logo, 2 = Unofficial AP Logo."
        )
        self.item_model_combo.currentIndexChanged.connect(self._on_change)
        row.addWidget(lbl)
        row.addWidget(self.item_model_combo)
        row.addStretch()
        vbox.addLayout(row)

        self.layout.addWidget(group)

    # ── Group: Cheats ─────────────────────────────────────────────────────

    def _build_cheats_group(self):
        group = QGroupBox("Cheats (applied in real-time by the AP client)")
        vbox = QVBoxLayout(group)

        note = QLabel(
            "<i>These cheats are applied via memory writes by the Archipelago client "
            "while connected. They do NOT affect randomizer logic or seed generation.</i>"
        )
        note.setWordWrap(True)
        vbox.addWidget(note)

        cheat_defs = [
            (
                "cheat_infinite_health",
                "Infinite Health",
                "Damage multiplier forced to 0 — you take no damage.",
            ),
            (
                "cheat_infinite_stamina",
                "Infinite Stamina",
                "Stamina gauge kept full at all times.",
            ),
            (
                "cheat_infinite_ammo",
                "Infinite Arrows/Bombs/Seeds",
                "Arrow, Bomb, and Deku Seed counters kept at max.",
            ),
            (
                "cheat_infinite_bugs",
                "Infinite Bugs",
                "Start with 99 of every bug. Client keeps flags set.",
            ),
            (
                "cheat_infinite_materials",
                "Infinite Materials (Treasures)",
                "Start with 99 of every treasure. Client keeps flags set.",
            ),
            (
                "cheat_infinite_shield",
                "Infinite Shield Durability",
                "Shield durability counter kept at max.",
            ),
            (
                "cheat_infinite_skyward_strike",
                "Infinite Skyward Strike",
                "Skyward Strike charge never expires.",
            ),
            (
                "cheat_infinite_rupees",
                "Infinite Rupees",
                "Rupee counter kept at wallet maximum.",
            ),
            ("cheat_moon_jump", "Moon Jump", "Press Y while airborne to fly upward."),
            (
                "cheat_hovercraft",
                "Hovercraft Mode",
                "Hold X to float. L-stick up/down to move forward/back, L-stick left/right to turn.",
            ),
            (
                "cheat_infinite_beetle",
                "Infinite Beetle Flying Time",
                "Beetle flight timer set to a very large value (patches game code).",
            ),
            (
                "cheat_infinite_loftwing",
                "Infinite Loftwing Charges",
                "Spiral charge counter stays at 3.",
            ),
            (
                "cheat_no_electric_stun",
                "No Electric Stun",
                "Electric shock paralysis animation removed.",
            ),
        ]

        self._cheat_checkboxes: dict[str, QCheckBox] = {}

        for key, label, tooltip in cheat_defs:
            cb = QCheckBox(label)
            cb.setToolTip(tooltip)
            cb.stateChanged.connect(self._on_change)
            vbox.addWidget(cb)
            self._cheat_checkboxes[key] = cb

        # Speed multiplier
        row = QHBoxLayout()
        lbl = QLabel("Speed Multiplier:")
        lbl.setMinimumWidth(160)
        self.speed_spin = QSpinBox()
        self.speed_spin.setRange(10, 50)
        self.speed_spin.setSingleStep(5)
        self.speed_spin.setSuffix("  (10 = 1x)")
        self.speed_spin.setToolTip(
            "Multiplies Link's forward movement speed.\n"
            "10 = normal (1.0x), 20 = double (2.0x), 30 = triple (3.0x).\n"
            "Values above 30 may cause collision issues."
        )
        self.speed_spin.valueChanged.connect(self._on_change)
        row.addWidget(lbl)
        row.addWidget(self.speed_spin)
        row.addStretch()
        vbox.addLayout(row)

        self.layout.addWidget(group)

    # ── Group: ROM Extract Path ───────────────────────────────────────────

    def _build_extract_group(self):
        group = QGroupBox("ROM Extract Path (for YAML / Patcher)")
        vbox = QVBoxLayout(group)

        note = QLabel(
            "<i>Path to your extracted SSHD ROM. Must contain romfs/ and exefs/ folders. "
            "Used when generating the Archipelago YAML and when patching.</i>"
        )
        note.setWordWrap(True)
        vbox.addWidget(note)

        row = QHBoxLayout()
        self.extract_path_edit = QLineEdit()
        self.extract_path_edit.setPlaceholderText(
            "C:\\ProgramData\\Archipelago\\sshd_extract"
        )
        self.extract_path_edit.setToolTip(
            "Path to extracted SSHD ROM (romfs/ and exefs/)."
        )
        self.extract_path_edit.textChanged.connect(self._on_change)
        row.addWidget(self.extract_path_edit, stretch=1)

        browse_btn = QPushButton("Browse")
        browse_btn.clicked.connect(self._browse_extract)
        row.addWidget(browse_btn)
        vbox.addLayout(row)

        self.layout.addWidget(group)

    def _build_summary_group(self):
        """Show a quick summary of current AP settings for at-a-glance review."""
        group = QGroupBox("Current Configuration Summary")
        vbox = QVBoxLayout(group)

        self.summary_label = QLabel("")
        self.summary_label.setWordWrap(True)
        vbox.addWidget(self.summary_label)

        self.layout.addWidget(group)
        self._update_summary()

    # ── Value load / save ─────────────────────────────────────────────────

    def _load_values(self):
        """Populate widgets from self.ap dict."""
        # Block signals while loading to prevent _on_change from firing
        # mid-load (which would save partially-default widget values over the
        # real loaded settings).
        self._loading = True
        try:
            self.player_name_edit.setText(
                self.ap.get("player_name", AP_DEFAULTS["player_name"])
            )
            self.demise_count_spin.setValue(self.ap.get("demise_count", 1))
            self.goal_combo.setCurrentIndex(self.ap.get("goal", 0))
            self.triforce_required_cb.setChecked(self.ap.get("triforce_required", True))
            self.triforce_count_spin.setValue(self.ap.get("triforce_count", 3))
            self._update_triforce_count_enabled()
            self.require_dungeons_cb.setChecked(self.ap.get("dungeon_goal_requirement", False))
            self.dungeon_count_spin.setValue(self.ap.get("required_dungeon_count", 0))
            self._update_dungeon_count_enabled()
            self.require_greg_cb.setChecked(self.ap.get("require_greg", False))
            self.require_tim_cb.setChecked(self.ap.get("require_tim", False))
            self.require_all_progression_cb.setChecked(self.ap.get("require_all_progression_items", False))
            self.death_link_cb.setChecked(self.ap.get("death_link", False))
            self.breath_link_cb.setChecked(self.ap.get("breath_link", False))
            self.progression_spin.setValue(self.ap.get("progression_balancing", 50))
            self.alt_logo_cb.setChecked(self.ap.get("use_alternative_logo", False))
            self.item_model_combo.setCurrentIndex(
                self.ap.get("archipelago_item_model", 2)
            )
            self.extract_path_edit.setText(self.ap.get("extract_path", ""))
            self.speed_spin.setValue(self.ap.get("cheat_speed_multiplier", 10))

            for key, cb in self._cheat_checkboxes.items():
                cb.setChecked(self.ap.get(key, False))
        finally:
            self._loading = False

    def _save_values(self):
        """Write widget values back to self.ap and persist config."""
        self.ap["player_name"] = self.player_name_edit.text().strip() or "Player1"
        self.ap["demise_count"] = self.demise_count_spin.value()
        self.ap["goal"] = self.goal_combo.currentIndex()
        self.ap["triforce_required"] = self.triforce_required_cb.isChecked()
        self.ap["triforce_count"] = self.triforce_count_spin.value()
        self.ap["dungeon_goal_requirement"] = self.require_dungeons_cb.isChecked()
        self.ap["required_dungeon_count"] = self.dungeon_count_spin.value()
        self.ap["require_greg"] = self.require_greg_cb.isChecked()
        self.ap["require_tim"] = self.require_tim_cb.isChecked()
        self.ap["require_all_progression_items"] = self.require_all_progression_cb.isChecked()
        self.ap["death_link"] = self.death_link_cb.isChecked()

        # Sync triforce settings into the randomizer's config settings map
        # so the randomizer logic sees them.
        rando_settings = self.config.settings[0].settings
        if "triforce_required" in rando_settings:
            rando_settings["triforce_required"].value = (
                "on" if self.ap["triforce_required"] else "off"
            )
        if "triforce_count" in rando_settings:
            rando_settings["triforce_count"].value = str(self.ap["triforce_count"])
        if "demise_count" in rando_settings:
            rando_settings["demise_count"].value = str(self.ap["demise_count"])
        self.ap["breath_link"] = self.breath_link_cb.isChecked()
        self.ap["progression_balancing"] = self.progression_spin.value()
        self.ap["use_alternative_logo"] = self.alt_logo_cb.isChecked()
        self.ap["archipelago_item_model"] = self.item_model_combo.currentIndex()
        self.ap["extract_path"] = self.extract_path_edit.text().strip()
        self.ap["cheat_speed_multiplier"] = self.speed_spin.value()

        for key, cb in self._cheat_checkboxes.items():
            self.ap[key] = cb.isChecked()

        self.config.ap_settings = self.ap
        write_config_to_file(CONFIG_PATH, self.config)

    def get_ap_settings(self) -> dict:
        """Return a copy of the current AP settings."""
        self._save_values()
        return dict(self.ap)

    # ── Callbacks ─────────────────────────────────────────────────────────

    def _on_change(self, *_args):
        if getattr(self, "_loading", False):
            return
        self._save_values()
        self._update_summary()

    def _browse_extract(self):
        start = self.extract_path_edit.text().strip() or str(Path.home())
        path = QFileDialog.getExistingDirectory(
            self.main,
            "Select SSHD ROM Extract Folder",
            start,
        )
        if path:
            self.extract_path_edit.setText(path)

    def _update_summary(self):
        """Refresh the at-a-glance summary label."""
        if not hasattr(self, "summary_label"):
            return

        parts = []
        name = self.ap.get("player_name", "Player1")
        parts.append(f"<b>Player:</b> {name}")

        goal_idx = self.ap.get("goal", 0)
        parts.append(f"<b>Goal:</b> {GOAL_OPTIONS[goal_idx]}")

        if self.ap.get("triforce_required", True):
            tc = self.ap.get("triforce_count", 3)
            parts.append(f"<b>Triforce:</b> {tc}/3 pieces required")
        else:
            parts.append("<b>Triforce:</b> Not required")

        active_links = []
        if self.ap.get("death_link"):
            active_links.append("Death Link")
        if self.ap.get("breath_link"):
            active_links.append("Breath Link")
        if active_links:
            parts.append(f"<b>Links:</b> {', '.join(active_links)}")

        bal = self.ap.get("progression_balancing", 50)
        parts.append(f"<b>Progression Balancing:</b> {bal}")

        active_cheats = []
        for key, cb in self._cheat_checkboxes.items():
            if cb.isChecked():
                active_cheats.append(cb.text())
        speed = self.ap.get("cheat_speed_multiplier", 10)
        if speed != 10:
            active_cheats.append(f"Speed {speed/10:.0f}x")

        if active_cheats:
            parts.append(
                f"<b>Active Cheats ({len(active_cheats)}):</b> {', '.join(active_cheats)}"
            )
        else:
            parts.append("<b>Cheats:</b> None")

        extract = self.ap.get("extract_path", "")
        if extract:
            # Check if path looks valid
            p = Path(extract)
            if (p / "romfs").exists():
                parts.append(f"<b>Extract:</b> {extract}")
            else:
                parts.append(f"<b>Extract:</b> {extract} (romfs/ not found)")
        else:
            parts.append("<b>Extract:</b> Not set")

        self.summary_label.setText("<br>".join(parts))

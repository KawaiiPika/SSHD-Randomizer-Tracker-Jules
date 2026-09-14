"""
Generate a SkywardSwordHD.yaml file from the current randomizer config
and Archipelago settings.

This combines the sshd-rando config.yaml settings with the AP-specific
settings (death link, cheats, etc.) into a single YAML template that
Archipelago can consume directly.
"""

from pathlib import Path
import hashlib

import yaml

from logic.config import Config
from logic.settings import Setting

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from gui.archipelago import Archipelago

# Maps sshd-rando setting names to YAML keys where they differ.
# Most are 1:1 so they don't need to be in this map.
_RANDO_TO_YAML = {
    "small_keys": "small_key_shuffle",
    "boss_keys": "boss_key_shuffle",
    "map_mode": "map_shuffle",
    "skip_g3": "skip_ghirahim3",
    "randomize_dungeon_entrances": "randomize_dungeons",
    "randomize_trial_gate_entrances": "randomize_trials",
    "required_dungeons": "required_dungeon_count",
    "got_sword_requirement": "gate_of_time_sword_requirement",
    "skip_misc_small_cutscenes": "skip_misc_cutscenes",
    "randomize_music": "music_randomization",
    "random_starting_tablet_count": "starting_tablets",
    # triforce_count in sshd-rando = required_triforce_pieces AP option (how many for Hylia's Realm door)
    "triforce_count": "required_triforce_pieces",
    # randomize_skykeep_layout in sshd-rando = decouple_skykeep_layout AP option
    "randomize_skykeep_layout": "decouple_skykeep_layout",
}

# sshd-rando settings that have no AP equivalent and should be excluded from yaml
_SKIP_SETTINGS = {
    "skip_demise",
    "goal_requirement",  # Replaced by individual require_* toggles in AP settings
}

# Settings that use on/off in sshd-rando but true/false in the YAML
_BOOL_SETTINGS = {
    "gratitude_crystal_shuffle",
    "stamina_fruit_shuffle",
    "hidden_item_shuffle",
    "goddess_chest_shuffle",
    "tadtone_shuffle",
    "gossip_stone_treasure_shuffle",
    "randomize_dungeon_entrances",
    "randomize_trial_gate_entrances",
    "randomize_door_entrances",
    "decouple_double_doors",
    "randomize_interior_entrances",
    "randomize_overworld_entrances",
    "randomize_gate_of_time",
    "randomize_skykeep_layout",
    "decouple_entrances",
    "triforce_required",
    "random_starting_statues",
    "limit_starting_spawn",
    "burn_traps",
    "curse_traps",
    "noise_traps",
    "groose_traps",
    "health_traps",
    "open_thunderhead",
    "open_batreaux_shed",
    "skip_harp_playing",
    "skip_misc_small_cutscenes",
    "no_spoiler_log",
    "enable_back_in_time",
    "underground_rupee_shuffle",
    "random_bottle_contents",
    "randomize_shop_prices",
    "full_wallet_upgrades",
    "upgraded_skyward_strike",
    "faster_air_meter_depletion",
    "unlock_all_groosenator_destinations",
    "allow_flying_at_night",
    "natural_night_connections",
    "dungeons_include_sky_keep",
    "empty_unrequired_dungeons",
    "small_keys_in_fancy_chests",
    "cutoff_game_over_music",
    "skip_horde",
    "skip_g3",
    "spawn_hearts",
    "tunic_swap",
    "lightning_skyward_strike",
    "starry_skies",
    "remove_enemy_music",
    "start_with_all_bugs",
    "start_with_all_treasures",
    # Logic tricks
    "logic_early_lake_floria",
    "logic_beedles_island_cage_chest_dive",
    "logic_volcanic_island_dive",
    "logic_east_island_dive",
    "logic_advanced_lizalfos_combat",
    "logic_long_ranged_skyward_strikes",
    "logic_gravestone_jump",
    "logic_waterfall_cave_jump",
    "logic_bird_nest_item_from_beedles_shop",
    "logic_beedles_shop_with_bombs",
    "logic_stuttersprint",
    "logic_precise_beetle",
    "logic_bomb_throws",
    "logic_faron_woods_with_groosenator",
    "logic_itemless_first_timeshift_stone",
    "logic_stamina_potion_through_sink_sand",
    "logic_brakeslide",
    "logic_lanayru_mine_quick_bomb",
    "logic_tot_skip_brakeslide",
    "logic_tot_slingshot",
    "logic_fire_node_without_hook_beetle",
    "logic_cactus_bomb_whip",
    "logic_skippers_fast_clawshots",
    "logic_skyview_spider_roll",
    "logic_skyview_coiled_rupee_jump",
    "logic_skyview_precise_slingshot",
    "logic_et_keese_skyward_strike",
    "logic_et_slope_stuttersprint",
    "logic_et_bombless_scaldera",
    "logic_lmf_whip_switch",
    "logic_lmf_ceiling_precise_slingshot",
    "logic_lmf_whip_armos_room_timeshift_stone",
    "logic_lmf_minecart_jump",
    "logic_lmf_bellowsless_moldarach",
    "logic_ac_lever_jump_trick",
    "logic_ac_chest_after_whip_hooks_jump",
    "logic_sandship_jump_to_stern",
    "logic_sandship_itemless_spume",
    "logic_sandship_no_combination_hint",
    "logic_fs_pillar_jump",
    "logic_fs_practice_sword_ghirahim_2",
    "logic_present_bow_switches",
    "logic_skykeep_vineclip",
    # Shortcuts
    "shortcut_ios_bridge_complete",
    "shortcut_spiral_log_to_btt",
    "shortcut_logs_near_machi",
    "shortcut_faron_log_to_floria",
    "shortcut_deep_woods_log_before_tightrope",
    "shortcut_deep_woods_log_before_temple",
    "shortcut_eldin_entrance_boulder",
    "shortcut_eldin_ascent_boulder",
    "shortcut_vs_flames",
    "shortcut_lanayru_bars",
    "shortcut_west_wall_minecart",
    "shortcut_sand_oasis_minecart",
    "shortcut_minecart_before_caves",
    "shortcut_skyview_boards",
    "shortcut_skyview_bars",
    "shortcut_earth_temple_bridge",
    "shortcut_lmf_wind_gates",
    "shortcut_lmf_boxes",
    "shortcut_lmf_bars_to_west_side",
    "shortcut_ac_bridge",
    "shortcut_ac_water_vents",
    "shortcut_sandship_windows",
    "shortcut_sandship_brig_bars",
    "shortcut_fs_outside_bars",
    "shortcut_fs_lava_flow",
    "shortcut_sky_keep_svt_room_bars",
    "shortcut_sky_keep_fs_room_lower_bars",
    "shortcut_sky_keep_fs_room_upper_bars",
}

# Integer settings (value stored as string in sshd-rando)
_INT_SETTINGS = {
    "required_dungeons",
    "random_starting_tablet_count",
    "random_starting_item_count",
    "trial_treasure_shuffle",
    "starting_hearts",
    "peatrice_conversations",
    "triforce_count",
    "demise_count",
}

# Settings that use "progressive_items" → "true"/"false"
_PROGRESSIVE_BOOL = {"progressive_items"}

# Settings that need custom value mapping
_VALUE_MAP = {
    # sshd-rando vanilla/randomized → AP Toggle false/true
    "npc_closet_shuffle": {"vanilla": False, "randomized": True},
    # sshd-rando none/simple/advanced/full → AP Choice (pass through directly)
    "random_trial_object_positions": {
        "none": "none",
        "simple": "simple",
        "advanced": "advanced",
        "full": "full",
    },
    # sshd-rando music options → AP choice names
    "randomize_music": {
        "vanilla": "vanilla",
        "shuffle_music": "shuffled",
        "shuffle_music_limit_vanilla": "shuffled_limit_vanilla",
    },
    # sshd-rando spawn options → AP choice names (AP only has vanilla/anywhere)
    "random_starting_spawn": {
        "vanilla": "vanilla",
        "bird_statues": "anywhere",
        "any_surface_region": "anywhere",
        "anywhere": "anywhere",
    },
    # sshd-rando multi-option → AP Choice (pass through directly)
    "open_lake_floria": {
        "vanilla": "vanilla",
        "yerbal": "yerbal",
        "open": "open",
    },
    "open_earth_temple": {
        "open": "open",
        "shuffle_eldin": "shuffle_eldin",
        "shuffle_anywhere": "shuffle_anywhere",
    },
    "open_lmf": {"nodes": "nodes", "main_node": "main_node", "open": "open"},
    "randomize_loftwing": {"on": "off", "off": "on"},
}

# sshd-rando damage_multiplier (numeric 0-80) → AP named choice
_DAMAGE_MULTIPLIER_MAP = {
    0: "half",
    1: "normal",
    2: "double",
    4: "quadruple",
    80: "ohko",
}


def _convert_damage_multiplier(val) -> str:
    """Map the sshd-rando numeric damage_multiplier to an AP choice name."""
    try:
        num = int(val)
    except (ValueError, TypeError):
        return "normal"
    if num in _DAMAGE_MULTIPLIER_MAP:
        return _DAMAGE_MULTIPLIER_MAP[num]
    # For non-standard values, pick the closest AP option
    closest = min(_DAMAGE_MULTIPLIER_MAP, key=lambda k: abs(k - num))
    return _DAMAGE_MULTIPLIER_MAP[closest]


def _resolve_random_setting_value(name: str, setting: Setting, seed) -> str:
    """Resolve a setting value of 'random' to a deterministic concrete option."""
    options = []
    if getattr(setting, "info", None) and getattr(setting.info, "options", None):
        options = [opt for opt in setting.info.options if opt != "random"]

    if not options:
        return "random"

    token = f"{seed}:{name}".encode("utf-8")
    digest = hashlib.sha256(token).digest()
    index = int.from_bytes(digest[:8], "big") % len(options)
    return options[index]


def _convert_setting_value(name: str, setting: Setting, seed=None):
    """Convert a sshd-rando Setting to the appropriate YAML value."""
    val = setting.value

    if val == "random":
        val = _resolve_random_setting_value(name, setting, seed)

    if name == "damage_multiplier":
        return _convert_damage_multiplier(val)

    if name in _VALUE_MAP:
        return _VALUE_MAP[name].get(val, val)

    if name in _BOOL_SETTINGS:
        if val == "on":
            return True
        elif val == "off":
            return False
        # Preserve bool-like values and default to False only for unknown strings
        return val in ("true", "True", True)

    if name in _PROGRESSIVE_BOOL:
        return val == "on"

    if name in _INT_SETTINGS:
        try:
            return int(val)
        except (ValueError, TypeError):
            return val

    return val


def generate_yaml(
    config: Config,
    ap_settings: dict,
    output_path: Path,
) -> Path:
    """
    Build and write a SkywardSwordHD.yaml from the current config and AP settings.

    Args:
        config: The sshd-rando Config object (with all randomizer settings).
        ap_settings: Dict of Archipelago-specific settings from the AP tab.
        output_path: Where to write the YAML file.

    Returns:
        The Path of the written YAML file.
    """
    player_name = ap_settings.get("player_name", "Player1")

    out: dict = {}
    out["name"] = player_name
    out["description"] = f"Skyward Sword HD Archipelago YAML for {player_name}"
    out["game"] = "Skyward Sword HD"
    out["requires"] = {
        "version": "0.6.6",
        "game": {"Skyward Sword HD": "0.7.4"},
    }

    game_settings: dict = {}

    # ── Extract path ──────────────────────────────────────────────────
    game_settings["extract_path"] = ap_settings.get("extract_path", "")

    # ── Config method: leave config_yaml_path and setting_string blank ─
    game_settings["config_yaml_path"] = ""
    game_settings["setting_string"] = ""
    # Leave blank so the AP world assigns the seed during generation.
    game_settings["sshdr_seed"] = ""

    # ── Randomizer settings ───────────────────────────────────────────
    # These come from the sshd-rando config (user's GUI settings).
    # Written first so AP-specific overrides below can take priority.
    if config.settings:
        setting_map = config.settings[0]

        for setting_name, setting in setting_map.settings.items():
            if setting_name in _SKIP_SETTINGS:
                continue
            yaml_key = _RANDO_TO_YAML.get(setting_name, setting_name)
            game_settings[yaml_key] = _convert_setting_value(
                setting_name,
                setting,
                seed=config.seed,
            )

        # Starting inventory
        starting_items = {}
        for item in setting_map.starting_inventory.elements():
            starting_items[item] = starting_items.get(item, 0) + 1
        game_settings["custom_starting_items"] = (
            starting_items if starting_items else {}
        )

        # Individually excluded locations
        excluded_locations = list(getattr(setting_map, "excluded_locations", []) or [])
        game_settings["excluded_locations"] = excluded_locations

        # No-spoiler-log is derived from generate_spoiler_log
        game_settings["no_spoiler_log"] = not config.generate_spoiler_log

    # ── Archipelago options (written AFTER rando loop to take priority) ─
    # These come from the AP tab UI settings and override any rando defaults.
    game_settings["goal"] = ap_settings.get("goal", 0)
    game_settings["demise_count"] = ap_settings.get("demise_count", 1)
    game_settings["death_link"] = ap_settings.get("death_link", False)
    game_settings["breath_link"] = ap_settings.get("breath_link", False)
    game_settings["progression_balancing"] = ap_settings.get(
        "progression_balancing", 50
    )
    game_settings["use_alternative_logo"] = ap_settings.get(
        "use_alternative_logo", False
    )
    game_settings["archipelago_item_model"] = ap_settings.get(
        "archipelago_item_model", 2
    )

    # ── Completion requirement toggles (AP-specific) ──────────────────
    # triforce_required comes from sshd-rando config (handled in rando loop above as bool).
    # We re-apply from ap_settings to ensure the AP tab value wins.
    game_settings["triforce_required"] = ap_settings.get("triforce_required", True)
    # required_triforce_pieces = triforce count (rando loop maps triforce_count → required_triforce_pieces).
    # Re-apply from ap_settings["triforce_count"] so AP tab value wins over rando default.
    game_settings["required_triforce_pieces"] = ap_settings.get("triforce_count", 3)
    game_settings["dungeon_goal_requirement"] = ap_settings.get("dungeon_goal_requirement", False)
    game_settings["required_dungeon_count"] = ap_settings.get("required_dungeon_count", 2)
    game_settings["require_greg"] = ap_settings.get("require_greg", False)
    game_settings["require_tim"] = ap_settings.get("require_tim", False)
    game_settings["require_all_progression_items"] = ap_settings.get("require_all_progression_items", False)

    # ── AP-only settings (no sshd-rando equivalent, use defaults if not in ap_settings) ─
    # triforce_shuffle: where triforces appear — default anywhere
    game_settings["triforce_shuffle"] = ap_settings.get("triforce_shuffle", "anywhere")
    # gate_of_time_dungeon_requirements: whether required dungeons must be beaten to open GoT
    game_settings["gate_of_time_dungeon_requirements"] = ap_settings.get(
        "gate_of_time_dungeon_requirements", "required"
    )
    # imp2_skip: skip Imp 2 fight — default True (DefaultOnToggle)
    game_settings["imp2_skip"] = ap_settings.get("imp2_skip", True)
    # skip_horde / skip_ghirahim3 come from rando loop (_BOOL_SETTINGS) but
    # re-assert with ap_settings if present so AP tab wins.
    if "skip_horde" in ap_settings:
        game_settings["skip_horde"] = ap_settings["skip_horde"]
    if "skip_ghirahim3" in ap_settings:
        game_settings["skip_ghirahim3"] = ap_settings["skip_ghirahim3"]
    # empty_unreachable_locations / add_junk_items / junk_item_rate — AP-only
    game_settings["empty_unreachable_locations"] = ap_settings.get(
        "empty_unreachable_locations", False
    )
    game_settings["add_junk_items"] = ap_settings.get("add_junk_items", False)
    game_settings["junk_item_rate"] = ap_settings.get("junk_item_rate", 50)
    # skip_skykeep_door_cutscene — AP-only (DefaultOnToggle default True)
    game_settings["skip_skykeep_door_cutscene"] = ap_settings.get(
        "skip_skykeep_door_cutscene", True
    )

    # ── Cheats ────────────────────────────────────────────────────────
    cheat_keys = [k for k in ap_settings if k.startswith("cheat_")]
    for key in cheat_keys:
        game_settings[key] = ap_settings[key]

    out["Skyward Sword HD"] = game_settings

    # ── Write ─────────────────────────────────────────────────────────
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    with open(output_path, "w", encoding="utf-8") as f:
        # Write with nice formatting
        yaml.dump(out, f, default_flow_style=False, sort_keys=False, allow_unicode=True)

    return output_path

from functools import partial
from pathlib import Path
import sys
from types import TracebackType

from PySide6.QtCore import QEvent, Qt, QSize, QUrl
from PySide6.QtGui import QDesktopServices, QIcon, QMouseEvent, QPixmap, QCloseEvent
from PySide6.QtWidgets import (
    QApplication,
    QCheckBox,
    QFileDialog,
    QMessageBox,
    QMainWindow,
    QWidget,
    QLayout,
)

from constants.guiconstants import OPTION_PREFIX
from constants.randoconstants import VERSION
from filepathconstants import (
    CONFIG_PATH,
    DEFAULT_OUTPUT_PATH,
    ICON_PATH,
)

from gui.accessibility import Accessibility
from gui.advanced import Advanced
from gui.archipelago import Archipelago
from gui.patcher_tab import PatcherTab
from gui.dialogs.dialog_header import print_progress_text
from gui.tracker import Tracker
from gui.dialogs.error_dialog import error, error_from_str
from gui.dialogs.fi_info_dialog import FiInfoDialog
from gui.dialogs.fi_question_dialog import FiQuestionDialog
from gui.guithreads import RandomizationThread
from gui.settings import Settings
from gui.dialogs.randomize_progress_dialog import RandomizerProgressDialog
from gui.ui.ui_main import Ui_main_window
from gui.yaml_generator import generate_yaml
from logic.config import load_config_from_file, write_config_to_file


class Main(QMainWindow):
    def __init__(self):
        super().__init__()
        print_progress_text("Initializing GUI")

        self.randomize_thread = RandomizationThread()
        self.randomize_thread.error_abort.connect(self.thread_error)

        self.progress_dialog = None

        self.ui = Ui_main_window()
        self.ui.setupUi(self)

        self.setWindowTitle(
            f"The Legend of Zelda: Skyward Sword HD Randomizer — Archipelago (Ver. {VERSION})"
        )

        self.setWindowIcon(QIcon(ICON_PATH.as_posix()))

        # Always open on the getting started tab
        self.ui.tab_widget.setCurrentIndex(0)

        # Remove the Hints tab (hints are not used in Archipelago)
        hints_index = self.ui.tab_widget.indexOf(self.ui.hints_tab)
        if hints_index != -1:
            self.ui.tab_widget.removeTab(hints_index)

        self.fi_info_dialog = FiInfoDialog(self)
        self.fi_question_dialog = FiQuestionDialog(self)

        self.config = load_config_from_file(
            CONFIG_PATH, create_if_blank=True, default_on_invalid_value=True
        )

        print_progress_text("Initializing GUI: accessibility")
        self.accessibility = Accessibility(self, self.ui)

        # Add Archipelago-specific accessibility options
        self._init_ap_accessibility_options()

        print_progress_text("Initializing GUI: settings")
        self.settings = Settings(self, self.ui)
        print_progress_text("Initializing GUI: advanced")
        self.advanced = Advanced(self, self.ui)
        print_progress_text("Initializing GUI: archipelago")
        self.archipelago = Archipelago(self, self.ui)
        print_progress_text("Initializing GUI: patcher")
        self.patcher_tab = PatcherTab(self, self.ui)
        print_progress_text("Initializing GUI: tracker")
        self.tracker = Tracker(self, self.ui)

        self.ui.about_button.clicked.connect(self.about)
        self.ui.tab_widget.currentChanged.connect(self.on_tab_change)

        # Override Getting Started text for Archipelago workflow
        self._update_getting_started_text()

        print_progress_text("GUI initialized")

    def randomize(self):
        if not self.check_output_dir():
            return

        self.progress_dialog = RandomizerProgressDialog(self, self.cancel_callback)

        self.randomize_thread.dialog_value_update.connect(self.progress_dialog.setValue)
        self.randomize_thread.dialog_label_update.connect(
            self.progress_dialog.setLabelText
        )

        self.randomize_thread.setTerminationEnabled(True)
        self.randomize_thread.start()
        self.progress_dialog.exec()

        if self.progress_dialog is None:
            self.fi_info_dialog.show_dialog(
                "Randomization Failed",
                "The randomization was unable to be completed and has been cancelled.",
            )
            return

    def generate_ap_yaml(self):
        """Generate a SkywardSwordHD.yaml from current settings + AP settings."""
        ap_settings = self.archipelago.get_ap_settings()
        player_name = ap_settings.get("player_name", "Player1")

        # Validate player name
        if not player_name or player_name.isspace():
            self.fi_info_dialog.show_dialog(
                "Missing Player Name",
                "Please set a player name in the Archipelago tab before generating a YAML.",
            )
            return

        # Warn if extract path is empty (it's needed for patching, not YAML gen)
        extract_path = ap_settings.get("extract_path", "")
        if not extract_path and not self.config.disable_extract_verification:
            confirm = self.fi_question_dialog.show_dialog(
                "No Extract Path Set",
                "You haven't set a ROM extract path in the Archipelago tab.<br>"
                "The YAML will be generated with a blank extract_path - you'll need to "
                "fill it in manually before patching.<br><br>Continue anyway?",
            )
            if confirm != QMessageBox.StandardButton.Yes:
                return

        # Ask user where to save
        default_name = f"SkywardSwordHD_{player_name}.yaml"
        default_dir = (
            self.config.output_dir if self.config.output_dir else DEFAULT_OUTPUT_PATH
        )
        default_path = Path(default_dir) / default_name

        save_path, _ = QFileDialog.getSaveFileName(
            self,
            "Save Archipelago YAML",
            str(default_path),
            "YAML Files (*.yaml *.yml);;All Files (*)",
        )

        if not save_path:
            return

        try:
            result = generate_yaml(self.config, ap_settings, Path(save_path))
            self.fi_info_dialog.show_dialog(
                "YAML Generated!",
                f"SkywardSwordHD.yaml has been saved to:<br><br>{result}<br><br>"
                f"You can now use this file with Archipelago to generate a multiworld.",
            )
        except Exception as e:
            error_from_str(
                f"Failed to generate YAML: {e}",
                str(e),
            )

    def cancel_callback(self):
        RandomizationThread.cancelled = True

    def on_tab_change(self):
        # Handle tracker tooltips
        # Why does Qt not let us read the currentTabName variable??
        if (
            self.ui.tab_widget.tabText(self.ui.tab_widget.currentIndex()).lower()
            == "tracker"
        ):
            default_description = (
                OPTION_PREFIX
                + "Left or Right click items to cycle through them and update your inventory.<br>"
            )
            default_description += (
                OPTION_PREFIX + "Hover over something to see what it is.<br>"
            )
            default_description += (
                OPTION_PREFIX
                + 'Click a dungeon label (e.g. "SVT") to toggle if it is a required dungeon.'
            )

            self.ui.settings_current_option_description_label.setText(
                default_description
            )
        else:
            self.settings.set_setting_descriptions(None)

    def open_output_folder(self):
        QDesktopServices.openUrl(QUrl.fromLocalFile(self.config.output_dir.absolute()))

    def _update_getting_started_text(self):
        """Override the Getting Started tab text for Archipelago workflow."""
        try:
            self.ui.how_to_extract_group_box.setTitle("1. Extract the Game")
            self.ui.how_to_extract_label.setText(
                "<html><body><p>Before generating a YAML, you need a valid extract of the game.</p>"
                '<p>Follow the <a href="https://docs.google.com/document/d/1HHQRXND0n-ZrmhEl4eXjzMANQ-xHK3pKKXPQqSbwXwY">'
                '<span style="text-decoration: underline; color:#9a0089;">Setup Guide</span></a> for help.</p></body></html>'
            )
            self.ui.useful_choose_settings_group_box.setTitle("2. Configure Settings")
            self.ui.choose_settings_label.setText(
                "<html><body>"
                "<p><b>Configure your randomizer settings</b> in the other tabs, then go to the "
                "<b>Archipelago</b> tab to set your player name, multiworld options, and cheats.</p>"
                "<p>You can use presets for a quick start or customize every setting yourself.</p>"
                "</body></html>"
            )
            self.ui.how_to_generate_group_box.setTitle("3. Generate YAML")
            self.ui.how_to_generate_label.setText(
                "<html><body><p>Click <span style=\"font-family:'Courier New';\">Generate YAML</span> "
                "in the bottom right to create your SkywardSwordHD.yaml file.</p>"
                "<p>Give this file to your multiworld host (or use it yourself as host).</p></body></html>"
            )
            self.ui.how_to_running_group_box.setTitle("4. Patch and Play")
            self.ui.how_to_running_label.setText(
                "<html><body>"
                "<p>After the host generates the multiworld, you'll get an <b>.apsshd</b> file.</p>"
                "<p>Go to the <b>Patcher</b> tab, select the .apsshd file, and click <b>Patch &amp; Install</b>.</p>"
                "<p>Then launch the game in your emulator and connect the Archipelago client!</p>"
                "</body></html>"
            )
        except AttributeError:
            # UI elements might not exist in all versions
            pass

    def _init_ap_accessibility_options(self):
        """Add Archipelago-specific checkboxes to the accessibility group box."""
        from PySide6.QtWidgets import QGroupBox, QVBoxLayout

        # Create a new group box for AP options
        ap_options_box = QGroupBox("Options", self.ui.accessibility_group_box)
        layout = QVBoxLayout(ap_options_box)

        self.disable_extract_verification_cb = QCheckBox(
            "Disable Extract Verification", ap_options_box
        )
        self.disable_extract_verification_cb.setToolTip(
            "Skip the extract verification prompt on startup."
        )
        self.disable_extract_verification_cb.setChecked(
            self.config.disable_extract_verification
        )
        self.disable_extract_verification_cb.stateChanged.connect(
            self._on_ap_option_changed
        )
        layout.addWidget(self.disable_extract_verification_cb)

        self.disable_open_extract_folder_cb = QCheckBox(
            "Disable Opening Extract Folder", ap_options_box
        )
        self.disable_open_extract_folder_cb.setToolTip(
            "Don't automatically open the extract folder on first startup."
        )
        self.disable_open_extract_folder_cb.setChecked(
            self.config.disable_open_extract_folder
        )
        self.disable_open_extract_folder_cb.stateChanged.connect(
            self._on_ap_option_changed
        )
        layout.addWidget(self.disable_open_extract_folder_cb)

        self.disable_reminders_cb = QCheckBox("Disable Reminders", ap_options_box)
        self.disable_reminders_cb.setToolTip(
            "Skip one-time informational popups (e.g. seed generation tips, random setting tutorials)."
        )
        self.disable_reminders_cb.setChecked(self.config.disable_reminders)
        self.disable_reminders_cb.stateChanged.connect(self._on_ap_option_changed)
        layout.addWidget(self.disable_reminders_cb)

        self.ui.horizontalLayout_6.addWidget(ap_options_box)

    def _on_ap_option_changed(self):
        self.config.disable_extract_verification = (
            self.disable_extract_verification_cb.isChecked()
        )
        self.config.disable_open_extract_folder = (
            self.disable_open_extract_folder_cb.isChecked()
        )
        self.config.disable_reminders = self.disable_reminders_cb.isChecked()
        write_config_to_file(CONFIG_PATH, self.config)

    def check_output_dir(self) -> bool:
        output_dir = self.config.output_dir

        if output_dir != DEFAULT_OUTPUT_PATH and (
            not output_dir.exists() or not output_dir.is_dir()
        ):
            output_not_exists_dialog = self.fi_question_dialog.show_dialog(
                "Cannot find output folder",
                f"""
The output folder you have specified cannot be found.
<br>Would you like to continue and use the default output path?
<br>
<br>Your output path:
<br>{output_dir.as_posix()}
<br>
<br>Default output folder:
<br>{DEFAULT_OUTPUT_PATH.as_posix()}""",
            )

            if output_not_exists_dialog != QMessageBox.StandardButton.Yes:
                return False

            self.config.output_dir = DEFAULT_OUTPUT_PATH
            self.advanced.output_dir_line_edit.setText(
                self.config.output_dir.as_posix()
            )
            write_config_to_file(CONFIG_PATH, self.config)

        return True

    def about(self):
        about_dialog = QMessageBox(self)
        about_dialog.setTextFormat(Qt.TextFormat.RichText)

        about_text = f"""
                        <b>The Legend of Zelda: Skyward Sword HD Randomizer - Archipelago Edition</b><br>
                        Version: {VERSION}<br><br>

                        Archipelago Integration by:
                        <a href=\"https://github.com/Wesley-Playz\">Wesley-Playz</a><br><br>

                        Original Randomizer by:
                        <a href=\"https://github.com/covenesme\">CovenEsme</a>,
                        <a href=\"https://github.com/Kuonino\">Kuonino</a>,
                        <a href=\"https://github.com/gymnast86\">Gymnast86</a>, and
                        <a href=\"https://github.com/tbpixel\">tbpixel</a><br><br>

                        <a href=\"https://github.com/LonLon-Labs/sshd-rando/issues\">Report issues</a>
                        or view the 
                        <a href=\"https://github.com/LonLon-Labs/sshd-rando\">Source code</a>
        """

        about_dialog.about(self, "About", about_text)

    def eventFilter(self, target: QWidget, event: QEvent) -> bool:
        if event.type() == QEvent.Type.Enter:
            return self.settings.update_descriptions(target)
        elif event.type() == QEvent.Type.Leave:
            return self.settings.update_descriptions(None)
        elif (
            isinstance(event, QMouseEvent)
            and event.type() == QEvent.Type.MouseButtonRelease
            and event.button() == Qt.MouseButton.RightButton
        ):
            return self.settings.show_full_descriptions(target)
        elif (
            isinstance(event, QMouseEvent)
            and event.button() == Qt.MouseButton.MiddleButton
        ):
            return self.settings.reset_single(
                self.settings.get_setting_from_widget(target)
            )

        return QMainWindow.eventFilter(self, target, event)

    def thread_error(self, exception: str, traceback: str):
        if self.progress_dialog is not None:
            self.progress_dialog.deleteLater()
            self.progress_dialog = None

        if "ThreadCancelled" in traceback:
            print(exception, "This should be ignored.")
        else:
            error_from_str(exception, traceback)

    def closeEvent(self, event: QCloseEvent) -> None:
        # Autosave tracker on window close if it's active
        # This guarantees that the notes will be properly saved
        if self.tracker.started:
            self.tracker.autosave_tracker()
        event.accept()

    def clear_layout(self, layout: QLayout, remove_nested_layouts=True) -> None:
        # Recursively clear nested layouts
        for nested_layout in layout.findChildren(QLayout):
            self.clear_layout(nested_layout, remove_nested_layouts)

        while item := layout.takeAt(0):
            if widget := item.widget():
                widget.deleteLater()
            del item

        if remove_nested_layouts:
            for nested_layout in layout.findChildren(QLayout):
                layout.removeItem(nested_layout)


def start_gui(app: QApplication):
    try:
        main = Main()

        # In the Archipelago fork, the main button generates a YAML
        # instead of randomizing (the AP client handles randomization).
        main.ui.randomize_button.setText("Generate YAML")
        main.ui.randomize_button.clicked.connect(main.generate_ap_yaml)

        # Sync extract path from AP tab to patcher tab when it changes
        main.archipelago.extract_path_edit.textChanged.connect(
            main.patcher_tab.set_extract_path
        )

        main.show()

        if not main.config.verified_extract:
            get_extract_text = "Before you can begin, you will need to provide an extract of The Legend of Zelda: Skyward Sword HD"
            get_extract_text += "<br><br>Instructions for how to do this can be found here: <a href='https://docs.google.com/document/d/1HHQRXND0n-ZrmhEl4eXjzMANQ-xHK3pKKXPQqSbwXwY'>The Legend of Zelda: Skyward Sword HD Randomizer - Setup Guide</a>"
            get_extract_text += '<br><br>Once you are ready, click "OK" and the extract folder will open. Copy your extract of the base game into this folder'
            get_extract_text += "<br><br>(If you just wish to look around, you can skip this step but you will be unable to generate a YAML or patch)."
            main.fi_info_dialog.show_dialog(
                title="Getting Started", text=get_extract_text
            )

            if not main.config.disable_open_extract_folder:
                main.advanced.open_extract_folder()

            if not main.config.disable_extract_verification:
                confirm_first_time_verify_dialog = main.fi_question_dialog.show_dialog(
                    "Perform Full Verification?",
                    f'Would you like to verify your extract (required for patching)?<br><br>Answering "No" will prevent you from patching the game but you will still be able to configure settings and generate a YAML.',
                )

                if confirm_first_time_verify_dialog == QMessageBox.StandardButton.Yes:
                    if main.advanced.verify_extract(verify_all=True):
                        main.config.verified_extract = True
                        main.settings.update_from_config()

        sys.exit(app.exec())
    except Exception as e:
        error(e)
        sys.exit()


old_excepthook = sys.excepthook


def excepthook(source, exception, traceback: TracebackType):
    old_excepthook(source, exception, traceback)

    traceback_str = "Qt caught and ignored exception:\n"
    current_traceback = traceback

    while current_traceback.tb_next is not None:
        traceback_str += f"\n{current_traceback.tb_frame}"
        current_traceback = current_traceback.tb_next

    traceback_str += f"\n\n{source}: {exception}"
    error_from_str(exception, traceback_str)


sys.excepthook = excepthook

if __name__ == "__main__":
    start_gui(QApplication([]))

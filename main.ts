import {
  App,
  Plugin,
  PluginSettingTab,
  Setting,
  Notice,
  Editor,
} from "obsidian";

import { spawn } from "child_process";

type ExecResult = { stdout: string; stderr: string };

interface AgeCryptoSettings {
  ageBinaryPath: string; // "age" if in PATH, else full path
  ageKeygenBinaryPath: string; // "age-keygen" if in PATH, else full path
  identityKeyPath: string; // path to keys.txt
  recipient: string; // age1...
  armor: boolean; // produce ASCII armored output
}

const DEFAULT_SETTINGS: AgeCryptoSettings = {
  ageBinaryPath: "age",
  ageKeygenBinaryPath: "age-keygen",
  identityKeyPath: "",
  recipient: "",
  armor: true,
};

function isAgeArmoredBlock(text: string): boolean {
  return (
    text.includes("-----BEGIN AGE ENCRYPTED FILE-----") &&
    text.includes("-----END AGE ENCRYPTED FILE-----")
  );
}

export default class AgeCryptoPlugin extends Plugin {
  settings: AgeCryptoSettings;

  async onload() {
    await this.loadSettings();
    this.addSettingTab(new AgeCryptoSettingTab(this.app, this));

    // Encrypt current note
    this.addCommand({
      id: "age-encrypt-note",
      name: "AGE: Encrypt current note",
      editorCallback: async (editor) => {
        await this.encryptEditorContent(editor, { selectionOnly: false });
      },
    });

    // Decrypt current note
    this.addCommand({
      id: "age-decrypt-note",
      name: "AGE: Decrypt current note",
      editorCallback: async (editor) => {
        await this.decryptEditorContent(editor, { selectionOnly: false });
      },
    });

    // Encrypt selection
    this.addCommand({
      id: "age-encrypt-selection",
      name: "AGE: Encrypt selection",
      editorCallback: async (editor) => {
        await this.encryptEditorContent(editor, { selectionOnly: true });
      },
    });

    // Decrypt selection
    this.addCommand({
      id: "age-decrypt-selection",
      name: "AGE: Decrypt selection",
      editorCallback: async (editor) => {
        await this.decryptEditorContent(editor, { selectionOnly: true });
      },
    });

    // Derive recipient from identity
    this.addCommand({
      id: "age-derive-recipient",
      name: "AGE: Derive recipient from identity key",
      callback: async () => {
        try {
          this.ensureIdentityConfigured();
          const recipient = await this.deriveRecipientFromIdentity();
          this.settings.recipient = recipient;
          await this.saveSettings();
          new Notice(`Recipient set: ${recipient}`);
        } catch (e: any) {
          new Notice(`Derive recipient failed: ${e?.message ?? e}`);
        }
      },
    });
  }

  onunload() {}

  private ensureIdentityConfigured() {
    if (!this.settings.identityKeyPath.trim()) {
      throw new Error("Identity key path is not set (Settings → AGE Crypto).");
    }
  }

  private ensureRecipientConfigured() {
    const r = this.settings.recipient.trim();
    if (!r) {
      throw new Error(
        "Recipient is not set. Set it in Settings or run: AGE: Derive recipient from identity key.",
      );
    }
    // минимальная валидация
    if (!r.startsWith("age1")) {
      throw new Error(
        "Recipient must be an 'age1...' string (not a file path).",
      );
    }
  }

  private runProcess(
    bin: string,
    args: string[],
    input?: string,
  ): Promise<ExecResult> {
    return new Promise((resolve, reject) => {
      const p = spawn(bin, args, { stdio: ["pipe", "pipe", "pipe"] });

      let stdout = "";
      let stderr = "";

      p.stdout.setEncoding("utf8");
      p.stderr.setEncoding("utf8");

      p.stdout.on("data", (d) => (stdout += d));
      p.stderr.on("data", (d) => (stderr += d));

      p.on("error", (err) => reject(err));
      p.on("close", (code) => {
        if (code === 0) return resolve({ stdout, stderr });
        reject(
          new Error(stderr.trim() || `Command failed with exit code ${code}`),
        );
      });

      if (input !== undefined) {
        p.stdin.write(input);
      }
      p.stdin.end();
    });
  }

  private async runAge(args: string[], input: string): Promise<ExecResult> {
    return await this.runProcess(this.settings.ageBinaryPath, args, input);
  }

  private async runAgeKeygen(args: string[]): Promise<ExecResult> {
    return await this.runProcess(this.settings.ageKeygenBinaryPath, args);
  }

  private async encryptText(plain: string): Promise<string> {
    this.ensureRecipientConfigured();
    const args: string[] = [];
    if (this.settings.armor) args.push("-a");
    args.push("-r", this.settings.recipient.trim());

    const { stdout } = await this.runAge(args, plain);
    return stdout;
  }

  private async decryptText(cipher: string): Promise<string> {
    this.ensureIdentityConfigured();
    const args = ["-d", "-i", this.settings.identityKeyPath.trim()];

    const { stdout } = await this.runAge(args, cipher);
    return stdout;
  }

  private async deriveRecipientFromIdentity(): Promise<string> {
    // age-keygen -y -i keys.txt
    const { stdout } = await this.runAgeKeygen([
      "-y",
      "-i",
      this.settings.identityKeyPath.trim(),
    ]);
    const rec = stdout.trim();

    if (!rec.startsWith("age1")) {
      throw new Error(`Unexpected recipient output: ${rec}`);
    }
    return rec;
  }

  private async encryptEditorContent(
    editor: Editor,
    opts: { selectionOnly: boolean },
  ) {
    try {
      this.ensureRecipientConfigured();

      const text = opts.selectionOnly
        ? editor.getSelection()
        : editor.getValue();
      if (!text.trim()) {
        new Notice("Nothing to encrypt.");
        return;
      }
      if (isAgeArmoredBlock(text)) {
        new Notice("Looks already encrypted (AGE armored block detected).");
        return;
      }

      const out = await this.encryptText(text);
      if (opts.selectionOnly) editor.replaceSelection(out);
      else editor.setValue(out);

      new Notice("Encrypted.");
    } catch (e: any) {
      new Notice(`Encrypt failed: ${e?.message ?? e}`);
    }
  }

  private async decryptEditorContent(
    editor: Editor,
    opts: { selectionOnly: boolean },
  ) {
    try {
      this.ensureIdentityConfigured();

      const text = opts.selectionOnly
        ? editor.getSelection()
        : editor.getValue();
      if (!text.trim()) {
        new Notice("Nothing to decrypt.");
        return;
      }
      if (!isAgeArmoredBlock(text)) {
        new Notice("No AGE armored block detected.");
        return;
      }

      const out = await this.decryptText(text);
      if (opts.selectionOnly) editor.replaceSelection(out);
      else editor.setValue(out);

      new Notice("Decrypted.");
    } catch (e: any) {
      new Notice(`Decrypt failed: ${e?.message ?? e}`);
    }
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}

class AgeCryptoSettingTab extends PluginSettingTab {
  plugin: AgeCryptoPlugin;

  constructor(app: App, plugin: AgeCryptoPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName("age binary path")
      .setDesc("Path to age/rage binary (or 'age' if it's in PATH).")
      .addText((t) =>
        t
          .setPlaceholder("age")
          .setValue(this.plugin.settings.ageBinaryPath)
          .onChange(async (v) => {
            this.plugin.settings.ageBinaryPath = v.trim();
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("age-keygen binary path")
      .setDesc(
        "Path to age-keygen (or 'age-keygen' if it's in PATH). Used to derive recipient.",
      )
      .addText((t) =>
        t
          .setPlaceholder("age-keygen")
          .setValue(this.plugin.settings.ageKeygenBinaryPath)
          .onChange(async (v) => {
            this.plugin.settings.ageKeygenBinaryPath = v.trim();
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Identity key path")
      .setDesc("Path to identity key file (keys.txt).")
      .addText((t) =>
        t
          .setPlaceholder("/Users/you/.config/age/keys.txt")
          .setValue(this.plugin.settings.identityKeyPath)
          .onChange(async (v) => {
            this.plugin.settings.identityKeyPath = v.trim();
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Recipient")
      .setDesc("Recipient public key (age1...). Required for encryption.")
      .addText((t) =>
        t
          .setPlaceholder("age1...")
          .setValue(this.plugin.settings.recipient)
          .onChange(async (v) => {
            this.plugin.settings.recipient = v.trim();
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("ASCII armor")
      .setDesc(
        "Output encrypted text as armored block (BEGIN/END). Recommended for notes.",
      )
      .addToggle((tg) =>
        tg.setValue(this.plugin.settings.armor).onChange(async (v) => {
          this.plugin.settings.armor = v;
          await this.plugin.saveSettings();
        }),
      );
  }
}

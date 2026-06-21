import {
  App,
  Plugin,
  PluginSettingTab,
  Setting,
  Notice,
  Editor,
} from "obsidian";

import * as age from "age-encryption";

interface AgeCryptoSettings {
  identityKey: string; // AGE-SECRET-KEY-...
  recipient: string; // age1...
}

const DEFAULT_SETTINGS: AgeCryptoSettings = {
  recipient: "",
  identityKey: "",
};

function isAgeArmoredBlock(text: string): boolean {
  return (
    text.includes("-----BEGIN AGE ENCRYPTED FILE-----") &&
    text.includes("-----END AGE ENCRYPTED FILE-----")
  );
}

function parseIdentityKeys(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("AGE-SECRET-KEY-"));
}

function formatGeneratedIdentity(identity: string, recipient: string): string {
  return [`# public key: ${recipient}`, identity].join("\n");
}

export default class AgeCryptoPlugin extends Plugin {
  settings!: AgeCryptoSettings;

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

    this.addCommand({
      id: "age-generate-identity",
      name: "AGE: Generate new identity key",
      callback: async () => {
        try {
          const identity = await age.generateIdentity();
          const recipient = await age.identityToRecipient(identity);

          this.settings.identityKey = formatGeneratedIdentity(
            identity,
            recipient,
          );
          this.settings.recipient = recipient;
          await this.saveSettings();

          new Notice("Generated identity key and recipient.");
        } catch (e: any) {
          new Notice(`Generate identity failed: ${e?.message ?? e}`);
        }
      },
    });
  }

  onunload() {}

  ensureIdentityConfigured() {
    if (parseIdentityKeys(this.settings.identityKey).length === 0) {
      throw new Error(
        "Identity key is not set (Settings -> AGE Crypto). Paste an AGE-SECRET-KEY-... value or generate a new identity.",
      );
    }
  }

  private ensureRecipientConfigured() {
    const r = this.settings.recipient.trim();
    if (!r) {
      throw new Error(
        "Recipient is not set. Set it in Settings or run: AGE: Derive recipient from identity key.",
      );
    }
    // Minimal validation before handing the value to age-encryption.
    if (!r.startsWith("age1")) {
      throw new Error(
        "Recipient must be an 'age1...' string (not a file path).",
      );
    }
  }

  private async encryptText(plain: string): Promise<string> {
    this.ensureRecipientConfigured();

    const encrypter = new age.Encrypter();
    encrypter.addRecipient(this.settings.recipient.trim());

    const ciphertext = await encrypter.encrypt(plain);
    return age.armor.encode(ciphertext);
  }

  private async decryptText(cipher: string): Promise<string> {
    this.ensureIdentityConfigured();

    const decrypter = new age.Decrypter();
    for (const identity of parseIdentityKeys(this.settings.identityKey)) {
      decrypter.addIdentity(identity);
    }

    return await decrypter.decrypt(age.armor.decode(cipher), "text");
  }

  async deriveRecipientFromIdentity(): Promise<string> {
    const identity = parseIdentityKeys(this.settings.identityKey)[0];
    if (!identity) {
      throw new Error("Identity key is not set.");
    }

    const rec = await age.identityToRecipient(identity);

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
    const data = (await this.loadData()) as Partial<AgeCryptoSettings> | null;
    this.settings = Object.assign({}, DEFAULT_SETTINGS, data);
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
      .setName("Identity key")
      .setDesc(
        "Paste an age identity key (AGE-SECRET-KEY-...) or generate a new one. This private key is stored in Obsidian plugin data.",
      )
      .addTextArea((t) => {
        t.inputEl.rows = 6;
        t.inputEl.cols = 32;
        t
          .setPlaceholder("AGE-SECRET-KEY-1...")
          .setValue(this.plugin.settings.identityKey)
          .onChange(async (v) => {
            this.plugin.settings.identityKey = v.trim();
            await this.plugin.saveSettings();
          });
      })
      .addButton((btn) =>
        btn.setButtonText("Generate").onClick(async () => {
          try {
            const identity = await age.generateIdentity();
            const recipient = await age.identityToRecipient(identity);

            this.plugin.settings.identityKey = formatGeneratedIdentity(
              identity,
              recipient,
            );
            this.plugin.settings.recipient = recipient;
            await this.plugin.saveSettings();
            this.display();

            new Notice("Generated identity key and recipient.");
          } catch (e: any) {
            new Notice(`Generate identity failed: ${e?.message ?? e}`);
          }
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
      )
      .addButton((btn) =>
        btn.setButtonText("Derive").onClick(async () => {
          try {
            this.plugin.ensureIdentityConfigured();
            this.plugin.settings.recipient =
              await this.plugin.deriveRecipientFromIdentity();
            await this.plugin.saveSettings();
            this.display();

            new Notice("Recipient derived from identity key.");
          } catch (e: any) {
            new Notice(`Derive recipient failed: ${e?.message ?? e}`);
          }
        }),
      );
  }
}

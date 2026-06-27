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
  recipients: string; // age1... values, one per line
}

const DEFAULT_SETTINGS: AgeCryptoSettings = {
  recipients: "",
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

function parseRecipients(text: string): string[] {
  const seen = new Set<string>();
  const recipients: string[] = [];

  for (const line of text.split(/\r?\n/)) {
    const recipient = line.trim();
    if (!recipient || recipient.startsWith("#") || seen.has(recipient)) {
      continue;
    }

    recipients.push(recipient);
    seen.add(recipient);
  }

  return recipients;
}

function formatRecipients(recipients: string[]): string {
  return recipients.join("\n");
}

function formatGeneratedIdentity(identity: string, recipient: string): string {
  return [`# public key: ${recipient}`, identity].join("\n");
}

function appendGeneratedIdentity(
  currentIdentityKey: string,
  identity: string,
  recipient: string,
): string {
  if (parseIdentityKeys(currentIdentityKey).includes(identity)) {
    return currentIdentityKey.trim();
  }

  return [
    currentIdentityKey.trim(),
    formatGeneratedIdentity(identity, recipient),
  ]
    .filter(Boolean)
    .join("\n\n");
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export default class AgeCryptoPlugin extends Plugin {
  settings!: AgeCryptoSettings;

  private getLocalIdentityStorageKey(): string {
    return `${this.manifest.id}:${this.app.vault.getName()}:identityKey`;
  }

  getIdentityKey(): string {
    return window.localStorage.getItem(this.getLocalIdentityStorageKey()) ?? "";
  }

  setIdentityKey(identityKey: string) {
    const key = this.getLocalIdentityStorageKey();
    const value = identityKey.trim();

    if (value) {
      window.localStorage.setItem(key, value);
    } else {
      window.localStorage.removeItem(key);
    }
  }

  addRecipient(recipient: string): boolean {
    const recipients = parseRecipients(this.settings.recipients);
    if (recipients.includes(recipient)) {
      return false;
    }

    recipients.push(recipient);
    this.settings.recipients = formatRecipients(recipients);
    return true;
  }

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

    // Add the current local identity's public recipient to the shared list.
    this.addCommand({
      id: "age-derive-recipient",
      name: "AGE: Add current identity recipient",
      callback: async () => {
        try {
          this.ensureIdentityConfigured();
          const recipient = await this.deriveRecipientFromIdentity();
          const added = this.addRecipient(recipient);
          await this.saveSettings();
          new Notice(
            added ? `Recipient added: ${recipient}` : "Recipient already exists.",
          );
        } catch (error: unknown) {
          new Notice(`Add recipient failed: ${getErrorMessage(error)}`);
        }
      },
    });

    this.addCommand({
      id: "age-generate-identity",
      name: "AGE: Generate new local identity key",
      callback: async () => {
        try {
          const identity = await age.generateIdentity();
          const recipient = await age.identityToRecipient(identity);

          this.setIdentityKey(
            appendGeneratedIdentity(this.getIdentityKey(), identity, recipient),
          );
          this.addRecipient(recipient);
          await this.saveSettings();

          new Notice("Generated local identity key and added its recipient.");
        } catch (error: unknown) {
          new Notice(`Generate identity failed: ${getErrorMessage(error)}`);
        }
      },
    });
  }

  onunload() {}

  ensureIdentityConfigured() {
    if (parseIdentityKeys(this.getIdentityKey()).length === 0) {
      throw new Error(
        "Identity key is not set on this device (Settings -> AGE Crypto). Paste an AGE-SECRET-KEY-... value or generate a new local identity.",
      );
    }
  }

  private ensureRecipientConfigured() {
    const recipients = parseRecipients(this.settings.recipients);
    if (recipients.length === 0) {
      throw new Error(
        "Recipients are not set. Add at least one age1... recipient in Settings.",
      );
    }

    for (const recipient of recipients) {
      // Minimal validation before handing the value to age-encryption.
      if (!recipient.startsWith("age1")) {
        throw new Error(
          "Every recipient must be an 'age1...' string (not a file path).",
        );
      }
    }
  }

  private async encryptText(plain: string): Promise<string> {
    this.ensureRecipientConfigured();

    const encrypter = new age.Encrypter();
    for (const recipient of parseRecipients(this.settings.recipients)) {
      encrypter.addRecipient(recipient);
    }

    const ciphertext = await encrypter.encrypt(plain);
    return age.armor.encode(ciphertext);
  }

  private async decryptText(cipher: string): Promise<string> {
    this.ensureIdentityConfigured();

    const decrypter = new age.Decrypter();
    for (const identity of parseIdentityKeys(this.getIdentityKey())) {
      decrypter.addIdentity(identity);
    }

    return await decrypter.decrypt(age.armor.decode(cipher), "text");
  }

  async deriveRecipientFromIdentity(): Promise<string> {
    const identity = parseIdentityKeys(this.getIdentityKey())[0];
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
    } catch (error: unknown) {
      new Notice(`Encrypt failed: ${getErrorMessage(error)}`);
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
    } catch (error: unknown) {
      new Notice(`Decrypt failed: ${getErrorMessage(error)}`);
    }
  }

  async loadSettings() {
    const data = (await this.loadData()) as
      | (Partial<AgeCryptoSettings> & {
          identityKey?: string;
          recipient?: string;
        })
      | null;

    this.settings = Object.assign({}, DEFAULT_SETTINGS, {
      recipients: data?.recipients ?? data?.recipient ?? "",
    });

    if (data?.identityKey && !this.getIdentityKey()) {
      this.setIdentityKey(data.identityKey);
    }

    if (data?.recipient || data?.identityKey) {
      await this.saveSettings();
    }
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
      .setName("Local identity key")
      .setDesc(
        "Paste an age identity key (AGE-SECRET-KEY-...) or generate a new one for this device. This private key is stored locally and is not synced through Obsidian plugin data.",
      )
      .addTextArea((t) => {
        t.inputEl.rows = 6;
        t.inputEl.cols = 32;
        t
          .setPlaceholder("AGE-SECRET-KEY-1...")
          .setValue(this.plugin.getIdentityKey())
          .onChange(async (v) => {
            this.plugin.setIdentityKey(v);
          });
      })
      .addButton((btn) =>
        btn.setButtonText("Generate").onClick(async () => {
          try {
            const identity = await age.generateIdentity();
            const recipient = await age.identityToRecipient(identity);

            this.plugin.setIdentityKey(
              appendGeneratedIdentity(
                this.plugin.getIdentityKey(),
                identity,
                recipient,
              ),
            );
            this.plugin.addRecipient(recipient);
            await this.plugin.saveSettings();
            this.display();

            new Notice("Generated local identity key and added its recipient.");
          } catch (error: unknown) {
            new Notice(`Generate identity failed: ${getErrorMessage(error)}`);
          }
        }),
      );

    new Setting(containerEl)
      .setName("Recipients")
      .setDesc(
        "Public recipient keys to encrypt for. Add one age1... value per line; any matching device identity can decrypt.",
      )
      .addTextArea((t) => {
        t.inputEl.rows = 6;
        t.inputEl.cols = 32;
        t
          .setPlaceholder("age1...\nage1...")
          .setValue(this.plugin.settings.recipients)
          .onChange(async (v) => {
            this.plugin.settings.recipients = v.trim();
            await this.plugin.saveSettings();
          });
      })
      .addButton((btn) =>
        btn.setButtonText("Add mine").onClick(async () => {
          try {
            this.plugin.ensureIdentityConfigured();
            const recipient = await this.plugin.deriveRecipientFromIdentity();
            const added = this.plugin.addRecipient(recipient);
            await this.plugin.saveSettings();
            this.display();

            new Notice(
              added
                ? "Current device recipient added."
                : "Current device recipient already exists.",
            );
          } catch (error: unknown) {
            new Notice(`Add recipient failed: ${getErrorMessage(error)}`);
          }
        }),
      );
  }
}

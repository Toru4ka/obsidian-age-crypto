# AGE Crypto (Obsidian plugin)

Minimal Obsidian plugin that encrypts/decrypts note content using the **age** CLI (`age` / `age-keygen`).

> Desktop only. The plugin calls external binaries from your OS.

---

## Features

- Encrypt / decrypt **entire note**
- Encrypt / decrypt **selected text**
- Store settings:
  - path to `age` binary
  - path to `age-keygen` binary (optional, for deriving recipient)
  - path to **identity** key file (private key)
  - **recipient** public key (`age1...`)
  - ASCII armor output (`-----BEGIN AGE ENCRYPTED FILE-----`)

---

## Requirements

- Obsidian Desktop
- `age` installed and available in PATH (or specify full path)
- Optional: `age-keygen` (usually installed together with `age`)

### Install age (macOS)
```bash
brew install age
```

Check:
```bash
which age
which age-keygen
```

---

## Installation (manual)

1. Build the plugin:
```bash
npm i
npm run build
```

2. Copy files to your vault:
```
<Vault>/.obsidian/plugins/age-crypto/
  manifest.json
  main.js
  styles.css
```

3. Enable it in Obsidian:
- Settings → Community plugins → enable **AGE Crypto**

---

## Configuration

Obsidian → Settings → Community plugins → **AGE Crypto**:

- **age binary path**  
  Example: `/opt/homebrew/bin/age` (macOS Homebrew) or just `age`

- **age-keygen binary path**  
  Example: `/opt/homebrew/bin/age-keygen` or `age-keygen`

- **Identity key path**  
  Path to your private identity key file (example):  
  `/Users/<you>/.config/age/key.txt`

- **Recipient**  
  Your public recipient string (must start with `age1...`)  
  Example: `age1tguvx...`

- **ASCII armor**  
  Keep enabled to store encrypted text as readable armored block.

### How to get recipient (`age1...`)
If you already have a private identity key:
```bash
age-keygen -y -i /path/to/key.txt
```

Or if you have `key.pub`, just copy its content (usually it is the `age1...` string).

---

## Usage

Open Command Palette:
- macOS: `Cmd + P`
- Windows/Linux: `Ctrl + P`

Available commands:

### Encrypt / decrypt whole note
- **AGE: Encrypt current note**
- **AGE: Decrypt current note**

### Encrypt / decrypt selection
- **AGE: Encrypt selection**
- **AGE: Decrypt selection**

### Derive recipient from identity
- **AGE: Derive recipient from identity key**  
  Runs:
  ```bash
  age-keygen -y -i <identityKeyPath>
  ```
  and stores result in settings.

---

## Notes on storage (important)

- The plugin **replaces the text in the editor**.
- After **Decrypt**, your note contains **plaintext** until you encrypt it again.
- Encrypted output will be different every time (normal for age).

### Recommended pattern
Do **not** store encrypted blocks inside Markdown tables.  
Obsidian may convert newlines to `<br>` in tables which can break encryption blocks.

Best practice:
- Keep secrets in separate blocks (outside tables)
- Tables can hold metadata/links, while secrets live below as encrypted blocks

---

## Troubleshooting

### “Recipient is not set”
Encryption requires a recipient public key (`age1...`).  
Set **Recipient** in settings or run **Derive recipient**.

### “Identity key path is not set”
Decryption requires the private identity key path.  
Set **Identity key path** in settings.

### Nothing happens / no changes
- Ensure you are in an editable mode (Live Preview / Source) and have selection if using selection commands.
- Verify `ageBinaryPath` is correct and executable:
  ```bash
  /opt/homebrew/bin/age --version
  ```

---

## Security

- Do not commit private keys.
- Do not store identity keys inside the vault.
- Treat any accidentally shared private key as compromised and rotate it.

---

## License

MIT

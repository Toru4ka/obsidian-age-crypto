# AGE Crypto (Obsidian plugin)

Obsidian plugin that encrypts and decrypts note content using the age file
encryption format.

This version uses a bundled TypeScript implementation of age instead of calling
external `age` / `age-keygen` binaries, so it can run on Obsidian Desktop and
Mobile.

---

## Features

- Encrypt / decrypt the entire current note
- Encrypt / decrypt selected text
- Generate a new age identity key
- Derive a recipient public key from an identity key
- Store encrypted content as ASCII-armored text blocks:
  `-----BEGIN AGE ENCRYPTED FILE-----`

---

## Platforms

Supported by design:

- iOS
- Android
- macOS
- Windows
- Linux

No external CLI tools are required.

---

## Installation (manual)

1. Build the plugin:

```bash
npm i
npm run build
```

2. Copy files to your vault:

```text
<Vault>/.obsidian/plugins/age-crypto/
  manifest.json
  main.js
  styles.css
```

3. Enable it in Obsidian:

- Settings -> Community plugins -> enable AGE Crypto

---

## Configuration

Obsidian -> Settings -> Community plugins -> AGE Crypto:

- Identity key
  - Paste an existing `AGE-SECRET-KEY-...` value, or click Generate.
  - Identity files with comments are accepted; the plugin reads
    `AGE-SECRET-KEY-...` lines.
- Recipient
  - Public recipient string beginning with `age1...`.
  - Click Derive to fill it from the identity key.

The generated identity field looks like this:

```text
# public key: age1...
AGE-SECRET-KEY-1...
```

---

## Usage

Open Command Palette:

- macOS / iOS: `Cmd + P`
- Windows / Linux / Android: `Ctrl + P`

Available commands:

- AGE: Encrypt current note
- AGE: Decrypt current note
- AGE: Encrypt selection
- AGE: Decrypt selection
- AGE: Derive recipient from identity key
- AGE: Generate new identity key

---

## Security

- The identity key is private. Anyone with this key can decrypt your encrypted
  notes.
- The plugin stores settings in Obsidian plugin data so it can work on mobile.
  Protect your device, vault, and sync provider accordingly.
- Do not commit private keys.
- Treat any accidentally shared private key as compromised and rotate it.
- After decrypting, the editor contains plaintext until you encrypt it again.

---

## Notes

- Encrypted output changes every time. This is normal for age.
- Do not store encrypted blocks inside Markdown tables. Obsidian may convert
  newlines to `<br>`, which can break encrypted blocks.
- Best practice: keep encrypted secrets in separate blocks outside tables.

---

## Development

```bash
npm run check
npm run build
```

The plugin is marked with `"isDesktopOnly": false` and should not import Node or
Electron APIs.

---

## Release

To publish a new release for Obsidian, update `version` in `manifest.json`,
`package.json`, and `versions.json`, then push a matching semver tag:

```bash
git tag 0.1.0
git push origin 0.1.0
```

The GitHub Actions release workflow builds the plugin and uploads the files
Obsidian expects:

- `main.js`
- `manifest.json`
- `styles.css`

---

## License

MIT

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
- Generate a local age identity key per device
- Encrypt to multiple recipients
- Add the current device recipient to the shared recipient list
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
  - The identity key is stored locally on the current device.
  - It is not saved to Obsidian plugin data, so each device can use a different
    private key.
  - Identity files with comments are accepted; the plugin reads
    `AGE-SECRET-KEY-...` lines.
- Recipients
  - Public recipient strings beginning with `age1...`, one per line.
  - Click Add mine to add the current device recipient to the list.
  - Encryption writes one age block that can be decrypted by any listed
    recipient's matching identity key.

The generated identity field looks like this:

```text
# public key: age1...
AGE-SECRET-KEY-1...
```

### Multiple devices

To avoid using the same private key everywhere:

1. On each device, generate a local identity key.
2. Click Add mine and sync/share the resulting recipient list.
3. Make sure the recipient list contains every device's `age1...` public key.
4. Encrypt notes normally. Any listed device can decrypt the same encrypted
   block with its own local identity key.

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
- AGE: Add current identity recipient
- AGE: Generate new local identity key

---

## Security

- The identity key is private. Anyone with this key can decrypt your encrypted
  notes.
- The plugin stores the identity key locally on the current device. Public
  recipients are stored in Obsidian plugin data so they can sync across devices.
  Protect your device, vault, and sync provider accordingly.
- Back up each local identity key. If a device identity is lost, notes encrypted
  only for that recipient can't be decrypted with a newly generated key.
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
git tag 0.1.3
git push origin 0.1.3
```

The GitHub Actions release workflow builds the plugin and uploads the files
Obsidian expects with GitHub artifact attestations:

- `main.js`
- `manifest.json`
- `styles.css`

---

## License

Copyright (c) 2026 Toru4ka.

This project is licensed under the GNU General Public License v3.0 or later
(`GPL-3.0-or-later`). Modified versions and forks must remain under the same
license when distributed.

The AGE Crypto name and project branding are not licensed for modified
redistributions. If you publish a modified fork, use a different plugin name and
plugin id.

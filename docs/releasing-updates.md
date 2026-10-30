# Releasing Updates (Self-Updater)

Hirameki ships with the Tauri **self-updater**. The app checks an endpoint you
host; if a newer, correctly-signed version is advertised, it downloads and
installs it and restarts. No app store required — this is for direct
distribution.

## How it's wired up

- **Plugins**: `tauri-plugin-updater` + `tauri-plugin-process` (desktop-only,
  registered under `#[cfg(desktop)]` in [`lib.rs`](../src-tauri/src/lib.rs)).
- **Client logic**: [`src/lib/updater.ts`](../src/lib/updater.ts).
  - Silent check on launch (see [`App.tsx`](../src/App.tsx)).
  - Manual "Check for updates" button in the Settings panel.
- **Config**: [`tauri.conf.json`](../src-tauri/tauri.conf.json) →
  `bundle.createUpdaterArtifacts: true` and `plugins.updater` (public key +
  endpoints).
- **Permissions**: `updater:default`, `process:default` in
  [`capabilities/default.json`](../src-tauri/capabilities/default.json).

## Signing keys (already generated)

| Item | Value |
| --- | --- |
| Private key | `%USERPROFILE%\.tauri\hirameki.key` ← **secret, back it up** |
| Public key | `%USERPROFILE%\.tauri\hirameki.key.pub` |
| Password | *(empty)* |

The **public** key is committed in `tauri.conf.json` (`plugins.updater.pubkey`)
— it's safe to share, that's its job:

```text
dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IEYxQkQ3NjMwQUQyNUQ2NjQKUldSazFpV3RNSGE5OFJzMkJhS1JrMVZyc2ZrNGxrWDdUc29FelYzemhXcEd3VlVLaUp4cmF1UHYK
```

> **If you lose the private key you can never push updates to installed apps.**
> Every existing install only trusts updates signed by this exact key, so a new
> key means stranded users who must manually download a fresh build.

### Backup checklist (do this once, now)

- [ ] Copy `%USERPROFILE%\.tauri\hirameki.key` into a password manager or
      private/encrypted backup (it's a short text file — paste its contents).
- [ ] Record the password (empty, here) next to it.
- [ ] Confirm it is **not** tracked by git (it lives outside the repo, so it
      shouldn't be — but never move it into the project folder).
- [ ] If you set up CI, store the same key + password as repo **secrets**
      (`TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`).

To regenerate (only if starting over — invalidates all installed apps):
```powershell
pnpm tauri signer generate --ci -p "" -w "$env:USERPROFILE\.tauri\hirameki.key" -f
```

## ⚠️ Building now requires the signing key

Because `createUpdaterArtifacts` is `true`, `pnpm tauri build` will **fail**
unless the signing key is in the environment. Build like this:

```powershell
$env:TAURI_SIGNING_PRIVATE_KEY = Get-Content "$env:USERPROFILE\.tauri\hirameki.key" -Raw
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = ""
pnpm tauri build
```

This produces, alongside the installers:
- `...-setup.exe` **and** `...-setup.exe.sig` (NSIS)
- `....msi` **and** `....msi.sig` (MSI)

The `.sig` files are the signatures the updater verifies.

## Before a release that touches `src-tauri/migrations/`

sqlx records a SHA-384 of each migration's text and refuses to open a database
whose recorded checksum no longer matches, so **the bytes of an applied
migration are part of the contract**. [`.gitattributes`](../.gitattributes)
pins them to CRLF because every release so far was built on a Windows runner
with `core.autocrlf=true`; changing that would brick the next upgrade for
everyone who already has the app. Never edit an applied migration — add a new
numbered one.

A schema change is a **minor** version bump, not a patch, and the migration is
one way: test it against a copy of a real database first.

## The release flow (each update)

1. **Bump the version** in all four — they must agree, or installed copies may
   never see the release: `package.json`, `src-tauri/Cargo.toml`,
   `src-tauri/Cargo.lock` (the `hirameki` package entry),
   `src-tauri/tauri.conf.json`.
1b. **Write `RELEASE_NOTES.md`.** It is the body of the GitHub release;
   [`release.yml`](../.github/workflows/release.yml) reads the file at build
   time. Say plainly whether the database migrates and whether bundles stay
   readable by older versions.
2. **Build** with the signing env vars (above).
3. **Host** the installer where your endpoint can reach it.
4. **Publish a `latest.json`** manifest at the endpoint URL, e.g.:

   ```json
   {
     "version": "0.2.0",
     "notes": "What changed in this release.",
     "pub_date": "2026-06-21T00:00:00Z",
     "platforms": {
       "windows-x86_64": {
         "signature": "<contents of the .sig file>",
         "url": "https://your-host/Hirameki_0.2.0_x64-setup.exe"
       }
     }
   }
   ```
   `signature` is the **text inside** the `.sig` file, not its path.

5. Installed apps pick it up on next launch (or via the Settings button).

> **The manual flow above is the fallback.** The normal path is automated via
> GitHub Actions (below) — you just push a tag.

## Hosting: GitHub Releases (configured)

- **Repo**: `arbxz/hirameki`
- **Endpoint** (already set in `tauri.conf.json`):
  `https://github.com/arbxz/hirameki/releases/latest/download/latest.json`
  — this always resolves to the newest release's manifest.
- **Workflow**: [`.github/workflows/release.yml`](../.github/workflows/release.yml)
  uses [`tauri-apps/tauri-action`](https://github.com/tauri-apps/tauri-action)
  to build, sign, create the release, and generate `latest.json` automatically.

> ⚠️ **The repo must be public** for the updater to download assets without a
> token. If you keep the code private, publish releases from a separate public
> repo and point the endpoint there instead.

### One-time setup: add the signing secret

Add the **private key contents** as a repo secret named
`TAURI_SIGNING_PRIVATE_KEY`. With the GitHub CLI (keeps it out of your shell
history and the transcript):

```powershell
gh secret set TAURI_SIGNING_PRIVATE_KEY < "$env:USERPROFILE\.tauri\hirameki.key"
```

Or via the web UI: **Settings → Secrets and variables → Actions → New
repository secret**, paste the file contents.

`TAURI_SIGNING_PRIVATE_KEY_PASSWORD` is **not needed** (the key has no
password); the workflow defaults it to empty.

### Cutting a release

```powershell
# 1. Bump version in all three files (keep them in sync):
#    package.json, src-tauri/Cargo.toml, src-tauri/tauri.conf.json
# 2. Commit, then tag and push — the tag triggers the workflow:
git commit -am "release: v0.2.0"
git tag v0.2.0
git push origin main --tags
```

Actions then builds, signs, and publishes the release with the installer,
`.sig`, and `latest.json`. Installed apps update on next launch (or via the
Settings button). Watch the run under the repo's **Actions** tab.

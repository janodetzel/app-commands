---
"@janodetzel/app-commands": patch
---

Publish to npmjs.org. Install with `npm install @janodetzel/app-commands`: no `.npmrc` scope entry and no token, locally, in CI, or on a build service. Releases are published through npm trusted publishing and carry a provenance attestation. Earlier releases stay on GitHub Packages; an app moving over drops the `@janodetzel` registry lines from its `.npmrc` and any token it passed to installs for them.

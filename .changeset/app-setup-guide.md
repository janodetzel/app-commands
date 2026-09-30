---
"@janodetzel/app-commands": patch
---

Document how to set up an app around the package. A new `setting-up-an-app` skill covers the folder layout, the composition root and registry, ports and adapters, keeping features headless, the guardrail config, the headless test setup, and the pitfalls found moving an Expo Router app onto app-commands. The README now covers installing from GitHub Packages in CI and on a build service, the `+not-found` screen an Expo Router app needs to keep the command bridge up, and how to install the skills. `building-a-feature` names commands after the control that triggers them and treats `api.ts` as a port for any platform call.

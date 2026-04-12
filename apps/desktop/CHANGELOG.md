# Changelog

## [0.6.0](https://github.com/Blaise1030/workbench/compare/v0.5.3...v0.6.0) (2026-04-10)


### Features

* updated terminal positioning ([8987aa1](https://github.com/Blaise1030/workbench/commit/8987aa130e728f4e85ef593902f1d3c79c99edfa))

## [0.5.3](https://github.com/Blaise1030/workbench/compare/v0.5.2...v0.5.3) (2026-04-10)


### Bug Fixes

* **desktop:** fix electron-builder release packaging and publish metadata

## [0.5.2](https://github.com/Blaise1030/workbench/compare/v0.5.1...v0.5.2) (2026-04-10)


### Bug Fixes

* **desktop:** fix closeConfirmation resume IDs message and electron-builder channel ([88b0be7](https://github.com/Blaise1030/workbench/commit/88b0be77640ab6f107a99db69b4ddbc234b067aa))

## [0.5.1](https://github.com/Blaise1030/workbench/compare/v0.5.0...v0.5.1) (2026-04-10)


### Bug Fixes

* **desktop:** resolve threadBootstrap test import for node/electron tsconfigs ([ff1a551](https://github.com/Blaise1030/workbench/commit/ff1a5517cfbd1257e62c6bb35aff09496652ed7a))

## [0.5.0](https://github.com/Blaise1030/workbench/compare/v0.4.0...v0.5.0) (2026-04-10)


### Features

* add cursor resume-ID parser ([0232584](https://github.com/Blaise1030/workbench/commit/023258497eb288c17d4b9ac8b70bdfb2f221e205))
* add CursorCliAdapter with detectResumeId ([7a82263](https://github.com/Blaise1030/workbench/commit/7a822634c243409a8e43a8a8a8e2e8efa3579d4d))
* add cursorSessionIdDetected IPC channel ([6bba333](https://github.com/Blaise1030/workbench/commit/6bba333216d01236896a31d2707fd193085cf078))
* add setRawDataListener hook to PtyService ([8099b6b](https://github.com/Blaise1030/workbench/commit/8099b6b29b1afc2a98ce7a2910bf4ebb14513128))
* added resumable feature ([2eb0d58](https://github.com/Blaise1030/workbench/commit/2eb0d580173a86b5c6b7b6bda37be492e85a9fd7))
* using shadcn sonner component ([ee29943](https://github.com/Blaise1030/workbench/commit/ee29943063338f1b95461a7cf61dd34b71877799))


### Bug Fixes

* fix missing styling ([85e28ca](https://github.com/Blaise1030/workbench/commit/85e28ca4a0b9c282e8799a70a3a685dd60ab76c3))

## [0.4.0](https://github.com/Blaise1030/workbench/compare/v0.3.0...v0.4.0) (2026-04-07)


### Features

* add Work Bench landing page (Astro + Cloudflare) and FileSearchEditor updates ([9c559c9](https://github.com/Blaise1030/workbench/commit/9c559c954676dd7ed25e53933f003e9992addf5b))
* capture first prompt for thread titles ([ed9fbbf](https://github.com/Blaise1030/workbench/commit/ed9fbbf2d6d815ebdc89d59f7bf6add871346dc0))
* capture first prompt for thread titles ([523eebd](https://github.com/Blaise1030/workbench/commit/523eebdbf5c23f90b57c37c525618e50c0d0d5a8))
* **desktop:** refresh file explorer on Files tab; file service and IPC updates ([1dc5ab7](https://github.com/Blaise1030/workbench/commit/1dc5ab7fb0afa5a906018eb0f5cc9b3bf3762875))
* persist thread session metadata ([f7b56a0](https://github.com/Blaise1030/workbench/commit/f7b56a0eda704ccd07e71cf43180ec6490fe3036))


### Bug Fixes

* align thread session storage contract ([fa51b40](https://github.com/Blaise1030/workbench/commit/fa51b406a193d57e5eb6d2b00d60cfe5cbe3aaee))
* complete thread session persistence ([78e4b46](https://github.com/Blaise1030/workbench/commit/78e4b46ade08e4f35caf56bbfc1dd9e053a48ea7))
* preserve thread cleanup with foreign keys ([0f11eec](https://github.com/Blaise1030/workbench/commit/0f11eecc55d8b577aa857da56b7b7dfafe74aa1f))
* tighten initial prompt capture semantics ([15f617d](https://github.com/Blaise1030/workbench/commit/15f617d9dd1054ad981839b01be3cb79058b05ff))

## [0.3.0](https://github.com/Blaise1030/workbench/compare/workbench-v0.2.2...workbench-v0.3.0) (2026-04-07)


### Features

* add Work Bench landing page (Astro + Cloudflare) and FileSearchEditor updates ([9c559c9](https://github.com/Blaise1030/workbench/commit/9c559c954676dd7ed25e53933f003e9992addf5b))
* capture first prompt for thread titles ([ed9fbbf](https://github.com/Blaise1030/workbench/commit/ed9fbbf2d6d815ebdc89d59f7bf6add871346dc0))
* capture first prompt for thread titles ([523eebd](https://github.com/Blaise1030/workbench/commit/523eebdbf5c23f90b57c37c525618e50c0d0d5a8))
* **desktop:** refresh file explorer on Files tab; file service and IPC updates ([1dc5ab7](https://github.com/Blaise1030/workbench/commit/1dc5ab7fb0afa5a906018eb0f5cc9b3bf3762875))
* persist thread session metadata ([f7b56a0](https://github.com/Blaise1030/workbench/commit/f7b56a0eda704ccd07e71cf43180ec6490fe3036))


### Bug Fixes

* align thread session storage contract ([fa51b40](https://github.com/Blaise1030/workbench/commit/fa51b406a193d57e5eb6d2b00d60cfe5cbe3aaee))
* complete thread session persistence ([78e4b46](https://github.com/Blaise1030/workbench/commit/78e4b46ade08e4f35caf56bbfc1dd9e053a48ea7))
* preserve thread cleanup with foreign keys ([0f11eec](https://github.com/Blaise1030/workbench/commit/0f11eecc55d8b577aa857da56b7b7dfafe74aa1f))
* tighten initial prompt capture semantics ([15f617d](https://github.com/Blaise1030/workbench/commit/15f617d9dd1054ad981839b01be3cb79058b05ff))

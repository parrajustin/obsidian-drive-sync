# Changelog

## [1.3.4](https://github.com/parrajustin/obsidian-drive-sync/compare/v1.3.3...v1.3.4) (2024-09-29)


### Bug Fixes

* Fix bug where when renaming a file the old file node wouldn't be updated ([f77590c](https://github.com/parrajustin/obsidian-drive-sync/commit/f77590cbe6bc9f3a190b1dd0b612cc7ddd24e8d5))

## [1.3.3](https://github.com/parrajustin/obsidian-drive-sync/compare/v1.3.2...v1.3.3) (2024-09-29)


### Bug Fixes

* fix issues with plugins being synced ([4af3b73](https://github.com/parrajustin/obsidian-drive-sync/commit/4af3b73ff0f5b1b53b2ddfad81f9839d979df64b))
* If there is local data just use it instead of trying to download data ([7fc3442](https://github.com/parrajustin/obsidian-drive-sync/commit/7fc34421f8491f0b26d0f5dd73451887ba367e82))

## [1.3.2](https://github.com/parrajustin/obsidian-drive-sync/compare/v1.3.1...v1.3.2) (2024-09-29)


### Bug Fixes

* Fix issue with renaming files ([bbcebfb](https://github.com/parrajustin/obsidian-drive-sync/commit/bbcebfb71115773b86e4230857dbe95acf296d44))

## [1.3.1](https://github.com/parrajustin/obsidian-drive-sync/compare/v1.3.0...v1.3.1) (2024-09-29)


### Bug Fixes

* Fix tests and bug with moving files ([babd672](https://github.com/parrajustin/obsidian-drive-sync/commit/babd6722f2c59f21eeb550aa5d191f527d9cdc0d))

## [1.3.0](https://github.com/parrajustin/obsidian-drive-sync/compare/v1.2.3...v1.3.0) (2024-09-28)


### Features

* Add caching for firebase syncer ([a5d518e](https://github.com/parrajustin/obsidian-drive-sync/commit/a5d518e740ed080403ee1ed4b4043f35392961c9))


### Bug Fixes

* Add missing firestore indexes ([75cf13d](https://github.com/parrajustin/obsidian-drive-sync/commit/75cf13de36411394fbd9f4192ac1c4d2a6d4902a))

## [1.2.3](https://github.com/parrajustin/obsidian-drive-sync/compare/v1.2.2...v1.2.3) (2024-09-28)


### Bug Fixes

* Fix mess up cleaning local files and display updates left ([094d8b0](https://github.com/parrajustin/obsidian-drive-sync/commit/094d8b036418d708deecdffa009f6c726bb863dc))

## [1.2.2](https://github.com/parrajustin/obsidian-drive-sync/compare/v1.2.1...v1.2.2) (2024-09-28)


### Bug Fixes

* fix obsidian folders don't exist ([3ec9875](https://github.com/parrajustin/obsidian-drive-sync/commit/3ec987530ce82d58448119844ef4c5c6ae240a16))

## [1.2.1](https://github.com/parrajustin/obsidian-drive-sync/compare/v1.2.0...v1.2.1) (2024-09-28)


### Bug Fixes

* change upload path to include the user id ([4410a14](https://github.com/parrajustin/obsidian-drive-sync/commit/4410a14aa28f0a012ea516a316f4029715514cd6))
* fix firestore rules ([bc06c41](https://github.com/parrajustin/obsidian-drive-sync/commit/bc06c41120aa90661845860b28f41f25a5bd91de))

## [1.2.0](https://github.com/parrajustin/obsidian-drive-sync/compare/v1.1.0...v1.2.0) (2024-09-28)


### Features

* Add capability to limit max uploads ([c0e338e](https://github.com/parrajustin/obsidian-drive-sync/commit/c0e338e08caa8b89fc760367f54759d1e92f9ea3))


### Bug Fixes

* Add sorting of suggestions ([1abbb2b](https://github.com/parrajustin/obsidian-drive-sync/commit/1abbb2b8d081725ff3119289be9e108b8c81a756))
* Fixes first use flow ([0cc10f2](https://github.com/parrajustin/obsidian-drive-sync/commit/0cc10f2c673dd2891c0a37b073f9b95ff8cd8d10))
* increase limit of files in fuzzy suggest modal ([c0e338e](https://github.com/parrajustin/obsidian-drive-sync/commit/c0e338e08caa8b89fc760367f54759d1e92f9ea3))
* remove brotli compression ([aa9b87f](https://github.com/parrajustin/obsidian-drive-sync/commit/aa9b87f7044dec4fbcaf2af575de979c2af3fa35))
* Update api for WrapPromise ([aa9b87f](https://github.com/parrajustin/obsidian-drive-sync/commit/aa9b87f7044dec4fbcaf2af575de979c2af3fa35))

## [1.1.0](https://github.com/parrajustin/obsidian-drive-sync/compare/v1.0.4...v1.1.0) (2024-09-28)


### Features

* Add ability to reset settings ([b59a081](https://github.com/parrajustin/obsidian-drive-sync/commit/b59a081967c7bf65f839f0f076067528055d2dd8))


### Bug Fixes

* add templator as a default filtered out file path for file ids ([9b96bb8](https://github.com/parrajustin/obsidian-drive-sync/commit/9b96bb854c87158eb64f6311da15ddf7aa431383))
* fix bug with duplicate progress views being created ([35986ba](https://github.com/parrajustin/obsidian-drive-sync/commit/35986ba763426c5f2adea8b611ecddc23bc4d4c7))
* fix version bump js ([0a11a3b](https://github.com/parrajustin/obsidian-drive-sync/commit/0a11a3bfa74a68d38ecd2c26334c87e8b712da41))
* move cloud storage files to a new dir ([93bef01](https://github.com/parrajustin/obsidian-drive-sync/commit/93bef01ac8b4fda68897d14adda1fdf62401d3a7))

## [1.0.4](https://github.com/parrajustin/obsidian-drive-sync/compare/v1.0.3...v1.0.4) (2024-09-28)


### Bug Fixes

* experiment with committing version update files ([a59ddd9](https://github.com/parrajustin/obsidian-drive-sync/commit/a59ddd912818c7dd687cd8b9b4cf2c865d4a0911))
* trying to remove the if from the workflow ([db089c0](https://github.com/parrajustin/obsidian-drive-sync/commit/db089c0fb809e1dd633d93c7e015259d08325b58))
* update version bump build script ([da815ae](https://github.com/parrajustin/obsidian-drive-sync/commit/da815ae4ee51b0d86ffb7bea596a195667ff7cf6))

## [1.0.3](https://github.com/parrajustin/obsidian-drive-sync/compare/v1.0.2...v1.0.3) (2024-09-28)


### Bug Fixes

* fix release build statements ([6f4ecaf](https://github.com/parrajustin/obsidian-drive-sync/commit/6f4ecaf5bf35ffce58e91c1267c33c4bbd4aa362))

## [1.0.2](https://github.com/parrajustin/obsidian-drive-sync/compare/v1.0.1...v1.0.2) (2024-09-28)


### Bug Fixes

* attempt to fix release please workflow ([f3fda16](https://github.com/parrajustin/obsidian-drive-sync/commit/f3fda16ad4ef3671cbae8841ae37e298d5b423fc))
* if protect release please and remove deprecated workflow ([6e498d4](https://github.com/parrajustin/obsidian-drive-sync/commit/6e498d441dc6a5ac0b7af2fd3cda030208102cbf))
* Update release please ([d26a64c](https://github.com/parrajustin/obsidian-drive-sync/commit/d26a64c926d5bde8abe4ffc5b2aa2ae0521a0fa8))

## [1.0.1](https://github.com/parrajustin/obsidian-drive-sync/compare/1.0.0...v1.0.1) (2024-09-28)


### Miscellaneous Chores

* release 1.0.1 ([362930c](https://github.com/parrajustin/obsidian-drive-sync/commit/362930c10e28584c002ecea01f5caa85c0eba066))

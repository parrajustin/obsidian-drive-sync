# Changelog

## [2.2.0](https://github.com/parrajustin/obsidian-drive-sync/compare/v2.1.1...v2.2.0) (2024-11-17)


### Features

* **file:** Changed files to be file centric instead of file id ([77bb3f9](https://github.com/parrajustin/obsidian-drive-sync/commit/77bb3f9cc3fae8637c8f2d8ab27d80798e7abd6f))


### Bug Fixes

* cleanup removal of local cache types ([560b1a8](https://github.com/parrajustin/obsidian-drive-sync/commit/560b1a86c26f23ba9e3ee8c41a8e97c2cd310d24))
* Fix an issue with deleting cloud using local not marked ([9567273](https://github.com/parrajustin/obsidian-drive-sync/commit/9567273b4278e66d46a05ca298725ea2da7fcdb3))
* fix file syncing pattern for files ([4daf125](https://github.com/parrajustin/obsidian-drive-sync/commit/4daf12567320be552c5292e83d5e2ff1ab02b038))
* **history:** Remove entryTime from history queries ([068227b](https://github.com/parrajustin/obsidian-drive-sync/commit/068227b3a4794a3fffbda9080d0bdf033e04f0fa))
* remove local caches when there is the firestore cache ([8283e68](https://github.com/parrajustin/obsidian-drive-sync/commit/8283e685d85483145d5f8233d5aedecaf8b6be30))

## [2.1.1](https://github.com/parrajustin/obsidian-drive-sync/compare/v2.1.0...v2.1.1) (2024-11-12)


### Bug Fixes

* Fix the default syncer config setting to sync all raw but this plugin's settings ([bb78fdd](https://github.com/parrajustin/obsidian-drive-sync/commit/bb78fdd46e0af4a450ab9a7631bc021ea76c17a6))

## [2.1.0](https://github.com/parrajustin/obsidian-drive-sync/compare/v2.0.0...v2.1.0) (2024-11-12)


### Features

* Add view to see version of code ([02e1036](https://github.com/parrajustin/obsidian-drive-sync/commit/02e1036e08fe5182aaa994335eb117dae0e56d44))

## [2.0.0](https://github.com/parrajustin/obsidian-drive-sync/compare/v1.4.1...v2.0.0) (2024-11-12)


### ⚠ BREAKING CHANGES

* Massive changes to the file storage nodes

### Features

* Add ability to diff files ([9074873](https://github.com/parrajustin/obsidian-drive-sync/commit/9074873efe567577e567e38bd382abb33a29a92c))
* Add file content hashes ([d2a6482](https://github.com/parrajustin/obsidian-drive-sync/commit/d2a6482d19dea65bc2677d2cb1cee79ee6d6832e))
* Add file viewer for historic files ([0b5e2fa](https://github.com/parrajustin/obsidian-drive-sync/commit/0b5e2fac7864ecd98c8e7cd11159f45ddb08e8ad))
* Add inital History view ([cc9ff89](https://github.com/parrajustin/obsidian-drive-sync/commit/cc9ff897c823f8c1bc895eed58b96f2213c165f5))
* **history:** add 3 way merge inital util ([1280dbb](https://github.com/parrajustin/obsidian-drive-sync/commit/1280dbbbb6dc4fb0c1bc5f1a5718402598b80188))
* **history:** Partial add 3 way merge util ([7679bad](https://github.com/parrajustin/obsidian-drive-sync/commit/7679bad071e26ffd78b4c7c8f864e011b2a26b72))
* **idx:** Add IDX compatability ([e6bffdb](https://github.com/parrajustin/obsidian-drive-sync/commit/e6bffdb234c80a54e506a805e80fd80686cee0fe))
* **lib:** Add the diff-match-patch library ([63cd385](https://github.com/parrajustin/obsidian-drive-sync/commit/63cd38555f3484ed54a7c72d0d8b572d47a88efd))
* Make it so that on error history will reset all the data. ([f33d097](https://github.com/parrajustin/obsidian-drive-sync/commit/f33d0978b968fc5171105c6b8c4c17a71772e03f))
* Massive changes to the file storage nodes ([abe4f12](https://github.com/parrajustin/obsidian-drive-sync/commit/abe4f128221c7491336b2465ad25e47f9d1ff0bc))


### Bug Fixes

* Add icon utils ([ef6a514](https://github.com/parrajustin/obsidian-drive-sync/commit/ef6a5143fc411f3c0748a8d8ccf87eea0286cfb4))
* Add metadata to know origin of file node from cloud ([20b3885](https://github.com/parrajustin/obsidian-drive-sync/commit/20b388593d915ee595b088b6309060c7104bda71))
* Add packages for history view ([95340f1](https://github.com/parrajustin/obsidian-drive-sync/commit/95340f19658b4f6c0ea34a38201078160d37cefd))
* **ci:** remove pnpm version from actions pipeline ([beb7af2](https://github.com/parrajustin/obsidian-drive-sync/commit/beb7af2404188105f721acdd66d14e8482ae0533))
* **ci:** Update pnpm version to match package.json ([ded3586](https://github.com/parrajustin/obsidian-drive-sync/commit/ded358699f0a15cac6ba7f849aeb9b6273efdd37))
* Fix firebase security rules for history and files ([2d87c31](https://github.com/parrajustin/obsidian-drive-sync/commit/2d87c31cd4609280e018c4ed185c292ee733092f))
* Fix firebase syncer getting full update due to snapshot ([a100424](https://github.com/parrajustin/obsidian-drive-sync/commit/a100424297c4baf936556e9c90cf36ff10343042))
* Fix history data not having file hash ([b2e5bc3](https://github.com/parrajustin/obsidian-drive-sync/commit/b2e5bc3e608e86509b178fd9d6af0084675adfc0))
* Fix history hash text overflow ([5ab6065](https://github.com/parrajustin/obsidian-drive-sync/commit/5ab60659f41c7486a7987f8f8ebbaf32878410fd))
* Fix the styling of history view ([684f45e](https://github.com/parrajustin/obsidian-drive-sync/commit/684f45e9a5bdc48ffdfa2a85a768c88a0e232b4d))
* Fix type check and errors with history reading data ([34aefc7](https://github.com/parrajustin/obsidian-drive-sync/commit/34aefc7afa130bc9035015b82e5914ae2ca64ef6))
* Make it so file nodes don't update every tick ([069f703](https://github.com/parrajustin/obsidian-drive-sync/commit/069f703b1ca33b379b73b0562f0d404d4218918d))
* Make status payload be anything ([a67f1e6](https://github.com/parrajustin/obsidian-drive-sync/commit/a67f1e63341ad3bf40e500089de4721a677d2424))
* Some cleanup of log statements ([afc9698](https://github.com/parrajustin/obsidian-drive-sync/commit/afc9698a9bca799daef84ae349d03ed5aabbd876))
* Update library utiltiy functions ([3b5f0f6](https://github.com/parrajustin/obsidian-drive-sync/commit/3b5f0f60ffdb91188cb0650bd13835011d205026))

## [1.4.1](https://github.com/parrajustin/obsidian-drive-sync/compare/v1.4.0...v1.4.1) (2024-10-20)


### Bug Fixes

* Add settings schema updaters ([47d6d20](https://github.com/parrajustin/obsidian-drive-sync/commit/47d6d20735b1062a332d32bb321d2bd67b545f4d))
* Fix logic and icon of right leaf progress view ([0a8b4bc](https://github.com/parrajustin/obsidian-drive-sync/commit/0a8b4bc8142f595ff89e3b7c08b73f32a78f2fe9))

## [1.4.0](https://github.com/parrajustin/obsidian-drive-sync/compare/v1.3.5...v1.4.0) (2024-10-20)


### Features

* Add feature to enable/disable file id writing ([cdc0403](https://github.com/parrajustin/obsidian-drive-sync/commit/cdc040376d1926e2e12a5c5fbb42c2099ba89ab9))
* Support versionable settings schema ([d305ce5](https://github.com/parrajustin/obsidian-drive-sync/commit/d305ce5097edca9ec8dba49d7a61df5338cca9bb))


### Bug Fixes

* Fix general testing of release ([e1391e5](https://github.com/parrajustin/obsidian-drive-sync/commit/e1391e501a7b39c6b6b7547e9acc8b7cc3bfc52c))

## [1.3.5](https://github.com/parrajustin/obsidian-drive-sync/compare/v1.3.4...v1.3.5) (2024-09-29)


### Bug Fixes

* Remove ctime and cache file id ([957486c](https://github.com/parrajustin/obsidian-drive-sync/commit/957486cc216279d0c48ef11638bd6be15ef86169))
* Remove unused import ([1da38a2](https://github.com/parrajustin/obsidian-drive-sync/commit/1da38a242a59f35894881d937c7bad1e36ecacb8))

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

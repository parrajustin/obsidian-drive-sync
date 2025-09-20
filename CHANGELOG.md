# Changelog

## [3.1.0](https://github.com/parrajustin/obsidian-drive-sync/compare/v3.0.0...v3.1.0) (2025-09-20)


### Features

* Add capability to build the plugin by script ([36272ff](https://github.com/parrajustin/obsidian-drive-sync/commit/36272ff9bad2923aa5ac7a3e356774458f22249d))
* Add util to update firestore rules ([f07d174](https://github.com/parrajustin/obsidian-drive-sync/commit/f07d17444373b89d49c155d3b794242e0ff72aa2))
* Create robust script to update firestore.rules from schema ([a51bb75](https://github.com/parrajustin/obsidian-drive-sync/commit/a51bb75cad3d04cc2c20622c0c08801cf89f4ce2))
* Create robust script to update firestore.rules from schema ([975f512](https://github.com/parrajustin/obsidian-drive-sync/commit/975f512f39bf7b5fed822aaae0c27fec97bebafb))
* **schema:** Update schema default mechanism ([660e446](https://github.com/parrajustin/obsidian-drive-sync/commit/660e4462cf50dcd1880d8cc8a9efddfa5c1dbaf8))
* **schema:** Update schema default mechanism ([9cfa843](https://github.com/parrajustin/obsidian-drive-sync/commit/9cfa8431285d4a2c04e8257079e7362d9d0f8849))


### Bug Fixes

* add firestore debug log as ignored ([de2b7fb](https://github.com/parrajustin/obsidian-drive-sync/commit/de2b7fb88131cc1ccfd4e6c4f4ef9bae8b17b3c1))
* fix bugs with sync ([93cc608](https://github.com/parrajustin/obsidian-drive-sync/commit/93cc608fdcef7590ede2c5e52a681a665b5d2ff6))
* if settins fail to validate a default is used. ([2eb5bdc](https://github.com/parrajustin/obsidian-drive-sync/commit/2eb5bdc9a5854d66b957f451a0a43fc328ec2aaf))
* remove npm package lock ([2921102](https://github.com/parrajustin/obsidian-drive-sync/commit/29211021f118c023b5f1b179a81a0bb8849da1c6))
* remove old firestore rules ([0caa4de](https://github.com/parrajustin/obsidian-drive-sync/commit/0caa4dea5aa1deaf6d864653d76d0ec04c091a63))
* Update dev container ([1ee1b20](https://github.com/parrajustin/obsidian-drive-sync/commit/1ee1b206056bcb02903364252dcd668f2b9df6ff))

## [3.0.0](https://github.com/parrajustin/obsidian-drive-sync/compare/v2.3.1...v3.0.0) (2025-09-16)


### ⚠ BREAKING CHANGES

* Bump version

### Features

* Add a map util ([e8bdd9e](https://github.com/parrajustin/obsidian-drive-sync/commit/e8bdd9e2a8b4bad6a0cb3410bc1d639354588969))
* Add a missing logging decorator ([faa40ad](https://github.com/parrajustin/obsidian-drive-sync/commit/faa40ad9730efd99c6df472143fdd9420ae52a0a))
* add access information to  the build step ([1c93774](https://github.com/parrajustin/obsidian-drive-sync/commit/1c937746909d0b4160b2cabb8f2074e4509d2aeb))
* Add comprehensive e2e tests for FileSyncer ([6963b95](https://github.com/parrajustin/obsidian-drive-sync/commit/6963b95d431026968d89b48b6fcbb7e29e7ca742))
* add comprehensive tests for convergence_util ([2b74d07](https://github.com/parrajustin/obsidian-drive-sync/commit/2b74d075485b51cc1b08b64f7d6929dc449b22d2))
* Add comprehensive tests for FileAccess module ([88bc911](https://github.com/parrajustin/obsidian-drive-sync/commit/88bc9119228e7810863c73d7bd44447b663d40d1))
* Add decompressStringData function ([7fa497f](https://github.com/parrajustin/obsidian-drive-sync/commit/7fa497fa82be487048240ae39a5c3e0a748900c7))
* add deleted file nodes ([c9b1902](https://github.com/parrajustin/obsidian-drive-sync/commit/c9b19029f0bba816742034a39df92b7627ab1cc6))
* Add firebase cache unit tests ([0502bef](https://github.com/parrajustin/obsidian-drive-sync/commit/0502bef332cc25f94c71802b0899d769b7c1c246))
* Add grafana loki logging ([e0c8af9](https://github.com/parrajustin/obsidian-drive-sync/commit/e0c8af9618e5b9362408810f6d72401221896f40))
* add inital tracing ([579ecd7](https://github.com/parrajustin/obsidian-drive-sync/commit/579ecd7b63ecd1d1788effae23b5a707464d8ddb))
* Add more identifiers to the build ([e862202](https://github.com/parrajustin/obsidian-drive-sync/commit/e862202ef3d39cee92a74f1f65d5bf12d4041435))
* Add more inital logging ([a8497c8](https://github.com/parrajustin/obsidian-drive-sync/commit/a8497c81862658fa175fd1718878bd771dd151e1))
* Add more tests for executeLimitedSyncConvergence ([b34f200](https://github.com/parrajustin/obsidian-drive-sync/commit/b34f200706666d1bfa301b8ce2ee5448ef2cc84f))
* add schema utils ([cc01228](https://github.com/parrajustin/obsidian-drive-sync/commit/cc01228daa6458ef02c4b132e33a67c393794478))
* Add test for executeLimitedSyncConvergence ([53f3770](https://github.com/parrajustin/obsidian-drive-sync/commit/53f37703414215acaa355d4e4c277a1c8663a314))
* Add test for executeLimitedSyncConvergence ([bbf4187](https://github.com/parrajustin/obsidian-drive-sync/commit/bbf418788917a2eee6c6145a67152854bbcece5c))
* Add tests for file_util_obsidian_api ([af1be75](https://github.com/parrajustin/obsidian-drive-sync/commit/af1be75568ca8f0726592d836e66b907ef01557a))
* Add tests for FileUtilRaw ([0a904f2](https://github.com/parrajustin/obsidian-drive-sync/commit/0a904f249f8b06037bee64b88ce27757603448e8))
* Add tracing OTLP to the plugin ([1ac4ec5](https://github.com/parrajustin/obsidian-drive-sync/commit/1ac4ec5e0589567d285c2f766e66824b05459c49))
* Add unit tests for FirebaseSyncer ([5cf8e68](https://github.com/parrajustin/obsidian-drive-sync/commit/5cf8e688525c2cf532e700448a2b0b2641ad7c4b))
* Add unit tests for FirebaseSyncer ([8265a60](https://github.com/parrajustin/obsidian-drive-sync/commit/8265a60664bbf1dc4c61c8d79091832748145849))
* Bump version ([2b2c606](https://github.com/parrajustin/obsidian-drive-sync/commit/2b2c606252538888eab29431e8302d57adad7905))
* Change filenode implementation ([a3bc59b](https://github.com/parrajustin/obsidian-drive-sync/commit/a3bc59b3d1c7987f8e77bb96c82a572853b2052d))
* Fix convergence to make it simple ([600083c](https://github.com/parrajustin/obsidian-drive-sync/commit/600083c8c2da4a7aa625fb971c796c31fa94e471))
* fix remaining files to make plugin buildable ([8e7fb64](https://github.com/parrajustin/obsidian-drive-sync/commit/8e7fb64559556a5729856c850e5bd130cc0918ec))
* Implement UPDATE_LOCAL convergence logic ([00969eb](https://github.com/parrajustin/obsidian-drive-sync/commit/00969ebd9a4ac723047f423663ae0670716c1f88))
* Make syncer test work ([614b165](https://github.com/parrajustin/obsidian-drive-sync/commit/614b16568dbf22c7b768aae2ca81d616eddb6888))
* move firebase cache from settings to syncer config ([a7b9664](https://github.com/parrajustin/obsidian-drive-sync/commit/a7b96640d46fd916cd8bf1ca26ea98603f84a0fb))
* **tests:** Add comprehensive tests for file_access.ts ([e7ff554](https://github.com/parrajustin/obsidian-drive-sync/commit/e7ff554c652bb89dbf1d7bb59b01b91e2702456f))
* **tests:** Add comprehensive tests for file_access.ts ([db9f4b1](https://github.com/parrajustin/obsidian-drive-sync/commit/db9f4b17800cce80ea3909a0731a32591e1930cb))
* update fake clock implementation for testing ([90c0b02](https://github.com/parrajustin/obsidian-drive-sync/commit/90c0b027b3b380e819629b4ab452e6fbfb7836f4))
* update firebase cache ergonomics ([aab6783](https://github.com/parrajustin/obsidian-drive-sync/commit/aab678321f2ef83b16c4f694b5e155058aed3064))
* update firebase syncer logic ([8339d35](https://github.com/parrajustin/obsidian-drive-sync/commit/8339d356243f29f4144366659b616901df085734))
* update type of file nodes ([ef6411a](https://github.com/parrajustin/obsidian-drive-sync/commit/ef6411ae790a6c1e26f7569552187eee12feadf4))


### Bug Fixes

* Add api to delete a file node ([c59fb6b](https://github.com/parrajustin/obsidian-drive-sync/commit/c59fb6bb2cf4394a51c5e83df6f1b7ab097b2ebd))
* Add missing convergence action and view ([01681de](https://github.com/parrajustin/obsidian-drive-sync/commit/01681dee812aafcd2ab4ccc4c5700cdae9b49a0e))
* add missing lib changes ([0cd221a](https://github.com/parrajustin/obsidian-drive-sync/commit/0cd221a43d94638ad581ec1df3e728ce4f0980c8))
* add missing number type ([f3e9f04](https://github.com/parrajustin/obsidian-drive-sync/commit/f3e9f045d2f97d1b84515c4db7792656819de891))
* add missing schema fields ([7c8c4ba](https://github.com/parrajustin/obsidian-drive-sync/commit/7c8c4ba732e5dbdfcb748e965d2d8c25e55d5adf))
* add small comments to ensure ai knows ([068dc82](https://github.com/parrajustin/obsidian-drive-sync/commit/068dc82b1200a5c01c64636397271b0d7f288a26))
* Comment out all history related stuff ([ec9f3fd](https://github.com/parrajustin/obsidian-drive-sync/commit/ec9f3fde83a0f686574209208431e9c84edcea77))
* comment out broken test for now ([e4d71b6](https://github.com/parrajustin/obsidian-drive-sync/commit/e4d71b6b0592ca6939a8eb1164a96848136b6fa1))
* Current iteration adding cloud storage ([882fe83](https://github.com/parrajustin/obsidian-drive-sync/commit/882fe83a555de784b6d8b52ee5089dfbe0fb359b))
* feature errors ([8da34f7](https://github.com/parrajustin/obsidian-drive-sync/commit/8da34f7ac87473b48e7b1d87df72e285a9c8566e))
* fix an error with main being included ([af2d54c](https://github.com/parrajustin/obsidian-drive-sync/commit/af2d54cc23a692a7e726559491940334b19479b8))
* fix broken tests ([d2f7f84](https://github.com/parrajustin/obsidian-drive-sync/commit/d2f7f84979e079da125153b0e4def773b9d8ea7c))
* fix issues with syncer update util ([d332a19](https://github.com/parrajustin/obsidian-drive-sync/commit/d332a1930d8fe2e90094a9360e045c31ec9b3ef8))
* fix schema for Bytes ([673a872](https://github.com/parrajustin/obsidian-drive-sync/commit/673a8722c3da225e664a0cf64c53f0c7cda66b1e))
* Fix similarites between new file and cloud node ([f1cd372](https://github.com/parrajustin/obsidian-drive-sync/commit/f1cd372662cec75b129a9d60df454c56e52b47f4))
* Fix some issues with the query suggest changes ([0d824f3](https://github.com/parrajustin/obsidian-drive-sync/commit/0d824f3f9d84fc72f9a8e92e2009010eeeb29075))
* Fix some linting and add to the test of compression utils ([bf94140](https://github.com/parrajustin/obsidian-drive-sync/commit/bf94140f07361cd6cca1a4396f1e9df40270a53f))
* fix some logging stuff ([8ed9b27](https://github.com/parrajustin/obsidian-drive-sync/commit/8ed9b27ce03fe4372b7b49ad91776d5d35762a09))
* fix some static function visbility ([657c67b](https://github.com/parrajustin/obsidian-drive-sync/commit/657c67b83aa91477575ce56f94fe82082131f28d))
* fix some testing for syncer update util ([bfee4ad](https://github.com/parrajustin/obsidian-drive-sync/commit/bfee4adcd764dcd417f0cfb650dea778e1f9f12b))
* fix syncer and tests needed ([8902263](https://github.com/parrajustin/obsidian-drive-sync/commit/89022639ba50b46f6c5234ecfa97ec9e7bfa7199))
* fix syncer tests ([e500353](https://github.com/parrajustin/obsidian-drive-sync/commit/e5003531e173eb7f92c77d5c5cb9e387f64a7f6e))
* fix syncer update util test ([cee986a](https://github.com/parrajustin/obsidian-drive-sync/commit/cee986ac75d0964be4a3aab784e1092815f7e596))
* fix type error in file access ([8c23dc9](https://github.com/parrajustin/obsidian-drive-sync/commit/8c23dc9dd3437fde32f85da344cbed81192a749b))
* fix typing and clean up ([f3fbc58](https://github.com/parrajustin/obsidian-drive-sync/commit/f3fbc58f54df6f29575da5f762e0937317a6435e))
* issue with convergence test and logging ([58bb39a](https://github.com/parrajustin/obsidian-drive-sync/commit/58bb39a8eec13a00c31087c42c63d33b5eb50d24))
* make the pre commit checks work ([0f3cc6f](https://github.com/parrajustin/obsidian-drive-sync/commit/0f3cc6facf0656dbfadfa094ef48e8c8dae646e7))
* Seperate out local only and cloud with local files ([696d6e2](https://github.com/parrajustin/obsidian-drive-sync/commit/696d6e2191e290d8767a46f3cc1ce87ef120ed76))
* **test:** Add more comprehensive syncer test ([76602a5](https://github.com/parrajustin/obsidian-drive-sync/commit/76602a5f37cff12427ed3944505c1ea5376862f6))
* typing and issues in schema files ([f227353](https://github.com/parrajustin/obsidian-drive-sync/commit/f22735319f58e3e5870c061cd81602898c325198))
* Uncomment and update types in querySuggest.ts ([5239041](https://github.com/parrajustin/obsidian-drive-sync/commit/523904137597eb769b8f68c46749a0cbe953faf1))
* Uncomment and update types in querySuggest.ts ([66a03e5](https://github.com/parrajustin/obsidian-drive-sync/commit/66a03e5d29b046742dc10df92aa554ba5292433a))
* Update file node semantics and convergence ([9460c9b](https://github.com/parrajustin/obsidian-drive-sync/commit/9460c9b4e22f838515137f93ef2f60795cf84d45))
* update firebase syncer with changes from cache ([8907383](https://github.com/parrajustin/obsidian-drive-sync/commit/890738336d31acec0e69fb2939f270e59c9cf649))
* update some documentation ([a34802e](https://github.com/parrajustin/obsidian-drive-sync/commit/a34802e673983bfaecf10135846a5f54d53735b4))
* Update some typeing issues with the file access tests ([53b853b](https://github.com/parrajustin/obsidian-drive-sync/commit/53b853bc7dd4a19cb2e62296655a9a0781439c0e))

## [2.3.1](https://github.com/parrajustin/obsidian-drive-sync/compare/v2.3.0...v2.3.1) (2025-06-19)


### Bug Fixes

* Fix broken tests and default schema behavior ([ccb13a5](https://github.com/parrajustin/obsidian-drive-sync/commit/ccb13a502a30ecbfcf7be0704a9ca3c24346db39))

## [2.3.0](https://github.com/parrajustin/obsidian-drive-sync/compare/v2.2.0...v2.3.0) (2025-06-19)


### Features

* Add inital schema update util ([db1ff6a](https://github.com/parrajustin/obsidian-drive-sync/commit/db1ff6afca7c542e2fa435abbc776695d31f8a39))
* **shared_syncer:** adding ability to select a folder from settings ([4052587](https://github.com/parrajustin/obsidian-drive-sync/commit/4052587f96d8c727f4b716e8fba07fd1705cbe10))


### Bug Fixes

* **shared_syncer:** Added the shared syncer type config ([dcab164](https://github.com/parrajustin/obsidian-drive-sync/commit/dcab1643dd9d6f2fcb5b3e94e8dba3ebf9b59941))
* small code cleanup ([38f8491](https://github.com/parrajustin/obsidian-drive-sync/commit/38f84912c6fc94add85bc5457f2fae61750bb87c))

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

# Changelog

## [0.10.0](https://github.com/Blaise1030/workbench/compare/v0.9.0...v0.10.0) (2026-04-16)


### Features

* **agents:** async WebLLM thread title after first send ([d950932](https://github.com/Blaise1030/workbench/commit/d9509323e444a6726e676f80edd106b2281e228b))
* **desktop:** add extraEnv param to PtyService.getOrCreate ([1394599](https://github.com/Blaise1030/workbench/commit/139459927995054ad7ae6c5a79c90510958173ae))
* **desktop:** add HookHandler to dispatch agent hook events ([422e16d](https://github.com/Blaise1030/workbench/commit/422e16dcdcdc4714b2c6341f09e6fa8f5ec43c3b))
* **desktop:** add HookRegistrationService for agent hook scripts ([757dcf8](https://github.com/Blaise1030/workbench/commit/757dcf80afa9079a8e7625335c7006413348b46a))
* **desktop:** add HookServer for agent lifecycle hook events ([c11eec1](https://github.com/Blaise1030/workbench/commit/c11eec1d4172266f7119d22f94bafdb287868a77))
* **desktop:** add NotificationService.trigger for OS notification delivery ([c60231e](https://github.com/Blaise1030/workbench/commit/c60231ef5592c5bc377b5e508ef7a5aab9eeb8fb))
* **desktop:** wire HookServer and HookRegistrationService into app startup ([e93e5f0](https://github.com/Blaise1030/workbench/commit/e93e5f04667fb04e4c15e3d820de55e7117d89c8))
* **local-llm:** add prompts and output parsers with tests ([6235562](https://github.com/Blaise1030/workbench/commit/6235562c755672965c4a1f87f7a0d87d51839251))
* **local-llm:** lazy WebLLM engine with WebGPU gate and queue ([7b78af0](https://github.com/Blaise1030/workbench/commit/7b78af00c20f88e789ed9c0c68b02ae6ffff4017))
* **scm:** IPC for staged unified diff for local LLM ([654b741](https://github.com/Blaise1030/workbench/commit/654b741b137d81592f8df3f0fe59d4892898ebea))
* **scm:** suggest commit messages via local WebLLM ([2588513](https://github.com/Blaise1030/workbench/commit/258851355aa0a74131d6bfb0d53844c1a4be455c))
* **sidebar:** implement ThreadSidebarNodes with context/thread node pattern ([ff52873](https://github.com/Blaise1030/workbench/commit/ff528738e3f83e4e253f2f37aa4b1c4eb8dd81a4))
* **sidebar:** replace ThreadGroupHeader+ThreadRow loop with ThreadSidebarNodes ([068f4e8](https://github.com/Blaise1030/workbench/commit/068f4e83fec5f49eb179007be60de9d6c3c47a41))
* **sidebar:** wire node-based context/thread model in ThreadSidebar script ([92d2b24](https://github.com/Blaise1030/workbench/commit/92d2b242713bb8992d970b0f9eb63d485bbd4126))
* updated hooks ([1539299](https://github.com/Blaise1030/workbench/commit/153929925031b10fce24c07a69e54133697d9ec1))
* updated thread sidebar to be more  minimal ([a5b0d69](https://github.com/Blaise1030/workbench/commit/a5b0d6971fff2e1087a9ae5f1aa7982aa872f5e3))
* updated to hook based notification ([5719fdc](https://github.com/Blaise1030/workbench/commit/5719fdc5a587404b939c7ea5aec342432366f5a9))


### Bug Fixes

* **agents:** capture thread title epoch before refreshSnapshot ([49f4d2b](https://github.com/Blaise1030/workbench/commit/49f4d2b70f54e0cb8b352dbcda4416250db9a6cf))
* browser behaviours ([dd06a42](https://github.com/Blaise1030/workbench/commit/dd06a424968dbdce0855f7cc9b357d36f2f7aa83))
* **desktop:** add RenameThreadInput type and workspaceRenameThread IPC channel ([bede801](https://github.com/Blaise1030/workbench/commit/bede8012e03dc5c6701bc2cfdc334b898d6ad0f1))
* **desktop:** change hook scripts dir to ~/.workbench/hooks ([5342b1b](https://github.com/Blaise1030/workbench/commit/5342b1bc004ba0e52bc02cdf6a5ae2a9dca8a151))
* **desktop:** fix HookServer robustness issues (error handling, stop, guard) ([3b8201d](https://github.com/Blaise1030/workbench/commit/3b8201d9555272ae165d194fb7dfa46396d1f193))
* **desktop:** resolve typecheck issues from hooks reliability wiring ([205e84f](https://github.com/Blaise1030/workbench/commit/205e84fd3a755aab6125d673c6f3053c35f29a32))
* **desktop:** use space-free path for hook scripts to fix macOS shell split ([e63f1d2](https://github.com/Blaise1030/workbench/commit/e63f1d261ebc9a8201291332a8c9b82b8354876f))
* **sidebar:** align node add-thread target id and restore group test hooks ([22c27ea](https://github.com/Blaise1030/workbench/commit/22c27ea1ad37b52bdfaccd28e18b67ce93a63c96))
* **sidebar:** resolve ThreadSidebarNodes markup and typing risks ([b0e19c3](https://github.com/Blaise1030/workbench/commit/b0e19c30ea3d3b5c99d691dc601c4aef75cdc8fe))

## [0.9.0](https://github.com/Blaise1030/workbench/compare/v0.8.0...v0.9.0) (2026-04-14)


### Features

* add preview IPC channels (reload, setBounds, show, hide) ([a87e4a0](https://github.com/Blaise1030/workbench/commit/a87e4a06e9cbcc341fea545356f87786d68006e1))
* add PreviewBounds and PreviewApi types ([b5d0a6e](https://github.com/Blaise1030/workbench/commit/b5d0a6efbeb14c39707c0b44b1a7dcacfbb32a8d))
* add PreviewPanel component and unit tests ([e6200b1](https://github.com/Blaise1030/workbench/commit/e6200b13299f3b1c6391ada8e980572289579dbf))
* add WebContentsView lifecycle and preview IPC handlers in main process ([a81bcd6](https://github.com/Blaise1030/workbench/commit/a81bcd6cf48563554ec3f0d9cfdbbb34ada77474))
* **desktop:** add inline thread prompt pane to WorkspaceLayout ([10ac421](https://github.com/Blaise1030/workbench/commit/10ac42182f9c7a0dcde2778f094012eb61e5c221))
* **desktop:** add MonacoDiffEditor component ([af02aa1](https://github.com/Blaise1030/workbench/commit/af02aa1e5bba5fefc73160cb30c0e9c64fba9b66))
* **desktop:** add MonacoEditor component ([a75f825](https://github.com/Blaise1030/workbench/commit/a75f8259540a7b0e0c3aae1fd778787fea027e2e))
* **desktop:** add monacoLanguageIdFromPath utility ([1f372ad](https://github.com/Blaise1030/workbench/commit/1f372ad6b059e97d7d82d55aef1abefa64bdaa5a))
* **desktop:** add preview WebContentsView DevTools button ([cbb20a6](https://github.com/Blaise1030/workbench/commit/cbb20a60c34a6b6cacf093580f4e1e2c6bdf2b0b))
* **desktop:** add ThreadInlinePromptEditor component ([d59e931](https://github.com/Blaise1030/workbench/commit/d59e931d01a4603e0320f45b3adfccb3ccd9ced0))
* **desktop:** empty default preview URL, hide URLs in banners, persist per worktree ([4d1948c](https://github.com/Blaise1030/workbench/commit/4d1948c19edf3df17a363a12a8ded0a29c6da185))
* **desktop:** inline thread compose in sidebar ([584a637](https://github.com/Blaise1030/workbench/commit/584a6372f5ce6756e2e97a0ba9a42de84898d184))
* **desktop:** native preview BrowserView host ([031bfa1](https://github.com/Blaise1030/workbench/commit/031bfa143c302daccf0f560d0c7c307772858fcf))
* **desktop:** show preview load, HTTP, and network errors in the panel ([1e95c21](https://github.com/Blaise1030/workbench/commit/1e95c21f8de02234aa0238f80cccc19769689e47))
* **desktop:** swap CodeMirrorEditor → MonacoEditor in FileSearchEditor ([9ca071a](https://github.com/Blaise1030/workbench/commit/9ca071a3e1a3de597b0b840785ec449550ba4aad))
* **desktop:** swap CodeMirrorMergeDiff → MonacoDiffEditor in SourceControlPanel ([8f1f75f](https://github.com/Blaise1030/workbench/commit/8f1f75f170b7feb5194419ea2f3d6a5f50163824))
* **desktop:** ThreadGroupHeader emits add-thread-inline, wires to inline prompt ([23f4170](https://github.com/Blaise1030/workbench/commit/23f41707701bc85a47d7a4441ff0a0ff26ee6812))
* **desktop:** wire Preview tab in workspace and persist preview in layout ([707c9bb](https://github.com/Blaise1030/workbench/commit/707c9bb11c06a74bf213d0aea9a8966711d6ef8d))
* expose previewApi in preload and inline new channel strings ([a07cef9](https://github.com/Blaise1030/workbench/commit/a07cef9d5ed24a238cf4a278d9decc4e4bde771d))


### Bug Fixes

* **desktop:** agent PTY bootstrap resume vs prompt ([ffb57e1](https://github.com/Blaise1030/workbench/commit/ffb57e127829c80cc8c5fad3cf57f74af951816a))
* **desktop:** avoid jsdom canvas stderr in monacoShadcnTheme toHex ([f50fe6e](https://github.com/Blaise1030/workbench/commit/f50fe6edb0e202a8e4548b4598ac6d6dce96f82c))
* **desktop:** keep project tab hover card above native preview WebContentsView ([8be880a](https://github.com/Blaise1030/workbench/commit/8be880aae193fdb1d7afd55d61f67c115687e673))
* **desktop:** restore file editor collapse toggle in header ([deb321f](https://github.com/Blaise1030/workbench/commit/deb321f48606f5f893d1ca9221254e36743452d4))
* **desktop:** steer popovers away from native preview via collision mirror ([13a0dc3](https://github.com/Blaise1030/workbench/commit/13a0dc3860953be9b7dad789c47b80d41d0d6ab8))
* guard show() rejection and add ResizeObserver disconnect test in PreviewPanel ([3700c2f](https://github.com/Blaise1030/workbench/commit/3700c2f082761ba728879978e61339812d978e9d))
* handle addChildView failure and document preview constraints in main process ([3ccb19e](https://github.com/Blaise1030/workbench/commit/3ccb19e953832ae1bcc91b383a68f51143075d43))

## [0.8.0](https://github.com/Blaise1030/workbench/compare/v0.7.0...v0.8.0) (2026-04-12)


### Features

* add command center icon bar and activeFilter to WorkspaceLauncherModal ([92178ca](https://github.com/Blaise1030/workbench/commit/92178ca3f53dd727a0686fced4b4e4a54a3d0cd5))
* add useCommandCenter composable with scoped keybindings ([d88afa2](https://github.com/Blaise1030/workbench/commit/d88afa2b3d5d540a67b2442e2ad46a52550d5cbb))
* remove project digit-slot switching from workspace keybindings ([cb2b50a](https://github.com/Blaise1030/workbench/commit/cb2b50a5f9f9978403a1e831ebee75f08fff49e4))
* remove switchProjectOrTerminalDigit keybinding ([cf4914c](https://github.com/Blaise1030/workbench/commit/cf4914c42098c25ae29726181e1fa2dca3b18bfb))
* wire Command Center into WorkspaceLayout, remove project digit-slot switching ([f7a5c01](https://github.com/Blaise1030/workbench/commit/f7a5c01ee03d030f9d6ddc4abf3705db8ab7460c))

## [0.7.0](https://github.com/Blaise1030/workbench/compare/v0.6.0...v0.7.0) (2026-04-12)


### Features

* added unified git diff ([f62f53d](https://github.com/Blaise1030/workbench/commit/f62f53d7656b439be373f4d155659457f6e79320))
* bundle metrics helper for main Vite chunk ([bb56d07](https://github.com/Blaise1030/workbench/commit/bb56d074af6ebe11c4c3352084aa6fb6b94d6ef4))
* **context-queue:** [Agent Tab] paste header for thread agent terminal ([34d6f16](https://github.com/Blaise1030/workbench/commit/34d6f1656b209609fd95c0c2ae02beb3342cbef8))
* **context-queue:** add paste text formatters ([93a1c91](https://github.com/Blaise1030/workbench/commit/93a1c91a2f9cccd5804ffbecaf477a405937cd5b))
* **context-queue:** add PTY inject loop ([76065a7](https://github.com/Blaise1030/workbench/commit/76065a7135bc5d8c42c3452724889504bc664c4b))
* **context-queue:** add queue types ([d11e7c4](https://github.com/Blaise1030/workbench/commit/d11e7c428a524fe563fa4e9099bbea373b7a76c4))
* **context-queue:** add review dialog ([8f9a2a1](https://github.com/Blaise1030/workbench/commit/8f9a2a178a6fbbdffcadc815e80474bf6b4a7994))
* **context-queue:** add selection popup and anchor helpers ([50a04e0](https://github.com/Blaise1030/workbench/commit/50a04e0a85242d8037a81f0921748918974f1c27))
* **context-queue:** add thread context queue composable ([7178507](https://github.com/Blaise1030/workbench/commit/7178507397be3de0b5ed522f5e5c8ab2047f339e))
* **desktop:** Agent button on selection popup sends context to PTY ([0f06d22](https://github.com/Blaise1030/workbench/commit/0f06d2203965dd3681716fc88a9e7894930c9fba))
* **desktop:** context queue bar on overlay shell terminals too ([9ad7fe7](https://github.com/Blaise1030/workbench/commit/9ad7fe714f1fbc017b5f9d7326f432e862ba8b8c))
* **desktop:** drag-and-drop reorder in context queue review ([a635dd6](https://github.com/Blaise1030/workbench/commit/a635dd64879fba4cf02fb6d6c0c6bd6d27520eed))
* **desktop:** emit user-typed from TerminalPane for PTY echo suppression ([6a8dc93](https://github.com/Blaise1030/workbench/commit/6a8dc935ec7300d1a5034620fa0da2c664e409c1))
* **desktop:** GitHub-style composer for context queue review ([ab08980](https://github.com/Blaise1030/workbench/commit/ab089808acc5351a424f84aa084149ce9a0f57c7))
* **desktop:** keybindings for Queue/Agent selection bar ([ca832d1](https://github.com/Blaise1030/workbench/commit/ca832d187d34fff8f67e2f60c74984398778761d))
* **desktop:** open queue review when context is enqueued ([c7d6fd1](https://github.com/Blaise1030/workbench/commit/c7d6fd1a892a149aee0d60c7a0e16d55d131638c))
* **desktop:** thread context queue with review and PTY inject ([60147d3](https://github.com/Blaise1030/workbench/commit/60147d3c78cb6def2c3d5206b67086b013f0bd2b))
* **desktop:** TipTap thread create, attachments, IPC channel map ([7c2392d](https://github.com/Blaise1030/workbench/commit/7c2392d3391bc5d0c8d0ab6f49334e45eab97079))
* **editor:** inline file badges, slash chip styling, Done with check icon ([326fdd3](https://github.com/Blaise1030/workbench/commit/326fdd3f7b29068061baebde077238aba10f8b3d))
* improve tooltip provider rendering ([54ee9a1](https://github.com/Blaise1030/workbench/commit/54ee9a1ae0cda102ab9aa95276bacf0fc8220998))
* moved terminal to the bottom bar ([64c2811](https://github.com/Blaise1030/workbench/commit/64c2811a55627f76d07052c64a436c31ef630137))
* **queue:** context badge in TipTap, footer Remove+Done, drop preview chip ([51b205a](https://github.com/Blaise1030/workbench/commit/51b205a55d7c3687482416ea44c950f3e4cdd005))
* **queue:** show queue context badge as inline TipTap tag in review note ([3f3639a](https://github.com/Blaise1030/workbench/commit/3f3639a62c233df60a615df18b220487c97300d8))
* **queue:** TipTap comment editor with blob preview in context queue review ([dc6b19d](https://github.com/Blaise1030/workbench/commit/dc6b19d7278f4ee1c22b61570e3a6c45bdbce301))
* updated git diff ([f19b47c](https://github.com/Blaise1030/workbench/commit/f19b47ce1b3f7a67299b18ad7e0a19ab374e2dcb))


### Bug Fixes

* **desktop:** anchor context-queue bar to selection and visual viewport ([ec7c143](https://github.com/Blaise1030/workbench/commit/ec7c14370d37b82a07a740d48ccc75de4ac2448d))
* **desktop:** dismiss context queue popups on scroll ([c9f40ce](https://github.com/Blaise1030/workbench/commit/c9f40ce94592d73b954c937c18345834dc78f0af))
* **desktop:** label queued shell output as Terminal N, not generic Terminal ([affc760](https://github.com/Blaise1030/workbench/commit/affc7600769fa44cc1f209a0e704c56fa9a1b9fc))
* **desktop:** thread PTY idle attention uses activeThreadId and input suppression ([b1c2522](https://github.com/Blaise1030/workbench/commit/b1c252274279c1742f4c256b07ded96e5808aa38))
* **desktop:** wire activeThreadId and user-typed into PTY run status ([3e5d313](https://github.com/Blaise1030/workbench/commit/3e5d313ac6964014a308e7e0bcca63d3fe1cb81f))
* queue input ([f068384](https://github.com/Blaise1030/workbench/commit/f068384525f235f5d6e0dd5d0bf06f58d58353dc))
* **queue:** align drag handle to the left of the review editor column ([f36f08c](https://github.com/Blaise1030/workbench/commit/f36f08cf9fa3cb94931c50aa0c79359db4115ac9))
* **queue:** do not preventDefault Space in TipTap edit mode (blob wrapper) ([6ad6fe4](https://github.com/Blaise1030/workbench/commit/6ad6fe42afca55725951880e982c1203056f0f9a))
* **queue:** preserve review drafts when queue props update while panel open ([c083304](https://github.com/Blaise1030/workbench/commit/c0833049c83cc520c3fa9e7ca3e4e82328ebd08a))
* **security:** add -- end-of-options separator before prompt in agent adapters (HIGH-3) ([7a69ed1](https://github.com/Blaise1030/workbench/commit/7a69ed19898489599e40ff7fdc807072ceb8ae06))
* **security:** enable sandbox:true — rewrite preload without Node.js path import (HIGH-1) ([5b32d64](https://github.com/Blaise1030/workbench/commit/5b32d64957e782271afedc4d6d85f4d8c75f2c1d))
* **security:** extract path guard utility and fix EditService path traversal (CRITICAL-1) ([20de633](https://github.com/Blaise1030/workbench/commit/20de633d382d52e95ac50b7717ee457b6fa6535c))
* **security:** fix git flag injection and worktreeRemove path derivation (MEDIUM-2, MEDIUM-3) ([699fe22](https://github.com/Blaise1030/workbench/commit/699fe2278b5a53bc3a4da19d28ab545b4f2eb898))
* **security:** reject file paths containing colon before git revspec interpolation (LOW-2) ([5d5688b](https://github.com/Blaise1030/workbench/commit/5d5688bdb36f3512538b0033874b5a9932d7c686))
* **security:** upgrade Electron to patch commandLineSwitches renderer injection CVE (HIGH-2) ([49b5da9](https://github.com/Blaise1030/workbench/commit/49b5da98b8f90bebfedf89134cf155aa0dd2cdb4))
* **security:** validate cwd against registered worktrees in IPC handlers (MEDIUM-1) ([dcbf1ee](https://github.com/Blaise1030/workbench/commit/dcbf1eef541e200504a3ee931d82d6f009e54e29))
* vulnerability from claude code review ([933f5e1](https://github.com/Blaise1030/workbench/commit/933f5e146fcbb1f408433b856959dfae00eae1d7))


### Performance Improvements

* **scm:** LRU diff text cache with worktree-qualified keys ([eaf8180](https://github.com/Blaise1030/workbench/commit/eaf81807da2dc509d2249cac81ec4ee214a909f4))

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

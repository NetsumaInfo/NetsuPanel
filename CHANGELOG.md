# Changelog

## [1.9.0](https://github.com/NetsumaInfo/NetsuPanel/compare/v1.8.1...v1.9.0) (2026-03-20)


### Features

* **auto-detect:** implement page detection scoring/grouping + popup integration ([6c962a9](https://github.com/NetsumaInfo/NetsuPanel/commit/6c962a994aaea3e2de882f06e69284078e9630f4))
* **downloads:** add CBZ and ZIP download support ([3f3ffab](https://github.com/NetsumaInfo/NetsuPanel/commit/3f3ffabc7e5026a94a04425832961ef4cf9978ed))
* persist applied filters; separate download progress per tab ([e0476a0](https://github.com/NetsumaInfo/NetsuPanel/commit/e0476a058e49d86fae927546e6a9bc2a6a628e9e))


### Bug Fixes

* **auto-detect:** improve URL-family grouping and prevent hex filename dedup collisions ([5b0b3ad](https://github.com/NetsumaInfo/NetsuPanel/commit/5b0b3ad0dd480b2ac68c2f41ab5c9fa145b63a63))
* **auto-detect:** persist default-on toggle and disable autoscan when unchecked ([8ab92da](https://github.com/NetsumaInfo/NetsuPanel/commit/8ab92da5f23dd5f2bee8e0fec11c16f0d70106e7))
* dedupe fetched images by src url to prevent duplicates in image … ([d4db1bf](https://github.com/NetsumaInfo/NetsuPanel/commit/d4db1bf4e409cc9079548fff31e76b22984c0c2d))
* dedupe fetched images by src url to prevent duplicates in image list ([430fd1b](https://github.com/NetsumaInfo/NetsuPanel/commit/430fd1b3f657a36c0570d507d17a067f8b5d48be))
* Download section CSS design fixed. ([6908594](https://github.com/NetsumaInfo/NetsuPanel/commit/69085943e1d90225231f74f820970ebad32eb41a))
* **download:** default to CBZ and reorder formats (CBZ → PDF → ZIP) ([685eb1b](https://github.com/NetsumaInfo/NetsuPanel/commit/685eb1bc1908764950bb4ed40cba7faec92598ca))
* **download:** prevent overlay from reverting to PDF label during CBZ/ZIP download ([e2862b0](https://github.com/NetsumaInfo/NetsuPanel/commit/e2862b0ca8594c82c2d4a6fd16b067a32bfaff5b))
* **firefox:** add data_collection_permissions for AMO validation ([94d20a7](https://github.com/NetsumaInfo/NetsuPanel/commit/94d20a757ec9a45b6a0b2cdc803c439c961ebe14))
* **firefox:** add gecko add-on id for MV3 AMO submission ([e94994a](https://github.com/NetsumaInfo/NetsuPanel/commit/e94994a9dcd8ff3b43016eb774d5c11677e0be8a))
* **firefox:** add gecko add-on id for MV3 AMO submission ([0a222df](https://github.com/NetsumaInfo/NetsuPanel/commit/0a222df3a5e9077267789961087d216b80dcd3f0))
* **firefox:** generate AMO-compatible manifest from manifest.base.json ([180159d](https://github.com/NetsumaInfo/NetsuPanel/commit/180159ddad852d5d10914861344d3de8e19622b5))
* **firefox:** generate AMO-compatible manifest from manifest.base.json ([e603cc3](https://github.com/NetsumaInfo/NetsuPanel/commit/e603cc34bf1c1c590ea321c29d9bf9e4e03d4bfb))
* handle stale download state and clear on error ([7dc47cb](https://github.com/NetsumaInfo/NetsuPanel/commit/7dc47cbed3fe6eae9b8a4da5d32bad72d7b0ebd6))
* handle stale download state and clear on error ([28576cf](https://github.com/NetsumaInfo/NetsuPanel/commit/28576cffb61435fce7dd1b95ed9c39ad13dc8232))
* sign firefox xpi in release workflow ([81f1931](https://github.com/NetsumaInfo/NetsuPanel/commit/81f19316570eb1ebb8d0cf463ba05076a10827dd))
* sign firefox xpi in release workflow ([9381517](https://github.com/NetsumaInfo/NetsuPanel/commit/9381517fe5f013cab6fde7a62c576c78a5ab3ec3))
* stabilize image extraction and downloads ([3ba5bfd](https://github.com/NetsumaInfo/NetsuPanel/commit/3ba5bfd2b81ef3670f85d7622b72a1dcd71f49af))
* test release automation ([b178675](https://github.com/NetsumaInfo/NetsuPanel/commit/b178675b25cb6e02651f00751032ab0b91b7bf1e))
* test release automation ([ede0d25](https://github.com/NetsumaInfo/NetsuPanel/commit/ede0d253444b882e987c7a92174688807febd809))
* test release automation ([222711c](https://github.com/NetsumaInfo/NetsuPanel/commit/222711c668f28163a8f29823f52be31fd55ddd72))

![MIT licensed][mit-badge]
![Apache licensed][apache-badge]
[![Build Status][actions-badge]][actions-url]

[mit-badge]: https://img.shields.io/badge/license-MIT-blue.svg
[apache-badge]: https://img.shields.io/github/license/saltstack/salt
[actions-badge]: https://github.com/tlsnotary/tlsn-extension/actions/workflows/build.yaml/badge.svg
[actions-url]: https://github.com/tlsnotary/tlsn-extension/actions?query=workflow%3Abuild+branch%3Amain++

<img src="src/assets/img/icon-128.png" width="64"/>

# Chrome Extension (MV3) for TLSNotary

> [!IMPORTANT]
> ⚠️ When running the extension against a [notary server](https://github.com/tlsnotary/tlsn/tree/dev/notary-server), please ensure that the server's version is the same as the version of this extension

## License
This repository is licensed under either of

- [Apache License, Version 2.0](http://www.apache.org/licenses/LICENSE-2.0)
- [MIT license](http://opensource.org/licenses/MIT)

at your option.


## Installing and Running

### Procedures:

1. Check if your [Node.js](https://nodejs.org/) version is >= **18**.
2. Clone this repository.
3. Run `npm install` to install the dependencies.
4. Run `npm run dev`
5. Load your extension on Chrome following:
   1. Access `chrome://extensions/`
   2. Check `Developer mode`
   3. Click on `Load unpacked extension`
   4. Select the `build` folder.
6. Happy hacking.

## Building Websockify Docker Image
```
$ git clone https://github.com/novnc/websockify && cd websockify
$ ./docker/build.sh
$ docker run -it --rm -p 55688:80 novnc/websockify 80 api.x.com:443
```

## Running Websockify Docker Image
```
$ cd tlsn-extension
$ docker run -it --rm -p 55688:80 novnc/websockify 80 api.twitter.com:443
```

## Packing

After the development of your extension run the command

```
$ NODE_ENV=production npm run build
```

Now, the content of `build` folder will be the extension ready to be submitted to the Chrome Web Store. Just take a look at the [official guide](https://developer.chrome.com/webstore/publish) to more infos about publishing.

## Resources:

- [Webpack documentation](https://webpack.js.org/concepts/)
- [Chrome Extension documentation](https://developer.chrome.com/extensions/getstarted)

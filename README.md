<img src="src/assets/img/icon-128.png" width="64"/>

# Chrome Extension (MV3) for TLSNotary

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
$ docker run -it --rm -p 55688:80 novnc/websockify 80 api.twitter.com:443
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
# frida-swift-bridge

Swift interop from Frida. (Currently supports arm64(e) Darwin only)

## Getting started
```
$ npm run install
$ npm run build
$ frida <process name> -l _agent.js
```
_Note_: As of the time of writing this, there's a conflict between one of the type names in `frida-gum` and those provided by TypeScript for the name `File`. It's easiest to remove that type from `frida-gum` for now, since we don't currently depend on it.

## Showcase
The best way to really see the available APIs in action is to have a look at the [testsuite](https://github.com/hot3eed/frida-swift-bridge/blob/master/test/basics.c). And who doesn't like a good screenshot?
![Screen Shot 2021-09-01 at 12 08 27 AM](https://user-images.githubusercontent.com/48328712/131582122-5efb6ea0-304a-49b6-bcdc-d909fbbeadee.png)
See the [docs](https://github.com/hot3eed/frida-swift-bridge/blob/master/docs/api.md) for more flexing.

## Notes
Expect this to be alpha-ish quality software. This hasn't been battle-tested yet, and chances are there's some quite weird shit waiting to be surfaced. PRs and issues are very welcome.

## License
[LGPL-3.0](https://www.gnu.org/licenses/lgpl-3.0.en.html)

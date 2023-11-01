# frida-swift-bridge

Swift interop from Frida.

## Requirements

- arm64(e) Darwin platforms
- Apps built using Swift 5.0+

## Getting started
The bridge comes bundled with Frida as of v15.1.0. That means it's as simple as [installing Frida](https://frida.re/docs/installation/), then:
```
$ frida <process name>
[Local::<process name>]-> Swift.available
true
```
Or, preferably, since the bridge isn't at production capacity yet, it might be better to use the latest
bridge from git, as there might be fixes or patches that haven't made it to the latest Frida version yet.
```
$ git clone git@github.com:frida/frida-swift-bridge.git
$ cd frida-swift-bridge
$ npm install
$ npm run watch
$ frida <process name> -l _agent.js # In another terminal
```

## Showcase
The best way to really see the available APIs in action is to have a look at the [testsuite](test/basics.c). And who doesn't like a good screenshot?
![Screen Shot 2021-09-01 at 12 08 27 AM](https://user-images.githubusercontent.com/48328712/131582122-5efb6ea0-304a-49b6-bcdc-d909fbbeadee.png)
See the [docs](docs/api.md) for more flexing.

## Notes
Expect this to be alpha-ish quality software. This hasn't been battle-tested yet, and chances are there's some quite weird shit waiting to be surfaced. PRs and issues are very welcome.

## License
[Apache 2.0](LICENSE.md)


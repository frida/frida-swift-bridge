RUNNER_ARGS ?=

frida_version := 14.2.18

cflags := -Wall -pipe -Os -g
ldflags := -Wl, -framework Foundation -lfrida-gumjs -lresolv -Wl,-dead_strip

macos_cc := $(shell xcrun --sdk macosx -f clang)
macos_swift := $(shell xcrun --sdk macosx -f swift)
macos_sdk := $(shell xcrun --sdk macosx --show-sdk-path)
macos_cflags := -isysroot "$(macos_sdk)" -arch arm64 $(cflags) -DHAVE_MACOS -DHAVE_V8
macos_swift_runtimedir := /usr/lib/swift
macos_ldflags := "-Wl,-rpath,$(macos_swift_runtimedir)" $(ldflags)
macos_swiftc := xcrun --sdk macosx swiftc

c_sources := basics.c runner.c
objc_headers := fixture.m
swift_sources := dummy.swift
js_sources := ../index.js

all: run-macos

clean:
	rm -rf build

build-macos: build/macos-arm64/runner

run-macos: build/macos-arm64/runner build/frida-swift-bridge.js
	$< $(RUNNER_ARGS)

watch-macos: build/macos-arm64/runner build/frida-swift-bridge.js
	npm run watch &
	./node_modules/.bin/chokidar \
		build/frida-swift-bridge.js \
		-c 'build/macos-arm64/runner $(RUNNER_ARGS)'

build/macos-arm64/runner: build/macos-arm64/dummy.o build/macos-arm64/libfrida-gumjs.a
	"$(macos_cc)" \
		$(macos_cflags) \
		$(c_sources) \
		build/macos-arm64/dummy.o \
		-o $@ \
		-Ibuild/macos-arm64 -Lbuild/macos-arm64 \
		$(macos_ldflags)

build/macos-arm64/dummy.o: $(swift_sources)
	@mkdir -p $(@D)
	$(macos_swiftc) -emit-library dummy.swift -o $@

build/%/libfrida-gumjs.a:
	@mkdir -p ${@D}
	curl -Ls https://github.com/frida/frida/releases/download/$(frida_version)/frida-gumjs-devkit-$(frida_version)-$*.tar.xz | tar -xJf - -C $(@D)

build/frida-swift-bridge.js: $(js_sources) node_modules
	npm run build

node_modules: package.json
	npm install

.PHONY: all clean

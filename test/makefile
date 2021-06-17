RUNNER_ARGS ?=

frida_version := 14.2.18

cflags := -Wall -pipe -Os -g
ldflags := -Wl, -framework,Foundation -lfrida-gumjs -lresolv -Wl,-dead_strip

macos_cc := $(shell xcrun --sdk macosx -f clang)
macos_swiftc := xcrun --sdk macosx swiftc

all: run-macos

clean:
	rm -rf build

build/macos-arm64/dummy.o: dummy.swift
	@mkdir -p $(@D)
	$(macos_swiftc) dummy.swift -o $@

.PHONY: all clean

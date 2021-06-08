#!/bin/bash

tsc -w &
P1=$!
frida-compile -o dist/_agent.js loader.js -w &
P2=$!
wait $P1 $P2

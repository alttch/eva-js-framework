all: prepare build

prepare:
	npm i @babel/core @babel/cli babel-plugin-transform-class-properties @babel/preset-env babel-preset-minify

build:
	./node_modules/.bin/babel packages/@eva-ics/framework --config-file `pwd`/.babelrc --no-comments > dist/eva.min.js

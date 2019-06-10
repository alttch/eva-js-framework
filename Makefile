all: build

prepare:
	npm i @babel/core @babel/cli babel-plugin-transform-class-properties @babel/preset-env babel-preset-minify \
		@altertech/jsaltt @altertech/cookies

build:
	cat \
		./node_modules/@altertech/jsaltt/index.js \
		./node_modules/@altertech/cookies/index.js \
		./src/@eva-ics/framework/index.js | \
			grep -vE "=.*require\(" | \
			grep -vE "^'use strict'" > dist/eva.js
	echo "//`jq < src/@eva-ics/framework/package.json -r .version`" > dist/eva.min.js
	./node_modules/.bin/babel dist/eva.js --config-file `pwd`/.babelrc --no-comments >> dist/eva.min.js

pub-framework:
	cp README.md ./src/@eva-ics/framework/
	cd src/@eva-ics/framework && npm version patch
	sed -i "s/\(const eva_sfa_framework_version\).*/\1 = '`jq < src/@eva-ics/framework/package.json -r .version`';/g" \
		./src/@eva-ics/framework/index.js
	cd src/@eva-ics/framework && npm publish --access public

all: build

prepare:
	npm i @babel/core @babel/cli babel-plugin-transform-class-properties \
	 	@babel/preset-env babel-preset-minify cssmin-cli @altertech/jsaltt @altertech/cookies

#build:
	#cat \
		#./node_modules/@altertech/jsaltt/index.js \
		#./node_modules/@altertech/cookies/index.js \
		#./src/@eva-ics/framework/index.js | \
			#grep -vE "=.*require\(" | \
			#grep -vE "^'use strict'" > dist/eva.js
	#echo "//`jq < src/@eva-ics/framework/package.json -r .version`" > dist/eva.min.js
	#./node_modules/.bin/babel dist/eva.js \
			#--config-file `pwd`/.babelrc --no-comments >> dist/eva.min.js
	#cat ./src/@eva-ics/toolbox/index.js | \
			#grep -vE "=.*require\(" | \
			#grep -vE "^'use strict'" > dist/eva.toolbox.js
	#echo "//`jq < src/@eva-ics/toolbox/package.json -r .version`" > dist/eva.toolbox.min.js
	#./node_modules/.bin/babel dist/eva.toolbox.js \
			 #--config-file `pwd`/.babelrc --no-comments >> dist/eva.toolbox.min.js
	#./node_modules/.bin/cssmin ./css/eva.toolbox.css > css/eva.toolbox.min.css

build: framework full css

framework:
	mkdir -p node_modules
	cd framework && \
		rm -rf node_modules && \
		ln -sf ../node_modules && \
	 	npm install && \
	 	./node_modules/.bin/webpack && \
		echo "//`jq < package.json -r .version`" > ../dist/eva.framework.min.js && \
	 	cat dist/eva.framework.min.js >> ../dist/eva.framework.min.js && \
	rm -rf ./node_modules/@eva-ics/framework && \
	mkdir -p ./node_modules/@eva-ics/framework
	cd ./node_modules/@eva-ics/framework && \
		ln -sf ../../../framework/package.json && \
		ln -sf ../../../framework/src
	rm -rf ./node_modules/@eva-ics/toolbox && \
	mkdir -p ./node_modules/@eva-ics/toolbox
	cd ./node_modules/@eva-ics/toolbox && \
		ln -sf ../../../toolbox/package.json && \
		ln -sf ../../../toolbox/src

full:
	webpack --config webpack.full.js

css:
	npm install cssmin-cli
	./node_modules/.bin/cssmin ./toolbox/css/eva.toolbox.css > dist/eva.min.css

pub-framework:
	cp README.md ./framework/
	cd framework && npm version patch
	sed -i "s/\(const eva_framework_version\).*/\1 = '`jq < framework/package.json -r .version`';/g" \
		./framework/src/index.js
	npm publish framework --access public

clean:
	rm -rf node_modules \
	 	framework/node_modules framework/dist framework/package-lock.json framework/README.md

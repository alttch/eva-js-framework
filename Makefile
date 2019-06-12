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

build:
	cd framework && npm install && ./node_modules/.bin/webpack && mv -f dist/eva.framework.min.js ../dist/

pub-framework:
	cp README.md ./framework/
	cd framework/src && npm version patch
	sed -i "s/\(const eva_framework_version\).*/\1 = '`jq < framework/package.json -r .version`';/g" \
		./framework/src/index.js
	cd framework && npm publish framework --access public

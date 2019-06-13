all: build

prepare:
	npm i @babel/core @babel/cli babel-plugin-transform-class-properties \
	 	@babel/preset-env babel-preset-minify cssmin-cli @altertech/jsaltt @altertech/cookies

build: clean-dist build-framework build-full build-css done

clean-dist:
	rm -f dist/*

build-framework:
	cd framework && \
	 	npm install && \
	 	./node_modules/.bin/webpack && \
		echo "//`jq < package.json -r .version`" > ../dist/eva.framework.min.js && \
	 	cat dist/eva.framework.min.js >> ../dist/eva.framework.min.js

build-full:
	npm install webpack webpack-cli babel-register babel-loader \
		 @babel/core babel-plugin-transform-class-properties @babel/preset-env \
		 @altertech/jsaltt @altertech/cookies
	rm -rf node_modules/@eva-ics/framework
	rm -rf node_modules/@eva-ics/toolbox
	npm link framework
	npm link toolbox
	./node_modules/.bin/webpack --config webpack.full.js
	mv ./dist/eva.min.js ./dist/eva.min.js.tmp
	echo "//`jq < ./framework/package.json -r .version`" > ./dist/eva.min.js
	cat ./dist/eva.min.js.tmp >> ./dist/eva.min.js
	rm -f ./dist/eva.min.js.tmp

build-css:
	cd toolbox && \
	 	npm install cssmin-cli && \
		./node_modules/.bin/cssmin ./css/eva.toolbox.css > ../dist/eva.min.css

pub-framework:
	cp README.md ./framework/
	cd framework && npm version patch
	sed -i "s/\(const eva_framework_version\).*/\1 = '`jq < framework/package.json -r .version`';/g" \
		./framework/src/index.js
	npm publish framework --access public

pub-toolbox:
	cd toolbox && npm version patch
	npm publish toolbox --access public

done:
	@which figlet > /dev/null && figlet -f slant "DONE" || echo -e "-----------------\nDONE"

clean:
	rm -rf package-lock.json node_modules \
	 	framework/node_modules framework/dist framework/package-lock.json framework/README.md \
		toolbox/node_modules toolbox/package-lock.json

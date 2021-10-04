VERSION=$(shell jq -r .version < framework/package.json)

all: build

prepare:
	npm i @babel/core @babel/cli babel-plugin-transform-class-properties \
	 	@babel/preset-env babel-preset-minify cssmin-cli @altertech/jsaltt @altertech/cookies

build: clean-dist build-framework build-full done

clean-dist:
	rm -f dist/*

build-framework:
	mkdir -p dist
	cd framework && \
	 	npm install && \
	 	./node_modules/.bin/webpack && \
		echo "// `jq < package.json -r .version`" > ../dist/eva.framework.min.js && \
	 	cat dist/eva.framework.min.js >> ../dist/eva.framework.min.js

build-full:
	mkdir -p dist
	cd full && \
		npm install && \
		npm link ../framework && \
		npm link ../toolbox && \
		./node_modules/.bin/webpack
	echo -n "// `jq < ./framework/package.json -r .version`" > ./dist/eva.min.js
		echo " | `jq < ./toolbox/package.json -r .version`" >> ./dist/eva.min.js
		cat ./full/dist/eva.min.js >> ./dist/eva.min.js

pub-framework:
	cp README.md ./framework/
	cd framework && npm version --no-git-tag-version patch
	sed -i "s/\(const eva_framework_version\).*/\1 = '`jq < framework/package.json -r .version`';/g" \
		./framework/src/index.js
	cd framework && npm run build && npm publish --access public

pub-toolbox:
	cd toolbox && npm version --no-git-tag-version patch
	sed -i "s/\(const eva_toolbox_version\).*/\1 = '`jq < toolbox/package.json -r .version`';/g" \
		./toolbox/src/index.js
	cd toolbox && npm publish --access public

done:
	@which figlet > /dev/null && figlet -f slant "DONE" || echo -e "-----------------\nDONE"

clean:
	rm -rf package-lock.json node_modules \
	 	framework/node_modules framework/dist framework/package-lock.json framework/README.md \
		toolbox/node_modules toolbox/package-lock.json \
		full/node_modules full/dist full/package-lock.json

ver-pub:
	git commit -a -m "version `jq < ./framework/package.json -r .version`"; 
	git push

release:
	all pkg pub-pkg

pkg:
	rm -rf _build
	mkdir -p _build/ui
	cp dist/eva.min.js dist/eva.framework.min.js _build/ui
	sed "s/^VERSION=.*/VERSION='$(VERSION)'/g" setup.py > _build/setup.py
	cd _build && tar czf eva-js-framework-$(VERSION).evapkg ui setup.py

pub-pkg:
	echo "" | gh release create v$(VERSION) -t "v$(VERSION)" \
	 	_build/eva-js-framework-$(VERSION).evapkg dist/eva.min.js dist/eva.framework.min.js

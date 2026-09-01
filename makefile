.PHONY: zip test

test:
	node tests/utils.test.js
	node tests/manifest.test.js

zip:
	zip -r biliplus.zip css/ scripts/ settings/ manifest.json logo.png

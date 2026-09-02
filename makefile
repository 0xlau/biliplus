ZIP_FILE := biliplus.zip
PACKAGE_PATHS := css scripts settings manifest.json logo.png

.PHONY: zip test

test:
	node --test tests/*.test.js tests/*.test.cjs

zip:
	rm -f $(ZIP_FILE)
	zip -r $(ZIP_FILE) $(PACKAGE_PATHS) -x '*/.DS_Store'

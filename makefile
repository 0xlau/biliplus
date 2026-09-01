ZIP_FILE := biliplus.zip
PACKAGE_PATHS := css scripts settings manifest.json logo.png

.PHONY: zip

zip:
	rm -f $(ZIP_FILE)
	zip -r $(ZIP_FILE) $(PACKAGE_PATHS) -x '*/.DS_Store'
